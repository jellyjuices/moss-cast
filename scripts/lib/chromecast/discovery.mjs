import {
  readDeviceCache, writeDeviceCache, scanForDevices, refreshDeviceCacheInBackground,
} from "./cache.mjs";

export async function listDevices({ python, networkId, rescan = false, onNote = () => {} }) {
  const cache = rescan ? null : readDeviceCache(networkId);

  if (cache) {
    const count = cache.devices.length;
    onNote(`${count} known Chromecast${count === 1 ? "" : "s"} (remembered from a previous run).`);
    refreshDeviceCacheInBackground(python, networkId);
    return cache.devices;
  }

  onNote("Looking for Chromecasts on your network...");
  const devices = scanForDevices(python);
  if (devices.length === 0) {
    throw new Error("No Chromecasts found. Check that this Mac and the Chromecast are on the same WiFi.");
  }
  writeDeviceCache(networkId, devices);
  return devices;
}

export function findDeviceByName({ python, networkId, name, onNote = () => {} }) {
  const cached = readDeviceCache(networkId)?.devices?.find((device) => device.name === name);
  if (cached) return cached;

  onNote(`${name} is not in the cache - scanning.`);
  const devices = scanForDevices(python);
  if (devices.length > 0) writeDeviceCache(networkId, devices);

  const device = devices.find((candidate) => candidate.name === name);
  if (!device) throw new Error(`Could not find a Chromecast named "${name}" on this network.`);
  return device;
}
