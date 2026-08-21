// npm run cast:start
//
// 1. finds your Chromecasts on the network
// 2. lets you pick one with the arrow keys
// 3. starts the swyh-rs audio server (capturing BlackHole)
// 4. casts, then stays open with a live volume control
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { stdin, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  SWYH, PORT, STATE_DIR, STATE_FILE, LOG_FILE, CONFIG_FILE,
  findCatt, findCastPython, CASTER, color,
} from "./config.mjs";
import {
  findSwitcher, listOutputs, currentOutput, setOutput,
  findCastDevice, findRestoreDevice, INSTALL_HINT,
} from "./audio.mjs";
import {
  networkKey, readCache, writeCache, scan, refreshInBackground,
} from "./devices.mjs";
import { pick } from "./picker.mjs";
import * as ui from "./ui.mjs";

// WAV is the reliable choice: swyh-rs sends it with a declared 4GB length, so the
// Chromecast treats it as a very long file. An endless chunked FLAC stream has no
// duration, and Cast disconnects a second after connecting.
const FORMAT = process.env.CAST_FORMAT || "wav";
const MIME = FORMAT === "flac" ? "audio/flac" : "audio/wav";
const VOLUME_STEP = 0.05;

const ESC = "\u001b";
const KEY = { UP: `${ESC}[A`, DOWN: `${ESC}[B`, ESC, CTRL_C: "\u0003", SPACE: " " };

function fail(message, hint) {
  ui.showCursor();
  console.error(`\n${color.red("x")} ${message}`);
  if (hint) console.error(`  ${color.dim(hint)}`);
  process.exit(1);
}

function localIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

async function waitForServer(logPath, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
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

// ---- preflight ----------------------------------------------------------

const catt = findCatt();
if (!catt) fail("catt is not installed.", "Install it with: uv tool install catt");

const castPython = findCastPython();
if (!castPython) {
  fail("The Chromecast helper's Python is missing.",
    "Reinstall it with: uv tool install --force catt");
}

if (!existsSync(SWYH)) {
  fail(`The audio server is missing at ${SWYH}`,
    "It should be at ./bin/swyh-rs-cli inside this folder.");
}

const ip = localIPv4();
if (!ip) fail("No network connection found.", "Connect to WiFi and try again.");

mkdirSync(STATE_DIR, { recursive: true });

// swyh-rs writes its own log into ~/.swyh-rs and quits on the spot if that folder
// is not there. It never creates it itself, so do it here.
mkdirSync(join(homedir(), ".swyh-rs"), { recursive: true });

// A leftover server from a previous run would be holding port 5901.
if (existsSync(STATE_FILE)) {
  try {
    const old = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (old.pid) process.kill(old.pid, "SIGKILL");
  } catch {}
  rmSync(STATE_FILE, { force: true });
}

// ---- pick a speaker -----------------------------------------------------

// Discovery costs several seconds and the answer rarely changes, so a remembered
// list goes straight on screen while a fresh scan runs behind it.
const network = networkKey(ip);
const rescan = process.argv.includes("--rescan") || process.env.CAST_RESCAN === "1";
const cached = rescan ? null : readCache(network);
let devices = cached?.devices;
let refresher = null;

if (devices) {
  console.log(color.dim(`${devices.length} known Chromecast${devices.length === 1 ? "" : "s"} (remembered from a previous run).`));
  refresher = refreshInBackground(castPython, network);
} else {
  console.log(color.dim("Looking for Chromecasts on your network..."));
  try {
    devices = scan(castPython);
  } catch (e) {
    fail("Could not scan for Chromecasts.", e.message);
  }
  if (devices.length === 0) {
    fail("No Chromecasts found.",
      "Check that this Mac and the Chromecast are on the same WiFi network.");
  }
  writeCache(network, devices);
}

console.log("");
let device;
try {
  device = await pick(
    "Where should the audio go?  (arrow keys, Enter to choose)",
    devices,
    (d) => `${d.name}  ${color.dim(d.model + " - " + d.ip)}`,
  );
} catch (e) {
  fail(e.message, "Run `npm run cast` directly in Terminal, not through a pipe.");
} finally {
  // The refresh has served its purpose by now; do not hold the process open for it.
  try { refresher?.kill(); } catch {}
}

// ---- start the audio server --------------------------------------------

const url = `http://${ip}:${PORT}/stream/swyh.${FORMAT}`;

console.log(`\n${color.dim("Starting the audio server...")}`);
const logFd = openSync(LOG_FILE, "w");
const server = spawn(
  SWYH,
  ["-x", "-f", FORMAT, "-s", "BlackHole", "-C", CONFIG_FILE],
  { detached: true, stdio: ["ignore", logFd, logFd] },
);
server.unref();

const killServer = () => {
  try { process.kill(server.pid, "SIGKILL"); } catch {}
};

// Put the sound output back where it was. Returns the device name, or null if we
// never switched it in the first place.
let restoreOutput = null;
const restoreSound = () => {
  const bin = findSwitcher();
  if (!bin || !restoreOutput) return null;
  try {
    setOutput(bin, restoreOutput);
    return restoreOutput;
  } catch {
    return null;
  }
};

try {
  await waitForServer(LOG_FILE);
} catch (e) {
  killServer();
  fail(e.message,
    "Is BlackHole installed, and did you grant microphone permission to your terminal?");
}

// ---- point the Mac's sound output at the capture device ----------------

const switcher = findSwitcher();
let castOutput = null;

if (switcher) {
  castOutput = findCastDevice(switcher);
  if (!castOutput) {
    killServer();
    fail("No BlackHole or Multi-Output Device found in your sound outputs.",
      `Sound outputs seen: ${listOutputs(switcher).join(", ")}`);
  }
  restoreOutput = findRestoreDevice(switcher, currentOutput(switcher));
  try {
    setOutput(switcher, castOutput);
    console.log(color.dim(`Sound output switched to ${castOutput}.`));
  } catch (e) {
    killServer();
    fail(`Could not switch the sound output to ${castOutput}.`, e.message);
  }
} else {
  console.log(color.yellow("SwitchAudioSource is not installed - switch the sound output by hand."));
  console.log(color.dim(`  ${INSTALL_HINT}`));
}

writeFileSync(STATE_FILE, JSON.stringify({
  pid: server.pid, device: device.name, ip: device.ip, url,
  restoreOutput, startedAt: new Date().toISOString(),
}, null, 2));

// ---- connect to the Chromecast and hold the connection open -------------

console.log(color.dim(`Connecting to ${device.name}...`));

const casterArgs = [CASTER, device.name, url, MIME];
if (device.ip && device.port && device.uuid) {
  casterArgs.push(device.ip, String(device.port), device.uuid, device.model || "");
}

const caster = spawn(castPython, casterArgs, {
  stdio: ["pipe", "pipe", "pipe"],
});

let volume = 0.5;
let state = "connecting";
let note = "";
let live = false;
let shuttingDown = false;
let paused = false;

const draw = () => {
  if (live) ui.render({ device: device.name, volume, state, note, output: castOutput, paused });
};

createInterface({ input: caster.stdout }).on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.event === "error") {
    if (!live) {
      killServer();
      restoreSound();
      fail(msg.message, "Is the speaker powered on and on the same network?");
    }
    note = msg.message;
  } else {
    if (typeof msg.volume === "number") volume = msg.volume;
    if (msg.state) {
      // Ignore the watcher while a resync is in flight; it still sees the old state.
      if (!(state === "RESYNCING" && msg.state === "PAUSED")) state = msg.state;
      paused = state === "PAUSED";
    }
    if (msg.event === "ready" && !live) {
      live = true;
      ui.hideCursor();
    }
  }
  draw();
});

