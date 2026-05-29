import { chromium, type BrowserContext, type Page } from "playwright";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Profile, Settings } from "./config.js";
import type { Slot } from "./checker.js";
import { log } from "./logger.js";

const PROFILE_DIR = () => resolve(".browser-profile");
const COOKIES_PATH = () => resolve(".browser-profile-cookies.json");

/** Save current cookies to a side-file (Playwright's persistent profile drops session cookies on close). */
async function persistCookies(ctx: BrowserContext) {
  try {
    const cookies = await ctx.cookies();
    writeFileSync(COOKIES_PATH(), JSON.stringify(cookies));
  } catch (e) {
    log.warn("cookie persist failed:", (e as Error).message);
  }
}

/** Restore cookies from side-file at context startup. */
async function restoreCookies(ctx: BrowserContext) {
  if (!existsSync(COOKIES_PATH())) return;
  try {
    const cookies = JSON.parse(readFileSync(COOKIES_PATH(), "utf8"));
    if (Array.isArray(cookies) && cookies.length > 0) await ctx.addCookies(cookies);
  } catch (e) {
    log.warn("cookie restore failed:", (e as Error).message);
  }
}

async function launchPersistent(headless = false): Promise<BrowserContext> {
  // GPU acceleration crashes when a headed Chromium is launched as a child of
  // Electron (which is itself Chromium). The blank-page symptom is the giveaway.
  // Software rendering is plenty fast for a single tab.
  const args = ["--disable-blink-features=AutomationControlled"];
  if (!headless) args.push("--disable-gpu", "--disable-software-rasterizer", "--no-sandbox");

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR(), {
    headless,
    viewport: { width: 1280, height: 900 },
    args,
  });
  await restoreCookies(ctx);
  return ctx;
}

/**
 * Open the managed Chromium at the TableCheck sign-in page. Cookies persist in
 * .browser-profile/, so once the user signs in here, all future Autofill runs
 * will be authenticated as the same account.
 */
export async function openSignIn() {
  const ctx = await launchPersistent(false);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.tablecheck.com/en/users/sign_in", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  // Wait for the SPA shell to fully paint — without this, the user may see a
  // white page while the React app boots.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  log.info("Sign in to TableCheck in the opened browser. Close the window when done.");
}

/**
 * Headless auto-sign-in using credentials from profile.yaml. Idempotent — if
 * an existing cookie already authenticates us, we skip the form. Won't work
 * for Google/Apple SSO or 2FA-protected accounts; in those cases the user
 * should sign in manually via openSignIn().
 */
export async function autoSignIn(profile: Profile): Promise<"already" | "signed-in" | "failed" | "skipped"> {
  if (!profile.tablecheck_account || !profile.tablecheck_password) return "skipped";

  const ctx = await launchPersistent(true);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    // Visit a page that requires auth — if cookies are valid we'll stay there,
    // otherwise Rails redirects to /users/sign_in.
    await page.goto("https://www.tablecheck.com/en/account/edit", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    if (!/\/users\/sign_in/.test(page.url())) {
      log.info("auto-sign-in: already authenticated, skipping form fill");
      await persistCookies(ctx);
      return "already";
    }

    log.info("auto-sign-in: filling sign-in form");
    await page.locator("#customer_user_email").fill(profile.tablecheck_account, { timeout: 5_000 });
    await page.locator("#customer_user_password").fill(profile.tablecheck_password, { timeout: 5_000 });

    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
      page.locator('form#signUpForm button[type="submit"], form#signUpForm input[type="submit"]').first().click({ timeout: 5_000 }),
    ]);

    if (/\/users\/sign_in/.test(page.url())) {
      // Still on sign-in page — credentials rejected, captcha triggered, or 2FA required.
      const errText = await page.locator(".alert, .error, [class*='error']").first().textContent().catch(() => "");
      log.warn(`auto-sign-in: failed${errText ? " — " + errText.trim() : ""}`);
      return "failed";
    }
    log.info("auto-sign-in: signed in successfully");
    await persistCookies(ctx);
    return "signed-in";
  } catch (e) {
    log.warn("auto-sign-in: error —", (e as Error).message);
    return "failed";
  } finally {
    await ctx.close();
  }
}

/**
 * Launches a headed browser pinned to a persistent profile dir so the user stays
 * logged in across runs. Navigates to the slot URL, picks the time, then fills
 * the reservation form with the user's profile. Leaves the page open — user
 * reviews and clicks Confirm.
 *
 * Form selectors come from TableCheck's Rails form helpers (stable across
 * locales): #reservation_customer_first_name, #reservation_customer_email, etc.
 * If the SPA renders different names we fall back to label-based matching.
 */
