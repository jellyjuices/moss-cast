# cast-audio

Sends this Mac's system audio to a Chromecast.

## Use it

```sh
cd ~/Git/cast-audio
npm run cast:start
```

Pick a Chromecast with the arrow keys and press Enter. The Mac's sound output
switches to the capture device on its own, and switches back when you quit.

```sh
npm run cast:stop
```

Stops the Chromecast, shuts the audio server down, and puts the sound output back.
You only need this if the casting window is gone; pressing `q` does the same.

## From the menu bar

A [SwiftBar](https://swiftbar.app) plugin gives you the same thing without a
terminal: click the icon, pick a speaker, click **Stop casting** when you are done.
While it is casting the dropdown carries the speaker's volume in place of the
sound output line: a bar showing the current level, **Mute**, and a **Set volume**
submenu to jump straight to a level.

```sh
brew install --cask swiftbar
```

Point SwiftBar's plugin folder at `swiftbar/` inside this repo (SwiftBar asks on
first launch, or Preferences -> Plugin Folder). The plugin lists the speakers from
the same cache the CLI uses, so the menu opens instantly.

To use your own menu bar icon, drop a maskable PNG at `swiftbar/Normal.png`,
and optionally a second one at `swiftbar/Casting.png` for while it is casting.
They are drawn as template images, so macOS handles light and dark mode - use a
solid black shape on transparency. SwiftBar draws a PNG at its own pixel size, so
the plugin pins the icon to 18pt with the width/height params; that means you can
hand it a dense file (400x400) and get a crisp Retina icon rather than a huge one.
Without them the plugin falls back to SF Symbols.

### The same thing from a script

```sh
npm run cast:list           # known speakers, as JSON
npm run cast:to -- --device "Kitchen speaker"
npm run cast:status         # what is casting right now, as JSON
npm run cast:stop
npm run cast:volume -- up    # or: down, mute, or a number 0-100
```

`cast:volume` is the same control the menu uses. It writes to `.state/control.fifo`,
a named pipe the running `cast:to` reads: the Cast connection lives in that process,
so a one-shot command cannot set the volume itself, but it can ask.

`cast:to` is the headless twin of `npm run cast`: no picker, no keyboard controls.
It stays in the foreground holding the connection open, so background it (that is
what `scripts/cast-launch.sh` does) and stop it with `cast:stop`, which signals it
to put your sound output back. Anything it has to say goes to `.state/cast.log`.

### Speaker list caching

The first run discovers Chromecasts over mDNS, which takes about five seconds.
After that the list is remembered in `.state/devices.json` and appears instantly,
while a fresh scan runs in the background for next time. The cache also stores each
speaker's address, so connecting skips discovery too - about 4 seconds instead of 10.

The cache is keyed by which network you are on and expires after a week. A speaker
that moved to a new address falls back to discovery automatically and is corrected
on the next run. To force a fresh scan now:

```sh
npm run cast:rescan
```

### Sound output switching

Handled by [switchaudio-osx](https://github.com/deweller/switchaudio-osx), since
macOS has no built-in CLI for it:

```sh
brew install switchaudio-osx
```

It picks **Multi-Output Device** when you have one (audio goes to the Chromecast
*and* stays audible on this Mac), otherwise **BlackHole**. Whatever you were on
before is saved in `.state/session.json` and restored on quit - including on a
crash or a lost connection. Without the tool installed everything still works,
you just switch outputs by hand in the menu bar.

## If the Chromecast connects but plays nothing

You hear the cast chime, then silence. Check `.state/server.log`: if a line says
`Streaming to <chromecast-ip> has ended` a second after it connected, the format
is the problem. Chromecast will not hold an endless chunked stream that has no
declared duration.

WAV is the default here for exactly that reason. FLAC sounds better in theory but
disconnects immediately on most Cast devices. If you want to try anyway:

```sh
CAST_FORMAT=flac npm run cast:start
```

## If you hear nothing

- BlackHole on its own is silent by design — it has no speakers attached, so this
  Mac goes quiet while the Chromecast plays. Create a **Multi-Output Device** in
  Audio MIDI Setup (BlackHole + your speakers) and it gets preferred instead.
- macOS needs to have granted **microphone** permission to your terminal app.
  System Settings > Privacy & Security > Microphone. BlackHole counts as a
  microphone, so this is the permission the capture needs.
- Expect several seconds of delay. That is how Chromecast buffers; it cannot be
  tuned away. Fine for music, not usable for video.

## What it is made of

No npm packages — the scripts only use what ships with Node.

- `scripts/start.mjs` — pick, switch output, start server, cast
- `scripts/stop.mjs` — stop playback and the server, restore output
- `scripts/devices.mjs` — the remembered speaker list
- `scripts/scan.py` — mDNS discovery, as JSON
- `scripts/audio.mjs` — sound output switching
- `scripts/picker.mjs` — the arrow-key menu
- `scripts/menu.mjs` — the SwiftBar dropdown
- `scripts/volume.mjs` — volume changes, sent to a running session
- `scripts/config.mjs` — paths shared by both
- `.state/` — the running session's PID, its control pipe, and the server log (`server.log` is the
  first place to look when something misbehaves)

- `bin/swyh-rs-cli` — the audio server itself

| What | Where | Job |
| --- | --- | --- |
| swyh-rs | `bin/swyh-rs-cli` (in this folder) | captures BlackHole, serves it over HTTP |
| catt | `~/.local/bin/catt` | its pychromecast is what discovers and drives the speaker |
| switchaudio-osx | `/opt/homebrew/bin/SwitchAudioSource` | switches the Mac's sound output and back |
| BlackHole 2ch | audio driver | the loopback that makes system audio capturable |

`bin/swyh-rs-cli` is a self-contained binary — it links only against macOS system
frameworks, so it needs no Rust, no Homebrew packages, and no source repo.

## Rebuilding the audio server (only if you ever need to)

`swyh-rs-macos-fixes.patch` in this folder holds the macOS fixes that make the
upstream project work on a Mac — CoreAudio has no loopback, so upstream captures
a device that cannot be captured. To rebuild from scratch:

```sh
brew install cmake ninja          # libFLAC and FLTK compile from C source
git clone https://github.com/dheijl/swyh-rs && cd swyh-rs
git apply /path/to/swyh-rs-macos-fixes.patch
cargo build --release --no-default-features --features cli
cp target/release/swyh-rs-cli ~/Git/cast-audio/bin/
```
