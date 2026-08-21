// npm run cast:stop
//
// Stops the Chromecast playback and shuts the audio server down.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { STATE_FILE, findCatt, color } from "./config.mjs";
import { findSwitcher, setOutput } from "./audio.mjs";

const catt = findCatt();

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(STATE_FILE)) {
  console.log(color.yellow("Nothing is casting (no active session found)."));
  process.exit(0);
}

const session = JSON.parse(readFileSync(STATE_FILE, "utf8"));

if (catt && session.device) {
  try {
    execFileSync(catt, ["-d", session.device, "stop"], { stdio: "pipe", timeout: 30_000 });
    console.log(`${color.green("Stopped")} playback on ${color.bold(session.device)}`);
  } catch {
    console.log(color.yellow(`Could not reach ${session.device} - it may already be idle.`));
  }
}

if (session.pid && alive(session.pid)) {
  // swyh-rs does not always honour SIGTERM, so escalate if it is still there.
  try { process.kill(session.pid, "SIGTERM"); } catch {}
  await sleep(1500);
  if (alive(session.pid)) {
    try { process.kill(session.pid, "SIGKILL"); } catch {}
  }
  console.log(`${color.green("Stopped")} the audio server`);
} else {
  console.log(color.dim("The audio server was already stopped."));
}

// Put the sound output back where the session found it.
const switcher = findSwitcher();
if (switcher && session.restoreOutput) {
  try {
    setOutput(switcher, session.restoreOutput);
    console.log(`${color.green("Sound output")} back to ${color.bold(session.restoreOutput)}`);
  } catch {
    console.log(color.yellow(`Could not switch the sound output back to ${session.restoreOutput}.`));
  }
}

rmSync(STATE_FILE, { force: true });

if (!switcher || !session.restoreOutput) {
  console.log(color.dim("\nRemember to set your sound output back to your speakers.\n"));
}
