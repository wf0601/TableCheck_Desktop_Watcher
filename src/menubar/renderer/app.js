"use strict";
const api = window.tc;
const { t, applyDomTranslations } = window.__i18n;

// Apply translations to all static DOM elements marked with data-i18n attrs.
applyDomTranslations();

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (id) => document.getElementById(id);

function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { name: WEEKDAYS[dt.getDay()], isWeekend: dt.getDay() === 0 || dt.getDay() === 6 };
}

/** Drop the year from a YYYY-MM-DD string — we only watch the near future. */
function shortDate(iso) {
  const m = iso.match(/^\d{4}-(\d{2}-\d{2})$/);
  return m ? m[1] : iso;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

function setStatus(id, msg, kind) {
  const elx = $(id);
  elx.className = "status" + (kind ? " " + kind : "");
  elx.textContent = msg;
  if (msg && kind === "ok") setTimeout(() => { if (elx.textContent === msg) elx.textContent = ""; }, 3000);
}

// ===== Tabs =====
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "restaurants") loadWatchlistEditor();
  if (name === "profile") {
    loadProfileForm();
    refreshSignInStatus();
  }
}

// =====================================================================
// CHECK tab
// =====================================================================

let checkList = [];
// Track whether each editor has been opened — Save & Quit only writes loaded ones,
// so it can't accidentally overwrite a file with empty default form values.
let profileLoaded = false;
let watchlistLoaded = false;

async function loadCheckList() {
  const container = $("restaurants");
  container.textContent = t("check.loading");
  try {
    checkList = await api.listWatchlist();
  } catch (e) {
    container.textContent = t("check.failedWatchlist", { err: e?.message ?? e });
    return;
  }
  container.replaceChildren();
  if (checkList.length === 0) {
    container.append(el("div", { class: "empty" }, t("check.empty")));
    return;
  }
  for (const w of checkList) {
    const cb = el("input", { type: "checkbox", id: `cb_${w.slug}`, dataset: { url: w.url } });
    cb.checked = w.enabled;
    const row = el(
      "div",
      { class: "restaurant-row" + (w.enabled ? "" : " disabled") },
      el("label", { for: cb.id }, cb, el("strong", {}, w.name)),
      el("div", { class: "meta" }, t("check.meta", { party: w.party_size, days: w.targetDateCount })),
    );
    container.append(row);
  }
}

function setResultsSource(text, kind) {
  const el = $("results-source");
  el.className = "signin-status" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function renderResults(results, opts = {}) {
  const card = $("results-card");
  const container = $("results");
  container.replaceChildren();
  setResultsSource(opts.sourceLabel || "", opts.sourceKind || "");
  if (!results || results.length === 0) {
    if (!opts.keepOpenOnEmpty) card.hidden = true;
    else card.hidden = false;
    return;
  }
  card.hidden = false;
  for (const r of results) {
    const section = el("div", { class: "restaurant-result" });
    section.append(el("h3", {}, r.name));
    if (r.error) { section.append(el("p", { class: "error" }, t("results.error", { err: r.error }))); container.append(section); continue; }
    if (r.slots.length === 0) { section.append(el("p", { class: "empty" }, t("results.empty"))); container.append(section); continue; }
    const byDate = new Map();
    for (const s of r.slots) (byDate.get(s.date) || byDate.set(s.date, []).get(s.date)).push(s);
    const dates = [...byDate.keys()].sort();
    const slotsWrap = el("div", { class: "slots" });
    for (const date of dates) {
      const wd = weekdayOf(date);
      const dateCell = el("div", { class: "date" }, el("strong", {}, shortDate(date)), el("span", { class: "wd" + (wd.isWeekend ? " weekend" : "") }, wd.name));
      const pillsCell = el("div", { class: "slot-pills" });
      for (const slot of byDate.get(date)) pillsCell.append(buildSlotPill(slot));
      slotsWrap.append(el("div", { class: "date-row" }, dateCell, pillsCell));
    }
    section.append(slotsWrap);
    container.append(section);
  }
}

function buildSlotPill(slot) {
  const timeLink = el("a", {
    class: "time-link",
    href: "#",
    title: t("slot.openTitle"),
    onclick: (ev) => { ev.preventDefault(); api.openUrl(slot.deepLink); },
  }, slot.time);
  const autofillBtn = el("button", {
    class: "autofill",
    title: t("slot.autofillTitle"),
    onclick: async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true; const orig = b.textContent; b.textContent = t("slot.autofillLaunching");
      try { await api.autofill(slot); } finally {
        setTimeout(() => { b.disabled = false; b.textContent = orig; }, 2000);
      }
    },
  }, t("slot.autofill"));
  return el("div", { class: "slot" }, timeLink, autofillBtn);
}

