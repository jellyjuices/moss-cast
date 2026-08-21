// The Mac's own address, and the coarse network fingerprint the device cache is
// keyed by - enough to tell home from the office, no more.
import { networkInterfaces } from "node:os";

export function localIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

export const networkKey = (ip) => (ip ? ip.split(".").slice(0, 3).join(".") : "unknown");

export const currentNetwork = () => networkKey(localIPv4());
