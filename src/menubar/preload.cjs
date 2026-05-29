// Preload runs in an isolated world. Only what we expose via contextBridge
// is callable from the renderer. CJS so we can use require() simply.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tc", {
  listWatchlist: () => ipcRenderer.invoke("list-watchlist"),
  check: (urls) => ipcRenderer.invoke("check-restaurants", urls),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  autofill: (slot) => ipcRenderer.invoke("autofill-slot", slot),

  getProfile: () => ipcRenderer.invoke("get-profile"),
  saveProfile: (profile) => ipcRenderer.invoke("save-profile", profile),

  getWatchlistRaw: () => ipcRenderer.invoke("get-watchlist-raw"),
  saveWatchlist: (list) => ipcRenderer.invoke("save-watchlist", list),

  openSignIn: () => ipcRenderer.invoke("open-tablecheck-signin"),
  quit: () => ipcRenderer.invoke("quit-app"),

  getSignInStatus: () => ipcRenderer.invoke("get-signin-status"),
  runSignInNow: () => ipcRenderer.invoke("run-signin-now"),

  getPollStatus: () => ipcRenderer.invoke("get-poll-status"),
  setPollConfig: (cfg) => ipcRenderer.invoke("set-poll-config", cfg),
  stopPollNow: () => ipcRenderer.invoke("stop-poll-now"),
  testNotification: () => ipcRenderer.invoke("test-notification"),
  resetNotificationHistory: () => ipcRenderer.invoke("reset-notification-history"),

  getLastPollResults: () => ipcRenderer.invoke("get-last-poll-results"),
  // Subscribe to live updates from the background poller. cb(payload) is
  // called with either { type: "result", result } or { type: "summary", ... }.
  // Returns an unsubscribe function.
  onPollUpdate: (cb) => {
    const onResult = (_e, result) => cb({ type: "result", result });
    const onSummary = (_e, summary) => cb({ type: "summary", ...summary });
    ipcRenderer.on("poll-result", onResult);
    ipcRenderer.on("poll-summary", onSummary);
    return () => {
      ipcRenderer.removeListener("poll-result", onResult);
      ipcRenderer.removeListener("poll-summary", onSummary);
    };
  },
});