async function runCheck() {
  const checks = [...document.querySelectorAll("#restaurants input:checked")];
  const urls = checks.map((c) => c.dataset.url);
  if (urls.length === 0) { alert(t("results.pickOne")); return; }
  const btn = $("check-btn");
  btn.disabled = true;
  btn.textContent = t("results.checkingButton", { n: urls.length });
  $("results-card").hidden = false;
  $("results").replaceChildren(el("div", { class: "loading" }, t("results.checking")));
  try {
    const results = await api.check(urls);
    renderResults(results, { sourceLabel: t("results.sourceManual", { time: fmtRelTime(Date.now()) }), sourceKind: "" });
  } catch (e) {
    $("results").replaceChildren(el("p", { class: "error" }, t("results.checkFailed", { err: e?.message ?? e })));
  } finally {
    btn.disabled = false;
    btn.textContent = t("check.checkNow");
  }
}

$("check-btn").addEventListener("click", runCheck);
$("select-all").addEventListener("click", () => document.querySelectorAll("#restaurants input[type=checkbox]").forEach((c) => (c.checked = true)));
$("select-none").addEventListener("click", () => document.querySelectorAll("#restaurants input[type=checkbox]").forEach((c) => (c.checked = false)));

// =====================================================================
// PROFILE tab
// =====================================================================

async function loadProfileForm() {
  setStatus("profile-status", "");
  try {
    const profile = await api.getProfile();
    const form = $("profile-form");
    for (const [k, v] of Object.entries(profile)) {
      const f = form.elements.namedItem(k);
      if (f) f.value = v ?? "";
    }
    profileLoaded = true;
  } catch (e) {
    setStatus("profile-status", t("profile.failedLoad", { err: e?.message ?? e }), "err");
  }
}