export async function openAndPrefill(slot: Slot, profile: Profile, _settings: Settings) {
  const ctx = await launchPersistent();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  log.info(`Opening ${slot.shopName} ${slot.date} ${slot.time} for ${slot.partySize}`);
  await page.goto(slot.deepLink, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  // Click TableCheck login if the gate is up, else no-op.
  await ensureSignedIn(page, profile).catch((e) => log.warn("sign-in step failed:", e.message));

  // Drive the page's controls so the user lands on the exact slot they wanted.
  await selectPartySize(page, slot.partySize).catch((e) => log.warn("party-size set failed:", e.message));
  await pickSlotInGrid(page, slot.date, slot.time).catch((e) => log.warn("slot pick failed:", e.message));
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  // When signed in, TableCheck auto-populates 予約者情報 from the account.
  await page.waitForTimeout(1500);

  await fillForm(page, profile).catch((e) => log.warn("form fill partial:", e.message));

  log.info("✓ Form ready. Review and click Confirm/予約する.");
}

/** Set the 人数 (party size) dropdown. */
async function selectPartySize(page: Page, partySize: number): Promise<void> {
  const sel = page.locator("#reservation_num_people_adult").first();
  if ((await sel.count()) === 0) return;
  await sel.selectOption(String(partySize));
  log.info(`  · party size set to ${partySize}`);
}

/**
 * The reserve calendar is a single table: date columns (TDs with class wday-N
 * containing the day number) sit above time rows (TH "HH:MM" + TDs with class
 * "available" | "not_available" | "closed"). To select an exact slot we navigate
 * weeks until the target date is visible, then click the TD at the intersection
 * of (target time row, target date column).
 */
async function pickSlotInGrid(page: Page, isoDate: string, time: string): Promise<boolean> {
  const [y, mo, d] = isoDate.split("-").map(Number) as [number, number, number];
  const wday = new Date(y, mo - 1, d).getDay();

  // Party-size change triggers an XHR that refreshes the calendar. Wait first.
  await page.waitForSelector("td[class*='wday-']", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(800);

  for (let week = 0; week < 26; week++) {
    const result: "clicked" | "unavailable" | "not-visible" = await page.evaluate(
      ({ day, wday, time }) => {
        const tables = Array.from(document.querySelectorAll("table"));
        for (const tbl of tables) {
          const rows = Array.from(tbl.querySelectorAll("tr"));
          // Find the column index of the target (wday, day) in a wday-* row.
          // Matching wday is critical: across months, the same `day` recurs and
          // would otherwise match the wrong cell.
          let dateColIdx = -1;
          for (const row of rows) {
            const tds = Array.from(row.querySelectorAll("td"));
            for (let j = 0; j < tds.length; j++) {
              const td = tds[j];
              if (!td) continue;
              const wm = Array.from(td.classList).find((c) => /^wday-\d$/.test(c));
              if (!wm || Number(wm.slice(5)) !== wday) continue;
              const m = (td as HTMLElement).innerText.match(/\d+/);
              if (m && m[0] && Number(m[0]) === day) { dateColIdx = j; break; }
            }
            if (dateColIdx >= 0) break;
          }
          if (dateColIdx < 0) continue;

          // Find the time row whose first TH text matches our target time.
          for (const row of rows) {
            const firstTh = row.querySelector("th");
            if (!firstTh) continue;
            if ((firstTh as HTMLElement).innerText.trim() !== time) continue;
            const tds = Array.from(row.querySelectorAll("td"));
            const target = tds[dateColIdx];
            if (!target) continue;
            if (target.classList.contains("available")) {
              (target as HTMLElement).click();
              return "clicked" as const;
            }
            return "unavailable" as const;
          }
        }
        return "not-visible" as const;
      },
      { day: d, wday, time },
    );

    if (result === "clicked") {
      log.info(`  · slot ${isoDate} ${time} clicked (after ${week} week-step${week === 1 ? "" : "s"})`);
      await page.waitForTimeout(800);
      return true;
    }
    if (result === "unavailable") {
      log.warn(`  · slot ${isoDate} ${time} is not bookable (closed or already taken)`);
      return false;
    }

    // Date not visible — advance one week.
    const advanced = await page.evaluate(() => {
      const btn = document.querySelector(".next-week") as HTMLElement | null;
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!advanced) {
      log.warn("  · no .next-week button found");
      return false;
    }
    await page.waitForTimeout(600);
  }
  log.warn(`  · could not reach ${isoDate} within 26 weeks`);
  return false;
}

/**
 * The reserve page shows a 4-option login bar inside the 予約情報 section when
 * the user isn't authenticated. If we have credentials, click the TableCheck
 * button (the email+password option, vs Facebook/Google/Yahoo), fill creds,
 * and let the post-login redirect bring us back to the reserve page.
 */
async function ensureSignedIn(page: Page, profile: Profile): Promise<"already" | "signed-in" | "no-creds" | "no-gate"> {
  const loginBtn = page.locator("#tablecheck_login").first();
  const visible = await loginBtn.isVisible().catch(() => false);
  if (!visible) return "no-gate";

  if (!profile.tablecheck_account || !profile.tablecheck_password) {
    log.warn("Reserve page requires sign-in but no credentials in profile.yaml");
    return "no-creds";
  }

  log.info("Reserve page asking for sign-in — clicking TableCheck and filling credentials");
  await loginBtn.click({ timeout: 5_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  // Now on /users/sign_in
  await page.locator("#customer_user_email").fill(profile.tablecheck_account, { timeout: 5_000 });
  await page.locator("#customer_user_password").fill(profile.tablecheck_password, { timeout: 5_000 });
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
    page.locator('form#signUpForm button[type="submit"], form#signUpForm input[type="submit"]').first().click({ timeout: 5_000 }),
  ]);

  // We should be redirected back to the reserve page (login_source=reserve).
  log.info("Signed in via reserve page");
  return "signed-in";
}


/** Map a profile field → a list of candidate selectors. First-found wins. */
function fieldMap(p: Profile): Array<{ value: string; selectors: string[]; label?: RegExp }> {
  return [
    {
      value: p.first_name,
      selectors: ["#reservation_customer_first_name", 'input[name*="first_name"]:not([name*="kanji"]):not([name*="furigana"])'],
      label: /first\s*name|名前|名/i,
    },
    {
      value: p.last_name,
      selectors: ["#reservation_customer_last_name", 'input[name*="last_name"]:not([name*="kanji"]):not([name*="furigana"])'],
      label: /last\s*name|姓|苗字/i,
    },
    {
      value: p.kanji_first_name,
      selectors: ["#reservation_customer_kanji_first_name", 'input[name*="kanji_first_name"]'],
    },
    {
      value: p.kanji_last_name,
      selectors: ["#reservation_customer_kanji_last_name", 'input[name*="kanji_last_name"]'],
    },
    {
      value: p.furigana_first_name,
      selectors: ['input[name*="furigana_first_name"]', 'input[id*="furigana_first"]'],
    },
    {
      value: p.furigana_last_name,
      selectors: ['input[name*="furigana_last_name"]', 'input[id*="furigana_last"]'],
    },
    {
      value: p.email,
      selectors: ["#reservation_customer_email", 'input[type="email"]', 'input[name*="email"]'],
    },
    {
      value: p.email,
      selectors: ["#reservation_customer_email_confirmation", 'input[name*="email_confirmation"]'],
    },
    {
      value: p.phone,
      selectors: ["#reservation_customer_phone", 'input[type="tel"]', 'input[name*="phone"]'],
    },
    {
      value: p.notes,
      selectors: ['textarea[name*="memo"]', 'textarea[name*="note"]', 'textarea[name*="request"]', "#reservation_user_note"],
    },
  ].filter((f) => f.value && f.value.length > 0);
}

/**
 * Try selectors in order, fill the first match — BUT only if it's currently empty.
 * If TableCheck (or a browser autofill) already populated the field, we leave
 * it alone so we don't overwrite logged-in-account data with profile.yaml.
 */
async function fillIfEmpty(page: Page, selectors: string[], value: string): Promise<"filled" | "kept" | "miss"> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0) continue;
    try {
      const existing = (await el.inputValue({ timeout: 1_000 })).trim();
      if (existing) return "kept";
      await el.fill(value, { timeout: 2_000 });
      return "filled";
    } catch {
      /* try next selector */
    }
  }
  return "miss";
}

