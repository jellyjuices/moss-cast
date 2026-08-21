import { stdin, stdout } from "node:process";
import { color, KEY, hideCursor, showCursor } from "./lib/terminal/ansi.mjs";
import { checkRequirements, exitWithError } from "./lib/preflight.mjs";
import { listDevices } from "./lib/chromecast/discovery.mjs";
import { startCasting } from "./lib/engine.mjs";
import { pickFromList } from "./lib/terminal/picker.mjs";
import { renderCastingScreen, printClosingMessage } from "./lib/terminal/screen.mjs";

const VOLUME_STEP = 0.05;

const { python, networkId } = checkRequirements();

let devices;
try {
  devices = await listDevices({
    python,
    networkId,
    rescan: process.argv.includes("--rescan") || process.env.MOSS_RESCAN === "1",
    onNote: (text) => console.log(color.dim(text)),
  });
} catch (error) {
  exitWithError(error.message);
}

console.log("");
const device = await pickFromList(
  "Where should the audio go?  (arrow keys, Enter to choose)",
  devices,
  (item) => `${item.name}  ${color.dim(`${item.model} - ${item.ip}`)}`,
).catch((error) => exitWithError(
  error.message,
  "Run `node scripts/start.mjs` directly in Terminal, not through a pipe.",
));

let volume = 0.5;
let playbackState = "connecting";
let paused = false;
let note = "";
let screenIsLive = false;

const draw = () => {
  if (screenIsLive) {
    renderCastingScreen({
      device: device.name, volume, playbackState, note, output: castSession?.output, paused,
    });
  }
};

let castSession;
try {
  castSession = await startCasting({
    device,
    onLog: (message) => { if (!screenIsLive) console.log(color.dim(message)); },
    onEvent: (event) => {
      if (event.event === "error") note = event.message;
      if (typeof event.volume === "number") volume = event.volume;
      if (event.state) {
        if (!(playbackState === "RESYNCING" && event.state === "PAUSED")) playbackState = event.state;
        paused = playbackState === "PAUSED";
      }
      draw();
    },
    onConnectionLost: (code) => {
      showCursor();
      console.error(`\n${color.red("x")} Lost the connection to ${device.name} (code ${code}).`);
      process.exit(1);
    },
  });
} catch (error) {
  exitWithError(
    error.message,
    "Is BlackHole installed, and has your terminal been granted microphone access?",
  );
}

screenIsLive = true;
hideCursor();
draw();

const stop = async () => {
  if (stdin.isTTY) stdin.setRawMode(false);
  stdin.pause();
  const restoredOutput = await castSession.stop();
  printClosingMessage(`${color.green("Stopped casting.")}  ` + color.dim(
    restoredOutput
      ? `Sound output back to ${restoredOutput}.`
      : "Set your sound output back to your speakers.",
  ));
  process.exit(0);
};

const setVolume = (level) => {
  volume = Math.max(0, Math.min(1, Math.round(level * 100) / 100));
  castSession.sendCommand(`vol ${volume.toFixed(2)}`);
  draw();
};

const togglePause = () => {
  paused = !paused;
  playbackState = paused ? "PAUSED" : "RESYNCING";
  castSession.sendCommand(paused ? "pause" : "resume");
  draw();
};

if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();
stdin.on("data", (buffer) => {
  const key = buffer.toString();
  if (key === KEY.UP) setVolume(volume + VOLUME_STEP);
  else if (key === KEY.DOWN) setVolume(volume - VOLUME_STEP);
  else if (key === KEY.SPACE) togglePause();
  else if (key === KEY.ESC || key === KEY.CTRL_C || key === "q") stop();
});

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

stdout.write(color.dim("Waiting for the speaker to start playing...\n"));
