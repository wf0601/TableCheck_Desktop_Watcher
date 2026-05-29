import { loadProfile } from "../src/config.js";
import { openAndPrefill } from "../src/prefiller.js";

const profile = loadProfile();
const slot = {
  shopName: "Presente Sugi",
  shopUrl: "https://www.tablecheck.com/ja/shops/presente-sugi/reserve",
  shopSlug: "presente-sugi",
  date: "2026-07-01",
  time: "11:30",
  partySize: 4,
  slotTs: 0,
  deepLink: "https://www.tablecheck.com/ja/shops/presente-sugi/reserve?date=2026-07-01&num_people=4",
};

// Run headless first to verify the flow works programmatically
process.env.HEADLESS_FOR_TEST = "1";
await openAndPrefill(slot, profile, {} as any);
// Sleep briefly so cookies persist
await new Promise(r => setTimeout(r, 3000));
process.exit(0);
