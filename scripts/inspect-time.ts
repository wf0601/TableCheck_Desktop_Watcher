import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();

// Use a party size that has availability
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  // Find selects (dropdowns)
  const selects = Array.from(document.querySelectorAll("select")).map((s) => ({
    name: s.name, id: s.id, options: Array.from(s.options).slice(0, 12).map((o) => `${o.value}=${o.text.slice(0,30)}`),
  }));
  // Find party-size selector
  const partyInputs = Array.from(document.querySelectorAll('[name*="num_people"], [name*="party"], [name*="people"]')).map((el) => ({
    tag: el.tagName, name: (el as HTMLElement).getAttribute("name"), id: (el as HTMLElement).id,
  }));
  return { selects, partyInputs };
});
console.log(JSON.stringify(info, null, 2));

await ctx.close();
