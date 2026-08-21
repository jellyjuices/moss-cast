// Switching the Mac's sound output, via SwitchAudioSource (macOS ships no CLI for
// it). Everything degrades to a no-op when it is missing: casting still works,
// you just switch by hand.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATES = [
  "/opt/homebrew/bin/SwitchAudioSource",
  "/usr/local/bin/SwitchAudioSource",
];

export const findSwitcher = () => CANDIDATES.find((p) => existsSync(p));

export const INSTALL_HINT = "Install it with: brew install switchaudio-osx";

const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", timeout: 10_000 }).trim();

export const listOutputs = (bin) =>
  run(bin, ["-a", "-t", "output"]).split("\n").map((s) => s.trim()).filter(Boolean);

export const currentOutput = (bin) => run(bin, ["-c"]);

export const setOutput = (bin, name) => run(bin, ["-t", "output", "-s", name]);

const isCastDevice = (n) => /multi-output/i.test(n) || /blackhole/i.test(n);

// Multi-Output wins when it exists: it sends the same audio to BlackHole *and*
// the speakers, so this Mac is not silenced while casting.
const rank = (n) => (/multi-output/i.test(n) ? 0 : 1);

export const findCastDevice = (bin) =>
  listOutputs(bin).filter(isCastDevice).sort((a, b) => rank(a) - rank(b))[0];

// Where to go back to: whatever was selected before, unless that was itself a
// cast device (a previous run left it there) - then the first real one.
export function findRestoreDevice(bin, previous) {
  if (previous && !isCastDevice(previous)) return previous;
  return listOutputs(bin).find((n) => !isCastDevice(n));
}
