import { networkInterfaces } from "node:os";

export function findLocalIPv4() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

export const networkIdFor = (ip) => (ip ? ip.split(".").slice(0, 3).join(".") : "unknown");

export const currentNetworkId = () => networkIdFor(findLocalIPv4());
