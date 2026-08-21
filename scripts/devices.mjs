// The Chromecast list, cached on disk so a run does not have to wait for discovery.
//
// Discovery is mDNS: it costs a fixed few seconds every time, and the answer almost
// never changes between runs. So we show the remembered list right away and refresh
// it in the background. The cache is keyed by network, because the same speakers on
// a different WiFi would have different addresses.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR, DEVICES_FILE, CAST_SCAN, findCastPython } from "./config.mjs";

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

// The /24 the Mac is on. Enough to tell home from the office without pretending to
// be a real network fingerprint.
export function networkKey(ip) {
  return ip ? ip.split(".").slice(0, 3).join(".") : "unknown";
}

export function scan(python, timeoutSecs = 5) {
  const out = execFileSync(python, [CAST_SCAN, String(timeoutSecs)], {
    encoding: "utf8",
    timeout: (timeoutSecs + 25) * 1000,
  });
  return parse(out);
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

export function clearCache() {
  rmSync(DEVICES_FILE, { force: true });
}

// Rescan without blocking: the picker is already on screen by the time this lands,
// so the fresh list is for the *next* run.
export function refreshInBackground(python, network) {
  const child = spawn(python, [CAST_SCAN, "5"], {
    stdio: ["ignore", "pipe", "ignore"],
    detached: false,
  });
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
