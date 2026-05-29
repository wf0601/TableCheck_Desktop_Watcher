import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

const TimeRangeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "expected HH:MM-HH:MM");

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const ProfileSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  kanji_first_name: z.string().default(""),
  kanji_last_name: z.string().default(""),
  furigana_first_name: z.string().default(""),
  furigana_last_name: z.string().default(""),
  email: z.string().email(),
  phone: z.string().min(1),
  occasion: z.string().default(""),
  visit_count: z.enum(["first", "2nd", "3rd", "4th_plus"]).default("first"),
  notes: z.string().default(""),
  // Optional TableCheck credentials. If both set, the app auto-signs-in on launch.
  // Stored as plaintext in profile.yaml — file is gitignored, but anyone with
  // local disk access can read it. Empty = use the manual "Sign in" button.
  tablecheck_account: z.string().default(""),
  tablecheck_password: z.string().default(""),
});

export const SettingsSchema = z.object({
  poll_interval_seconds: z.number().int().min(30).default(180),
  poll_jitter_seconds: z.number().int().min(0).default(30),
  headless_check: z.boolean().default(true),
  on_match: z.enum(["notify", "open", "notify+open"]).default("notify+open"),
  locale: z.string().default("en"),
  notify_sound: z.string().default("Glass"),
  // Background polling from inside the menubar app. When enabled, the main
  // process checks every N minutes; new slots fire desktop notifications.
  background_poll_enabled: z.boolean().default(false),
  background_poll_minutes: z.number().int().min(1).max(60).default(5),
  // After a slot is notified once, it's silenced for this many minutes; the
  // next tick after that re-pings if the slot is still open. 0 = no dedupe
  // (notify on every tick). Default is balanced for "I want to see it again
  // if it's still there, but not every 5 minutes."
  notify_repeat_minutes: z.number().int().min(0).max(1440).default(30),
  // Number of restaurants checked in parallel (worker pool). 1 = sequential.
  // TableCheck rate-limits per IP — bump cautiously. The retry-with-backoff
  // path catches occasional 429s if you go too high.
  poll_concurrency: z.number().int().min(1).max(4).default(2),
});

export const WatchEntrySchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url(),
    party_size: z.number().int().min(1).max(20),
    dates: z.array(IsoDateSchema).default([]),
    window_weeks: z.number().int().min(1).max(26).optional(),
    window_days: z.number().int().min(1).max(180).optional(),
    times: z.array(TimeRangeSchema).default([]),
    enabled: z.boolean().default(true),
  })
  .refine(
    (e) => e.dates.length > 0 || e.window_weeks !== undefined || e.window_days !== undefined,
    { message: "set `dates`, `window_weeks`, or `window_days`" },
  );

export const WatchlistSchema = z.array(WatchEntrySchema);

export type Profile = z.infer<typeof ProfileSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type WatchEntry = z.infer<typeof WatchEntrySchema>;
export type Watchlist = z.infer<typeof WatchlistSchema>;
export type Config = { profile: Profile; settings: Settings; watchlist: Watchlist };

const PROFILE_PATH = () => resolve("profile.yaml");
const SETTINGS_PATH = () => resolve("settings.yaml");
const WATCHLIST_PATH = () => resolve("watchlist.yaml");

function readYaml(path: string): unknown {
  if (!existsSync(path)) throw new Error(`Missing config file: ${path}`);
  return parseYaml(readFileSync(path, "utf8"));
}

function writeYaml(path: string, data: unknown) {
  // Use a sane block-style format with stable key order.
  writeFileSync(path, stringifyYaml(data, { lineWidth: 0 }));
}

function formatIssues(name: string, err: z.ZodError): string {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
  return `Invalid ${name}:\n${issues}`;
}

export function loadProfile(): Profile {
  const raw = readYaml(PROFILE_PATH());
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(formatIssues("profile.yaml", parsed.error));
  return parsed.data;
}

export function loadSettings(): Settings {
  const path = SETTINGS_PATH();
  // Settings file is optional — fall back to defaults.
  if (!existsSync(path)) return SettingsSchema.parse({});
  const raw = readYaml(path);
  const parsed = SettingsSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new Error(formatIssues("settings.yaml", parsed.error));
  return parsed.data;
}

export function loadWatchlist(): Watchlist {
  const raw = readYaml(WATCHLIST_PATH());
  const parsed = WatchlistSchema.safeParse(raw);
  if (!parsed.success) throw new Error(formatIssues("watchlist.yaml", parsed.error));
  return parsed.data;
}

export function loadConfig(): Config {
  return {
    profile: loadProfile(),
    settings: loadSettings(),
    watchlist: loadWatchlist(),
  };
}

export function saveProfile(profile: Profile) {
  const parsed = ProfileSchema.parse(profile); // re-validate before writing
  writeYaml(PROFILE_PATH(), parsed);
}

export function saveWatchlist(list: Watchlist) {
  const parsed = WatchlistSchema.parse(list);
  writeYaml(WATCHLIST_PATH(), parsed);
}

export function saveSettings(settings: Settings) {
  const parsed = SettingsSchema.parse(settings);
  writeYaml(SETTINGS_PATH(), parsed);
}

/** Format a Date as YYYY-MM-DD in the local timezone (NOT UTC — booking dates are local). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toIsoDate(dt);
}

export function expandTargetDates(entry: WatchEntry, today: Date = new Date()): string[] {
  const set = new Set<string>(entry.dates);
  const days =
    (entry.window_days ?? 0) +
    (entry.window_weeks ? entry.window_weeks * 7 : 0);
  if (days > 0) {
    const start = toIsoDate(today);
    for (let i = 1; i <= days; i++) set.add(addDays(start, i));
  }
  return Array.from(set).sort();
}

export function timeInAnyRange(hhmm: string, ranges: string[]): boolean {
  if (ranges.length === 0) return true;
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const t = h * 60 + m;
  for (const r of ranges) {
    const [a, b] = r.split("-") as [string, string];
    const [ah, am] = a.split(":").map(Number) as [number, number];
    const [bh, bm] = b.split(":").map(Number) as [number, number];
    if (t >= ah * 60 + am && t <= bh * 60 + bm) return true;
  }
  return false;
}
