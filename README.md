# tablecheck-crawler

A personal-use macOS menubar app (with optional CLI) that watches [TableCheck](https://www.tablecheck.com/) restaurants for openings, pings you when one matches your criteria, and launches a logged-in Chromium pre-filled and pre-navigated to the exact slot. You review and click 予約する.

## What it does

1. Watches a YAML list of restaurants × dates × party sizes × time windows.
2. Hits TableCheck's `available/timetable` JSON API directly (auto-extracts the CSRF token from the reserve page) — no DOM scraping, fast, low traffic.
3. On a match: fires a macOS desktop notification and optionally launches a real Chromium pointed at the slot, with your reservation form populated. If you've configured account credentials it auto-signs-in headlessly on first run so the form is filled by TableCheck itself (account auto-fill), and our prefiller only tops up empty fields.
4. Dedupes notifications via a configurable quiet window so you're not spammed for the same slot every tick.
5. Honors a configurable parallelism budget so 8 restaurants check in ~30 s instead of ~2 min, while still respecting TableCheck's per-IP rate limit.

## Setup

```bash
npm install   # also installs Chromium + Playwright (~250 MB)
cp profile.example.yaml profile.yaml
cp watchlist.example.yaml watchlist.yaml
cp settings.example.yaml settings.yaml   # optional; defaults are fine
```

Edit the three YAMLs in any text editor, or use the menubar UI (covered below) — both write back to the same files. All three runtime files are git-ignored.

## Usage

### Menubar app (recommended)

```bash
npm run ui
```

The TableCheck logo appears in your macOS menubar (top-right of your screen). Click it to open a popover with three tabs:

- **Check** — Tick which restaurants from your watchlist to scan, then **Check Now**. Results stream into the card below, grouped by restaurant + date (with weekday). Each available slot shows the time as a clickable link that opens the reservation page in your default browser; the **Autofill** button opens the slot inside our managed Chromium (logged in) so TableCheck auto-fills the form and you click Confirm.
- **Restaurants** — Add / edit / delete watchlist entries inline. Each row has its own Save button (writes the whole `watchlist.yaml` atomically); changes are picked up by the next check.
- **Profile** — Form for your booking details (name / email / phone / kanji / occasion / notes). The TableCheck account section shows a sign-in status pill, a manual sign-in button (for Google/Apple SSO or 2FA), and a "Re-check / sign in now" trigger. Credentials live in `profile.yaml`; the form deliberately doesn't expose the password field.

Bonus: drop `TC Watcher.command` (in the repo root) onto your Desktop to launch by double-click. macOS may need a right-click → Open on first run.

#### Background polling

The Check tab also has a **Background polling** card with three knobs and a status pill:

| Field | What it does | Default |
|---|---|---|
| `Enabled` checkbox + `Apply` button | Starts/stops the in-process scheduler. The app is **always stopped on launch** — relaunching never auto-resumes (robust even after `pkill -9`). | unchecked |
| `Every N min` | Poll interval. | 5 |
| `Re-notify after N min` | Quiet window per slot. After a slot is notified, it's silenced for this many minutes; the next tick after that re-pings if it's still open. `0` = re-notify on every tick. | 30 |
| `Workers` | Concurrent restaurant checks per tick (worker pool). `1` = sequential (current safest). `4` = max. | 2 |

While polling, the same Results card on the Check tab streams **live updates from each scheduled tick** — header turns into a green "Background poll · started HH:MM:SS (done)" pill when complete, and each restaurant's slots populate as workers finish. Close and reopen the popover any time; the latest tick's results are cached and re-rendered.

Three buttons next to Apply:

- **Stop Now** (red, visible only while running) — kills the timer **and** closes the active Playwright browser to abort any in-flight scrape. Persists `enabled: false` to disk.
- **Test notification** — fires one banner immediately so you can verify macOS will surface them.
- **Reset history** — wipes `state.json` so the next tick treats all currently-open slots as new (useful for testing or when you just want a "what's open right now?" ping).

### CLI (scripted)

```bash
npm run dev                # the polling loop, runs forever. Ctrl-C to stop.
npm run check-once         # one pass, then exit
npm run check-once -- --debug  # also dump page HTML + screenshots + XHR bodies to ./debug
npm run book               # skip detection — open prefilled form for first enabled entry (autofill smoke test)
```

#### Reading the CLI output

Each entry prints every date in its window:

```
→ Restaurant ABC | party 2 | window 2026-05-29 → 2026-08-06 (70 days)
  2026-05-29  closed                          ← restaurant closed (or beyond booking horizon)
  2026-05-30  ✗ 11:30  ✗ 18:00                ← slots exist but fully booked
  2026-07-01  · 11:30  ✗ 18:00                ← available but outside your time filter
  2026-07-02  · 11:30  ✓ 18:00   ← match     ← available AND in your filter — notification fires
  ...
  ✓ 1 match(es) in 18:00-21:00
```

The menubar's Check tab renders the same data structure as styled card rows.

### Build for production

```bash
npm run build
node dist/index.js         # equivalent to `npm run dev` without tsx overhead
```

## Config files

| File | Holds | Editable via UI |
|---|---|---|
| `profile.yaml` | Your details (name, email, phone, kanji, occasion, notes, **TableCheck account credentials**) | ✓ Profile tab (credentials kept file-only) |
| `watchlist.yaml` | Your restaurants | ✓ Restaurants tab |
| `settings.yaml` | Poll cadence, locale, on-match behavior, worker pool size, re-notify quiet window | File-only |

### Profile

```yaml
first_name: You_First
last_name: You_Last
kanji_first_name: ""           # for the JP form (kanji name fields)
kanji_last_name: ""
furigana_first_name: ""
furigana_last_name: ""
email: you@example.com
phone: "09000000000"
occasion: ""                   # birthday / business / anniversary / …
visit_count: first             # first | 2nd | 3rd | 4th_plus
notes: ""

# Optional: TableCheck login. If both fields are set, the app auto-signs-in
# (headless) on launch and the session cookie is reused for all Autofill
# clicks. Won't work with Google/Apple SSO or 2FA — use manual sign-in in
# the Profile tab for those cases.
# WARNING: plaintext password on disk (file is gitignored).
tablecheck_account: ""
tablecheck_password: ""
```

### Watchlist

Each entry is one restaurant. Date selection takes either explicit `dates`, a rolling `window_weeks` / `window_days`, or both:

```yaml
- name: ABC
  url: https://www.tablecheck.com/shops/{ABC}/reserve
  party_size: 2
  window_weeks: 10                    # any date in the next 10 weeks
  times: ["18:00-21:00"]              # acceptable HH:MM-HH:MM ranges; [] = any time
  enabled: true                       # `false` to pause without deleting

# - name: Another Spot
#   url: https://www.tablecheck.com/shops/some-slug/reserve
#   party_size: 4
#   dates: ["2026-12-31"]              # specific dates instead
#   times: []
#   enabled: true
```

### Settings

```yaml
# CLI poll loop cadence (the menubar app's background polling uses its own setting).
poll_interval_seconds: 180
poll_jitter_seconds: 30
headless_check: true

# What happens when a slot is found via the CLI (`npm run dev`).
on_match: "notify+open"               # notify | open | notify+open

# Locale used for API requests + reserve page.
locale: "en"
notify_sound: "Glass"

# Background polling (menubar UI). Default false — must be explicitly enabled each session.
background_poll_enabled: false
background_poll_minutes: 5
# Quiet window per slot. After a notification, the slot is silenced for this
# many minutes; subsequent ticks re-ping if it's still open. 0 = no dedupe.
notify_repeat_minutes: 30
# Worker pool size. 1 = sequential (current behaviour). 4 = max. Bump cautiously
# — TableCheck rate-limits per IP; the retry-with-backoff path catches 429s if
# you go too high.
poll_concurrency: 2
```

## How autofill works

When you click **Autofill** on a slot (manual results card or after a notification), `src/prefiller.ts` opens a persistent Chromium (`.browser-profile/`, gitignored, so cookies survive across runs) and:

1. **Restores cookies** from `.browser-profile-cookies.json` (separate side-file because Playwright's persistent profile drops session cookies on close).
2. Loads the reserve URL.
3. If the page is showing the **4-option sign-in gate** (Facebook / Google / Yahoo / TableCheck), clicks the TableCheck button and fills email + password from `profile.yaml`, then returns to the reserve page.
4. **Sets the party-size dropdown** (`#reservation_num_people_adult`).
5. **Navigates the calendar** week by week to your target date (`.next-week` clicks until the `(weekday, day)` cell is visible), respecting `day-closed` cells.
6. **Clicks the time-slot cell** at the intersection of the date column and the `HH:MM` time row (only if the cell is `.available`).
7. **Waits ~1.5 s** for TableCheck's logged-in account to auto-populate the 予約者情報 section.
8. **Tops up empty fields only** from `profile.yaml` — never overwrites what TableCheck already filled. Touches the Rails IDs `#reservation_customer_first_name`, `_last_name`, `_kanji_*`, `_furigana_*`, `_email`, `_phone`, the notes textarea, and the occasion dropdown.

The browser stays open for you to review and click 予約する / Confirm. Nothing is submitted automatically.

## Files & state

| Path | What's in it |
|---|---|
| `profile.yaml` / `watchlist.yaml` / `settings.yaml` | Your config (gitignored) |
| `state.json` | Slot dedupe ledger (notified-at timestamps per `shop|date|time|party`); honored by `state.alreadyNotified(key, quietMinutes)`. Reset via UI button. |
| `.browser-profile/` | Persistent Chromium profile (DevTools state, localStorage) |
| `.browser-profile-cookies.json` | Side-file storing session cookies (TableCheck's session cookies have no expiry so Playwright's profile alone drops them on close) |
| `debug/` | Only created when you pass `check-once --debug` |
| `dist/` | Build output (gitignored) |
| `config.yaml.bak` | Old combined config, kept as a one-time backup when we split into three files |

## Caveats

- **TableCheck may update their form selectors.** If autofill stops working, run `npm run check-once -- --debug` to capture a fresh HTML snapshot and update the selector list in `src/prefiller.ts`.
- **CSRF token is per-page-load**; the checker re-fetches it on each entry. No persistent token caching.
- **Rate limit**: don't bump `poll_concurrency` past 2 unless your watchlist is large enough to need it. The retry-with-backoff in `src/checker.ts:fetchTimetable` handles 429s automatically, but persistent 429s mean you should dial back.
- **Notifications use `osascript`**, not Electron's `Notification` API, because the latter silently no-ops on unsigned dev builds. macOS may group rapid notifications from the same source — that's why each restaurant fires a single batched banner ("🍣 Presente Sugi — new slots · 2026-07-02 Thu 11:30 (+13 more)") instead of one per slot.
- **The menubar app's background poller is always stopped on launch.** You must explicitly tick Enabled + Apply each session — even after a clean quit. The `background_poll_minutes`, `notify_repeat_minutes`, and `poll_concurrency` values are remembered.
- **Personal tool, no auth.** There's no account system inside this app; "your" data is whatever's in your local YAMLs. Don't commit them.
