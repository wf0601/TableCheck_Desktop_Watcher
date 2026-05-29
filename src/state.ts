import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type StateFile = { seen: Record<string, number> };

const PATH = resolve("state.json");
// Hard upper bound for entry retention so the file doesn't grow forever; the
// per-call `quietMinutes` argument is what actually controls dedupe windows.
const HARD_TTL_MS = 24 * 60 * 60 * 1000;

function read(): StateFile {
  if (!existsSync(PATH)) return { seen: {} };
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as StateFile;
  } catch {
    return { seen: {} };
  }
}

function write(s: StateFile) {
  writeFileSync(PATH, JSON.stringify(s, null, 2));
}

function gc(s: StateFile): StateFile {
  const cutoff = Date.now() - HARD_TTL_MS;
  for (const k of Object.keys(s.seen)) {
    if ((s.seen[k] ?? 0) < cutoff) delete s.seen[k];
  }
  return s;
}

/**
 * Returns true if this key was notified within the last `quietMinutes`.
 * Pass 0 to disable dedupe entirely (always returns false).
 */
export function alreadyNotified(key: string, quietMinutes = 30): boolean {
  if (quietMinutes <= 0) return false;
  const s = gc(read());
  write(s);
  const ts = s.seen[key];
  if (ts === undefined) return false;
  return Date.now() - ts < quietMinutes * 60 * 1000;
}

export function markNotified(key: string) {
  const s = gc(read());
  s.seen[key] = Date.now();
  write(s);
}
