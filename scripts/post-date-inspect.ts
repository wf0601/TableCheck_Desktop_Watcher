import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2", { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(2000);

// Set party
await page.locator("#reservation_num_people_adult").selectOption("2");
await page.waitForTimeout(800);

// Navigate to week 4
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => (document.querySelector(".next-week") as HTMLElement)?.click());
  await page.waitForTimeout(600);
}

// Click the 7/2 (wday=4 day=2) cell
const before = await page.locator("#reservation_start_at_epoch option").count();
console.log("before click — time options:", before);
await page.evaluate(() => {
  const td = Array.from(document.querySelectorAll("td.wday-4")).find((el) => {
    return (el.querySelector(".date-num") as HTMLElement)?.innerText.trim() === "2";
  }) as HTMLElement | undefined;
  td?.click();
});
await page.waitForTimeout(1500);

// Inspect what changed
console.log("\n=== after date click ===");
console.log("time options:", await page.locator("#reservation_start_at_epoch option").count());
const timeOpts = await page.evaluate(() => {
  const s = document.getElementById("reservation_start_at_epoch") as HTMLSelectElement | null;
  return s ? Array.from(s.options).map(o => `${o.value}=${o.text}`) : [];
});
console.log("time option texts:", timeOpts);

// Maybe time slots are buttons / radios elsewhere?
const timeButtons = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button, a, label, input"))
    .filter((el) => /\b\d{1,2}:\d{2}\b/.test((el as HTMLElement).innerText || (el as HTMLInputElement).value || ""))
    .slice(0, 10)
    .map((el) => ({
      tag: el.tagName,
      text: ((el as HTMLElement).innerText || (el as HTMLInputElement).value || "").slice(0, 40),
      classes: (el as HTMLElement).className.toString().slice(0, 60),
      id: (el as HTMLElement).id,
      name: (el as HTMLElement).getAttribute("name"),
    }));
});
console.log("\nelements with HH:MM:");
for (const b of timeButtons) console.log(" ·", JSON.stringify(b));

// Also screenshot for review
await page.screenshot({ path: "/tmp/post-date.png", fullPage: true });
console.log("\nScreenshot: /tmp/post-date.png");

await ctx.close();
