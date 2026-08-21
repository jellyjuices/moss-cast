// The swyh-rs audio server: captures BlackHole and serves it over HTTP.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  SWYH, PORT, FORMAT, LOG_FILE, CONFIG_FILE, HELPER_APP, HELPER_BIN, hasHelper,
} from "./config.mjs";

const ARGS = ["-x", "-f", FORMAT, "-s", "BlackHole", "-C", CONFIG_FILE];

export const streamUrl = (ip) => `http://${ip}:${PORT}/stream/swyh.${FORMAT}`;

// Only ever matches our own bundle's executable, so a stray swyh-rs-cli started
// by hand from a terminal is left alone.
function helperPid() {
  try {
    return Number(execFileSync("/usr/bin/pgrep", ["-n", "-f", HELPER_BIN]).toString().trim()) || null;
  } catch {
    return null;
  }
}

async function waitUntilServing(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(LOG_FILE)) {
      const log = readFileSync(LOG_FILE, "utf8");
      if (/Serving started on port/.test(log)) return;
      const cannot = log.match(/cannot be opened for capture[^\n]*/);
      if (cannot) throw new Error(cannot[0]);
      const failed = log.match(/^Failed to [^\n]*/m);
      if (failed) throw new Error(`The audio server stopped: ${failed[0]}`);
    }
    await sleep(300);
  }
  throw new Error("The audio server did not start in time.");
}

// Starts the server and resolves once it is actually serving.
//
// The .app bundle is preferred: launched with `open`, capture is its own
// responsible app and can hold a microphone grant. Started as a bare binary it
// inherits whatever launched it - fine from a terminal, silently denied under
// SwiftBar, which then streams silence rather than failing. Falling back to the
// raw binary keeps the CLI working before `npm run setup` has been run.
export async function startServer() {
  mkdirSync(join(homedir(), ".swyh-rs"), { recursive: true }); // swyh-rs quits without it

  const fd = openSync(LOG_FILE, "w"); // truncate: waitUntilServing reads this run only

  let pid = null;
  if (hasHelper()) {
    // `open` returns as soon as launchd has taken over, so the pid has to be
    // looked up afterwards rather than taken from the spawn.
    spawn("/usr/bin/open",
      ["-a", HELPER_APP, "--stdout", LOG_FILE, "--stderr", LOG_FILE, "--args", ...ARGS],
      { stdio: "ignore" }).unref();
  } else {
    const child = spawn(SWYH, ARGS, { detached: true, stdio: ["ignore", fd, fd] });
    child.unref();
    pid = child.pid;
  }
  closeSync(fd);

  const stop = () => {
    try { process.kill(pid ?? helperPid(), "SIGKILL"); } catch {}
  };

  try {
    await waitUntilServing();
  } catch (e) {
    stop();
    throw e;
  }

  pid ??= helperPid(); // resolvable now the bundle is up; the menu reads it back
  return { pid, stop };
}
