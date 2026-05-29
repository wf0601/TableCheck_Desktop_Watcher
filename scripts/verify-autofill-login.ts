import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Simulate exactly what openAndPrefill does — launch persistent + restore cookies — then open a reserve page and check whether TableCheck sees us as logged in.
const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });

// Restore cookies (same as launchPersistent helper)
const path = resolve(".browser-profile-cookies.json");
if (existsSync(path)) {
  const cookies = JSON.parse(readFileSync(path, "utf-8"));
  await ctx.addCookies(cookies);
  console.log("restored", cookies.length, "cookies");
} else {
  console.log("no cookie file");
}

const page = ctx.pages()[0] ?? await ctx.newPage();

// Visit a reserve page and see if name/email is prefilled (which only happens when logged in).
await page.goto("https://www.tablecheck.com/en/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

// Try to detect logged-in status:
const status = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    hasSignIn: /sign\s*in/i.test(text.slice(0, 2000)),
    bodyTextSnippet: text.slice(0, 200).replace(/\n/g, " "),
  };
});
console.log("status:", status);

// Also visit /en/account/edit directly — protected route
await page.goto("https://www.tablecheck.com/en/account/edit", { waitUntil: "domcontentloaded", timeout: 15_000 });
console.log("/en/account/edit final URL:", page.url());

await ctx.close();
