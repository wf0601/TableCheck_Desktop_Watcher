import { loadProfile, loadWatchlist, loadSettings, saveProfile, saveWatchlist } from "../src/config.js";

const p = loadProfile();
console.log("profile loaded:", p.first_name, p.last_name, p.email);

const w = loadWatchlist();
console.log("watchlist loaded:", w.length, "entries");
for (const e of w) console.log("  ·", e.name, "party", e.party_size, "·", e.window_weeks ?? e.window_days ?? "explicit", "·", e.enabled ? "on" : "off");

const s = loadSettings();
console.log("settings loaded:", s.on_match, s.locale);

saveProfile(p);
saveWatchlist(w);
console.log("re-saved profile + watchlist OK");

const p2 = loadProfile();
const w2 = loadWatchlist();
console.log("re-loaded after save:", p2.first_name === p.first_name && w2.length === w.length);
