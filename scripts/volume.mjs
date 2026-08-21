import { openSync, writeSync, closeSync, constants, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { CONTROL_PIPE, MUTE_FILE, STATE_DIR } from "./lib/config.mjs";
import * as session from "./lib/session.mjs";

const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.5;
const OPEN_PIPE_ATTEMPTS = 5;
const USAGE = "Use: node scripts/volume.mjs up | down | mute | unmute | <0-100>";

const state = session.read();
if (!state || !session.isRunning(state)) {
  console.error("Nothing is casting.");
  process.exit(1);
}

const command = (process.argv[2] || "").toLowerCase();
const currentVolume = typeof state.volume === "number" ? state.volume : DEFAULT_VOLUME;

// The engine rewrites session.json on every status event, so the pre-mute level
// lives in its own file that only this script touches.
const readMutedFrom = () => {
  try {
    const value = JSON.parse(readFileSync(MUTE_FILE, "utf8")).mutedFrom;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
};
const writeMutedFrom = (value) => {
  if (value === null) return rmSync(MUTE_FILE, { force: true });
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(MUTE_FILE, JSON.stringify({ mutedFrom: value }));
};

const storedVolume = readMutedFrom();

let requestedVolume;
let nextMutedFrom = null;
if (command === "up") requestedVolume = currentVolume + VOLUME_STEP;
else if (command === "down") requestedVolume = currentVolume - VOLUME_STEP;
else if (command === "mute") {
  requestedVolume = 0;
  nextMutedFrom = currentVolume > 0 ? currentVolume : storedVolume;
} else if (command === "unmute") {
  requestedVolume = storedVolume ?? DEFAULT_VOLUME;
} else if (/^\d+(\.\d+)?$/.test(command)) requestedVolume = Number(command) / 100;
else {
  console.error(USAGE);
  process.exit(1);
}

const nextVolume = Math.max(0, Math.min(1, Math.round(requestedVolume * 100) / 100));

let pipeFd;
for (let attempt = 0; pipeFd === undefined; attempt++) {
  try {
    pipeFd = openSync(CONTROL_PIPE, constants.O_WRONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code !== "ENXIO" || attempt === OPEN_PIPE_ATTEMPTS) {
      console.error("The casting session is not listening - is it still running?");
      process.exit(1);
    }
    execFileSync("/bin/sleep", ["0.2"]);
  }
}

try {
  writeSync(pipeFd, `vol ${nextVolume.toFixed(2)}\n`);
} finally {
  closeSync(pipeFd);
}

writeMutedFrom(nextMutedFrom);
session.write({ ...state, volume: nextVolume });

console.log(nextVolume === 0 ? "Muted" : `Volume ${Math.round(nextVolume * 100)}%`);
