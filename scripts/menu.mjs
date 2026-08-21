// The SwiftBar dropdown. The plugin file in swiftbar/ is a wrapper around this.
//
// SwiftBar's format: the first line is the menu bar item, then `---`, then the
// dropdown. Every line takes `key=value` parameters after a `|`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./lib/config.mjs";
import { currentNetworkId } from "./lib/network.mjs";
import { readDeviceCache } from "./lib/chromecast/cache.mjs";
import * as session from "./lib/session.mjs";

const NODE = process.execPath;
const VOLUME = join(PROJECT_ROOT, "scripts", "volume.mjs");
const LIST = join(PROJECT_ROOT, "scripts", "list.mjs");

// These live in scripts/, not swiftbar/: SwiftBar treats every executable in its
// plugin folder as a plugin, and would give each one its own menu bar item.
const LAUNCH = join(PROJECT_ROOT, "scripts", "shell", "cast-launch.sh");
const STOP = join(PROJECT_ROOT, "scripts", "shell", "cast-stop.sh");

const line = (text, ...params) => console.log(params.length ? `${text} | ${params.join(" ")}` : text);
const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const separator = () => console.log("---");

const runs = (script, ...args) => [
  `bash=${quote(NODE)}`,
  `param1=${quote(script)}`,
  ...args.map((a, i) => `param${i + 2}=${quote(String(a))}`),
  "terminal=false",
  "refresh=true",
];

// SwiftBar draws a PNG at its own pixel size, so width/height are not optional:
// they pin the icon to the menu bar however big the source file is. templateImage
// lets macOS invert it for dark mode. Without a PNG, fall back to an SF Symbol.
const ICON_PT = 20;

function icon(name, sfimage) {
  const file = join(PROJECT_ROOT, "assets", "menubar", name);
  if (!existsSync(file)) return `sfimage=${sfimage}`;
  return `templateImage=${readFileSync(file).toString("base64")} width=${ICON_PT} height=${ICON_PT}`;
}

// SwiftBar has no slider, so the bar is drawn in a monospaced font, which keeps
// every level the same width. A click closes the menu, so nudging by steps would
// mean reopening it each time - the submenu jumps straight to a level instead.
const BAR_SEGMENTS = 10;

function volumeSection(volume) {
  const percent = Math.round(volume * 100);
  const filled = Math.round(volume * BAR_SEGMENTS);
  const bar = "█".repeat(filled) + "░".repeat(BAR_SEGMENTS - filled);

  line(`${bar}  Volume ${String(percent).padStart(3)}%`, "font=Menlo", "size=12");
  line("Set volume", "sfimage=slider.horizontal.3");
  for (let p = 100; p >= 0; p -= 10) {
    const mark = Math.round(percent / 10) * 10 === p ? " ✓" : "";
    line(`--${String(p).padStart(3)}%${mark}`, ...runs(VOLUME, p));
  }
  line("Mute", ...runs(VOLUME, "mute"), "sfimage=speaker.slash.fill");
}

const state = session.read();
const casting = session.isRunning(state);

if (casting) {
  // Icon only - "connecting" is spelled out in the dropdown instead, so the menu
  // bar item stays exactly the same width as the idle one.
  line("", icon("Casting.png", "waveform.circle.fill"));
} else if (state?.error) {
  // Template images cannot be tinted, and red in the menu bar is the whole point
  // of the failure state, so it keeps the SF Symbol.
  line("", "sfimage=airplayaudio", "sfcolor=red");
} else {
  line("", icon("Normal.png", "airplayaudio"));
}

separator();

if (casting) {
  line(`Casting to ${state.device}`, "sfimage=hifispeaker.fill");
  if (!state.ready) line("Connecting…", "size=11");

  if (state.ready && typeof state.volume === "number") {
    separator();
    volumeSection(state.volume);
  }

  separator();
  line("Stop casting", `bash=${quote(STOP)}`, "terminal=false", "refresh=true",
    "sfimage=stop.circle.fill");
} else {
  if (state?.error) {
    line("Last attempt failed", "sfimage=exclamationmark.triangle.fill", "color=red");
    line(state.error, "size=11", "color=red", "length=60");
    separator();
  }

  const devices = readDeviceCache(currentNetworkId())?.devices ?? [];

  if (devices.length === 0) {
    line("No speakers remembered", "sfimage=questionmark.circle");
  } else {
    line("Cast this Mac's audio to…", "size=11", "color=gray");
    for (const d of devices) {
      line(d.name, `bash=${quote(LAUNCH)}`, `param1=${quote(d.name)}`,
        "terminal=false", "refresh=true", "sfimage=hifispeaker");
    }
  }

  separator();
  line("Rescan for speakers", ...runs(LIST, "--rescan"), "sfimage=arrow.clockwise");
}
