import * as session from "./lib/session.mjs";

const printJson = (payload) => process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
const state = session.read();

if (!state) {
  printJson({ casting: false });
} else if (state.error) {
  printJson({ casting: false, error: state.error, failedAt: state.failedAt ?? null });
} else {
  const running = session.isRunning(state);
  printJson({
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
