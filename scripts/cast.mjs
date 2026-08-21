// node scripts/cast.mjs --device "Kitchen speaker"
//
// The headless twin of start.mjs: no picker, no keyboard - it takes a
// speaker by name, starts the audio server, switches the Mac's sound output, and
// then stays alive holding the Cast connection open until it is signalled.
//
// Staying alive is the whole point. The connection dies with the process, so the
// menu bar helper backgrounds this and talks to it only through .state/session.json
// and signals. Everything it prints goes to .state/cast.log.
import { spawn, execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, openSync, writeFileSync, readFileSync, rmSync,
  createReadStream,
} from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  SWYH, PORT, STATE_DIR, STATE_FILE, LOG_FILE, CONFIG_FILE, CONTROL_FIFO,
  HELPER_APP, HELPER_BIN, hasHelper, findCastPython, CASTER,
} from "./config.mjs";
import {
  findSwitcher, listOutputs, currentOutput, setOutput,
  findCastDevice, findRestoreDevice,
} from "./audio.mjs";
import { networkKey, readCache, scan } from "./devices.mjs";

const FORMAT = process.env.CAST_FORMAT || "wav";
const MIME = FORMAT === "flac" ? "audio/flac" : "audio/wav";

const log = (msg) => process.stdout.write(`${new Date().toISOString()}  ${msg}\n`);

// A failure has to be legible to a menu with no stderr: leave the reason in the
// session file so the helper can show it, rather than dying silently.
function fail(message) {
  log(`ERROR ${message}`);
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({
      error: message, failedAt: new Date().toISOString(),
    }, null, 2));
  } catch {}
  process.exit(1);
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
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
      const text = readFileSync(logPath, "utf8");
      if (/Serving started on port/.test(text)) return;
      const cannot = text.match(/cannot be opened for capture[^\n]*/);
      if (cannot) throw new Error(cannot[0]);
      const failed = text.match(/^Failed to [^\n]*/m);
      if (failed) throw new Error(`The audio server stopped: ${failed[0]}`);
    }
    await sleep(300);
  }
  throw new Error("The audio server did not start in time.");
}

// ---- preflight ----------------------------------------------------------

const wanted = flagValue("--device");
if (!wanted) fail("No speaker given. Use: --device \"Kitchen speaker\"");

const castPython = findCastPython();
if (!castPython) fail("The Chromecast helper's Python is missing. Run: uv tool install --force catt");

if (!existsSync(SWYH)) fail(`The audio server is missing at ${SWYH}`);

const ip = localIPv4();
if (!ip) fail("No network connection found.");

mkdirSync(STATE_DIR, { recursive: true });
mkdirSync(join(homedir(), ".swyh-rs"), { recursive: true });

// A leftover server from a previous run would be holding the port.
if (existsSync(STATE_FILE)) {
  try {
    const old = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (old.supervisorPid && old.supervisorPid !== process.pid) {
      try { process.kill(old.supervisorPid, "SIGTERM"); } catch {}
      await sleep(1500);
    }
    if (old.pid) process.kill(old.pid, "SIGKILL");
  } catch {}
  rmSync(STATE_FILE, { force: true });
}

// ---- resolve the speaker ------------------------------------------------

// The cached entry carries the address, which lets the helper connect straight to
// the speaker instead of paying for mDNS again. Without it, caster.py discovers.
const network = networkKey(ip);
let device = readCache(network)?.devices?.find((d) => d.name === wanted);

if (!device) {
  log(`${wanted} is not in the cache - scanning.`);
  try {
    device = scan(castPython).find((d) => d.name === wanted);
  } catch (e) {
    fail(`Could not scan for Chromecasts: ${e.message}`);
  }
}

if (!device) fail(`Could not find a Chromecast named "${wanted}" on this network.`);

// ---- start the audio server --------------------------------------------

const url = `http://${ip}:${PORT}/stream/swyh.${FORMAT}`;

log("Starting the audio server...");
const logFd = openSync(LOG_FILE, "w");
const serverArgs = ["-x", "-f", FORMAT, "-s", "BlackHole", "-C", CONFIG_FILE];

// Prefer the .app bundle: launched with `open`, the capture process is its own
// responsible app and can hold a microphone grant. Started as a bare binary it
// inherits whatever launched it - fine from a terminal, silently denied under
// SwiftBar, which streams silence rather than failing. Fall back to the raw
// binary when the bundle has not been built.
let serverPid = null;

if (hasHelper()) {
  // `open` returns as soon as it has handed off to launchd, so the pid has to be
  // found afterwards rather than taken from the spawn.
  spawn("/usr/bin/open", ["-a", HELPER_APP, "--stdout", LOG_FILE, "--stderr", LOG_FILE,
    "--args", ...serverArgs], { stdio: "ignore" }).unref();
} else {
  const server = spawn(SWYH, serverArgs,
    { detached: true, stdio: ["ignore", logFd, logFd] });
  server.unref();
  serverPid = server.pid;
}

