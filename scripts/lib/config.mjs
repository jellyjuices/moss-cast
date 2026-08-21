// Paths, tool discovery and the few tunables. No npm dependencies on purpose.
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const STATE_DIR = join(ROOT, ".state");
export const STATE_FILE = join(STATE_DIR, "session.json");
export const LOG_FILE = join(STATE_DIR, "server.log");
export const CAST_LOG = join(STATE_DIR, "cast.log");
export const DEVICES_FILE = join(STATE_DIR, "devices.json");
export const CONFIG_FILE = join(STATE_DIR, "swyh-cast.toml");

// The one control surface into a running session: a named pipe it reads lines
// from. The menu bar is a fresh process on every redraw, so it cannot hold the
// Cast connection itself - it writes "vol 0.40" here and the session forwards it.
export const CONTROL_FIFO = join(STATE_DIR, "control.fifo");

export const PORT = 5901;

// WAV is the reliable choice: swyh-rs sends it with a declared 4GB length, so the
// Chromecast treats it as a very long file. An endless chunked FLAC stream has no
// duration, and Cast disconnects a second after connecting.
export const FORMAT = process.env.CAST_FORMAT || "wav";
export const MIME = FORMAT === "flac" ? "audio/flac" : "audio/wav";

// Casting sends the audio to the Chromecast only. Set CAST_KEEP_LOCAL=1 (or pass
// --keep-local) to use a Multi-Output Device instead and hear it here too.
export const KEEP_LOCAL = process.env.CAST_KEEP_LOCAL === "1";

// The swyh-rs audio server, prebuilt and self-contained (it links only against
// macOS system frameworks, so there is no Rust toolchain to install).
export const SWYH = join(ROOT, "bin", "swyh-rs-cli");

// The same binary wrapped in an .app bundle by `node scripts/setup.mjs`. Capture needs
// microphone permission, and only a bundle carrying a usage string can be granted
// it - a bare binary launched from SwiftBar is denied without a prompt and
// captures silence. Launched through `open`, macOS attributes the grant here.
export const HELPER_APP = join(ROOT, "bin", "CastAudioHelper.app");
export const HELPER_BIN = join(HELPER_APP, "Contents", "MacOS", "CastAudioHelper");
export const hasHelper = () => existsSync(HELPER_BIN);

// The Chromecast helpers run on the Python inside catt's tool environment, which
// is where pychromecast comes from.
const PYTHON_CANDIDATES = [
  join(homedir(), ".local", "share", "uv", "tools", "catt", "bin", "python"),
  join(homedir(), ".local", "pipx", "venvs", "catt", "bin", "python"),
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
];

export const findPython = () => PYTHON_CANDIDATES.find((p) => existsSync(p));

export const PYTHON_HINT = "Install it with: uv tool install catt";

export const CASTER = join(ROOT, "scripts", "caster.py");
export const SCANNER = join(ROOT, "scripts", "scan.py");
