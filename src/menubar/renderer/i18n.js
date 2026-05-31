// Renderer i18n. Locale is selected by `?lang=ja` in the page URL (main.cjs
// appends this when the app is launched with `--lang=ja`).
//
// Conventions:
// - In HTML: <el data-i18n="key">English fallback text</el>
//            <el data-i18n-attr-title="key" title="...">  (attribute translations)
//            <el data-i18n-attr-placeholder="key" placeholder="...">
// - In JS:   window.__i18n.t("key") returns the translated string, falling
//            back to en, then to the key. Pass {vars} for {placeholder} interpolation.
//
// Wrapped in an IIFE so top-level names (DICT, t, locale) don't leak to the
// global scope — non-module <script> tags share globals, which would collide
// with app.js's `const { t, applyDomTranslations } = window.__i18n;`.
"use strict";
(function () {

const DICT = {
  en: {
    "header.title": "TableCheck Watcher",
    "header.reload": "Re-read all config files",
    "header.quit": "Save & Quit",
    "header.quit.title": "Save loaded forms and quit the app",

    "tab.check": "Check",
    "tab.restaurants": "Restaurants",
    "tab.profile": "Profile",

    "check.heading": "Restaurants to check",
    "check.selectAll": "All",
    "check.selectNone": "None",
    "check.loading": "Loading…",
    "check.empty": "Watchlist is empty. Add a restaurant in the Restaurants tab.",
    "check.checkNow": "Check Now",
    "check.meta": "party {party} · {days}d",
    "check.failedWatchlist": "Failed to read watchlist.yaml: {err}",

    "poll.heading": "Background polling",
    "poll.statusChecking": "checking…",
    "poll.statusRunning": "● Running",
    "poll.statusRunningInProgress": "● Running (checking now…)",
    "poll.statusStopped": "Stopped",
    "poll.helpText": "When enabled, the app re-checks your watchlist on a timer and fires a desktop notification when a new slot opens. Notifications dedupe via <code>state.json</code> so you won't get pinged twice.",
    "poll.enabled": "Enabled",
    "poll.every": "Every",
    "poll.min": "min",
    "poll.repeat": "Re-notify after",
    "poll.repeatTitle": "0 = re-notify on every tick",
    "poll.workers": "Workers",
    "poll.workersTitle": "Number of restaurants checked in parallel. Bump cautiously — TableCheck rate-limits per IP.",
    "poll.apply": "Apply",
    "poll.applying": "Applying…",
    "poll.stopNow": "Stop Now",
    "poll.stopping": "Stopping…",
    "poll.testNotify": "Test notification",
    "poll.resetHistory": "Reset history",
    "poll.resetHistoryTitle": "Clear state.json so all currently-open slots will notify again on the next tick",
    "poll.resetConfirm": "Clear notification history? All currently-open slots will notify again on the next tick.",
    "poll.resetClearing": "Clearing…",
    "poll.resetCleared": "Cleared ✓",
    "poll.metaLastCheck": "last check: {time}",
    "poll.metaNext": "next: {time}",
    "poll.metaError": "error: {err}",

    "results.heading": "Results",
    "results.empty": "No available slots in window.",
    "results.error": "Error: {err}",
    "results.checking": "Checking — 10-30s per restaurant…",
    "results.sourceManual": "Manual check · {time}",
    "results.sourceBackgroundRunning": "Background poll · started {time} (running…)",
    "results.sourceBackgroundDone": "Background poll · started {time} (done)",
    "results.checkFailed": "Check failed: {err}",
    "results.pickOne": "Pick at least one restaurant.",
    "results.checkingButton": "Checking {n}…",

    "slot.openTitle": "Open reservation page in your default browser",
    "slot.autofill": "Autofill",
    "slot.autofillTitle": "Open Chromium + prefill from your profile",
    "slot.autofillLaunching": "Launching…",

    "watchlist.heading": "Watchlist",
    "watchlist.add": "+ Add",
    "watchlist.save": "Save",
    "watchlist.saveAll": "Save Watchlist",
    "watchlist.delete": "Delete",
    "watchlist.deleteTitle": "Remove this entry",
    "watchlist.deleteConfirm": "Remove \"{name}\"?",
    "watchlist.deleteConfirmFallback": "this entry",
    "watchlist.saveSingleTitle": "Save this entry to watchlist.yaml",
    "watchlist.saving": "Saving…",
    "watchlist.saved": "Saved ✓",
    "watchlist.savedFile": "Saved to watchlist.yaml ✓",
    "watchlist.saveFailed": "Save failed: {err}",
    "watchlist.failedLoad": "Failed to load watchlist.yaml: {err}",
    "watchlist.empty": "No entries. Click + Add.",
    "watchlist.fields.enabled": "Enabled",
    "watchlist.fields.name": "Name",
    "watchlist.fields.url": "Reservation URL",
    "watchlist.fields.urlPlaceholder": "https://www.tablecheck.com/shops/<slug>/reserve",
    "watchlist.fields.partySize": "Party size",
    "watchlist.fields.windowWeeks": "Window (weeks)",
    "watchlist.fields.windowDays": "Window (days)",
    "watchlist.fields.dates": "Explicit dates (YYYY-MM-DD, comma-sep)",
    "watchlist.fields.datesPlaceholder": "2026-07-04, 2026-12-31",
    "watchlist.fields.times": "Time ranges (HH:MM-HH:MM, comma-sep)",
    "watchlist.fields.timesPlaceholder": "18:00-21:00 — leave blank for any time",
    "watchlist.fields.help": "Set at least one of: window (weeks), window (days), or explicit dates.",

    "profile.account.heading": "TableCheck account",
    "profile.account.help": "Auto-sign-in runs at launch using credentials from <code>profile.yaml</code>. For Google/Apple SSO or 2FA, use the manual sign-in instead — the cookies will persist.",
    "profile.account.signin": "Sign in (manual)",
    "profile.account.signinLaunching": "Launching browser…",
    "profile.account.recheck": "Re-check / sign in now",
    "profile.account.signingIn": "Signing in…",

    "profile.heading": "Your booking details",
    "profile.firstName": "First name",
    "profile.lastName": "Last name",
    "profile.kanjiFirst": "Kanji 名 (first)",
    "profile.kanjiLast": "Kanji 姓 (last)",
    "profile.furiganaFirst": "Furigana 名",
    "profile.furiganaLast": "Furigana 姓",
    "profile.email": "Email",
    "profile.phone": "Phone (E.164)",
    "profile.phonePlaceholder": "+81…",
    "profile.occasion": "Occasion",
    "profile.occasionPlaceholder": "birthday / business / …",
    "profile.visitCount": "Visit count",
    "profile.visitFirst": "First",
    "profile.visit2": "2nd",
    "profile.visit3": "3rd",
    "profile.visit4plus": "4th+",
    "profile.notes": "Notes",
    "profile.notesPlaceholder": "dietary, special requests",
    "profile.save": "Save Profile",
    "profile.saving": "Saving…",
    "profile.savedFile": "Saved to profile.yaml ✓",
    "profile.saveFailed": "Save failed: {err}",
    "profile.failedLoad": "Failed to load profile.yaml: {err}",

    "signin.status.already": "✓ Signed in (cached session)",
    "signin.status.signedIn": "✓ Signed in (just now)",
    "signin.status.failed": "✗ Sign-in failed — check credentials",
    "signin.status.noCreds": "No auto-credentials — use manual",
    "signin.status.skipped": "Skipped",
    "signin.status.unknown": "unknown",
    "signin.status.unavailable": "status unavailable",

    "saveExit.saving": "Saving…",
    "saveExit.quitting": "Quitting…",
    "saveExit.profileInvalid": "Profile form has invalid fields",
    "saveExit.profilePrefix": "Profile: {err}",
    "saveExit.watchlistPrefix": "Watchlist: {err}",
    "saveExit.confirmQuitAnyway": "Save failed:\n\n{errors}\n\nQuit anyway?",
  },

  ja: {
    "header.title": "TableCheck ウォッチャー",
    "header.reload": "全設定ファイルを再読み込み",
    "header.quit": "保存して終了",
    "header.quit.title": "編集中のフォームを保存してアプリを終了",

    "tab.check": "チェック",
    "tab.restaurants": "レストラン",
    "tab.profile": "プロフィール",

    "check.heading": "チェック対象レストラン",
    "check.selectAll": "全選択",
    "check.selectNone": "解除",
    "check.loading": "読み込み中…",
    "check.empty": "ウォッチリストが空です。「レストラン」タブで追加してください。",
    "check.checkNow": "今すぐチェック",
    "check.meta": "{party} 名 · {days} 日",
    "check.failedWatchlist": "watchlist.yaml の読み込みに失敗: {err}",

    "poll.heading": "バックグラウンド監視",
    "poll.statusChecking": "確認中…",
    "poll.statusRunning": "● 実行中",
    "poll.statusRunningInProgress": "● 実行中（チェック中…)",
    "poll.statusStopped": "停止中",
    "poll.helpText": "有効にすると、ウォッチリストを定期的に再チェックし、新しい空きが見つかった時にデスクトップ通知を出します。通知は <code>state.json</code> で重複排除されるため、二重通知されません。",
    "poll.enabled": "有効",
    "poll.every": "間隔",
    "poll.min": "分",
    "poll.repeat": "再通知間隔",
    "poll.repeatTitle": "0 = 毎ティック再通知",
    "poll.workers": "ワーカー数",
    "poll.workersTitle": "並列にチェックするレストラン数。TableCheck は IP 単位で制限があるため、慎重に増やしてください。",
    "poll.apply": "適用",
    "poll.applying": "適用中…",
    "poll.stopNow": "今すぐ停止",
    "poll.stopping": "停止中…",
    "poll.testNotify": "通知テスト",
    "poll.resetHistory": "履歴をリセット",
    "poll.resetHistoryTitle": "state.json を削除し、現在空いている全スロットを次回ティックで再通知させます",
    "poll.resetConfirm": "通知履歴をクリアしますか？ 現在空いているすべてのスロットが次回ティックで再通知されます。",
    "poll.resetClearing": "クリア中…",
    "poll.resetCleared": "クリア完了 ✓",
    "poll.metaLastCheck": "最終チェック: {time}",
    "poll.metaNext": "次回: {time}",
    "poll.metaError": "エラー: {err}",

    "results.heading": "結果",
    "results.empty": "ウィンドウ内に空きスロットがありません。",
    "results.error": "エラー: {err}",
    "results.checking": "チェック中 — レストラン1件あたり10〜30秒…",
    "results.sourceManual": "手動チェック · {time}",
    "results.sourceBackgroundRunning": "バックグラウンド監視 · 開始 {time}（実行中…)",
    "results.sourceBackgroundDone": "バックグラウンド監視 · 開始 {time}（完了)",
    "results.checkFailed": "チェック失敗: {err}",
    "results.pickOne": "少なくとも 1 軒のレストランを選んでください。",
    "results.checkingButton": "{n} 軒をチェック中…",

    "slot.openTitle": "予約ページを既定のブラウザで開く",
    "slot.autofill": "自動入力",
    "slot.autofillTitle": "Chromium を起動してプロフィールから自動入力",
    "slot.autofillLaunching": "起動中…",

    "watchlist.heading": "ウォッチリスト",
    "watchlist.add": "+ 追加",
    "watchlist.save": "保存",
    "watchlist.saveAll": "ウォッチリスト保存",
    "watchlist.delete": "削除",
    "watchlist.deleteTitle": "このエントリを削除",
    "watchlist.deleteConfirm": "「{name}」を削除しますか？",
    "watchlist.deleteConfirmFallback": "このエントリ",
    "watchlist.saveSingleTitle": "このエントリを watchlist.yaml に保存",
    "watchlist.saving": "保存中…",
    "watchlist.saved": "保存しました ✓",
    "watchlist.savedFile": "watchlist.yaml に保存しました ✓",
    "watchlist.saveFailed": "保存失敗: {err}",
    "watchlist.failedLoad": "watchlist.yaml の読み込みに失敗: {err}",
    "watchlist.empty": "エントリがありません。「+ 追加」をクリックしてください。",
    "watchlist.fields.enabled": "有効",
    "watchlist.fields.name": "店名",
    "watchlist.fields.url": "予約 URL",
    "watchlist.fields.urlPlaceholder": "https://www.tablecheck.com/shops/<slug>/reserve",
    "watchlist.fields.partySize": "人数",
    "watchlist.fields.windowWeeks": "ウィンドウ（週）",
    "watchlist.fields.windowDays": "ウィンドウ（日）",
    "watchlist.fields.dates": "明示日付（YYYY-MM-DD、カンマ区切り）",
    "watchlist.fields.datesPlaceholder": "2026-07-04, 2026-12-31",
    "watchlist.fields.times": "時間帯（HH:MM-HH:MM、カンマ区切り）",
    "watchlist.fields.timesPlaceholder": "18:00-21:00 — 空欄で任意の時間",
    "watchlist.fields.help": "ウィンドウ（週）、ウィンドウ（日）、明示日付のうち少なくとも 1 つを設定してください。",

    "profile.account.heading": "TableCheck アカウント",
    "profile.account.help": "起動時に <code>profile.yaml</code> の認証情報で自動サインインします。Google/Apple SSO や 2FA をご利用の場合は、手動サインインを使ってください — Cookie は保持されます。",
    "profile.account.signin": "サインイン（手動）",
    "profile.account.signinLaunching": "ブラウザを起動中…",
    "profile.account.recheck": "再確認 / 今すぐサインイン",
    "profile.account.signingIn": "サインイン中…",

    "profile.heading": "予約者情報",
    "profile.firstName": "名（ローマ字）",
    "profile.lastName": "姓（ローマ字）",
    "profile.kanjiFirst": "名（漢字）",
    "profile.kanjiLast": "姓（漢字）",
    "profile.furiganaFirst": "名（フリガナ）",
    "profile.furiganaLast": "姓（フリガナ）",
    "profile.email": "Eメール",
    "profile.phone": "電話番号 (E.164)",
    "profile.phonePlaceholder": "+81…",
    "profile.occasion": "ご利用シーン",
    "profile.occasionPlaceholder": "誕生日 / ビジネス / …",
    "profile.visitCount": "ご利用回数",
    "profile.visitFirst": "初回",
    "profile.visit2": "2 回目",
    "profile.visit3": "3 回目",
    "profile.visit4plus": "4 回目以上",
    "profile.notes": "備考",
    "profile.notesPlaceholder": "食事制限、特別なリクエストなど",
    "profile.save": "プロフィール保存",
    "profile.saving": "保存中…",
    "profile.savedFile": "profile.yaml に保存しました ✓",
    "profile.saveFailed": "保存失敗: {err}",
    "profile.failedLoad": "profile.yaml の読み込みに失敗: {err}",

    "signin.status.already": "✓ サインイン済み（キャッシュ）",
    "signin.status.signedIn": "✓ サインイン済み（先ほど)",
    "signin.status.failed": "✗ サインイン失敗 — 認証情報を確認してください",
    "signin.status.noCreds": "自動認証情報なし — 手動で",
    "signin.status.skipped": "スキップ",
    "signin.status.unknown": "不明",
    "signin.status.unavailable": "状態を取得できません",

    "saveExit.saving": "保存中…",
    "saveExit.quitting": "終了中…",
    "saveExit.profileInvalid": "プロフィールフォームに無効な項目があります",
    "saveExit.profilePrefix": "プロフィール: {err}",
    "saveExit.watchlistPrefix": "ウォッチリスト: {err}",
    "saveExit.confirmQuitAnyway": "保存失敗:\n\n{errors}\n\nそれでも終了しますか？",
  },
};

const locale = (() => {
  try {
    const v = new URLSearchParams(location.search).get("lang");
    return v && DICT[v] ? v : "en";
  } catch {
    return "en";
  }
})();

function interpolate(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

function t(key, vars) {
  const s = (DICT[locale] && DICT[locale][key]) ?? DICT.en[key] ?? key;
  return interpolate(s, vars);
}

/** Walk the DOM and apply translations to elements marked with data-i18n* attributes. */
function applyDomTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const html = t(key);
    // If the key's translation contains HTML (e.g. <code>...</code>), respect it.
    // Otherwise set textContent to avoid accidental injection.
    if (/<\w+/.test(html)) el.innerHTML = html;
    else el.textContent = html;
  });
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of el.getAttributeNames()) {
      const m = attr.match(/^data-i18n-attr-(.+)$/);
      if (!m) continue;
      el.setAttribute(m[1], t(el.getAttribute(attr)));
    }
  });
  // Set <html lang> so Chromium picks the right font / line-breaking.
  document.documentElement.setAttribute("lang", locale);
}

window.__i18n = { t, locale, applyDomTranslations };

})();
