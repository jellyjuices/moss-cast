// One casting session, from cold to torn down. Both front ends run this - the
// terminal one (start.mjs) draws a live screen on top, the headless one (cast.mjs)
// logs - so the two cannot drift apart. Order matters here: getting it wrong
// leaves a silent server holding port 5901, or the Mac stuck on BlackHole.
import { spawn, execFileSync } from "node:child_process";
import { openSync, rmSync, constants } from "node:fs";
import { Socket } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { CASTER, CONTROL_FIFO, MIME, findPython } from "./config.mjs";
import { localIPv4 } from "./net.mjs";
import { startServer, streamUrl } from "./server.mjs";
import * as session from "./session.mjs";
import {
  findSwitcher, listOutputs, currentOutput, setOutput, findCastDevice, findRestoreDevice,
} from "./audio.mjs";

// Chromecast buffers a couple of seconds ahead, so a stop it never hears about
// keeps playing. Give it a moment to acknowledge before killing the helper.
const STOP_GRACE_MS = 1200;

// Point the Mac's sound output at the capture device, remembering where to put it
// back. Without SwitchAudioSource everything still works - you switch by hand.
function claimOutput() {
  const bin = findSwitcher();
  if (!bin) return { output: null, restore: () => null };

  const output = findCastDevice(bin);
  if (!output) {
    throw new Error(
      "No BlackHole or Multi-Output Device found in your sound outputs. " +
      `Sound outputs seen: ${listOutputs(bin).join(", ")}`,
    );
  }

  const previous = findRestoreDevice(bin, currentOutput(bin));
  try {
    setOutput(bin, output);
  } catch (e) {
    throw new Error(`Could not switch the sound output to ${output}: ${e.message}`);
  }

  return {
    output,
    restore: () => {
      if (!previous) return null;
      try {
        setOutput(bin, previous);
        return previous;
      } catch {
        return null;
      }
    },
    previous,
  };
}

// Volume from the menu bar arrives here: the menu is a new process on every
// redraw and cannot hold the connection, so it writes a line into this pipe.
//
// Two details that are not optional. O_RDWR keeps our own writer on the pipe, so
// it never hits EOF when the menu's one-shot writer leaves - a read-only handle
// would close the stream after the first command. And the fd is handed to a
// Socket rather than fs.createReadStream because a blocking FIFO read on libuv's
// threadpool cannot be interrupted: process.exit() then hangs forever in
// uv_thread_join, leaving a session that will not die. A non-blocking fd read
// through a Socket is polled by the event loop instead, so teardown is clean.
function openControlPipe(onCommand, onLog) {
  let fd;
  try {
    rmSync(CONTROL_FIFO, { force: true });
    execFileSync("/usr/bin/mkfifo", [CONTROL_FIFO]);
    fd = openSync(CONTROL_FIFO, constants.O_RDWR | constants.O_NONBLOCK);
  } catch (e) {
    onLog(`No control pipe (${e.message}) - volume from the menu bar will not work.`);
    return () => {};
  }

  const pipe = new Socket({ fd, readable: true, writable: false });
  pipe.on("error", (e) => onLog(`Control pipe error: ${e.message}`));
  createInterface({ input: pipe }).on("line", (line) => {
    const cmd = line.trim();
    if (cmd) onCommand(cmd);
  });

  return () => {
    try { pipe.destroy(); } catch {}
    rmSync(CONTROL_FIFO, { force: true });
  };
}

/**
 * Starts casting to `device` and stays connected until stop() is called.
 *
 * onEvent receives the caster's JSON events ({event, volume, state, message}).
 * onLost is called if the connection drops on its own; everything is already
 * cleaned up by then. Throws - after undoing whatever it had done - if the
 * session cannot be established.
 */
export async function startCasting({ device, onEvent = () => {}, onLost = () => {}, onLog = () => {} }) {
  const python = findPython();
  const ip = localIPv4();
  const url = streamUrl(ip);

  await session.takeOver(sleep);

  onLog("Starting the audio server...");
  const server = await startServer();

  let sound;
  try {
    sound = claimOutput();
    if (sound.output) onLog(`Sound output switched to ${sound.output}.`);
    else onLog("SwitchAudioSource is not installed - switch the sound output by hand.");
  } catch (e) {
    server.stop();
    throw e;
  }

  let volume = null;
  let ready = false;
  const save = () => session.write({
    supervisorPid: process.pid,
    pid: server.pid,
    device: device.name,
    ip: device.ip,
    url,
    output: sound.output,
    restoreOutput: sound.previous ?? null,
    ready,
    volume,
    startedAt: new Date().toISOString(),
  });

  // Written before the speaker answers, with ready:false: the menu bar needs
  // something to show during the couple of seconds a connection takes.
  save();

  onLog(`Connecting to ${device.name}...`);
  const args = [CASTER, device.name, url, MIME];
  if (device.ip && device.port && device.uuid) {
    args.push(device.ip, String(device.port), device.uuid, device.model || "");
  }
  const caster = spawn(python, args, { stdio: ["pipe", "pipe", "pipe"] });

  const send = (cmd) => {
    try { caster.stdin.write(`${cmd}\n`); } catch {}
  };

  let stopping = false;
  let closePipe = () => rmSync(CONTROL_FIFO, { force: true });
  const teardown = () => {
    closePipe();
    server.stop();
    const restored = sound.restore();
    session.clear();
    return restored;
  };

  const stop = async () => {
    if (stopping) return null;
    stopping = true;
    send("stop");
    await sleep(STOP_GRACE_MS);
    try { caster.kill("SIGKILL"); } catch {}
    return teardown();
  };

  // The first event decides whether the session came up at all.
  const connected = new Promise((resolve, reject) => {
    createInterface({ input: caster.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      if (msg.event === "error" && !ready) {
        reject(new Error(`${msg.message}. Is the speaker powered on and on the same network?`));
        return;
      }
      if (typeof msg.volume === "number") volume = msg.volume;
      if (msg.event === "ready" && !ready) {
        ready = true;
        save();
        resolve();
      } else if (ready && msg.event === "status") {
        // The speaker is the authority on its own level - it can be changed from
        // a phone, and the menu bar should show what actually happened.
        save();
      }
      onEvent(msg);
    });

    createInterface({ input: caster.stderr })
      .on("line", (line) => onLog(`caster: ${line}`));

    // A crash in the helper must not leave a silent server running behind it.
    caster.on("exit", (code) => {
      if (stopping) return;
      if (!ready) {
        reject(new Error(`The Chromecast helper exited (code ${code}).`));
        return;
      }
      teardown();
      onLost(code);
    });
  });

  try {
    await connected;
  } catch (e) {
    stopping = true;
    try { caster.kill("SIGKILL"); } catch {}
    teardown();
    throw e;
  }

  closePipe = openControlPipe(send, onLog);

  return { url, output: sound.output, send, stop };
}