// A crash in the helper must not leave a silent server running behind it.
caster.on("exit", (code) => {
  if (!shuttingDown) {
    killServer();
    restoreSound();
    ui.showCursor();
    console.error(`\n${color.red("x")} Lost the connection to ${device.name} (code ${code}).`);
    rmSync(STATE_FILE, { force: true });
    process.exit(1);
  }
});

// ---- keyboard control ---------------------------------------------------

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (stdin.isTTY) stdin.setRawMode(false);
  stdin.pause();
  try { caster.stdin.write("stop\n"); } catch {}
  await sleep(1200);
  try { caster.kill("SIGKILL"); } catch {}
  killServer();
  const restored = restoreSound();
  rmSync(STATE_FILE, { force: true });
  ui.finish(
    `${color.green("Stopped casting.")}  ` +
    color.dim(restored
      ? `Sound output back to ${restored}.`
      : "Set your sound output back to your speakers."),
  );
  process.exit(0);
};

// Pause is instant, but resuming re-issues the stream rather than un-pausing: see
// the note in caster.py. That costs a couple of seconds of rebuffering, and is why
// the status reads "catching up" instead of jumping straight back to playing.
const togglePause = () => {
  if (!live) return;
  paused = !paused;
  if (paused) {
    state = "PAUSED";
  } else {
    state = "RESYNCING";
  }
  try { caster.stdin.write(`${paused ? "pause" : "resume"}\n`); } catch {}
  draw();
};

const setVolume = (next) => {
  volume = Math.max(0, Math.min(1, Math.round(next * 100) / 100));
  try { caster.stdin.write(`vol ${volume.toFixed(2)}\n`); } catch {}
  draw();
};

if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();
stdin.on("data", (buf) => {
  const key = buf.toString();
  if (key === KEY.UP) setVolume(volume + VOLUME_STEP);
  else if (key === KEY.DOWN) setVolume(volume - VOLUME_STEP);
  else if (key === KEY.SPACE) togglePause();
  else if (key === KEY.ESC || key === KEY.CTRL_C || key === "q") shutdown();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

stdout.write(color.dim("Waiting for the speaker to start playing...\n"));
