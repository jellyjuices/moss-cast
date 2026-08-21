// node scripts/stop.mjs - stops whatever is casting, however it was started.
import { setTimeout as sleep } from "node:timers/promises";
import { rmSync } from "node:fs";
import { CONTROL_FIFO } from "./lib/config.mjs";
import { findSwitcher, setOutput } from "./lib/audio.mjs";
import { color } from "./lib/term.mjs";
import * as session from "./lib/session.mjs";

const state = session.read();

if (!state) {
  console.log(color.yellow("Nothing is casting."));
  process.exit(0);
}

// Both front ends run the same engine, so the session owner already knows how to
// take everything down cleanly - sound output included. Signal it rather than
// tearing the pieces off underneath it.
if (session.alive(state.supervisorPid)) {
  try { process.kill(state.supervisorPid, "SIGTERM"); } catch {}
  for (let i = 0; i < 40 && session.read(); i++) await sleep(100);

  if (!session.read()) {
    console.log(`${color.green("Stopped")} casting to ${color.bold(state.device ?? "the speaker")}`);
    if (state.restoreOutput) {
      console.log(`${color.green("Sound output")} back to ${color.bold(state.restoreOutput)}`);
    }
    process.exit(0);
  }
  try { process.kill(state.supervisorPid, "SIGKILL"); } catch {}
}

// It did not go quietly, or it was already gone: clean up after it by hand.
if (session.alive(state.pid)) {
  try { process.kill(state.pid, "SIGKILL"); } catch {}
  console.log(`${color.green("Stopped")} the audio server`);
}

const switcher = findSwitcher();

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

rmSync(CONTROL_FIFO, { force: true });
session.clear();
