import { chromium } from "playwright";
import { resolve } from "node:path";
import { loadProfile } from "../src/config.js";

const p = loadProfile();
const dir = resolve(".browser-profile");

// Phase 1: sign in
{
  const ctx = await chromium.launchPersistentContext(dir, { headless: true });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto("https://www.tablecheck.com/en/users/sign_in", { waitUntil: "domcontentloaded" });
  await page.locator("#customer_user_email").fill(p.tablecheck_account);
  await page.locator("#customer_user_password").fill(p.tablecheck_password);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
    page.locator('form#signUpForm button[type="submit"]').first().click(),
  ]);
  console.log("[phase1] after submit, URL:", page.url());
  const cookies = await ctx.cookies("https://www.tablecheck.com");
  console.log("[phase1] cookies count:", cookies.length);
  console.log("[phase1] session cookies:", cookies.filter(c => /sess|user|auth|token/i.test(c.name)).map(c => `${c.name}=${c.value.slice(0,15)}...`));
  await ctx.close();
}

// Phase 2: REOPEN fresh context, check if cookies were persisted + work
{
  const ctx = await chromium.launchPersistentContext(dir, { headless: true });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const cookies = await ctx.cookies("https://www.tablecheck.com");
  console.log("[phase2] cookies after reopen count:", cookies.length);
  console.log("[phase2] session cookies after reopen:", cookies.filter(c => /sess|user|auth|token/i.test(c.name)).map(c => `${c.name}=${c.value.slice(0,15)}...`));
  await page.goto("https://www.tablecheck.com/en/users/sign_in", { waitUntil: "domcontentloaded", timeout: 15_000 });
  console.log("[phase2] visiting sign_in → URL after navigation:", page.url());
  await ctx.close();
}
