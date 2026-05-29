import { chromium } from "playwright";

// Start COMPLETELY fresh (no persistent profile) so we see the not-yet-logged-in flow.
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "ja-JP" });
const page = await ctx.newPage();

await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-01&num_people=4", {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

const url1 = page.url();
const body1 = await page.locator("body").innerText().catch(() => "");
console.log("=== INITIAL LOAD ===");
console.log("URL:", url1);
console.log("body chars:", body1.length);
console.log("first 800 chars:", body1.slice(0, 800).replace(/\n/g, " | "));

// Try clicking the time slot for 11:30 (the lunch time for presente-sugi)
console.log("\n=== CLICK 11:30 ===");
const clicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
  const target = btns.find((b) => /\b11:30\b/.test(((b)).innerText || ""));
  if (target) { (target as HTMLElement).click(); return true; }
  return false;
});
console.log("clicked 11:30?:", clicked);
await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(2000);

const url2 = page.url();
const body2 = await page.locator("body").innerText().catch(() => "");
console.log("URL after click:", url2);
console.log("body chars after click:", body2.length);
console.log("first 1200 chars:", body2.slice(0, 1200).replace(/\n/g, " | "));

// Look for sign-in-related buttons / options on the page
console.log("\n=== Sign-in / auth-looking buttons ===");
const authBtns = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button, a, [role='button']"))
    .filter((b) => {
      const t = ((b) as HTMLElement).innerText || "";
      return /login|log in|sign in|sign up|guest|ゲスト|ログイン|tablecheck|google|facebook|apple|tc\s*points|tc\s*member|ポイント/i.test(t);
    })
    .map((b) => ({
      tag: b.tagName,
      text: ((b) as HTMLElement).innerText.replace(/\n/g, " ").slice(0, 80),
      id: (b as HTMLElement).id,
      classes: (b as HTMLElement).className.toString().slice(0, 60),
    }));
});
for (const b of authBtns) console.log("  ·", JSON.stringify(b));

await page.screenshot({ path: "/tmp/reserve-signin-step.png", fullPage: true }).catch(() => {});
console.log("\nScreenshot: /tmp/reserve-signin-step.png");

await browser.close();
