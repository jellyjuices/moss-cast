// npm run cast:status
//
// Prints what is casting right now, as JSON. The session file is the source of
// truth; a file whose supervisor has died is stale and reported as not casting.
import { existsSync, readFileSync } from "node:fs";
import { STATE_FILE } from "./config.mjs";

const out = (payload) => process.stdout.write(JSON.stringify(payload, null, 2) + "\n");

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(STATE_FILE)) {
  out({ casting: false });
  process.exit(0);
}

let session;
try {
  session = JSON.parse(readFileSync(STATE_FILE, "utf8"));
} catch {
  out({ casting: false, stale: true });
  process.exit(0);
}

// A supervisor that failed leaves the reason behind instead of a live session.
if (session.error) {
  out({ casting: false, error: session.error, failedAt: session.failedAt ?? null });
  process.exit(0);
}

// Either process still standing means something is running and worth stopping.
const running = alive(session.supervisorPid) || alive(session.pid);

out({
  casting: running,
  stale: !running,
  device: session.device ?? null,
  ip: session.ip ?? null,
  output: session.output ?? null,
  ready: session.ready ?? false,
  startedAt: session.startedAt ?? null,
});
