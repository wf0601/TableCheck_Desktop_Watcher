function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export const log = {
  info: (...a: unknown[]) => console.log(`[${ts()}]`, ...a),
  warn: (...a: unknown[]) => console.warn(`[${ts()}] WARN`, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] ERROR`, ...a),
};
