// Shared paths and helpers. No npm dependencies on purpose: nothing to install.
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const STATE_DIR = join(ROOT, ".state");
export const STATE_FILE = join(STATE_DIR, "session.json");
export const LOG_FILE = join(STATE_DIR, "server.log");
export const DEVICES_FILE = join(STATE_DIR, "devices.json");

// The one control surface into a running supervisor: a named pipe it reads lines
// from. The menu is a fresh process every redraw, so it cannot hold the Cast
// connection itself - it writes "vol 0.40" here and the supervisor forwards it.
export const CONTROL_FIFO = join(STATE_DIR, "control.fifo");

// The swyh-rs audio server. The copy in ./bin is self-contained (it links only
// against macOS system frameworks), so the Rust source repo can be deleted.
const SWYH_LOCAL = join(ROOT, "bin", "swyh-rs-cli");
const SWYH_REPO = join(homedir(), "Git", "swyh-rs", "target", "release", "swyh-rs-cli");
export const SWYH = existsSync(SWYH_LOCAL) ? SWYH_LOCAL : SWYH_REPO;

// The same binary wrapped in an .app bundle, built by scripts/build-helper.sh.
// Capture needs microphone permission, and only a bundle with a usage string can
// be granted it - a bare binary launched from SwiftBar is denied without a prompt
// and captures silence. Launched through `open`, TCC attributes to this bundle.
export const HELPER_APP = join(ROOT, "bin", "CastAudioHelper.app");
export const HELPER_BIN = join(HELPER_APP, "Contents", "MacOS", "CastAudioHelper");
export const hasHelper = () => existsSync(HELPER_BIN);

// catt lives outside the default PATH when installed with `uv tool install`.
const CATT_CANDIDATES = [
  join(homedir(), ".local", "bin", "catt"),
  "/opt/homebrew/bin/catt",
  "/usr/local/bin/catt",
];

export function findCatt() {
  return CATT_CANDIDATES.find((p) => existsSync(p));
}

// The Chromecast helper runs on the Python inside catt's tool environment, which
// already has pychromecast. Holding one connection open keeps volume changes instant.
const CAST_PYTHON_CANDIDATES = [
  join(homedir(), ".local", "share", "uv", "tools", "catt", "bin", "python"),
  "/opt/homebrew/bin/python3",
];

export function findCastPython() {
  return CAST_PYTHON_CANDIDATES.find((p) => existsSync(p));
}

export const CASTER = join(ROOT, "scripts", "caster.py");
export const CAST_SCAN = join(ROOT, "scripts", "scan.py");

export const PORT = 5901;
export const CONFIG_FILE = join(STATE_DIR, "swyh-cast.toml");

export const color = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
