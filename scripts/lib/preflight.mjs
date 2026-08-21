import { existsSync, mkdirSync } from "node:fs";
import { AUDIO_SERVER_BIN, STATE_DIR, findPython, PYTHON_INSTALL_HINT } from "./config.mjs";
import { findLocalIPv4, networkIdFor } from "./network.mjs";
import { color, showCursor } from "./terminal/ansi.mjs";

export function exitWithError(message, hint) {
  showCursor();
  console.error(`\n${color.red("x")} ${message}`);
  if (hint) console.error(`  ${color.dim(hint)}`);
  process.exit(1);
}

export function checkRequirements(onError = exitWithError) {
  const python = findPython();
  if (!python) onError("The Chromecast helper's Python is missing.", PYTHON_INSTALL_HINT);

  if (!existsSync(AUDIO_SERVER_BIN)) {
    onError(`The audio server is missing at ${AUDIO_SERVER_BIN}`, "Run: node scripts/setup.mjs");
  }

  const ip = findLocalIPv4();
  if (!ip) onError("No network connection found.", "Connect to WiFi and try again.");

  mkdirSync(STATE_DIR, { recursive: true });
  return { python, networkId: networkIdFor(ip) };
}
