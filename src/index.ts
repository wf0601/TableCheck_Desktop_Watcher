#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { buildReserveUrl, checkEntry, launchBrowser, shopSlugFromUrl, type Slot } from "./checker.js";
import { openAndPrefill } from "./prefiller.js";
import { macNotify } from "./notifier.js";
import { alreadyNotified, markNotified } from "./state.js";
import { log } from "./logger.js";

function help() {
  console.log(`tc-watch — TableCheck reservation watcher

Usage:
  tc-watch                    Run the polling loop (default).
  tc-watch check-once         Run one check pass and exit.
  tc-watch check-once --debug Same, but dump page HTML + screenshots to debug/.
  tc-watch book               Skip the check; open prefilled form for the first
                              enabled watchlist entry. Useful for testing the
                              autofill against a known-open shop.
  tc-watch --help             This message.

Config: edit ./config.yaml (copy from config.example.yaml).
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function slotKey(s: Slot): string {
  return `${s.shopUrl}|${s.date}|${s.time}|${s.partySize}`;
}

async function handleFound(slots: Slot[], cfg: Awaited<ReturnType<typeof loadConfig>>) {
  for (const slot of slots) {
    const key = slotKey(slot);
    if (alreadyNotified(key)) continue;
    markNotified(key);

    const doNotify = cfg.settings.on_match === "notify" || cfg.settings.on_match === "notify+open";
    const doOpen = cfg.settings.on_match === "open" || cfg.settings.on_match === "notify+open";

    if (doNotify) {
      macNotify({
        title: `${slot.shopName} — opening!`,
        subtitle: `${slot.date} ${slot.time} · party of ${slot.partySize}`,
        body: slot.deepLink,
        sound: cfg.settings.notify_sound || undefined,
      });
    }
    if (doOpen) {
      // Don't block other notifications on the open — fire and forget.
      openAndPrefill(slot, cfg.profile, cfg.settings).catch((e) =>
        log.error("openAndPrefill failed:", e),
      );
    }
  }
}

async function runOnce(debug = false): Promise<Slot[]> {
  const cfg = loadConfig();
  const browser = await launchBrowser(cfg.settings.headless_check);
  const found: Slot[] = [];
  try {
    for (const entry of cfg.watchlist) {
      if (!entry.enabled) continue;
      try {
        const slots = await checkEntry(entry, cfg.settings, browser, { debug });
        found.push(...slots);
      } catch (e) {
        log.error(`checkEntry(${entry.name}) failed:`, (e as Error).message);
      }
    }
  } finally {
    await browser.close();
  }
  return found;
}

async function runLoop() {
  const cfg = loadConfig();
  log.info(`Watching ${cfg.watchlist.filter((e) => e.enabled).length} entries every ~${cfg.settings.poll_interval_seconds}s`);
  // Loop forever; on each iteration spin up a fresh browser so a long-running
  // Chromium can't accumulate state/memory.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const found = await runOnce(false);
      if (found.length > 0) await handleFound(found, cfg);
    } catch (e) {
      log.error("loop iteration failed:", (e as Error).message);
    }
    const jitter = Math.floor(Math.random() * (cfg.settings.poll_jitter_seconds * 1000));
    const wait = cfg.settings.poll_interval_seconds * 1000 + jitter;
    log.info(`sleep ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

async function bookFirstEnabled() {
  const cfg = loadConfig();
  const entry = cfg.watchlist.find((e) => e.enabled);
  if (!entry) throw new Error("no enabled watchlist entry");
  const date = entry.dates[0]!;
  const time = entry.times[0]?.split("-")[0] ?? "19:00";
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const slot: Slot = {
    shopName: entry.name,
    shopUrl: entry.url,
    shopSlug: shopSlugFromUrl(entry.url),
    date,
    time,
    partySize: entry.party_size,
    slotTs: Math.floor(new Date(`${date}T${time}:00+09:00`).getTime() / 1000) || hh * 3600 + mm * 60,
    deepLink: buildReserveUrl(entry.url, date, entry.party_size),
  };
  await openAndPrefill(slot, cfg.profile, cfg.settings);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();

  const cmd = args[0];
  if (cmd === "check-once") {
    const debug = args.includes("--debug");
    const cfg = loadConfig();
    const found = await runOnce(debug);
    if (found.length === 0) {
      log.info("no matches");
    } else {
      log.info(`${found.length} match(es):`);
      for (const s of found) log.info(`  · ${s.shopName} ${s.date} ${s.time} → ${s.deepLink}`);
      await handleFound(found, cfg);
    }
    process.exit(0);
  }
  if (cmd === "book") {
    await bookFirstEnabled();
    return;
  }
  await runLoop();
}

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