$("save-profile-btn").addEventListener("click", async () => {
  const form = $("profile-form");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const btn = $("save-profile-btn");
  btn.disabled = true;
  setStatus("profile-status", t("profile.saving"));
  try {
    const res = await api.saveProfile(data);
    if (res.ok) setStatus("profile-status", t("profile.savedFile"), "ok");
    else setStatus("profile-status", t("profile.saveFailed", { err: res.error }), "err");
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
// RESTAURANTS (watchlist editor) tab
// =====================================================================

let editorEntries = [];

async function loadWatchlistEditor() {
  setStatus("watchlist-status", "");
  try {
    editorEntries = (await api.getWatchlistRaw()).map(normalizeEntry);
    watchlistLoaded = true;
  } catch (e) {
    $("watchlist-editor").replaceChildren(el("p", { class: "error" }, t("watchlist.failedLoad", { err: e?.message ?? e })));
    return;
  }
  renderWatchlistEditor();
}

function normalizeEntry(e) {
  return {
    name: e.name ?? "",
    url: e.url ?? "",
    party_size: e.party_size ?? 2,
    window_weeks: e.window_weeks ?? "",
    window_days: e.window_days ?? "",
    dates: (e.dates ?? []).join(", "),
    times: (e.times ?? []).join(", "),
    enabled: e.enabled !== false,
  };
}

function renderWatchlistEditor() {
  const container = $("watchlist-editor");
  container.replaceChildren();
  if (editorEntries.length === 0) {
    container.append(el("p", { class: "empty" }, t("watchlist.empty")));
    return;
  }
  editorEntries.forEach((entry, idx) => container.append(buildEntryCard(entry, idx)));
}

function buildEntryCard(entry, idx) {
  const update = (key, value) => { entry[key] = value; };
  const statusEl = el("span", { class: "entry-status" });
  const card = el("div", { class: "entry-card", dataset: { idx: String(idx) } },
    el("div", { class: "head" },
      el("label", { class: "toggle" },
        el("input", {
          type: "checkbox", checked: entry.enabled,
          onchange: (ev) => update("enabled", ev.target.checked),
        }),
        t("watchlist.fields.enabled"),
      ),
      el("div", { class: "head-actions" },
        statusEl,
        el("button", {
          class: "save",
          title: t("watchlist.saveSingleTitle"),
          onclick: (ev) => saveSingleEntry(idx, ev.currentTarget, statusEl),
        }, t("watchlist.save")),
        el("button", {
          class: "danger",
          title: t("watchlist.deleteTitle"),
          onclick: () => {
            const name = entry.name || t("watchlist.deleteConfirmFallback");
            if (!confirm(t("watchlist.deleteConfirm", { name }))) return;
            editorEntries.splice(idx, 1);
            renderWatchlistEditor();
          },
        }, t("watchlist.delete")),
      ),
    ),
    el("div", { class: "entry-grid" },
      input(t("watchlist.fields.name"), entry.name, (v) => update("name", v), { span2: true, required: true }),
      input(t("watchlist.fields.url"), entry.url, (v) => update("url", v), { span2: true, required: true, placeholder: t("watchlist.fields.urlPlaceholder") }),
      input(t("watchlist.fields.partySize"), entry.party_size, (v) => update("party_size", Number(v)), { type: "number", min: 1, max: 20, required: true }),
      input(t("watchlist.fields.windowWeeks"), entry.window_weeks, (v) => update("window_weeks", v === "" ? "" : Number(v)), { type: "number", min: 1, max: 26 }),
      input(t("watchlist.fields.windowDays"), entry.window_days, (v) => update("window_days", v === "" ? "" : Number(v)), { type: "number", min: 1, max: 180 }),
      input(t("watchlist.fields.dates"), entry.dates, (v) => update("dates", v), { placeholder: t("watchlist.fields.datesPlaceholder") }),
      input(t("watchlist.fields.times"), entry.times, (v) => update("times", v), { placeholder: t("watchlist.fields.timesPlaceholder"), span2: true }),
      el("p", { class: "help" }, t("watchlist.fields.help")),
    ),
  );
  return card;
}

async function saveSingleEntry(idx, btn, statusEl) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = t("watchlist.saving");
  statusEl.className = "entry-status status";
  statusEl.textContent = "";
  try {
    const list = editorEntries.map(denormalizeEntry);
    const res = await api.saveWatchlist(list);
    if (res.ok) {
      statusEl.className = "entry-status status ok";
      statusEl.textContent = t("watchlist.saved");
      loadCheckList();
    } else {
      statusEl.className = "entry-status status err";
      statusEl.textContent = res.error;
    }
  } catch (e) {
    statusEl.className = "entry-status status err";
    statusEl.textContent = e?.message ?? String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
    if (statusEl.classList.contains("ok")) {
      setTimeout(() => { statusEl.textContent = ""; statusEl.className = "entry-status"; }, 3000);
    }
  }
}

function input(labelText, value, onChange, opts = {}) {
  const inp = el("input", {
    type: opts.type || "text",
    value: value ?? "",
    placeholder: opts.placeholder || "",
    min: opts.min,
    max: opts.max,
    required: opts.required,
    onchange: (ev) => onChange(ev.target.value),
    oninput: (ev) => onChange(ev.target.value),
  });
  return el("label", { class: opts.span2 ? "span2" : "" }, labelText, inp);
}

$("add-restaurant").addEventListener("click", () => {
  editorEntries.push(normalizeEntry({
    name: "",
    url: "",
    party_size: 2,
    window_weeks: 4,
    times: [],
    enabled: true,
  }));
  renderWatchlistEditor();
});

function parseCsv(s) {
  return String(s ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
}

function denormalizeEntry(e) {
  const out = {
    name: e.name.trim(),
    url: e.url.trim(),
    party_size: Number(e.party_size),
    times: parseCsv(e.times),
    enabled: !!e.enabled,
  };
  const dates = parseCsv(e.dates);
  if (dates.length > 0) out.dates = dates;
  if (e.window_weeks !== "" && e.window_weeks != null) out.window_weeks = Number(e.window_weeks);
  if (e.window_days !== "" && e.window_days != null) out.window_days = Number(e.window_days);
  return out;
}

$("save-watchlist-btn").addEventListener("click", async () => {
  const btn = $("save-watchlist-btn");
  const list = editorEntries.map(denormalizeEntry);
  btn.disabled = true;
  setStatus("watchlist-status", t("watchlist.saving"));
  try {
    const res = await api.saveWatchlist(list);
    if (res.ok) {
      setStatus("watchlist-status", t("watchlist.savedFile"), "ok");
      await loadCheckList();
    } else {
      setStatus("watchlist-status", t("watchlist.saveFailed", { err: res.error }), "err");
    }
  } finally {
    btn.disabled = false;
  }
});

// ===== Save & Quit =====
$("save-exit-btn").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = t("saveExit.saving");
  const errors = [];

  if (profileLoaded) {
    const form = $("profile-form");
    if (!form.reportValidity()) {
      errors.push(t("saveExit.profileInvalid"));
    } else {
      const data = Object.fromEntries(new FormData(form));
      const res = await api.saveProfile(data);
      if (!res.ok) errors.push(t("saveExit.profilePrefix", { err: res.error }));
    }
  }

  if (watchlistLoaded) {
    try {
      const list = editorEntries.map(denormalizeEntry);
      const res = await api.saveWatchlist(list);
      if (!res.ok) errors.push(t("saveExit.watchlistPrefix", { err: res.error }));
    } catch (e) {
      errors.push(t("saveExit.watchlistPrefix", { err: e?.message ?? e }));
    }
  }

  if (errors.length > 0) {
    const proceed = confirm(t("saveExit.confirmQuitAnyway", { errors: errors.join("\n\n") }));
    if (!proceed) {
      btn.disabled = false;
      btn.textContent = orig;
      return;
    }
  }

  btn.textContent = t("saveExit.quitting");
  await api.quit();
});

// ===== TableCheck sign-in =====
function renderSignInStatus(s) {
  const el = $("signin-status");
  const map = {
    "already":         { cls: "ok",   key: "signin.status.already" },
    "signed-in":       { cls: "ok",   key: "signin.status.signedIn" },
    "failed":          { cls: "err",  key: "signin.status.failed" },
    "no-credentials":  { cls: "warn", key: "signin.status.noCreds" },
    "skipped":         { cls: "warn", key: "signin.status.skipped" },
    "unknown":         { cls: "",     key: "signin.status.unknown" },
  };
  const r = map[s?.result] ?? { cls: "", key: null };
  const text = r.key ? t(r.key) : (s?.result || t("signin.status.unknown"));
  el.className = "signin-status " + r.cls;
  el.textContent = text + (s?.error ? ` (${s.error})` : "");
}

async function refreshSignInStatus() {
  try {
    const s = await api.getSignInStatus();
    renderSignInStatus(s);
  } catch (e) {
    $("signin-status").textContent = t("signin.status.unavailable");
  }
}

$("signin-btn").addEventListener("click", async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true; const orig = b.textContent; b.textContent = t("profile.account.signinLaunching");
  try { await api.openSignIn(); } finally {
    setTimeout(() => { b.disabled = false; b.textContent = orig; }, 2000);
  }
});

