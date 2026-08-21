import { setTimeout as sleep } from "node:timers/promises";
import { rmSync } from "node:fs";
import { CONTROL_PIPE } from "./lib/config.mjs";
import { findOutputSwitcher, setOutput } from "./lib/audio/output.mjs";
import { color } from "./lib/terminal/ansi.mjs";
import * as session from "./lib/session.mjs";

const SHUTDOWN_POLL_MS = 100;
const SHUTDOWN_POLL_ATTEMPTS = 40;

const state = session.read();

if (!state) {
  console.log(color.yellow("Nothing is casting."));
  process.exit(0);
}

if (session.isProcessAlive(state.supervisorPid)) {
  try { process.kill(state.supervisorPid, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < SHUTDOWN_POLL_ATTEMPTS && session.read(); attempt++) {
    await sleep(SHUTDOWN_POLL_MS);
  }

  if (!session.read()) {
    console.log(`${color.green("Stopped")} casting to ${color.bold(state.device ?? "the speaker")}`);
    if (state.restoreOutput) {
      console.log(`${color.green("Sound output")} back to ${color.bold(state.restoreOutput)}`);
    }
    process.exit(0);
  }
  try { process.kill(state.supervisorPid, "SIGKILL"); } catch {}
}

if (session.isProcessAlive(state.pid)) {
  try { process.kill(state.pid, "SIGKILL"); } catch {}
  console.log(`${color.green("Stopped")} the audio server`);
}

const switcher = findOutputSwitcher();

if (switcher && state.restoreOutput) {
  try {
    setOutput(switcher, state.restoreOutput);
    console.log(`${color.green("Sound output")} back to ${color.bold(state.restoreOutput)}`);
  } catch {
    console.log(color.yellow(`Could not switch the sound output back to ${state.restoreOutput}.`));
  }
} else {
  console.log(color.dim("Remember to set your sound output back to your speakers."));
}

rmSync(CONTROL_PIPE, { force: true });
session.clear();
