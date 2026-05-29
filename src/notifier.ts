import { spawn } from "node:child_process";

function escAS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function macNotify(opts: {
  title: string;
  subtitle?: string;
  body: string;
  sound?: string;
}) {
  if (process.platform !== "darwin") {
    console.log(`[notify] ${opts.title} — ${opts.body}`);
    return;
  }
  const parts = [`display notification "${escAS(opts.body)}"`, `with title "${escAS(opts.title)}"`];
  if (opts.subtitle) parts.push(`subtitle "${escAS(opts.subtitle)}"`);
  if (opts.sound) parts.push(`sound name "${escAS(opts.sound)}"`);
  const script = parts.join(" ");
  spawn("osascript", ["-e", script], { stdio: "ignore", detached: true }).unref();
}
