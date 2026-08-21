// The Chromecast list, cached on disk so a run does not wait for mDNS.
//
// The cache is keyed by network, because the same speakers on a different WiFi
// would have different addresses, and expires after a week.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { STATE_DIR, DEVICES_FILE, SCANNER } from "./config.mjs";

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parse(stdout) {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((d) => d && d.name && d.ip);
}

export function scan(python, timeoutSecs = 5) {
  return parse(execFileSync(python, [SCANNER, String(timeoutSecs)], {
    encoding: "utf8",
    timeout: (timeoutSecs + 25) * 1000,
  }));
}

export function readCache(network) {
  if (!existsSync(DEVICES_FILE)) return null;
  try {
    const cache = JSON.parse(readFileSync(DEVICES_FILE, "utf8"));
    if (cache.network !== network) return null;
    if (!Array.isArray(cache.devices) || cache.devices.length === 0) return null;
    if (Date.now() - new Date(cache.savedAt).getTime() > CACHE_TTL_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

export function writeCache(network, devices) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(DEVICES_FILE, JSON.stringify({
    network, savedAt: new Date().toISOString(), devices,
  }, null, 2));
}

export const clearCache = () => rmSync(DEVICES_FILE, { force: true });

// The picker is already on screen by the time this lands, so the fresh list is
// for the next run.
export function refreshInBackground(python, network) {
  const child = spawn(python, [SCANNER, "5"], { stdio: ["ignore", "pipe", "ignore"] });
  let out = "";
  child.stdout.on("data", (c) => { out += c; });
  child.on("exit", (code) => {
    if (code !== 0) return;
    const devices = parse(out);
    if (devices.length > 0) writeCache(network, devices);
  });
  child.unref();
  return child;
}
