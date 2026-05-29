// Ad-hoc probe: ask the timetable API for a specific start_date and dump the raw response.
// Usage: npx tsx scripts/probe.ts <slug> <YYYY-MM-DD> [partySize]
import { chromium } from "playwright";

const slug = process.argv[2] ?? "presente-sugi";
const startDate = process.argv[3] ?? "2026-07-15";
const partySize = Number(process.argv[4] ?? 2);
const locale = "en";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`https://www.tablecheck.com/${locale}/shops/${slug}/reserve`, {
  waitUntil: "domcontentloaded",
});
const token = await page.locator('meta[name="csrf-token"]').first().getAttribute("content");
if (!token) throw new Error("no csrf");

const u = new URL(`https://www.tablecheck.com/${locale}/shops/${slug}/available/timetable`);
u.searchParams.set("authenticity_token", token);
u.searchParams.set("reservation[num_people_adult]", String(partySize));
u.searchParams.set("reservation[start_date]", startDate);

const body = await page.evaluate(async (url: string) => {
  const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
  return { status: r.status, body: await r.text() };
}, u.toString());

console.log(`HTTP ${body.status}`);
console.log(body.body);
await browser.close();
