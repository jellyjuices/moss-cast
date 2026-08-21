// Switching the Mac's sound output. macOS ships no CLI for this, so this leans on
// SwitchAudioSource (`brew install switchaudio-osx`). Everything here degrades to
// a no-op when it is missing: casting still works, you just switch by hand.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SWITCH_CANDIDATES = [
  "/opt/homebrew/bin/SwitchAudioSource",
  "/usr/local/bin/SwitchAudioSource",
];

export function findSwitcher() {
  return SWITCH_CANDIDATES.find((p) => existsSync(p));
}

export const INSTALL_HINT = "Install it with: brew install switchaudio-osx";

function run(bin, args) {
  return execFileSync(bin, args, { encoding: "utf8", timeout: 10_000 }).trim();
}

export function listOutputs(bin) {
  return run(bin, ["-a", "-t", "output"]).split("\n").map((s) => s.trim()).filter(Boolean);
}

export function currentOutput(bin) {
  return run(bin, ["-c"]);
}

export function setOutput(bin, name) {
  run(bin, ["-t", "output", "-s", name]);
}

// A device that feeds the capture. Multi-Output wins when it exists: it sends the
// same audio to BlackHole *and* the speakers, so the Mac is not silenced.
const isCastDevice = (n) => /multi-output/i.test(n) || /blackhole/i.test(n);
const rank = (n) => (/multi-output/i.test(n) ? 0 : 1);

export function findCastDevice(bin) {
  return listOutputs(bin).filter(isCastDevice).sort((a, b) => rank(a) - rank(b))[0];
}

// Where to go back to. The device that was selected before we started, unless that
// was itself a cast device (a previous run left it there) - then the first real one.
export function findRestoreDevice(bin, previous) {
  if (previous && !isCastDevice(previous)) return previous;
  return listOutputs(bin).find((n) => !isCastDevice(n));
}
