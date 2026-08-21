import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { STATE_DIR, DEVICE_CACHE_FILE, SCANNER_SCRIPT } from "../config.mjs";

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_SCAN_SECONDS = 5;
const SCAN_OVERHEAD_SECONDS = 25;

function parseScanOutput(output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((device) => device && device.name && device.ip);
}

export function scanForDevices(python, scanSeconds = DEFAULT_SCAN_SECONDS) {
  return parseScanOutput(execFileSync(python, [SCANNER_SCRIPT, String(scanSeconds)], {
    encoding: "utf8",
    timeout: (scanSeconds + SCAN_OVERHEAD_SECONDS) * 1000,
  }));
}

export function readDeviceCache(networkId) {
  if (!existsSync(DEVICE_CACHE_FILE)) return null;
  try {
    const cache = JSON.parse(readFileSync(DEVICE_CACHE_FILE, "utf8"));
    if (cache.network !== networkId) return null;
    if (!Array.isArray(cache.devices) || cache.devices.length === 0) return null;
    if (Date.now() - new Date(cache.savedAt).getTime() > CACHE_MAX_AGE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

export function writeDeviceCache(networkId, devices) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(DEVICE_CACHE_FILE, JSON.stringify({
    network: networkId, savedAt: new Date().toISOString(), devices,
  }, null, 2));
}

export function refreshDeviceCacheInBackground(python, networkId) {
  const scanner = spawn(python, [SCANNER_SCRIPT, String(DEFAULT_SCAN_SECONDS)],
    { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  scanner.stdout.on("data", (chunk) => { output += chunk; });
  scanner.on("exit", (code) => {
    if (code !== 0) return;
    const devices = parseScanOutput(output);
    if (devices.length > 0) writeDeviceCache(networkId, devices);
  });
  scanner.unref();
  return scanner;
}
