import { chromium } from "playwright";
import { resolve } from "node:path";

const ctx = await chromium.launchPersistentContext(resolve(".browser-profile"), { headless: true });
const page = ctx.pages()[0] ?? await ctx.newPage();

// Try several paths to find one that reliably distinguishes signed-in vs not
const candidates = [
  "https://www.tablecheck.com/en/users/edit",
  "https://www.tablecheck.com/en/users/sign_in",
  "https://www.tablecheck.com/en/users/sign_out",
  "https://www.tablecheck.com/en/account",
  "https://www.tablecheck.com/en/mypage",
  "https://www.tablecheck.com/en/users/show",
  "https://www.tablecheck.com/en/users",
];
for (const url of candidates) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  console.log(url, "→", page.url(), "status:", await page.locator("body").innerText().then(t => t.slice(0, 80).replace(/\n/g, " ")).catch(() => "?"));
}

// Look at the homepage for a "signed-in" hint
await page.goto("https://www.tablecheck.com/en/", { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
const indicators = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    hasSignIn: /sign\s*in|log\s*in/i.test(text),
    hasMyAccount: /my\s*(account|page)|frankie|wu/i.test(text),
    hasSignOut: /sign\s*out|log\s*out/i.test(text),
  };
});
console.log("homepage indicators:", indicators);

await ctx.close();
