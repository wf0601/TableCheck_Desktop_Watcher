import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Settings, WatchEntry } from "./config.js";
import { addDays, expandTargetDates, timeInAnyRange, toIsoDate } from "./config.js";
import { log } from "./logger.js";

export type Slot = {
  shopName: string;
  shopUrl: string;
  shopSlug: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  partySize: number;
  /** Unix timestamp (seconds) the API uses as the slot key. */
  slotTs: number;
  /** URL pointing to the reserve page with date/party-size set. The Playwright autofill driver clicks from there. */
  deepLink: string;
};

type TimetableResponse = {
  queried_date?: string;
  data?: {
    slots?: Record<string, Record<string, { available: boolean; seconds: number }>>;
    seconds?: number[];
  };
};

export function shopSlugFromUrl(url: string): string {
  const m = url.match(/\/shops\/([^/?#]+)/);
  if (!m) throw new Error(`Cannot extract shop slug from ${url}`);
  return m[1]!;
}

export function buildReserveUrl(baseUrl: string, date: string, partySize: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set("date", date);
  u.searchParams.set("num_people", String(partySize));
  return u.toString();
}

function secondsToHHMM(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function localePath(url: string, locale: string): string {
  // The reserve URL may be /shops/<slug>/reserve or /<locale>/shops/<slug>/reserve.
  // Normalize to /<locale>/shops/<slug>/reserve for token + API consistency.
  const u = new URL(url);
  const path = u.pathname.replace(/^\/([a-z]{2}(-[A-Z]{2})?\/)?/, "/");
  u.pathname = `/${locale}${path}`;
  return u.toString();
}

async function warmupAndGetToken(page: Page, reserveUrl: string, locale: string): Promise<string> {
  const url = localePath(reserveUrl, locale);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const token = await page
    .locator('meta[name="csrf-token"]')
    .first()
    .getAttribute("content");
  if (!token) throw new Error("csrf token not found on reserve page");
  return token;
}

async function fetchTimetable(
  page: Page,
  shopSlug: string,
  locale: string,
  partySize: number,
  startDate: string,
  csrfToken: string,
): Promise<TimetableResponse> {
  const apiUrl = new URL(`https://www.tablecheck.com/${locale}/shops/${shopSlug}/available/timetable`);
  apiUrl.searchParams.set("authenticity_token", csrfToken);
  apiUrl.searchParams.set("reservation[num_people_adult]", String(partySize));
  apiUrl.searchParams.set("reservation[start_date]", startDate);

  type FetchResult =
    | { ok: true; data: TimetableResponse }
    | { ok: false; status: number; retryAfter: string | null };

  // Retry on 429 with backoff. TableCheck rate-limits per IP; bursts of ~80+
  // requests trip it. Most often a single backoff is enough.
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = (await page.evaluate(async (url: string) => {
      const r = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        return { ok: false, status: r.status, retryAfter: r.headers.get("Retry-After") };
      }
      return { ok: true, data: await r.json() };
    }, apiUrl.toString())) as FetchResult;

    if (result.ok) return result.data;

    if (result.status === 429) {
      const headerS = Number(result.retryAfter);
      const backoffMs = Number.isFinite(headerS) && headerS > 0
        ? headerS * 1000
        : Math.min(2000 * Math.pow(2, attempt), 15000); // 2s, 4s, 8s, 15s
      log.warn(`  rate-limited (429), backing off ${Math.round(backoffMs / 1000)}s (attempt ${attempt + 1}/4)`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`timetable fetch failed: HTTP ${result.status}`);
  }
  throw new Error("timetable fetch failed: HTTP 429 after 4 retries");
}

type DateSlots = Record<string, { available: boolean; seconds: number }>;

type SlotRow = { time: string; ts: number; available: boolean; inTimeFilter: boolean };
type DateStatus = "closed" | "checked";
type DateReport = { status: DateStatus; slots: SlotRow[] };

function summarizeDate(entry: WatchEntry, timesObj: DateSlots): SlotRow[] {
  return Object.entries(timesObj)
    .map(([tsStr, info]) => {
      const time = secondsToHHMM(info.seconds);
      return {
        time,
        ts: Number(tsStr),
        available: info.available,
        inTimeFilter: timeInAnyRange(time, entry.times),
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function matchesFromReport(
  entry: WatchEntry,
  shopSlug: string,
  date: string,
  rows: SlotRow[],
): Slot[] {
  return rows
    .filter((r) => r.available && r.inTimeFilter)
    .map((r) => ({
      shopName: entry.name,
      shopUrl: entry.url,
      shopSlug,
      date,
      time: r.time,
      partySize: entry.party_size,
      slotTs: r.ts,
      deepLink: buildReserveUrl(entry.url, date, entry.party_size),
    }));
}

function formatRow(r: SlotRow): string {
  // ✓ = bookable and matches your time filter
  // · = bookable but outside your time filter
  // ✗ = not bookable (full / not offered)
  const sym = !r.available ? "✗" : r.inTimeFilter ? "✓" : "·";
  return `${sym} ${r.time}`;
}

function printDateReport(date: string, rep: DateReport) {
  if (rep.status === "closed") {
    log.info(`  ${date}  closed`);
    return;
  }
  if (rep.slots.length === 0) {
    log.info(`  ${date}  no slots`);
    return;
  }
  const cells = rep.slots.map(formatRow).join("  ");
  const hasMatch = rep.slots.some((r) => r.available && r.inTimeFilter);
  log.info(`  ${date}  ${cells}${hasMatch ? "   ← match" : ""}`);
}

export type CheckOptions = { debug?: boolean };

const MAX_API_PAGES = 30; // safety cap for the start_date walk
const FALLBACK_STRIDE_DAYS = 7; // when API stops progressing naturally, jump forward this much

export async function checkEntry(
  entry: WatchEntry,
  settings: Settings,
  browser: Browser,
  _opts: CheckOptions = {},
): Promise<Slot[]> {
  const ctx: BrowserContext = await browser.newContext({
    locale: settings.locale === "ja" ? "ja-JP" : "en-US",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const found: Slot[] = [];
  try {
    const shopSlug = shopSlugFromUrl(entry.url);
    const csrfToken = await warmupAndGetToken(page, entry.url, settings.locale);

    const targetDates = expandTargetDates(entry);
    if (targetDates.length === 0) return found;
    const targetSet = new Set(targetDates);
    const lastTarget = targetDates[targetDates.length - 1]!;
    const today = toIsoDate(new Date());

    // The API returns a window of several upcoming service days from start_date.
    // Walk forward: each call advances start_date past the last returned date,
    // until we pass the user's last target date or the API stops returning new data.
    let startDate = targetDates[0]! < today ? today : targetDates[0]!;
    const reports = new Map<string, DateReport>();
    const seen = new Set<string>();

    for (let page_i = 0; page_i < MAX_API_PAGES; page_i++) {
      const resp = await fetchTimetable(
        page,
        shopSlug,
        settings.locale,
        entry.party_size,
        startDate,
        csrfToken,
      );
      const slotMap = resp.data?.slots ?? {};
      const returnedDates = Object.keys(slotMap).sort();
      let sawNewForward = false;

      for (const date of returnedDates) {
        if (!targetSet.has(date)) continue;
        if (reports.has(date)) continue;
        const rows = summarizeDate(entry, slotMap[date] ?? {});
        reports.set(date, { status: "checked", slots: rows });
        if (date >= startDate) sawNewForward = true;
        for (const s of matchesFromReport(entry, shopSlug, date, rows)) {
          const k = `${s.date}|${s.slotTs}`;
          if (seen.has(k)) continue;
          seen.add(k);
          found.push(s);
        }
      }

      // Advance start_date. The API sometimes returns only PAST dates (when start_date is
      // beyond what's been opened for booking yet), so we can't rely on maxReturned to
      // progress us forward — we have to fall back to a fixed stride.
      const maxReturned = returnedDates[returnedDates.length - 1] ?? "";
      const natural = maxReturned >= startDate ? addDays(maxReturned, 1) : "";
      const fallback = addDays(startDate, FALLBACK_STRIDE_DAYS);
      const nextStart = natural && sawNewForward ? natural : fallback;
      if (nextStart <= startDate) break; // truly stuck
      if (nextStart > lastTarget) break; // walked past the user's window
      startDate = nextStart;
      // Small per-call pause so a single shop's walk doesn't burst-fire 10+
      // requests in <1s and trip the per-IP rate limit.
      await new Promise((r) => setTimeout(r, 150));
    }

    // Fill in dates the API never returned — they're closed days for this shop.
    for (const date of targetDates) {
      if (!reports.has(date)) reports.set(date, { status: "closed", slots: [] });
    }

    log.info(
      `→ ${entry.name} | party ${entry.party_size} | window ${targetDates[0]} → ${lastTarget} (${targetDates.length} days)`,
    );
    for (const date of targetDates) printDateReport(date, reports.get(date)!);
    log.info(
      `  ${found.length > 0 ? "✓" : "·"} ${found.length} match(es) in ${entry.times.length > 0 ? entry.times.join(",") : "any time"}`,
    );
  } finally {
    // Swallow errors here — if the parent browser was force-closed (e.g. user
    // clicked Stop Now), ctx.close() will throw "Target page, context or
    // browser has been closed" which isn't a real failure.
    await ctx.close().catch(() => {});
  }
  return found;
}

export async function launchBrowser(headless: boolean): Promise<Browser> {
  return chromium.launch({ headless });
}
