import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

export const PROJECT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const STATE_DIR = join(PROJECT_ROOT, ".state");
export const SESSION_FILE = join(STATE_DIR, "session.json");
export const MUTE_FILE = join(STATE_DIR, "mute.json");
export const SERVER_LOG_FILE = join(STATE_DIR, "server.log");
export const DEVICE_CACHE_FILE = join(STATE_DIR, "devices.json");
export const SERVER_CONFIG_FILE = join(STATE_DIR, "swyh-cast.toml");
export const SCAN_MARKER_FILE = join(STATE_DIR, "scanning");
export const CONTROL_PIPE = join(STATE_DIR, "control.fifo");

export const STREAM_PORT = 5901;
export const STREAM_FORMAT = process.env.MOSS_FORMAT || "wav";
export const STREAM_MIME_TYPE = STREAM_FORMAT === "flac" ? "audio/flac" : "audio/wav";

export const AUDIO_SERVER_BIN = join(PROJECT_ROOT, "bin", "swyh-rs-cli");

export const CAPTURE_HELPER_APP = join(PROJECT_ROOT, "bin", "MossCastHelper.app");
export const CAPTURE_HELPER_BIN = join(CAPTURE_HELPER_APP, "Contents", "MacOS", "MossCastHelper");
export const hasCaptureHelper = () => existsSync(CAPTURE_HELPER_BIN);

const PYTHON_CANDIDATES = [
  join(homedir(), ".local", "share", "uv", "tools", "catt", "bin", "python"),
  join(homedir(), ".local", "pipx", "venvs", "catt", "bin", "python"),
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
];

export const findPython = () => PYTHON_CANDIDATES.find((path) => existsSync(path));

export const PYTHON_INSTALL_HINT = "Install it with: uv tool install catt";

export const CASTER_SCRIPT = join(PROJECT_ROOT, "scripts", "python", "caster.py");
export const SCANNER_SCRIPT = join(PROJECT_ROOT, "scripts", "python", "scan.py");
