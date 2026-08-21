import { mkdirSync, writeFileSync } from "node:fs";
import { STATE_DIR, SESSION_FILE } from "./lib/config.mjs";
import { checkRequirements } from "./lib/preflight.mjs";
import { findDeviceByName } from "./lib/chromecast/discovery.mjs";
import { startCasting } from "./lib/engine.mjs";

const log = (message) => process.stdout.write(`${new Date().toISOString()}  ${message}\n`);

function exitWithLoggedError(message) {
  log(`ERROR ${message}`);
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify({
      error: message, failedAt: new Date().toISOString(),
    }, null, 2));
  } catch {}
  process.exit(1);
}

const deviceFlagIndex = process.argv.indexOf("--device");
const requestedDeviceName = deviceFlagIndex !== -1 ? process.argv[deviceFlagIndex + 1] : undefined;
if (!requestedDeviceName) exitWithLoggedError('No speaker given. Use: --device "Kitchen speaker"');

const { python, networkId } = checkRequirements((message) => exitWithLoggedError(message));

let castSession;
try {
  const device = findDeviceByName({ python, networkId, name: requestedDeviceName, onNote: log });
  castSession = await startCasting({
    device,
    onLog: log,
    onConnectionLost: (code) => {
      log(`Lost the connection to ${device.name} (code ${code}).`);
      process.exit(1);
    },
  });
  log(`Casting to ${device.name}.`);
} catch (error) {
  exitWithLoggedError(error.message);
}

const shutDown = async () => {
  const restoredOutput = await castSession.stop();
  log(`Stopped casting.${restoredOutput ? ` Sound output back to ${restoredOutput}.` : ""}`);
  process.exit(0);
};

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
