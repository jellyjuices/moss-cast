import { spawn, execFileSync } from "node:child_process";
import { openSync, rmSync, constants } from "node:fs";
import { Socket } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { CASTER_SCRIPT, CONTROL_PIPE, STREAM_MIME_TYPE, findPython } from "./config.mjs";
import { findLocalIPv4 } from "./network.mjs";
import { startAudioServer, streamUrl } from "./audio/server.mjs";
import * as session from "./session.mjs";
import {
  findOutputSwitcher, listOutputs, currentOutput, setOutput,
  findCaptureOutput, findOutputToRestore,
} from "./audio/output.mjs";

const STOP_GRACE_MS = 1200;

function claimSoundOutput() {
  const switcher = findOutputSwitcher();
  if (!switcher) return { captureOutput: null, previousOutput: null, restore: () => null };

  const captureOutput = findCaptureOutput(switcher);
  if (!captureOutput) {
    throw new Error(
      "No BlackHole or Multi-Output Device found in your sound outputs. "
      + `Sound outputs seen: ${listOutputs(switcher).join(", ")}`,
    );
  }

  const previousOutput = findOutputToRestore(switcher, currentOutput(switcher));
  try {
    setOutput(switcher, captureOutput);
  } catch (error) {
    throw new Error(`Could not switch the sound output to ${captureOutput}: ${error.message}`);
  }

  return {
    captureOutput,
    previousOutput,
    restore: () => {
      if (!previousOutput) return null;
      try {
        setOutput(switcher, previousOutput);
        return previousOutput;
      } catch {
        return null;
      }
    },
  };
}

function openControlPipe(onCommand, onLog) {
  let pipeFd;
  try {
    rmSync(CONTROL_PIPE, { force: true });
    execFileSync("/usr/bin/mkfifo", [CONTROL_PIPE]);
    pipeFd = openSync(CONTROL_PIPE, constants.O_RDWR | constants.O_NONBLOCK);
  } catch (error) {
    onLog(`No control pipe (${error.message}) - volume from the menu bar will not work.`);
    return () => {};
  }

  const pipe = new Socket({ fd: pipeFd, readable: true, writable: false });
  pipe.on("error", (error) => onLog(`Control pipe error: ${error.message}`));
  createInterface({ input: pipe }).on("line", (line) => {
    const command = line.trim();
    if (command) onCommand(command);
  });

  return () => {
    try { pipe.destroy(); } catch {}
    rmSync(CONTROL_PIPE, { force: true });
  };
}

export async function startCasting({
  device, onEvent = () => {}, onConnectionLost = () => {}, onLog = () => {},
}) {
  const python = findPython();
  const url = streamUrl(findLocalIPv4());

  await session.takeOverFromPreviousSession(sleep);

  onLog("Starting the audio server...");
  const audioServer = await startAudioServer();

  let soundOutput;
  try {
    soundOutput = claimSoundOutput();
    if (soundOutput.captureOutput) onLog(`Sound output switched to ${soundOutput.captureOutput}.`);
    else onLog("SwitchAudioSource is not installed - switch the sound output by hand.");
  } catch (error) {
    audioServer.stop();
    throw error;
  }

  let volume = null;
  let ready = false;
  const saveSession = () => session.write({
    supervisorPid: process.pid,
    pid: audioServer.pid,
    device: device.name,
    ip: device.ip,
    url,
    output: soundOutput.captureOutput,
    restoreOutput: soundOutput.previousOutput ?? null,
    ready,
    volume,
    startedAt: new Date().toISOString(),
  });

  saveSession();

  onLog(`Connecting to ${device.name}...`);
  const casterArgs = [CASTER_SCRIPT, device.name, url, STREAM_MIME_TYPE];
  if (device.ip && device.port && device.uuid) {
    casterArgs.push(device.ip, String(device.port), device.uuid, device.model || "");
  }
  const caster = spawn(python, casterArgs, { stdio: ["pipe", "pipe", "pipe"] });

  const sendCommand = (command) => {
    try { caster.stdin.write(`${command}\n`); } catch {}
  };

  let stopping = false;
  let closeControlPipe = () => rmSync(CONTROL_PIPE, { force: true });
  const tearDown = () => {
    closeControlPipe();
    audioServer.stop();
    const restoredOutput = soundOutput.restore();
    session.clear();
    return restoredOutput;
  };

  const stop = async () => {
    if (stopping) return null;
    stopping = true;
    sendCommand("stop");
    await sleep(STOP_GRACE_MS);
    try { caster.kill("SIGKILL"); } catch {}
    return tearDown();
  };

  const connected = new Promise((resolve, reject) => {
    createInterface({ input: caster.stdout }).on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.event === "error" && !ready) {
        reject(new Error(`${event.message}. Is the speaker powered on and on the same network?`));
        return;
      }
      if (typeof event.volume === "number") volume = event.volume;
      if (event.event === "ready" && !ready) {
        ready = true;
        saveSession();
        resolve();
      } else if (ready && event.event === "status") {
        saveSession();
      }
      onEvent(event);
    });

    createInterface({ input: caster.stderr })
      .on("line", (line) => onLog(`caster: ${line}`));

    caster.on("exit", (code) => {
      if (stopping) return;
      if (!ready) {
        reject(new Error(`The Chromecast helper exited (code ${code}).`));
        return;
      }
      tearDown();
      onConnectionLost(code);
    });
  });

  try {
    await connected;
  } catch (error) {
    stopping = true;
    try { caster.kill("SIGKILL"); } catch {}
    tearDown();
    throw error;
  }

  closeControlPipe = openControlPipe(sendCommand, onLog);

  return { output: soundOutput.captureOutput, sendCommand, stop };
}
