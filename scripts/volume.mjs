// npm run cast:volume -- up | down | mute | <0-100>
//
// The Cast connection belongs to the running session, so this writes one line
// into its control pipe and lets it forward the change.
import { openSync, writeSync, closeSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { CONTROL_FIFO } from "./lib/config.mjs";
import * as session from "./lib/session.mjs";

const STEP = 0.05;

const state = session.read();
if (!state || !session.isRunning(state)) {
  console.error("Nothing is casting.");
  process.exit(1);
}

const arg = (process.argv[2] || "").toLowerCase();
const current = typeof state.volume === "number" ? state.volume : 0.5;

let next;
if (arg === "up") next = current + STEP;
else if (arg === "down") next = current - STEP;
else if (arg === "mute") next = 0;
else if (/^\d+(\.\d+)?$/.test(arg)) next = Number(arg) / 100;
else {
  console.error("Use: cast:volume -- up | down | mute | <0-100>");
  process.exit(1);
}

next = Math.max(0, Math.min(1, Math.round(next * 100) / 100));

// O_NONBLOCK is what keeps this from hanging forever: opening a pipe for writing
// blocks until someone is reading, and a session that has died never will. ENXIO
// means nobody is reading yet, which is also what a session that is still
// connecting looks like, so give it a few tries before giving up.
let fd;
for (let i = 0; fd === undefined; i++) {
  try {
    fd = openSync(CONTROL_FIFO, constants.O_WRONLY | constants.O_NONBLOCK);
  } catch (e) {
    if (e.code !== "ENXIO" || i === 5) {
      console.error("The casting session is not listening - is it still running?");
      process.exit(1);
    }
    execFileSync("/bin/sleep", ["0.2"]);
  }
}

try {
  writeSync(fd, `vol ${next.toFixed(2)}\n`);
} finally {
  closeSync(fd);
}

// The speaker confirms a moment later, but the menu bar redraws immediately after
// a click, and a bar that lags the click by a second feels broken.
session.write({ ...state, volume: next });

console.log(`Volume ${Math.round(next * 100)}%`);
