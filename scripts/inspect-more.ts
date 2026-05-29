import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "ja-JP" });
const page = await ctx.newPage();
await page.goto("https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-01&num_people=4", { waitUntil: "networkidle", timeout: 30_000 });

// Look for all anchors / buttons with login-related IDs or classes
const opts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("a, button"))
    .filter((el) => /login|signin|sign_in/i.test((el as HTMLElement).id + " " + (el as HTMLElement).className))
    .map((el) => ({
      tag: el.tagName,
      id: (el as HTMLElement).id,
      classes: (el as HTMLElement).className.toString().slice(0, 80),
      href: (el as HTMLAnchorElement).href || "",
      text: (el as HTMLElement).innerText.slice(0, 50),
      visible: (el as HTMLElement).offsetParent !== null,
    }));
});
for (const o of opts) console.log(JSON.stringify(o));

await browser.close();
