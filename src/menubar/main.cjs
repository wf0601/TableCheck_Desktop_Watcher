// Electron main process for the menubar UI.
// Reuses the existing checker/prefiller from dist/ — run `npm run build` first (the `ui` script does it).
//
// Written as CJS because Electron 33 / Node 20's ESM loader can't statically wrap the `electron`
// module's named exports. We use dynamic import() for our ESM dist/ modules.
const { app, ipcMain, shell, Menu, nativeImage, Notification } = require("electron");
const { spawn } = require("node:child_process");
const { menubar } = require("menubar");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

// Use logo.jpeg from the repo root as the menubar icon, resized for the system menubar.
const iconPath = resolve(__dirname, "..", "..", "logo.jpeg");

// Locale selection: `--lang=ja` on the command line (preferred) or `TC_LANG=ja`
// env var. Falls back to `en`. The renderer reads this from `?lang=...` in
// its URL (see src/menubar/renderer/i18n.js).
const SUPPORTED_LOCALES = ["en", "ja"];
function detectLocale() {
  const argv = process.argv.slice(1).find((a) => a.startsWith("--lang="));
  const v = argv ? argv.slice(7) : process.env.TC_LANG;
  return v && SUPPORTED_LOCALES.includes(v) ? v : "en";
}
const UI_LOCALE = detectLocale();
console.log(`[main] UI locale: ${UI_LOCALE}`);

// Resolve our compiled ESM modules by file:// URL so dynamic import works under CJS.
const distUrl = (file) => pathToFileURL(join(__dirname, "..", "..", "dist", file)).href;

let lib = null;
async function getLib() {
  if (lib) return lib;
  const [config, checker, prefiller, state] = await Promise.all([
    import(distUrl("config.js")),
    import(distUrl("checker.js")),
    import(distUrl("prefiller.js")),
    import(distUrl("state.js")),
  ]);
  lib = { config, checker, prefiller, state };
  return lib;
}

const mb = menubar({
  dir: __dirname,
  index: pathToFileURL(join(__dirname, "renderer", "index.html")).href + `?lang=${UI_LOCALE}`,
  icon: iconPath,
  preloadWindow: true,
  showDockIcon: false,
  browserWindow: {
    width: 520,
    height: 720,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
});

mb.on("ready", () => {
  // Resize the 500×500 logo down to the macOS menubar icon size and replace the tray icon.
  // (We pass the full-size path to menubar()'s constructor for initial display, then swap to
  // a properly sized image now that nativeImage is available.)
  try {
    const sized = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18, quality: "best" });
    mb.tray.setImage(sized);
  } catch (e) {
    console.warn("logo resize failed, falling back to raw image:", e.message);
  }
  mb.tray.setToolTip("TableCheck Watcher");

  // Right-click on the menubar icon shows a context menu with Quit.
  const contextMenu = Menu.buildFromTemplate([
    { label: "Open", click: () => mb.showWindow() },
    { type: "separator" },
    { label: "Quit TC Watcher", accelerator: "CommandOrControl+Q", click: () => app.quit() },
  ]);
  mb.tray.on("right-click", () => mb.tray.popUpContextMenu(contextMenu));

  console.log("Menubar ready");

  // Auto-sign-in on launch if credentials are configured. Runs fire-and-forget
  // so we don't block the UI from loading.
  (async () => {
    try {
      const { config, prefiller } = await getLib();
      const profile = config.loadProfile();
      if (profile.tablecheck_account && profile.tablecheck_password) {
        console.log("Auto-sign-in starting…");
        const result = await prefiller.autoSignIn(profile);
        lastSignInStatus = { result, at: Date.now() };
        console.log("Auto-sign-in result:", result);
      } else {
        lastSignInStatus = { result: "no-credentials", at: Date.now() };
      }
    } catch (e) {
      lastSignInStatus = { result: "failed", error: e.message, at: Date.now() };
      console.error("Auto-sign-in error:", e.message);
    }
  })();
});

