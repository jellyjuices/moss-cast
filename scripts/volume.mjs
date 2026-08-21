import { openSync, writeSync, closeSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { CONTROL_PIPE } from "./lib/config.mjs";
import * as session from "./lib/session.mjs";

const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.5;
const OPEN_PIPE_ATTEMPTS = 5;
const USAGE = "Use: node scripts/volume.mjs up | down | mute | <0-100>";

const state = session.read();
if (!state || !session.isRunning(state)) {
  console.error("Nothing is casting.");
  process.exit(1);
}

const command = (process.argv[2] || "").toLowerCase();
const currentVolume = typeof state.volume === "number" ? state.volume : DEFAULT_VOLUME;

let requestedVolume;
if (command === "up") requestedVolume = currentVolume + VOLUME_STEP;
else if (command === "down") requestedVolume = currentVolume - VOLUME_STEP;
else if (command === "mute") requestedVolume = 0;
else if (/^\d+(\.\d+)?$/.test(command)) requestedVolume = Number(command) / 100;
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

session.write({ ...state, volume: nextVolume });

console.log(`Volume ${Math.round(nextVolume * 100)}%`);
