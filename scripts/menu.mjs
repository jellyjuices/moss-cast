// Renders the SwiftBar menu. The plugin file is a one-line wrapper around this.
//
// SwiftBar's format: the first line is the menu bar item itself, then `---`, then
// the dropdown. Every line takes `key=value` parameters after a `|`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { ROOT, STATE_FILE } from "./config.mjs";
import { networkKey, readCache } from "./devices.mjs";

const NODE = process.execPath;
// These live in scripts/, not swiftbar/: SwiftBar treats every executable in
// its plugin folder as a plugin, and would give each helper its own menu bar item.
const LAUNCH = join(ROOT, "scripts", "cast-launch.sh");
const STOP = join(ROOT, "scripts", "cast-stop.sh");

// A maskable PNG dropped in swiftbar/ becomes the menu bar icon; templateImage
// lets macOS invert it for dark mode. Without one, fall back to an SF Symbol.
//
// SwiftBar draws the PNG at its own pixel size, so the width/height params are
// not optional: they pin the icon to the menu bar regardless of how big the
// source file is. Supply a dense PNG (400x400 is fine) and macOS downsamples it
// to these 20pt - which is what keeps it from looking grainy on Retina.
const ICON_PT = 20;

function icon(name, sfimage) {
  const file = join(ROOT, "swiftbar", name);
  if (existsSync(file)) {
    return `templateImage=${readFileSync(file).toString("base64")} width=${ICON_PT} height=${ICON_PT}`;
  }
  return `sfimage=${sfimage}`;
}

const line = (text, ...params) => console.log(params.length ? `${text} | ${params.join(" ")}` : text);
const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

function session() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function localIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

// SwiftBar has no slider, so the bar is drawn: a filled run of blocks in a
// monospaced font, which keeps every level the same width. A click closes the
// menu, so nudging by steps would mean reopening it each time - the submenu
// jumps straight to a level instead.
const BAR_SEGMENTS = 10;

function bar(volume) {
  const filled = Math.round(volume * BAR_SEGMENTS);
  return "█".repeat(filled) + "░".repeat(BAR_SEGMENTS - filled);
}

function volumeSection(volume) {
  const percent = Math.round(volume * 100);
  line(`${bar(volume)}  Volume ${String(percent).padStart(3)}%`, "font=Menlo", "size=12");
  line("Set volume", "sfimage=slider.horizontal.3");
  for (let p = 100; p >= 0; p -= 10) {
    const mark = Math.round(percent / 10) * 10 === p ? " ✓" : "";
    console.log("--" + `${String(p).padStart(3)}%${mark} | bash=${quote(NODE)} ` +
      `param1=${quote(join(ROOT, "scripts", "volume.mjs"))} param2=${quote(String(p))} ` +
      "terminal=false refresh=true");
  }
  line("Mute", `bash=${quote(NODE)}`,
    `param1=${quote(join(ROOT, "scripts", "volume.mjs"))}`, `param2=${quote("mute")}`,
    "terminal=false", "refresh=true", "sfimage=speaker.slash.fill");
}

const state = session();
const casting = state && !state.error && (alive(state.supervisorPid) || alive(state.pid));

// ---- the menu bar item --------------------------------------------------

if (casting) {
  // Icon only - the connecting state is spelled out in the dropdown instead, so
  // the menu bar item stays exactly the same width as the idle one.
  line("", icon("Casting.png", "waveform.circle.fill"));
} else if (state?.error) {
  // Template images can't be tinted, so the failure state keeps the SF symbol:
  // red in the menu bar is the whole point of that branch.
  line("", "sfimage=airplayaudio", "sfcolor=red");
} else {
  line("", icon("Normal.png", "airplayaudio"));
}

console.log("---");

// ---- the dropdown -------------------------------------------------------

if (casting) {
  line(`Casting to ${state.device}`, "sfimage=hifispeaker.fill");
  if (!state.ready) line("Connecting…", "size=11");

  if (state.ready && typeof state.volume === "number") {
    console.log("---");
    volumeSection(state.volume);
  }

  console.log("---");
  line("Stop casting", `bash=${quote(STOP)}`, "terminal=false", "refresh=true",
    "sfimage=stop.circle.fill");
} else {
  if (state?.error) {
    line("Last attempt failed", "sfimage=exclamationmark.triangle.fill", "color=red");
    line(state.error, "size=11", "color=red", "length=60");
    console.log("---");
  }

  const devices = readCache(networkKey(localIPv4()))?.devices ?? [];

  if (devices.length === 0) {
    line("No speakers remembered", "sfimage=questionmark.circle");
    line("Scan for speakers", `bash=${quote(NODE)}`,
      `param1=${quote(join(ROOT, "scripts", "list.mjs"))}`, "param2=--rescan",
      "terminal=false", "refresh=true", "sfimage=arrow.clockwise");
  } else {
    line("Cast this Mac's audio to…", "size=11", "color=gray");
    for (const d of devices) {
      line(d.name, `bash=${quote(LAUNCH)}`, `param1=${quote(d.name)}`,
        "terminal=false", "refresh=true", "sfimage=hifispeaker");
    }
  }
}
if (!casting) {
  line("Rescan for speakers", `bash=${quote(NODE)}`,
    `param1=${quote(join(ROOT, "scripts", "list.mjs"))}`, "param2=--rescan",
    "terminal=false", "refresh=true", "sfimage=arrow.clockwise");
}