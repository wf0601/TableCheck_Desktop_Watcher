import { chromium } from "playwright";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { loadProfile } from "../src/config.js";

const p = loadProfile();
const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });

// Sign in if needed (gate visible)
const gateVisible = await page.locator("#tablecheck_login").isVisible().catch(() => false);
console.log("gate visible (need to sign in)?", gateVisible);
if (gateVisible) {
  await page.locator("#tablecheck_login").click();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.locator("#customer_user_email").fill(p.tablecheck_account);
  await page.locator("#customer_user_password").fill(p.tablecheck_password);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
    page.locator('form#signUpForm button[type="submit"]').first().click(),
  ]);
  console.log("post-signin URL:", page.url());
}

// Set party size
await page.locator("#reservation_num_people_adult").selectOption("2").catch(e => console.log("party err:", e.message));
console.log("party set");

// Now try to navigate week by week, log what we see
await page.waitForTimeout(1500); // extra wait
console.log("td count:", await page.locator("td[class*='wday-']").count());

for (let i = 0; i < 8; i++) {
  const cells = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll("td[class*='wday-']"));
    return tds.map((td) => {
      const wm = Array.from(td.classList).find(c => /^wday-\d$/.test(c));
      const numEl = td.querySelector(".date-num") as HTMLElement | null;
      return {
        wday: wm ? Number(wm.slice(5)) : -1,
        day: numEl ? Number(numEl.innerText.trim()) : NaN,
        closed: td.classList.contains("day-closed"),
      };
    });
  });
  console.log(`week ${i}: count=${cells.length}, cells=`, cells.map(c => `${c.wday}d:${c.day}${c.closed?'X':''}`).join(' '));
  
  // Try advance
  const advanced = await page.evaluate(() => {
    const btn = document.querySelector(".next-week") as HTMLElement | null;
    if (!btn) return false;
    btn.click(); return true;
  });
  if (!advanced) { console.log("no next-week"); break; }
  await page.waitForTimeout(400);
}

await ctx.close();
