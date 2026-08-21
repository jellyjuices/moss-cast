import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { STATE_DIR, SESSION_FILE } from "./config.mjs";

const SHUTDOWN_POLL_MS = 100;
const SHUTDOWN_POLL_ATTEMPTS = 15;

export function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function read() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function write(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
}

export const clear = () => rmSync(SESSION_FILE, { force: true });

export const isRunning = (state) =>
  Boolean(state) && !state.error
  && (isProcessAlive(state.supervisorPid) || isProcessAlive(state.pid));

export async function takeOverFromPreviousSession(sleep) {
  const previous = read();
  if (!previous) return;

  const { supervisorPid, pid } = previous;
  if (supervisorPid && supervisorPid !== process.pid && isProcessAlive(supervisorPid)) {
    try { process.kill(supervisorPid, "SIGTERM"); } catch {}
    for (let attempt = 0; attempt < SHUTDOWN_POLL_ATTEMPTS && isProcessAlive(supervisorPid); attempt++) {
      await sleep(SHUTDOWN_POLL_MS);
    }
  }
  if (pid) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  clear();
}
