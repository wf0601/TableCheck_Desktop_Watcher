import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadProfile } from "../src/config.js";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(2000);

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
        text: (td as HTMLElement).innerText.replace(/\n/g, " ").trim().slice(0, 30),
      };
    });
  });
  const header = await page.locator(".month, [class*=month-name], thead").first().innerText().catch(() => "?");
  console.log(`week ${i}: header="${header.slice(0,30)}", cells=`, cells.map(c => `${c.wday}d:${c.day}${c.closed?'X':''}`).join(' '));
  
  const advanced = await page.evaluate(() => {
    const btn = document.querySelector(".next-week") as HTMLElement | null;
    if (!btn) return false;
    btn.click(); return true;
  });
  if (!advanced) { console.log("no next-week"); break; }
  await page.waitForTimeout(400);
}

await ctx.close();
