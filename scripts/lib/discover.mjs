// Getting a list of speakers, or one speaker by name, out of the cache when it is
// warm and off the network when it is not.
import { readCache, writeCache, scan, refreshInBackground } from "./devices.mjs";

// mDNS costs several seconds and the answer rarely changes, so a remembered list
// goes straight on screen while a fresh scan runs behind it for next time.
export async function chooseDevice({ python, network, rescan = false, onNote = () => {} }) {
  const cached = rescan ? null : readCache(network);

  if (cached) {
    const n = cached.devices.length;
    onNote(`${n} known Chromecast${n === 1 ? "" : "s"} (remembered from a previous run).`);
    refreshInBackground(python, network);
    return cached.devices;
  }

  onNote("Looking for Chromecasts on your network...");
  const devices = scan(python);
  if (devices.length === 0) {
    throw new Error("No Chromecasts found. Check that this Mac and the Chromecast are on the same WiFi.");
  }
  writeCache(network, devices);
  return devices;
}

// The cached entry carries the address, which lets the caster connect straight to
// the speaker instead of paying for mDNS again.
export function findByName({ python, network, name, onNote = () => {} }) {
  const cached = readCache(network)?.devices?.find((d) => d.name === name);
  if (cached) return cached;

  onNote(`${name} is not in the cache - scanning.`);
  const devices = scan(python);
  if (devices.length > 0) writeCache(network, devices);

  const device = devices.find((d) => d.name === name);
  if (!device) throw new Error(`Could not find a Chromecast named "${name}" on this network.`);
  return device;
}
