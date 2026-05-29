import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(2000);
await page.locator("#reservation_num_people_adult").selectOption("2");
await page.waitForTimeout(1000);

// Navigate to week 4 (where 7/2 should be visible)
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => (document.querySelector(".next-week") as HTMLElement)?.click());
  await page.waitForTimeout(600);
}

// Inspect the calendar table structure
const grid = await page.evaluate(() => {
  // Find the main reservation calendar table
  const tables = Array.from(document.querySelectorAll("table"));
  const out: any[] = [];
  for (const tbl of tables) {
    const rows = Array.from(tbl.querySelectorAll("tr"));
    if (rows.length === 0) continue;
    const tag = tbl.className || tbl.id || "?";
    const rowData = rows.slice(0, 5).map((r) => {
      const cells = Array.from(r.querySelectorAll("th, td"));
      return cells.map((c) => ({
        tag: c.tagName,
        classes: (c as HTMLElement).className.toString().slice(0, 80),
        text: (c as HTMLElement).innerText.replace(/\n/g, " ").trim().slice(0, 30),
        dataAttrs: Array.from(c.attributes).filter(a => a.name.startsWith("data-")).map(a => `${a.name}="${a.value.slice(0,30)}"`),
      }));
    });
    out.push({ table: tag.toString().slice(0, 80), rowCount: rows.length, rows: rowData });
  }
  return out;
});
console.log(JSON.stringify(grid, null, 2));

await ctx.close();
