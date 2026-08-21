// The checks every front end makes before it can cast anything.
import { existsSync, mkdirSync } from "node:fs";
import { SWYH, STATE_DIR, findPython, PYTHON_HINT } from "./config.mjs";
import { localIPv4, networkKey } from "./net.mjs";
import { color, showCursor } from "./term.mjs";

export function fail(message, hint) {
  showCursor();
  console.error(`\n${color.red("x")} ${message}`);
  if (hint) console.error(`  ${color.dim(hint)}`);
  process.exit(1);
}

// Returns {python, ip, network}, or reports what is missing and exits.
export function preflight(onError = fail) {
  const python = findPython();
  if (!python) onError("The Chromecast helper's Python is missing.", PYTHON_HINT);

  if (!existsSync(SWYH)) {
    onError(`The audio server is missing at ${SWYH}`, "Run: node scripts/setup.mjs");
  }

  const ip = localIPv4();
  if (!ip) onError("No network connection found.", "Connect to WiFi and try again.");

  mkdirSync(STATE_DIR, { recursive: true });
  return { python, ip, network: networkKey(ip) };
}
