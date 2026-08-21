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

const isMulti = (n) => /multi-output/i.test(n);
const isCastDevice = (n) => isMulti(n) || /blackhole/i.test(n);

// Plain BlackHole by default: the audio goes to the Chromecast and nowhere else,
// which is what casting to a speaker in another room should sound like. A
// Multi-Output Device plays it here as well - useful, but only when asked for,
// since hearing the room twice a few seconds apart is worse than not hearing it.
// Either way, fall back to whichever of the two actually exists.
export function findCastDevice(bin, keepLocal = false) {
  const devices = listOutputs(bin).filter(isCastDevice);
  const wanted = devices.filter((n) => (keepLocal ? isMulti(n) : !isMulti(n)));
  return wanted[0] ?? devices[0];
}

// Where to go back to: whatever was selected before, unless that was itself a
// cast device (a previous run left it there) - then the first real one.
export function findRestoreDevice(bin, previous) {
  if (previous && !isCastDevice(previous)) return previous;
  return listOutputs(bin).find((n) => !isCastDevice(n));
}