$("signin-now-btn").addEventListener("click", async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true; const orig = b.textContent; b.textContent = t("profile.account.signingIn");
  $("signin-status").textContent = t("poll.statusChecking");
  try {
    const s = await api.runSignInNow();
    renderSignInStatus(s);
  } finally {
    b.disabled = false; b.textContent = orig;
  }
});

// ===== Background polling =====
function fmtRelTime(ts) {
  if (!ts) return "—";
  const dt = new Date(ts);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Status display only — does NOT touch the form inputs (otherwise the
// 5-second auto-refresh would clobber a tick before the user can hit Apply).
function renderPollStatus(s) {
  const pill = $("poll-status-pill");
  if (s.running) {
    pill.className = "signin-status ok";
    pill.textContent = s.tickInProgress ? t("poll.statusRunningInProgress") : t("poll.statusRunning");
  } else {
    pill.className = "signin-status";
    pill.textContent = t("poll.statusStopped");
  }
  $("poll-stop").hidden = !s.running;
  const meta = $("poll-meta");
  const parts = [];
  if (s.lastTickAt) parts.push(t("poll.metaLastCheck", { time: fmtRelTime(s.lastTickAt) }));
  if (s.nextTickAt) parts.push(t("poll.metaNext", { time: fmtRelTime(s.nextTickAt) }));
  if (s.lastError) parts.push(t("poll.metaError", { err: s.lastError }));
  meta.textContent = parts.join(" · ");
}

async function refreshPollStatus() {
  try { renderPollStatus(await api.getPollStatus()); }
  catch { /* ignore */ }
}

// Only sync the form to the saved values on initial load and after a successful Apply.
async function syncPollFormFromSettings() {
  try {
    const s = await api.getPollStatus();
    $("poll-enabled").checked = s.enabled;
    $("poll-minutes").value = s.minutes;
    if (s.repeatMinutes !== undefined) $("poll-repeat").value = s.repeatMinutes;
    if (s.concurrency !== undefined) $("poll-concurrency").value = s.concurrency;
    renderPollStatus(s);
  } catch { /* ignore */ }
}

$("poll-apply").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = t("poll.applying");
  try {
    const res = await api.setPollConfig({
      enabled: $("poll-enabled").checked,
      minutes: Number($("poll-minutes").value),
      repeatMinutes: Number($("poll-repeat").value),
      concurrency: Number($("poll-concurrency").value),
    });
    if (!res.ok) alert(t("watchlist.saveFailed", { err: res.error }));
    await syncPollFormFromSettings();
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

$("poll-test-notify").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try { await api.testNotification(); }
  finally { setTimeout(() => { btn.disabled = false; }, 1000); }
});

$("poll-reset-history").addEventListener("click", async (ev) => {
  if (!confirm(t("poll.resetConfirm"))) return;
  const btn = ev.currentTarget;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = t("poll.resetClearing");
  try {
    const res = await api.resetNotificationHistory();
    if (!res.ok) alert(t("watchlist.saveFailed", { err: res.error }));
    else btn.textContent = t("poll.resetCleared");
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 1500);
  }
});

