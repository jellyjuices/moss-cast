// npm run cast:list -- [--rescan]
//
// Prints the known Chromecasts as JSON. Reads the cache when it is warm so the
// menu bar can build a list without waiting on mDNS; only scans when it has to.
import { networkInterfaces } from "node:os";
import { findCastPython, color } from "./config.mjs";
import { networkKey, readCache, writeCache, scan } from "./devices.mjs";

function localIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

const out = (payload) => process.stdout.write(JSON.stringify(payload, null, 2) + "\n");

const ip = localIPv4();
if (!ip) {
  out({ ok: false, error: "No network connection." });
  process.exit(1);
}

const network = networkKey(ip);
const rescan = process.argv.includes("--rescan");
const cached = rescan ? null : readCache(network);

if (cached) {
  out({ ok: true, cached: true, savedAt: cached.savedAt, devices: cached.devices });
  process.exit(0);
}

const python = findCastPython();
if (!python) {
  out({ ok: false, error: "The Chromecast helper's Python is missing. Run: uv tool install --force catt" });
  process.exit(1);
}

try {
  const devices = scan(python);
  if (devices.length > 0) writeCache(network, devices);
  out({ ok: true, cached: false, savedAt: new Date().toISOString(), devices });
} catch (e) {
  out({ ok: false, error: `Could not scan for Chromecasts: ${e.message}` });
  process.exit(1);
}
