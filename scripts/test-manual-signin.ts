import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), {
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});

// Restore cookies (same as our prefiller does)
const cp = resolve(".browser-profile-cookies.json");
if (existsSync(cp)) {
  await ctx.addCookies(JSON.parse(readFileSync(cp, "utf-8")));
}

const page = ctx.pages()[0] ?? await ctx.newPage();

console.log("=== Visit /users/sign_in (no locale) ===");
await page.goto("https://www.tablecheck.com/users/sign_in", { waitUntil: "domcontentloaded", timeout: 30_000 });
console.log("final URL:", page.url());
const text1 = await page.locator("body").innerText().catch(() => "");
console.log("body text len:", text1.length, "first 200:", text1.slice(0, 200).replace(/\n/g, " "));

console.log("\n=== Visit /en/users/sign_in ===");
await page.goto("https://www.tablecheck.com/en/users/sign_in", { waitUntil: "domcontentloaded", timeout: 30_000 });
console.log("final URL:", page.url());
const text2 = await page.locator("body").innerText().catch(() => "");
console.log("body text len:", text2.length, "first 200:", text2.slice(0, 200).replace(/\n/g, " "));

await ctx.close();
