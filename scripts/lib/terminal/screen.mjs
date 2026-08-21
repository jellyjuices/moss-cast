import { stdout } from "node:process";
import { ESC, color, showCursor } from "./ansi.mjs";

const RENDERED_LINE_COUNT = 9;
const VOLUME_BAR_WIDTH = 22;

function volumeBar(level, width = VOLUME_BAR_WIDTH) {
  const filled = Math.round(level * width);
  return color.cyan("#".repeat(filled)) + color.dim("-".repeat(width - filled));
}

function playbackLabel(playbackState) {
  switch (playbackState) {
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
      return color.dim(String(playbackState || "connecting...").toLowerCase());
  }
}

let hasDrawn = false;

export function renderCastingScreen({ device, volume, playbackState, note, output, paused }) {
  if (hasDrawn) stdout.write(`${ESC}[${RENDERED_LINE_COUNT}A`);
  hasDrawn = true;

  const percent = String(Math.round(volume * 100)).padStart(3);
  const line = (text = "") => stdout.write(`${text}${ESC}[K\n`);

  line();
  line(`  ${color.green("Casting to")} ${color.bold(device)}`);
  line();
  line(`  Volume   ${volumeBar(volume)}  ${percent}%`);
  line(`  Status   ${playbackLabel(playbackState)}`);
  line();
  line(`  ${note ? color.yellow(note) : color.dim(`Sound output: ${output || "unchanged"}`)}`);
  line();
  line(`  ${color.dim("up/down")} volume    ${color.dim("space")} ${paused ? "resume" : "pause"}    ${color.dim("esc")} stop casting`);
}

export function printClosingMessage(message) {
  showCursor();
  stdout.write(`\n${message}\n\n`);
}
