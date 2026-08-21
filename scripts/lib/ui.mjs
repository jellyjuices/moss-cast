// The live status screen shown while casting. Redraws in place.
import { stdout } from "node:process";
import { ESC, color, showCursor } from "./term.mjs";

const LINES = 9; // keep in sync with the number of lines render() writes

function bar(level, width = 22) {
  const filled = Math.round(level * width);
  return color.cyan("#".repeat(filled)) + color.dim("-".repeat(width - filled));
}

function stateLabel(state) {
  switch (state) {
    case "PLAYING":
      return color.green("playing");
    case "BUFFERING":
      return color.yellow("buffering...");
    case "IDLE":
    case "UNKNOWN":
      return color.yellow("waiting for audio");
    case "PAUSED":
      return color.yellow("paused");
    case "RESYNCING":
      return color.yellow("catching up to live...");
    default:
      return color.dim(String(state || "connecting...").toLowerCase());
  }
}

let drawnOnce = false;

export function render({ device, volume, state, note, output, paused }) {
  if (drawnOnce) stdout.write(`${ESC}[${LINES}A`);
  drawnOnce = true;

  const pct = String(Math.round(volume * 100)).padStart(3);
  const line = (s = "") => stdout.write(`${s}${ESC}[K\n`);

  line();
  line(`  ${color.green("Casting to")} ${color.bold(device)}`);
  line();
  line(`  Volume   ${bar(volume)}  ${pct}%`);
  line(`  Status   ${stateLabel(state)}`);
  line();
  line(`  ${note ? color.yellow(note) : color.dim(`Sound output: ${output || "unchanged"}`)}`);
  line();
  line(`  ${color.dim("up/down")} volume    ${color.dim("space")} ${paused ? "resume" : "pause"}    ${color.dim("esc")} stop casting`);
}

export function finish(message) {
  showCursor();
  stdout.write(`\n${message}\n\n`);
}
