import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AUDIO_SERVER_BIN, STREAM_PORT, STREAM_FORMAT, SERVER_LOG_FILE, SERVER_CONFIG_FILE,
  CAPTURE_HELPER_APP, CAPTURE_HELPER_BIN, hasCaptureHelper,
} from "../config.mjs";

const SERVER_ARGS = ["-x", "-f", STREAM_FORMAT, "-s", "BlackHole", "-C", SERVER_CONFIG_FILE];

const STARTUP_TIMEOUT_MS = 15_000;
const STARTUP_POLL_MS = 300;

export const streamUrl = (ip) => `http://${ip}:${STREAM_PORT}/stream/swyh.${STREAM_FORMAT}`;

function findCaptureHelperPid() {
  try {
    const output = execFileSync("/usr/bin/pgrep", ["-n", "-f", CAPTURE_HELPER_BIN]).toString();
    return Number(output.trim()) || null;
  } catch {
    return null;
  }
}

async function waitUntilServing(timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(SERVER_LOG_FILE)) {
      const log = readFileSync(SERVER_LOG_FILE, "utf8");
      if (/Serving started on port/.test(log)) return;
      const captureBlocked = log.match(/cannot be opened for capture[^\n]*/);
      if (captureBlocked) throw new Error(captureBlocked[0]);
      const startupFailure = log.match(/^Failed to [^\n]*/m);
      if (startupFailure) throw new Error(`The audio server stopped: ${startupFailure[0]}`);
    }
    await sleep(STARTUP_POLL_MS);
  }
  throw new Error("The audio server did not start in time.");
}

export async function startAudioServer() {
  mkdirSync(join(homedir(), ".swyh-rs"), { recursive: true });

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
    try { process.kill(pid ?? findCaptureHelperPid(), "SIGKILL"); } catch {}
  };

  try {
    await waitUntilServing();
  } catch (error) {
    stop();
    throw error;
  }

  pid ??= findCaptureHelperPid();
  return { pid, stop };
}
