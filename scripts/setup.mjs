import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PROJECT_ROOT, AUDIO_SERVER_BIN, CAPTURE_HELPER_APP, hasCaptureHelper,
  findPython, PYTHON_INSTALL_HINT,
} from "./lib/config.mjs";
import { findOutputSwitcher, listOutputs } from "./lib/audio/output.mjs";
import { color } from "./lib/terminal/ansi.mjs";

const reportOk = (message) => console.log(`${color.green("ok")}    ${message}`);
const reportWarning = (message, hint) =>
  console.log(`${color.yellow("warn")}  ${message}\n      ${color.dim(hint)}`);
const reportProblem = (message, hint) =>
  console.log(`${color.red("x")}     ${message}\n      ${color.dim(hint)}`);

let blockingProblems = 0;

console.log(`\n${color.bold("moss-cast setup")}\n`);

const hasAudioServer = existsSync(AUDIO_SERVER_BIN);
if (hasAudioServer) {
  reportOk("audio server (bin/swyh-rs-cli)");
} else {
  blockingProblems++;
  reportProblem("audio server missing at bin/swyh-rs-cli",
    "See the last section of the README for how to rebuild it.");
}

if (hasAudioServer) {
  try {
    execFileSync(join(PROJECT_ROOT, "scripts", "shell", "build-helper.sh"), { stdio: "pipe" });
    reportOk(`capture helper built (${CAPTURE_HELPER_APP.replace(PROJECT_ROOT, ".")})`);
  } catch (error) {
    reportWarning("could not build the capture helper",
      `Casting from the menu bar may stream silence. ${error.message}`);
  }
}

const python = findPython();
if (python) {
  try {
    execFileSync(python, ["-c", "import pychromecast"], { stdio: "pipe" });
    reportOk("pychromecast");
  } catch {
    blockingProblems++;
    reportProblem("the Python found has no pychromecast", PYTHON_INSTALL_HINT);
  }
} else {
  blockingProblems++;
  reportProblem("no Python with pychromecast found", PYTHON_INSTALL_HINT);
}

const switcher = findOutputSwitcher();
if (switcher) {
  const outputs = listOutputs(switcher);
  const multiOutput = outputs.find((name) => /multi-output/i.test(name));
  const blackHole = outputs.find((name) => /blackhole/i.test(name));

  reportOk("SwitchAudioSource");
  if (blackHole) {
    reportOk(`capture device: ${blackHole} (audio goes to the Chromecast only)`);
  } else if (multiOutput) {
    reportOk(`capture device: ${multiOutput} (this Mac stays audible while casting)`);
  } else {
    blockingProblems++;
    reportProblem("no BlackHole or Multi-Output Device in your sound outputs",
      "Install it with: brew install blackhole-2ch");
  }
} else {
  reportWarning("SwitchAudioSource not installed",
    "Casting works, but you switch the sound output by hand. brew install switchaudio-osx");
}

if (hasCaptureHelper() || hasAudioServer) {
  if (existsSync("/Applications/SwiftBar.app")) reportOk("SwiftBar");
  else reportWarning("SwiftBar not installed", "Only needed for the menu bar. brew install --cask swiftbar");
}

console.log("");
if (blockingProblems > 0) {
  const noun = `${blockingProblems} thing${blockingProblems === 1 ? "" : "s"}`;
  console.log(`${color.red(noun)} still to fix before casting will work.\n`);
  process.exit(1);
}
console.log(`${color.green("Ready.")} Run ${color.bold("node scripts/start.mjs")}, or point SwiftBar's plugin folder at ${color.bold("swiftbar/")}.\n`);
