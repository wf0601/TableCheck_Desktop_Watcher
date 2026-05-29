import { loadProfile, saveProfile } from "../src/config.js";

const before = loadProfile();
console.log("Before save — credentials:");
console.log("  tablecheck_account:", before.tablecheck_account);
console.log("  tablecheck_password:", before.tablecheck_password ? "(set)" : "(empty)");

// Simulate what the UI save does NOW: payload has all profile fields EXCEPT the credentials
const uiPayload = { ...before };
delete (uiPayload as any).tablecheck_account;
delete (uiPayload as any).tablecheck_password;

// Mimic the merged save handler
const merged = { ...before, ...uiPayload };
saveProfile(merged);

const after = loadProfile();
console.log("\nAfter merge-save — credentials:");
console.log("  tablecheck_account:", after.tablecheck_account);
console.log("  tablecheck_password:", after.tablecheck_password ? "(set)" : "(empty)");
console.log("\nPreserved:", before.tablecheck_account === after.tablecheck_account && before.tablecheck_password === after.tablecheck_password ? "YES" : "NO");
