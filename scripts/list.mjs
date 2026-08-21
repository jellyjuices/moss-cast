// npm run cast:list [-- --rescan] - the known Chromecasts, as JSON.
import { findPython, PYTHON_HINT } from "./lib/config.mjs";
import { currentNetwork } from "./lib/net.mjs";
import { readCache, writeCache, scan } from "./lib/devices.mjs";

const out = (payload) => process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

const die = (error) => {
  out({ ok: false, error });
  process.exit(1);
};

const network = currentNetwork();
if (network === "unknown") die("No network connection.");

const cached = process.argv.includes("--rescan") ? null : readCache(network);
if (cached) {
  out({ ok: true, cached: true, savedAt: cached.savedAt, devices: cached.devices });
  process.exit(0);
}

const python = findPython();
if (!python) die(`The Chromecast helper's Python is missing. ${PYTHON_HINT}`);

try {
  const devices = scan(python);
  if (devices.length > 0) writeCache(network, devices);
  out({ ok: true, cached: false, savedAt: new Date().toISOString(), devices });
} catch (e) {
  die(`Could not scan for Chromecasts: ${e.message}`);
}
