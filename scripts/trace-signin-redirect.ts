import { chromium } from "playwright";
import { resolve } from "node:path";
import { loadProfile } from "../src/config.js";

const p = loadProfile();
const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const page = ctx.pages()[0] ?? await ctx.newPage();

console.log("step 1: navigate to reserve URL");
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });
console.log("  url:", page.url());
console.log("  td.wday-* count:", await page.locator("td[class*='wday-']").count());

console.log("step 2: click TableCheck login");
await page.locator("#tablecheck_login").click({ timeout: 5_000 });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
console.log("  url:", page.url());

console.log("step 3: fill creds + submit");
await page.locator("#customer_user_email").fill(p.tablecheck_account);
await page.locator("#customer_user_password").fill(p.tablecheck_password);
await Promise.all([
  page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
  page.locator('form#signUpForm button[type="submit"]').first().click(),
]);
console.log("  url after submit:", page.url());
await page.waitForTimeout(2000);
console.log("  url 2s later:", page.url());
console.log("  td.wday-* count:", await page.locator("td[class*='wday-']").count());

console.log("step 4: page text snippet");
console.log("  ", (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " | "));

await ctx.close();
