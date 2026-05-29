import { loadSettings, saveSettings } from "../src/config.js";
const before = loadSettings();
console.log("before:", { enabled: before.background_poll_enabled, minutes: before.background_poll_minutes });
if (before.background_poll_enabled) {
  saveSettings({ ...before, background_poll_enabled: false });
  const after = loadSettings();
  console.log("after  :", { enabled: after.background_poll_enabled, minutes: after.background_poll_minutes });
  console.log("interval preserved:", after.background_poll_minutes === before.background_poll_minutes);
  // Restore for the test
  saveSettings(before);
} else {
  console.log("(already disabled — nothing to test)");
}
