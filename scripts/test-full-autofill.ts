import { loadProfile } from "../src/config.js";
import { openAndPrefill } from "../src/prefiller.js";
import { chromium } from "playwright";

// Override launchPersistent to headless for this test by monkey-patching.
// (The real flow will launch headed; we just want to verify the navigation works.)
const original = chromium.launchPersistentContext;
chromium.launchPersistentContext = (...args: any[]) => {
  if (args[1]) args[1].headless = true;
  return original.apply(chromium, args as any);
};

const profile = loadProfile();
const slot = {
  shopName: "Presente Sugi",
  shopUrl: "https://www.tablecheck.com/ja/shops/presente-sugi/reserve",
  shopSlug: "presente-sugi",
  date: "2026-07-02",
  time: "11:30",
  partySize: 2,
  slotTs: 1782959400, // 7/2 11:30
  deepLink: "https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-02&num_people=2",
};

await openAndPrefill(slot, profile, {} as any);
console.log("\n=== done — exiting ===");
process.exit(0);
