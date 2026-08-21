// npm run setup - check what a fresh clone is missing, and build the helper app.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, SWYH, HELPER_APP, hasHelper, findPython, PYTHON_HINT } from "./lib/config.mjs";
import { findSwitcher, listOutputs } from "./lib/audio.mjs";
import { color } from "./lib/term.mjs";

const ok = (msg) => console.log(`${color.green("ok")}    ${msg}`);
const warn = (msg, hint) => console.log(`${color.yellow("warn")}  ${msg}\n      ${color.dim(hint)}`);
const bad = (msg, hint) => console.log(`${color.red("x")}     ${msg}\n      ${color.dim(hint)}`);

let blocking = 0;

console.log(`\n${color.bold("cast-audio setup")}\n`);

// --- the audio server ---
if (existsSync(SWYH)) {
  ok("audio server (bin/swyh-rs-cli)");
} else {
  blocking++;
  bad("audio server missing at bin/swyh-rs-cli", "See 'Rebuilding the audio server' in the README.");
}

// --- the .app bundle that can hold a microphone grant ---
if (existsSync(SWYH)) {
  try {
    execFileSync(join(ROOT, "scripts", "build-helper.sh"), { stdio: "pipe" });
    ok(`capture helper built (${HELPER_APP.replace(ROOT, ".")})`);
  } catch (e) {
    warn("could not build the capture helper", `Casting from the menu bar may stream silence. ${e.message}`);
  }
}

// --- pychromecast, via catt's tool environment ---
const python = findPython();
if (python) {
  try {
    execFileSync(python, ["-c", "import pychromecast"], { stdio: "pipe" });
    ok("pychromecast");
  } catch {
    blocking++;
    bad("the Python found has no pychromecast", PYTHON_HINT);
  }
} else {
  blocking++;
  bad("no Python with pychromecast found", PYTHON_HINT);
}

// --- the loopback device that makes system audio capturable ---
const switcher = findSwitcher();
if (switcher) {
  const outputs = listOutputs(switcher);
  const multi = outputs.find((n) => /multi-output/i.test(n));
  const blackhole = outputs.find((n) => /blackhole/i.test(n));

  ok("SwitchAudioSource");
  if (multi) {
    ok(`capture device: ${multi} (this Mac stays audible while casting)`);
  } else if (blackhole) {
    warn(`capture device: ${blackhole}`,
      "BlackHole alone silences this Mac. Create a Multi-Output Device in Audio MIDI Setup to hear both.");
  } else {
    blocking++;
    bad("no BlackHole or Multi-Output Device in your sound outputs",
      "Install it with: brew install blackhole-2ch");
  }
} else {
  warn("SwitchAudioSource not installed",
    "Casting works, but you switch the sound output by hand. brew install switchaudio-osx");
}

// --- the menu bar plugin ---
if (hasHelper() || existsSync(SWYH)) {
  const swiftbar = existsSync("/Applications/SwiftBar.app");
  if (swiftbar) ok("SwiftBar");
  else warn("SwiftBar not installed", "Only needed for the menu bar. brew install --cask swiftbar");
}

console.log("");
if (blocking > 0) {
  const noun = `${blocking} thing${blocking === 1 ? "" : "s"}`;
  console.log(`${color.red(noun)} still to fix before casting will work.\n`);
  process.exit(1);
}
console.log(`${color.green("Ready.")} Run ${color.bold("npm run cast")}, or point SwiftBar's plugin folder at ${color.bold("swiftbar/")}.\n`);