// Only ever matches our own bundle's executable, so a stray swyh-rs-cli started
// by hand from a terminal is left alone.
function findHelperPid() {
  try {
    return Number(execFileSync("/usr/bin/pgrep", ["-n", "-f", HELPER_BIN])
      .toString().trim()) || null;
  } catch {
    return null;
  }
}

const killServer = () => {
  const pid = serverPid ?? findHelperPid();
  try { process.kill(pid, "SIGKILL"); } catch {}
};

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
  // The bundle is up now, so its pid is resolvable - the menu bar helper reads
  // this out of the session file to tell casting from stopped.
  serverPid ??= findHelperPid();
} catch (e) {
  killServer();
  fail(`${e.message} Is BlackHole installed, and does this app have microphone permission?`);
}

// ---- point the Mac's sound output at the capture device ----------------

const switcher = findSwitcher();
let castOutput = null;

if (switcher) {
  castOutput = findCastDevice(switcher);
  if (!castOutput) {
    killServer();
    fail(`No BlackHole or Multi-Output Device found. Sound outputs seen: ${listOutputs(switcher).join(", ")}`);
  }
  restoreOutput = findRestoreDevice(switcher, currentOutput(switcher));
  try {
    setOutput(switcher, castOutput);
    log(`Sound output switched to ${castOutput}.`);
  } catch (e) {
    killServer();
    fail(`Could not switch the sound output to ${castOutput}: ${e.message}`);
  }
} else {
  log("SwitchAudioSource is not installed - switch the sound output by hand.");
}

// ---- connect and hold ---------------------------------------------------

// Written before the speaker answers, with ready:false. The helper needs something
// to show during the couple of seconds a connection takes.
let volume = null;

const writeSession = (extra = {}) => {
  writeFileSync(STATE_FILE, JSON.stringify({
    supervisorPid: process.pid,
    pid: serverPid,
    device: device.name,
    ip: device.ip,
    url,
    output: castOutput,
    restoreOutput,
    ready: false,
    volume,
    startedAt: new Date().toISOString(),
    ...extra,
  }, null, 2));
};
writeSession();

log(`Connecting to ${device.name}...`);

const casterArgs = [CASTER, device.name, url, MIME];
if (device.ip && device.port && device.uuid) {
  casterArgs.push(device.ip, String(device.port), device.uuid, device.model || "");
}

const caster = spawn(castPython, casterArgs, { stdio: ["pipe", "pipe", "pipe"] });

let live = false;
let shuttingDown = false;

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
      fail(`${msg.message}. Is the speaker powered on and on the same network?`);
    }
    log(`caster: ${msg.message}`);
  } else if (msg.event === "ready" && !live) {
    live = true;
    if (typeof msg.volume === "number") volume = msg.volume;
    writeSession({ ready: true });
    log(`Casting to ${device.name}.`);
  } else if (msg.event === "status" && typeof msg.volume === "number") {
    // The speaker is the authority on its own level - it can be changed from a
    // phone, and the menu should show what actually happened.
    if (msg.volume !== volume) {
      volume = msg.volume;
      if (live) writeSession({ ready: true });
    }
  }
});

createInterface({ input: caster.stderr }).on("line", (line) => log(`caster stderr: ${line}`));

// A crash in the helper must not leave a silent server running behind it.
caster.on("exit", (code) => {
  if (shuttingDown) return;
  killServer();
  restoreSound();
  log(`Lost the connection to ${device.name} (code ${code}).`);
  rmSync(CONTROL_FIFO, { force: true });
  rmSync(STATE_FILE, { force: true });
  process.exit(1);
});

// ---- the control pipe ---------------------------------------------------

// Volume comes from the menu, which is a new process on every redraw and so
// cannot hold the connection. It writes a line here instead; we forward it to
// the caster, which already speaks `vol <0.0-1.0>` on stdin.
//
// Opened "r+" on purpose: a read-only handle on a FIFO hits EOF the moment the
// last writer leaves, and the stream would close after the first command.
function openControlPipe() {
  try {
    rmSync(CONTROL_FIFO, { force: true });
    execFileSync("/usr/bin/mkfifo", [CONTROL_FIFO]);
  } catch (e) {
    log(`No control pipe (${e.message}) - volume from the menu will not work.`);
    return;
  }
  createInterface({ input: createReadStream(CONTROL_FIFO, { flags: "r+" }) })
    .on("line", (cmd) => {
      const text = cmd.trim();
      if (!text) return;
      try { caster.stdin.write(`${text}\n`); } catch {}
    });
}

openControlPipe();

// ---- shutdown -----------------------------------------------------------

// SIGTERM is the only control surface: `cast:stop` sends it, and the sound output
// goes back the same way it would have on a keypress.
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { caster.stdin.write("stop\n"); } catch {}
  await sleep(1200);
  try { caster.kill("SIGKILL"); } catch {}
  killServer();
  const restored = restoreSound();
  rmSync(CONTROL_FIFO, { force: true });
  rmSync(STATE_FILE, { force: true });
  log(`Stopped casting.${restored ? ` Sound output back to ${restored}.` : ""}`);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
