import { findPython, PYTHON_INSTALL_HINT } from "./lib/config.mjs";
import { currentNetworkId } from "./lib/network.mjs";
import {
  readDeviceCache, writeDeviceCache, scanForDevices, markScanStarted, markScanFinished,
} from "./lib/chromecast/cache.mjs";

const printJson = (payload) => process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

const exitWithError = (error) => {
  markScanFinished(); // process.exit runs no finally block
  printJson({ ok: false, error });
  process.exit(1);
};

const networkId = currentNetworkId();
if (networkId === "unknown") exitWithError("No network connection.");

const cache = process.argv.includes("--rescan") ? null : readDeviceCache(networkId);
if (cache) {
  printJson({ ok: true, cached: true, savedAt: cache.savedAt, devices: cache.devices });
  process.exit(0);
}

const python = findPython();
if (!python) exitWithError(`The Chromecast helper's Python is missing. ${PYTHON_INSTALL_HINT}`);

markScanStarted();
try {
  const devices = scanForDevices(python);
  if (devices.length > 0) writeDeviceCache(networkId, devices);
  printJson({ ok: true, cached: false, savedAt: new Date().toISOString(), devices });
} catch (error) {
  exitWithError(`Could not scan for Chromecasts: ${error.message}`);
} finally {
  markScanFinished();
}
