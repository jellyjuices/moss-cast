// The session file: the one thing every entry point agrees on.
//
// start.mjs (a terminal session) and cast.mjs (the headless one the menu bar
// starts) both write the same shape, so status, stop, the volume control and the
// SwiftBar menu work the same whichever started the cast.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { STATE_DIR, STATE_FILE } from "./config.mjs";

export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function read() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function write(session) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(session, null, 2));
}

export const clear = () => rmSync(STATE_FILE, { force: true });

// A session file outlives a crash, so the pids are what decide. Either process
// still standing means something is running and worth stopping.
export const isRunning = (session) =>
  Boolean(session) && !session.error && (alive(session.supervisorPid) || alive(session.pid));

// A leftover session would be holding port 5901. Ask its supervisor to shut down
// (that also puts the sound output back), then make sure the server is gone.
export async function takeOver(sleep) {
  const old = read();
  if (!old) return;
  if (old.supervisorPid && old.supervisorPid !== process.pid && alive(old.supervisorPid)) {
    try { process.kill(old.supervisorPid, "SIGTERM"); } catch {}
    for (let i = 0; i < 15 && alive(old.supervisorPid); i++) await sleep(100);
  }
  if (old.pid) {
    try { process.kill(old.pid, "SIGKILL"); } catch {}
  }
  clear();
}
