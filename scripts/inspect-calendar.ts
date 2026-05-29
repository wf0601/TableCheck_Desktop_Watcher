import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
const page = ctx.pages()[0] ?? await ctx.newPage();

await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-01&num_people=4", { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(2000);

// Inspect the date picker / calendar structure
const info = await page.evaluate(() => {
  const out: any = {};
  // Look for elements containing "1" or "2" in calendar-like containers
  const dayCells = Array.from(document.querySelectorAll('td, [class*="day"], [class*="date"], [class*="calendar"], button')).filter((el) => {
    const t = (el as HTMLElement).innerText?.trim() || "";
    return /^[\d]{1,2}$/.test(t) || /^[木金土日月火水]\s*\d+/.test(t);
  });
  out.dayCellsCount = dayCells.length;
  out.dayCellsSample = dayCells.slice(0, 20).map((el) => ({
    tag: el.tagName,
    classes: (el as HTMLElement).className.toString().slice(0, 80),
    text: (el as HTMLElement).innerText.replace(/\n/g, " ").slice(0, 30),
    dataAttrs: Array.from(el.attributes).filter(a => a.name.startsWith("data-")).map(a => `${a.name}="${a.value.slice(0,30)}"`),
    id: (el as HTMLElement).id,
  }));
  // Look for month navigation
  const arrows = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((el) => {
    const t = (el as HTMLElement).innerText || "";
    const cls = (el as HTMLElement).className.toString();
    return /next|prev|前|次|<|>|→|←/i.test(t + " " + cls);
  });
  out.arrowsSample = arrows.slice(0, 10).map((el) => ({
    text: (el as HTMLElement).innerText.slice(0, 30),
    classes: (el as HTMLElement).className.toString().slice(0, 80),
    id: (el as HTMLElement).id,
  }));
  // Look at the calendar's months currently shown
  const monthHeader = document.querySelector('[class*="month"], [class*="year"], caption, thead');
  if (monthHeader) out.monthHeader = (monthHeader as HTMLElement).innerText.slice(0, 100);
  // Try to find what's selected currently
  const selected = document.querySelectorAll('[class*="selected"], [class*="active"], [aria-selected="true"]');
  out.selectedCount = selected.length;
  out.selectedSample = Array.from(selected).slice(0, 5).map((el) => ({
    tag: el.tagName,
    classes: (el as HTMLElement).className.toString().slice(0, 80),
    text: (el as HTMLElement).innerText?.slice(0, 30),
  }));
  return out;
});

console.log(JSON.stringify(info, null, 2));

await ctx.close();
