// node scripts/volume.mjs up | down | <0-100>
//
// The menu's volume control. It cannot talk to the speaker itself - the Cast
// connection belongs to the running supervisor (scripts/cast.mjs) - so it writes
// one line into the control pipe and lets the supervisor forward it.
//
// The new level is also written straight into the session file. The speaker will
// confirm it a moment later, but the menu redraws immediately after a click, and
// a bar that lags a click by a second feels broken.
import { openSync, writeSync, closeSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { STATE_FILE, CONTROL_FIFO } from "./config.mjs";

const STEP = 0.05;

const arg = (process.argv[2] || "").toLowerCase();

if (!existsSync(STATE_FILE)) {
  console.error("Nothing is casting.");
  process.exit(1);
}

const session = JSON.parse(readFileSync(STATE_FILE, "utf8"));
const current = typeof session.volume === "number" ? session.volume : 0.5;

let next;
if (arg === "up") next = current + STEP;
else if (arg === "down") next = current - STEP;
else if (arg === "mute") next = 0;
else if (/^\d+(\.\d+)?$/.test(arg)) next = Number(arg) / 100;
else {
  console.error("Use: volume.mjs up | down | mute | <0-100>");
  process.exit(1);
}

next = Math.max(0, Math.min(1, Math.round(next * 100) / 100));

// O_NONBLOCK is what keeps this from hanging forever: opening a pipe for writing
// blocks until someone is reading, and a supervisor that has died never will.
// ENXIO means nobody is reading yet, which is also what the first second of a
// fresh session looks like, so give it a few tries before giving up.
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

try {
  writeFileSync(STATE_FILE, JSON.stringify({ ...session, volume: next }, null, 2));
} catch {}

console.log(`Volume ${Math.round(next * 100)}%`);