mb.on("after-create-window", () => {
  if (!mb.window) return;
  const wc = mb.window.webContents;
  if (process.env.TC_DEVTOOLS) wc.openDevTools({ mode: "detach" });
  // Echo renderer console + load errors into the terminal — useful for `npm run ui` debugging.
  wc.on("console-message", (_e, level, message, line, src) => {
    const tag = ["log", "warn", "error", "debug"][level] || level;
    console.log(`[renderer:${tag}] ${message} (${src}:${line})`);
  });
  wc.on("preload-error", (_e, p, err) => {
    console.error("[renderer] preload-error", p, err.message);
  });
});

// --- IPC handlers ---

ipcMain.handle("list-watchlist", async () => {
  const { config, checker } = await getLib();
  const list = config.loadWatchlist();
  return list.map((w) => ({
    name: w.name,
    url: w.url,
    party_size: w.party_size,
    window_weeks: w.window_weeks,
    window_days: w.window_days,
    dates: w.dates,
    times: w.times,
    enabled: w.enabled,
    targetDateCount: config.expandTargetDates(w).length,
    slug: checker.shopSlugFromUrl(w.url),
  }));
});

ipcMain.handle("get-profile", async () => {
  const { config } = await getLib();
  return config.loadProfile();
});

ipcMain.handle("save-profile", async (_event, partial) => {
  const { config } = await getLib();
  try {
    // Merge with the existing file so fields not present in the form (e.g.
    // tablecheck_account / tablecheck_password) aren't wiped on save.
    const current = config.loadProfile();
    const merged = { ...current, ...partial };
    config.saveProfile(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("get-watchlist-raw", async () => {
  const { config } = await getLib();
  return config.loadWatchlist();
});

ipcMain.handle("save-watchlist", async (_event, list) => {
  const { config } = await getLib();
  try {
    config.saveWatchlist(list);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

/**
 * Worker-pool that runs `workerFn(item)` over `items` with `concurrency`
 * simultaneous workers. Each worker waits `gapMs` between its own jobs (per-
 * worker throttle so total request rate stays sane regardless of pool size).
 * Aborts cleanly when `shouldAbort()` returns true.
 */
async function runPool(items, concurrency, workerFn, gapMs = 800, shouldAbort = () => false) {
  const queue = items.slice();
  const workers = [];
  for (let w = 0; w < Math.max(1, concurrency); w++) {
    workers.push((async () => {
      let firstForWorker = true;
      while (queue.length > 0 && !shouldAbort()) {
        if (!firstForWorker && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
        firstForWorker = false;
        const item = queue.shift();
        if (!item) break;
        await workerFn(item);
      }
    })());
  }
  await Promise.all(workers);
}

ipcMain.handle("check-restaurants", async (_event, urls) => {
  const { config, checker } = await getLib();
  const cfg = config.loadConfig();
  const entries = cfg.watchlist.filter((w) => urls.includes(w.url));
  if (entries.length === 0) return [];

  const browser = await checker.launchBrowser(true);
  const results = [];
  try {
    const concurrency = Math.max(1, Math.min(4, cfg.settings.poll_concurrency || 1));
    console.log(`[check] ${entries.length} restaurants, concurrency=${concurrency}`);
    await runPool(entries, concurrency, async (entry) => {
      try {
        const slots = await checker.checkEntry(entry, cfg.settings, browser);
        results.push({
          name: entry.name,
          url: entry.url,
          partySize: entry.party_size,
          slug: checker.shopSlugFromUrl(entry.url),
          slots,
          error: null,
        });
      } catch (e) {
        results.push({
          name: entry.name,
          url: entry.url,
          partySize: entry.party_size,
          slug: checker.shopSlugFromUrl(entry.url),
          slots: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  } finally {
    await browser.close();
  }
  return results;
});

ipcMain.handle("open-url", async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("autofill-slot", async (_event, slot) => {
  const { config, prefiller } = await getLib();
  const cfg = config.loadConfig();
  prefiller.openAndPrefill(slot, cfg.profile, cfg.settings).catch((e) => {
    console.error("autofill failed", e);
  });
  return { ok: true };
});

ipcMain.handle("open-tablecheck-signin", async () => {
  const { prefiller } = await getLib();
  prefiller.openSignIn().catch((e) => console.error("sign-in launch failed", e));
  return { ok: true };
});

ipcMain.handle("quit-app", async () => {
  setTimeout(() => app.quit(), 100);
  return { ok: true };
});

// Track the most recent sign-in result so the UI can show it without re-checking each time.
let lastSignInStatus = { result: "unknown", at: null };

ipcMain.handle("get-signin-status", async () => lastSignInStatus);

ipcMain.handle("run-signin-now", async () => {
  try {
    const { config, prefiller } = await getLib();
    const profile = config.loadProfile();
    const result = await prefiller.autoSignIn(profile);
    lastSignInStatus = { result, at: Date.now() };
    return lastSignInStatus;
  } catch (e) {
    lastSignInStatus = { result: "failed", error: e.message, at: Date.now() };
    return lastSignInStatus;
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

// On quit, persist `background_poll_enabled: false` so a relaunch starts
// stopped. The user must explicitly tick Enabled + Apply again to re-arm
// the scheduler. The configured `background_poll_minutes` is preserved.
let quitInProgress = false;
app.on("before-quit", (event) => {
  if (quitInProgress) return;
  quitInProgress = true;
  // Stop the in-memory timer immediately (no future ticks).
  stopBackgroundPoll();
  // Persist enabled=false to disk before exiting. Defer the actual quit
  // until the write completes.
  event.preventDefault();
  (async () => {
    try {
      const { config } = await getLib();
      const current = config.loadSettings();
      if (current.background_poll_enabled) {
        config.saveSettings({ ...current, background_poll_enabled: false });
        console.log("[poll] disabled in settings.yaml on quit");
      }
    } catch (e) {
      console.error("could not persist poll-disable on quit:", e.message);
    } finally {
      app.exit(0);
    }
  })();
});

// ============================================================================
// Background polling
// ============================================================================

let pollTimer = null;
let pollStatus = { running: false, lastTickAt: null, lastError: null, nextTickAt: null, tickInProgress: false };
let pollAborted = false;
let pollActiveBrowser = null;
// Cache of the latest poll tick's per-restaurant results. Mirrored from main
// process to the UI's Results card so the popover stays useful even after the
// notification is dismissed.
let lastPollResults = [];
let lastPollStartedAt = null;
let lastPollFinishedAt = null;

function pushPollResult(result) {
  lastPollResults.push(result);
  if (mb && mb.window && !mb.window.isDestroyed()) {
    mb.window.webContents.send("poll-result", result);
  }
}

function broadcastPollSummary() {
  if (mb && mb.window && !mb.window.isDestroyed()) {
    mb.window.webContents.send("poll-summary", {
      startedAt: lastPollStartedAt,
      finishedAt: lastPollFinishedAt,
      results: lastPollResults,
    });
  }
}

/**
 * Display a macOS notification. We use osascript (rather than Electron's
 * Notification API) because the API is unreliable for unsigned dev builds —
 * notifications silently no-op if the OS hasn't granted permission to the
 * specific binary. osascript piggybacks on Script Editor's notification
 * permission, which is granted by default on every Mac.
 */
function macDisplayNotification({ title, subtitle, body, sound = "Glass" }) {
  console.log(`[notify] ${title} — ${body}`);
  if (process.platform !== "darwin") return;
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const parts = [`display notification "${esc(body)}"`, `with title "${esc(title)}"`];
  if (subtitle) parts.push(`subtitle "${esc(subtitle)}"`);
  if (sound) parts.push(`sound name "${esc(sound)}"`);
  spawn("osascript", ["-e", parts.join(" ")], { stdio: "ignore", detached: true }).unref();

  // Also fire Electron's Notification as a parallel attempt — when it works
  // it gives us click-to-open behavior. Harmless if it silently no-ops.
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body: subtitle ? `${subtitle}\n${body}` : body, silent: true });
      n.on("click", () => {
        // body for slot notifications is the deepLink; for the test it's a marker string.
        if (body.startsWith("http")) shell.openExternal(body).catch(() => {});
        if (mb.window) mb.showWindow();
      });
      n.show();
    }
  } catch { /* ignore */ }
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayLabel(iso) {
  const [yy, mm, dd] = iso.split("-").map(Number);
  return WEEKDAYS_SHORT[new Date(yy, mm - 1, dd).getDay()];
}

/**
 * One notification per restaurant per tick. macOS bundles rapid notifications
 * from the same source into "X notifications" rollups — so firing 14 separate
 * banners ends up invisible. A single summary banner is reliably shown.
 */
function notifyForNewSlots(shopName, newSlots) {
  if (newSlots.length === 0) return;
  const first = newSlots[0];
  const more = newSlots.length > 1 ? ` (+${newSlots.length - 1} more)` : "";
  macDisplayNotification({
    title: `🍣 ${shopName} — new slot${newSlots.length > 1 ? "s" : ""}`,
    subtitle: `${first.date} ${weekdayLabel(first.date)} ${first.time}${more}`,
    body: `Party of ${first.partySize} — open the TC menubar to book`,
  });
}

async function runOneTick() {
  pollStatus.lastError = null;
  pollStatus.tickInProgress = true;
  pollAborted = false;
  // Reset cache + notify renderer that a fresh tick has started.
  lastPollResults = [];
  lastPollStartedAt = Date.now();
  lastPollFinishedAt = null;
  broadcastPollSummary();
  try {
    const { config, checker, state } = await getLib();
    const cfg = config.loadConfig();
    const entries = cfg.watchlist.filter((w) => w.enabled);
    if (entries.length === 0) return;

    const browser = await checker.launchBrowser(true);
    pollActiveBrowser = browser;
    try {
      const concurrency = Math.max(1, Math.min(4, cfg.settings.poll_concurrency || 1));
      const quietMinutes = cfg.settings.notify_repeat_minutes;
      console.log(`[poll] tick: ${entries.length} restaurants, concurrency=${concurrency}`);

      await runPool(entries, concurrency, async (entry) => {
        if (pollAborted) return;
        let slots = [];
        let errorMsg = null;
        try {
          slots = await checker.checkEntry(entry, cfg.settings, browser);
        } catch (e) {
          const msg = e?.message || String(e);
          const isBrowserClosed = /Target page, context or browser has been closed|browserContext\.close/.test(msg);
          if (pollAborted || isBrowserClosed) {
            console.log(`[poll] ${entry.name} check cancelled`);
            return;
          }
          console.error("[poll]", entry.name, "check failed:", msg);
          errorMsg = msg;
        }
        let deduped = 0;
        const newSlots = [];
        for (const s of slots) {
          const key = `${s.shopUrl}|${s.date}|${s.time}|${s.partySize}`;
          if (state.alreadyNotified(key, quietMinutes)) { deduped++; continue; }
          state.markNotified(key);
          newSlots.push(s);
        }
        if (newSlots.length > 0) notifyForNewSlots(entry.name, newSlots);
        const window = quietMinutes === 0 ? "no dedupe" : `silenced for ${quietMinutes}m`;
        console.log(`[poll] ${entry.name}: ${slots.length} matched | ${newSlots.length} new (notified) | ${deduped} ${window}`);
        // Mirror the result to the UI's Results card.
        pushPollResult({
          name: entry.name,
          url: entry.url,
          partySize: entry.party_size,
          slug: checker.shopSlugFromUrl(entry.url),
          slots,
          error: errorMsg,
          stats: { matched: slots.length, newCount: newSlots.length, deduped },
        });
      }, 800, () => pollAborted);
    } finally {
      pollActiveBrowser = null;
      await browser.close().catch(() => {});
    }
  } catch (e) {
    pollStatus.lastError = e.message || String(e);
    console.error("[poll] tick failed:", e.message);
  } finally {
    pollStatus.lastTickAt = Date.now();
    pollStatus.tickInProgress = false;
    lastPollFinishedAt = Date.now();
    broadcastPollSummary();
  }
}

function startBackgroundPoll(minutes) {
  stopBackgroundPoll();
  const ms = Math.max(1, minutes) * 60_000;
  pollStatus.running = true;
  pollStatus.nextTickAt = Date.now() + ms;
  pollTimer = setInterval(() => {
    pollStatus.nextTickAt = Date.now() + ms;
    runOneTick();
  }, ms);
  // Fire one immediately so the user sees something happen.
  runOneTick();
  console.log(`[poll] started, every ${minutes} min`);
}

function stopBackgroundPoll() {
  // 1. Stop scheduling future ticks.
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  pollStatus.running = false;
  pollStatus.nextTickAt = null;

  // 2. Signal mid-tick abort so the loop bails between restaurants.
  pollAborted = true;

  // 3. Close any active Playwright browser so the current scrape ends now.
  if (pollActiveBrowser) {
    pollActiveBrowser.close().catch(() => {});
    pollActiveBrowser = null;
  }

  console.log("[poll] stopped");
}

ipcMain.handle("get-last-poll-results", async () => ({
  startedAt: lastPollStartedAt,
  finishedAt: lastPollFinishedAt,
  inProgress: pollStatus.tickInProgress,
  results: lastPollResults,
}));

ipcMain.handle("get-poll-status", async () => {
  const { config } = await getLib();
  const s = config.loadSettings();
  return {
    enabled: s.background_poll_enabled,
    minutes: s.background_poll_minutes,
    repeatMinutes: s.notify_repeat_minutes,
    concurrency: s.poll_concurrency,
    running: pollStatus.running,
    tickInProgress: pollStatus.tickInProgress,
    lastTickAt: pollStatus.lastTickAt,
    nextTickAt: pollStatus.nextTickAt,
    lastError: pollStatus.lastError,
  };
});

// Hard stop — interrupts in-flight work AND persists "disabled" so a relaunch
// doesn't auto-resume.
ipcMain.handle("reset-notification-history", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const p = path.resolve("state.json");
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    console.log("[poll] notification history cleared (state.json removed)");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("test-notification", async () => {
  macDisplayNotification({
    title: "🍣 TC Watcher — test",
    subtitle: "If you can see this, notifications work",
    body: "Click the menubar icon → Check tab to run a real check",
  });
  return { ok: true };
});

ipcMain.handle("stop-poll-now", async () => {
  stopBackgroundPoll();
  try {
    const { config } = await getLib();
    const current = config.loadSettings();
    config.saveSettings({ ...current, background_poll_enabled: false });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true };
});

ipcMain.handle("set-poll-config", async (_event, { enabled, minutes, repeatMinutes, concurrency }) => {
  const { config } = await getLib();
  try {
    const current = config.loadSettings();
    const merged = {
      ...current,
      background_poll_enabled: !!enabled,
      background_poll_minutes: Math.max(1, Math.min(60, Number(minutes) || 5)),
      notify_repeat_minutes:
        repeatMinutes === undefined || repeatMinutes === null || repeatMinutes === ""
          ? current.notify_repeat_minutes
          : Math.max(0, Math.min(1440, Number(repeatMinutes))),
      poll_concurrency:
        concurrency === undefined || concurrency === null || concurrency === ""
          ? current.poll_concurrency
          : Math.max(1, Math.min(4, Number(concurrency))),
    };
    config.saveSettings(merged);
    if (merged.background_poll_enabled) startBackgroundPoll(merged.background_poll_minutes);
    else stopBackgroundPoll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// On app launch the scheduler is ALWAYS stopped — the user must explicitly
// tick Enabled + Apply to start it each session. The configured interval is
// remembered. This is robust even when the previous run was killed via
// SIGKILL / crash (where `before-quit` couldn't flip the setting).
app.whenReady().then(async () => {
  try {
    const { config } = await getLib();
    const current = config.loadSettings();
    if (current.background_poll_enabled) {
      config.saveSettings({ ...current, background_poll_enabled: false });
      console.log("[poll] cleared stale 'enabled: true' from settings.yaml on launch");
    }
  } catch (e) {
    console.error("could not normalize settings on launch:", e.message);
  }
});
