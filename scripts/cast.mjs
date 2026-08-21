// npm run cast:to -- --device "Kitchen speaker"
//
// The headless twin of start.mjs, and what the menu bar starts. It has to stay in
// the foreground: the Cast connection dies with the process, so cast-launch.sh
// backgrounds it and cast:stop signals it. Output goes to .state/cast.log.
import { mkdirSync, writeFileSync } from "node:fs";
import { STATE_DIR, STATE_FILE } from "./lib/config.mjs";
import { preflight } from "./lib/preflight.mjs";
import { findByName } from "./lib/discover.mjs";
import { startCasting } from "./lib/engine.mjs";

const log = (msg) => process.stdout.write(`${new Date().toISOString()}  ${msg}\n`);

// A failure has to be legible to a menu with no stderr, so the reason is left in
// the session file for the SwiftBar plugin to show.
function fail(message) {
  log(`ERROR ${message}`);
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({
      error: message, failedAt: new Date().toISOString(),
    }, null, 2));
  } catch {}
  process.exit(1);
}

const i = process.argv.indexOf("--device");
const wanted = i !== -1 ? process.argv[i + 1] : undefined;
if (!wanted) fail('No speaker given. Use: --device "Kitchen speaker"');

const { python, network } = preflight((message) => fail(message));

let session;
try {
  const device = findByName({ python, network, name: wanted, onNote: log });
  session = await startCasting({
    device,
    onLog: log,
    onLost: (code) => {
      log(`Lost the connection to ${device.name} (code ${code}).`);
      process.exit(1);
    },
  });
  log(`Casting to ${device.name}.`);
} catch (e) {
  fail(e.message);
}

const shutdown = async () => {
  const restored = await session.stop();
  log(`Stopped casting.${restored ? ` Sound output back to ${restored}.` : ""}`);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
