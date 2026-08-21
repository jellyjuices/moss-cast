// The SwiftBar dropdown. The plugin file in swiftbar/ is a wrapper around this.
//
// SwiftBar's format: the first line is the menu bar item, then `---`, then the
// dropdown. Every line takes `key=value` parameters after a `|`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT, MUTE_FILE } from "./lib/config.mjs";
import { currentNetworkId } from "./lib/network.mjs";
import { readDeviceCache, isScanning } from "./lib/chromecast/cache.mjs";
import * as session from "./lib/session.mjs";

const NODE = process.execPath;
const VOLUME = join(PROJECT_ROOT, "scripts", "volume.mjs");
const LIST = join(PROJECT_ROOT, "scripts", "list.mjs");
const LAUNCH = join(PROJECT_ROOT, "scripts", "shell", "cast-launch.sh");
const STOP = join(PROJECT_ROOT, "scripts", "shell", "cast-stop.sh");
const QUIT = join(PROJECT_ROOT, "scripts", "shell", "cast-quit.sh");
const ICON_PT = 20;
const line = (text, ...params) =>
  console.log(params.length ? `${text} | ${params.join(" ")}` : text);
const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const separator = () => console.log("---");
const state = session.read();
const casting = session.isRunning(state);

function runs(script, ...args) {
  return [
    `bash=${quote(NODE)}`,
    `param1=${quote(script)}`,
    ...args.map((a, i) => `param${i + 2}=${quote(String(a))}`),
    "terminal=false",
    "refresh=true",
  ];
}

function changeIcon(name, sfimage) {
  const file = join(PROJECT_ROOT, "assets", "menubar", name);
  if (!existsSync(file)) return `sfimage=${sfimage}`;
  return line(
    ``,
    `templateImage=${readFileSync(file).toString("base64")} width=${ICON_PT} height=${ICON_PT}`,
  );
}

function readMutedFrom() {
  try {
    return JSON.parse(readFileSync(MUTE_FILE, "utf8")).mutedFrom;
  } catch {
    return null;
  }
}

function volumeSection(volume, mutedFrom) {
  const percent = Math.round(volume * 100);
  const muted = percent === 0;
  const dynamicSpeaker = `sfimage=speaker.wave.${Math.ceil(percent / 33)}.fill`;

  if (!muted) {
    line(`Volume ${percent}%`, dynamicSpeaker, "refresh=true");
    for (let p = 100; p >= 10; p -= 10) {
      const mark = Math.round(percent / 10) * 10 === p ? " ✓" : "";
      line(`--${String(p).padStart(3)}%${mark}`, ...runs(VOLUME, p));
    }
    line("Mute", ...runs(VOLUME, "mute"), "sfimage=speaker.slash.fill");
  } else {
    const restore =
      typeof mutedFrom === "number" ? ` (${Math.round(mutedFrom * 100)}%)` : "";
    line("Unmute", ...runs(VOLUME, "unmute"), dynamicSpeaker);
  }
}

function renderScanningView() {
  line("Scanning for speakers…", "color=gray");
  quitSection();
}

function quitSection() {
  separator();
  line(
    "Quit",
    `bash=${quote(QUIT)}`,
    "terminal=false",
    "refresh=false",
    "sfimage=power",
  );
}

function renderCastingView() {
  line(`Casting to ${state.device}`, "sfimage=hifispeaker.fill");
  if (!state.ready) line("Connecting…", "size=11");

  if (state.ready && typeof state.volume === "number") {
    separator();
    volumeSection(state.volume, readMutedFrom());
  }

  separator();
  line(
    "Stop casting",
    `bash=${quote(STOP)}`,
    "terminal=false",
    "refresh=true",
    "sfimage=stop.circle.fill",
  );
}

if (isScanning()) {
  changeIcon("Scanning.png", "arrow.clockwise");
} else if (casting) {
  changeIcon("Casting.png", "waveform.circle.fill");
} else if (state?.error) {
  changeIcon("sfimage=exclamationmark.triangle.fill");
} else {
  changeIcon("Normal.png", "airplayaudio");
}

separator();

if (isScanning()) {
  renderScanningView();
  process.exit(0);
} else if (casting) {
  renderCastingView();
} else {
  if (state?.error) {
    line(
      "Last attempt failed",
      "sfimage=exclamationmark.triangle.fill",
      "color=red",
    );
    line(state.error, "size=11", "color=red", "length=60");
    separator();
  }

  const devices = readDeviceCache(currentNetworkId())?.devices ?? [];

  if (devices.length === 0) {
    line("No speakers remembered", "sfimage=questionmark.circle");
  } else {
    line("Cast Mac audio to…", "size=11", "color=gray");
    for (const d of devices) {
      line(
        d.name,
        `bash=${quote(LAUNCH)}`,
        `param1=${quote(d.name)}`,
        "terminal=false",
        "refresh=true",
        "sfimage=hifispeaker.fill",
      );
    }
  }

  separator();
  line(
    "Rescan for speakers",
    ...runs(LIST, "--rescan"),
    "sfimage=arrow.clockwise",
  );
}

quitSection();
