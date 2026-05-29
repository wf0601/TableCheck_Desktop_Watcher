import { loadProfile, loadWatchlist, saveProfile, saveWatchlist } from "../src/config.js";

console.log("=== Profile round-trip ===");
const p = loadProfile();
console.log("loaded:", p.email);
// Simulate a UI edit
const edited = { ...p, notes: "TEST EDIT " + new Date().toISOString() };
saveProfile(edited);
console.log("saved with new notes");
const p2 = loadProfile();
console.log("re-loaded notes:", p2.notes);
console.log("match:", p2.notes === edited.notes ? "OK" : "FAILED");
// Restore
saveProfile(p);
console.log("restored");

console.log("\n=== Watchlist round-trip ===");
const w = loadWatchlist();
console.log("loaded", w.length, "entries");
// Edit: toggle the first entry's enabled flag
const w2 = [...w];
w2[0] = { ...w2[0], enabled: !w2[0].enabled };
saveWatchlist(w2);
console.log("saved with first entry toggled");
const w3 = loadWatchlist();
console.log("re-loaded first.enabled:", w3[0].enabled, "(was:", w[0].enabled, ")");
console.log("toggle survived:", w3[0].enabled !== w[0].enabled ? "OK" : "FAILED");
// Restore
saveWatchlist(w);
console.log("restored");
