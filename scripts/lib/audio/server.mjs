import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AUDIO_SERVER_BIN, STREAM_PORT, STREAM_FORMAT, SERVER_LOG_FILE, SERVER_CONFIG_FILE,
  CAPTURE_HELPER_APP, CAPTURE_HELPER_BIN, hasCaptureHelper,
} from "../config.mjs";
import { findLocalIPv4 } from "../network.mjs";

const SERVER_ARGS = ["-x", "-f", STREAM_FORMAT, "-s", "BlackHole", "-C", SERVER_CONFIG_FILE];

const STARTUP_TIMEOUT_MS = 15_000;
const STARTUP_POLL_MS = 300;
const PORT_PROBE_TIMEOUT_MS = 500;
const PORT_FREE_TIMEOUT_MS = 5_000;

export const streamUrl = (ip) => `http://${ip}:${STREAM_PORT}/stream/swyh.${STREAM_FORMAT}`;

// Both binaries are the same audio server: the .app bundle is what a normal run
// uses, the bare one is the fallback before setup has built the bundle. Either
// can be left behind by a crash, and either one holds the port if it is.
const SERVER_BINARIES = [CAPTURE_HELPER_BIN, AUDIO_SERVER_BIN];

// Anchored to the full path, so a swyh-rs-cli the user started by hand from
// somewhere else is never in the match.
function findServerPids() {
  const pids = new Set();
  for (const binary of SERVER_BINARIES) {
    try {
      const output = execFileSync("/usr/bin/pgrep", ["-f", `^${binary}`]).toString();
      for (const line of output.split("\n")) {
        const pid = Number(line.trim());
        if (pid && pid !== process.pid) pids.add(pid);
      }
    } catch {
      // pgrep exits 1 when nothing matches.
    }
  }
  return [...pids];
}

// swyh-rs binds the LAN address rather than 0.0.0.0, so the probe has to use the
// same address the Chromecast will be given - 127.0.0.1 is refused either way.
function canConnectToPort(host) {
  return new Promise((resolve) => {
    const socket = connect({ host, port: STREAM_PORT });
    const settle = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

// Kills by binary rather than by a recorded pid: `open` hands the bundle to
// launchd, so a stop that misses leaves the server running under pid 1 with no
// pid written down anywhere to find it by again.
export function stopAudioServers() {
  const pids = findServerPids();
  for (const pid of pids) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  return pids;
}

// A leftover server keeps the port, and the new one then fails to bind. It still
// captures nothing the Chromecast can use - a bare binary is denied capture
// without a prompt - so the speaker connects to it and plays silence.
async function stopStrayServers(host) {
  const strays = stopAudioServers();
  if (strays.length === 0) return strays;

  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline && await canConnectToPort(host)) {
    await sleep(STARTUP_POLL_MS);
  }
  return strays;
}

async function waitUntilServing(host, timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(SERVER_LOG_FILE)) {
      const log = readFileSync(SERVER_LOG_FILE, "utf8");

      // Checked before the success line: swyh-rs prints "Serving started" even
      // when the web server thread has already panicked on a taken port, so
      // trusting that line alone reports a server that is not listening at all.
      const bindFailure = log.match(/Error starting server thread: [^\n]*/);
      if (bindFailure) throw new Error(`The audio server could not open port ${STREAM_PORT}: ${bindFailure[0]}`);
      const captureBlocked = log.match(/cannot be opened for capture[^\n]*/);
      if (captureBlocked) throw new Error(captureBlocked[0]);
      const startupFailure = log.match(/^Failed to [^\n]*/m);
      if (startupFailure) throw new Error(`The audio server stopped: ${startupFailure[0]}`);

      if (/Serving started on port/.test(log) && await canConnectToPort(host)) return;
    }
    await sleep(STARTUP_POLL_MS);
  }
  throw new Error("The audio server did not start in time.");
}

export async function startAudioServer() {
  mkdirSync(join(homedir(), ".swyh-rs"), { recursive: true });

  const host = findLocalIPv4();
  await stopStrayServers(host);

  const logFd = openSync(SERVER_LOG_FILE, "w");

  let pid = null;
  if (hasCaptureHelper()) {
    spawn("/usr/bin/open",
      ["-a", CAPTURE_HELPER_APP, "--stdout", SERVER_LOG_FILE, "--stderr", SERVER_LOG_FILE,
        "--args", ...SERVER_ARGS],
      { stdio: "ignore" }).unref();
  } else {
    const child = spawn(AUDIO_SERVER_BIN, SERVER_ARGS, { detached: true, stdio: ["ignore", logFd, logFd] });
    child.unref();
    pid = child.pid;
  }
  closeSync(logFd);

  const stop = () => {
    stopAudioServers();
    if (pid) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  };

  try {
    await waitUntilServing(host);
  } catch (error) {
    stop();
    throw error;
  }

  pid ??= findServerPids()[0] ?? null;
  return { pid, stop };
}
