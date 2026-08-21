// node scripts/status.mjs - what is casting right now, as JSON.
import * as session from "./lib/session.mjs";

const out = (payload) => process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
const state = session.read();

if (!state) {
  out({ casting: false });
} else if (state.error) {
  out({ casting: false, error: state.error, failedAt: state.failedAt ?? null });
} else {
  const running = session.isRunning(state);
  out({
    casting: running,
    stale: !running,
    device: state.device ?? null,
    ip: state.ip ?? null,
    output: state.output ?? null,
    volume: state.volume ?? null,
    ready: state.ready ?? false,
    startedAt: state.startedAt ?? null,
  });
}
