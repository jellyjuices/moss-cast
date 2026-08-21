// node scripts/start.mjs [--rescan]
//
// Pick a speaker, cast, and stay on screen with volume controls.
import { stdin, stdout } from "node:process";
import { color, KEY, hideCursor, showCursor } from "./lib/term.mjs";
import { preflight, fail } from "./lib/preflight.mjs";
import { chooseDevice } from "./lib/discover.mjs";
import { startCasting } from "./lib/engine.mjs";
import { pick } from "./lib/picker.mjs";
import * as ui from "./lib/ui.mjs";

const VOLUME_STEP = 0.05;

const { python, network } = preflight();

let devices;
try {
  devices = await chooseDevice({
    python,
    network,
    rescan: process.argv.includes("--rescan") || process.env.CAST_RESCAN === "1",
    onNote: (text) => console.log(color.dim(text)),
  });
} catch (e) {
  fail(e.message);
}

console.log("");
const device = await pick(
  "Where should the audio go?  (arrow keys, Enter to choose)",
  devices,
  (d) => `${d.name}  ${color.dim(`${d.model} - ${d.ip}`)}`,
).catch((e) => fail(e.message, "Run `node scripts/start.mjs` directly in Terminal, not through a pipe."));

let volume = 0.5;
let state = "connecting";
let paused = false;
let note = "";
let live = false;

const draw = () => {
  if (live) ui.render({ device: device.name, volume, state, note, output: session?.output, paused });
};

let session;
try {
  session = await startCasting({
    device,
    onLog: (msg) => { if (!live) console.log(color.dim(msg)); },
    onEvent: (msg) => {
      if (msg.event === "error") note = msg.message;
      if (typeof msg.volume === "number") volume = msg.volume;
      if (msg.state) {
        // Ignore the watcher while a resync is in flight; it still sees the old state.
        if (!(state === "RESYNCING" && msg.state === "PAUSED")) state = msg.state;
        paused = state === "PAUSED";
      }
      draw();
    },
    onLost: (code) => {
      showCursor();
      console.error(`\n${color.red("x")} Lost the connection to ${device.name} (code ${code}).`);
      process.exit(1);
    },
  });
} catch (e) {
  fail(e.message, "Is BlackHole installed, and has your terminal been granted microphone access?");
}

live = true;
hideCursor();
draw();

const stop = async () => {
  if (stdin.isTTY) stdin.setRawMode(false);
  stdin.pause();
  const restored = await session.stop();
  ui.finish(`${color.green("Stopped casting.")}  ` + color.dim(
    restored ? `Sound output back to ${restored}.` : "Set your sound output back to your speakers.",
  ));
  process.exit(0);
};

const setVolume = (next) => {
  volume = Math.max(0, Math.min(1, Math.round(next * 100) / 100));
  session.send(`vol ${volume.toFixed(2)}`);
  draw();
};

// Resuming re-issues the stream rather than un-pausing (see caster.py), which
// costs a couple of seconds of rebuffering - hence "catching up" rather than
// jumping straight back to playing.
const togglePause = () => {
  paused = !paused;
  state = paused ? "PAUSED" : "RESYNCING";
  session.send(paused ? "pause" : "resume");
  draw();
};

if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();
stdin.on("data", (buf) => {
  const key = buf.toString();
  if (key === KEY.UP) setVolume(volume + VOLUME_STEP);
  else if (key === KEY.DOWN) setVolume(volume - VOLUME_STEP);
  else if (key === KEY.SPACE) togglePause();
  else if (key === KEY.ESC || key === KEY.CTRL_C || key === "q") stop();
});

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

stdout.write(color.dim("Waiting for the speaker to start playing...\n"));