$("poll-stop").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = t("poll.stopping");
  try {
    const res = await api.stopPollNow();
    if (!res.ok) alert(t("watchlist.saveFailed", { err: res.error }));
    await syncPollFormFromSettings();
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

// Refresh the poll-status display periodically while the popover is open.
setInterval(refreshPollStatus, 5000);

// ===== Reload (all) =====
$("reload-btn").addEventListener("click", () => {
  loadCheckList();
  loadWatchlistEditor();
  loadProfileForm();
});

// ===== Live poll results stream =====
// When the background poller is running, push per-restaurant results into the
// same Results card the manual flow uses, with a header showing source + time.
const pollResultsBuffer = [];
let pollResultsStartedAt = null;

function renderPollResultsBuffer(finished) {
  const time = fmtRelTime(pollResultsStartedAt || Date.now());
  const label = pollResultsStartedAt
    ? t(finished ? "results.sourceBackgroundDone" : "results.sourceBackgroundRunning", { time })
    : t("poll.heading");
  renderResults(pollResultsBuffer, {
    sourceLabel: label,
    sourceKind: finished ? "ok" : "",
    keepOpenOnEmpty: !finished,
  });
}

api.onPollUpdate((payload) => {
  if (payload.type === "summary") {
    pollResultsStartedAt = payload.startedAt;
    if (payload.finishedAt) {
      // Tick is done — sync to the authoritative final list.
      pollResultsBuffer.length = 0;
      pollResultsBuffer.push(...(payload.results || []));
      renderPollResultsBuffer(true);
    } else {
      // Tick just started — clear and show "running…".
      pollResultsBuffer.length = 0;
      renderPollResultsBuffer(false);
    }
  } else if (payload.type === "result") {
    pollResultsBuffer.push(payload.result);
    renderPollResultsBuffer(false);
  }
});

// On Check tab open, fetch the last poll results so closing/reopening the
// popover preserves the most recent background tick's output.
async function loadLastPollResults() {
  try {
    const last = await api.getLastPollResults();
    if (!last || (!last.startedAt && (!last.results || last.results.length === 0))) return;
    pollResultsStartedAt = last.startedAt;
    pollResultsBuffer.length = 0;
    pollResultsBuffer.push(...(last.results || []));
    renderPollResultsBuffer(!!last.finishedAt);
  } catch { /* ignore */ }
}

// Initial load — only the Check tab is visible.
loadCheckList();
syncPollFormFromSettings();
loadLastPollResults();