async function fillForm(page: Page, profile: Profile) {
  let filled = 0, kept = 0;
  for (const field of fieldMap(profile)) {
    const r = await fillIfEmpty(page, field.selectors, field.value);
    if (r === "filled") filled++;
    else if (r === "kept") kept++;
    else if (field.label) {
      try {
        const el = page.getByLabel(field.label).first();
        if ((await el.count()) > 0) {
          const existing = (await el.inputValue({ timeout: 1_000 })).trim();
          if (existing) kept++;
          else { await el.fill(field.value, { timeout: 2_000 }); filled++; }
        }
      } catch { /* skip */ }
    }
  }

  // Occasion dropdown — leave alone if already set.
  if (profile.occasion) {
    const dropdowns = [
      page.locator('select[name*="occasion"]'),
      page.locator('select[name*="purpose"]'),
    ];
    for (const dd of dropdowns) {
      if ((await dd.count()) === 0) continue;
      const current = await dd.inputValue().catch(() => "");
      if (current) { kept++; break; }
      await dd.selectOption({ label: profile.occasion }).catch(() =>
        dd.selectOption({ value: profile.occasion }).catch(() => {}),
      );
      filled++;
      break;
    }
  }

  log.info(`  filled ${filled} field(s) from profile, kept ${kept} that TableCheck/account already populated`);
}
