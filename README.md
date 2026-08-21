# cast-audio

Send Mac OS system audio to a Chromecast — from the terminal, or from the
menu bar. Nothing to install with npm and nothing to build: the scripts use only
what ships with Node (18 or newer), and each command below is the script it runs.

## Setup

```sh
brew install node blackhole-2ch switchaudio-osx
brew install --cask swiftbar          # optional, for the menu bar
uv tool install catt                  # supplies pychromecast

git clone <this repo> && cd cast-audio
node scripts/setup.mjs
```

`setup.mjs` checks each of those, builds the capture helper app, and tells you
what is still missing. The audio server itself is committed as `bin/swyh-rs-cli`,
so there is nothing to compile.

Two things macOS needs from you by hand:

- **Microphone permission.** Capture counts as microphone input. Grant it to your
  terminal (System Settings → Privacy & Security → Microphone), and to
  **Cast Audio Helper** when it asks on the first cast from the menu bar.
- **A Multi-Output Device.** In Audio MIDI Setup, create one containing BlackHole
  *and* your speakers. Without it BlackHole is used alone, which is silent on this
  Mac by design — the audio goes only to the Chromecast.

## Use it

From the terminal:

```sh
node scripts/start.mjs
```

Pick a speaker with the arrow keys and press Enter. The sound output switches
itself and switches back when you quit.

| Key | |
| --- | --- |
| up / down | volume |
| space | pause and resume |
| q or esc | stop casting |

From the menu bar: point SwiftBar's plugin folder at `swiftbar/` inside this repo
(it asks on first launch, or Preferences → Plugin Folder). Click the icon, pick a
speaker, click **Stop casting** when you are done. While casting, the dropdown
carries the speaker's volume: a level bar, **Mute**, and a **Set volume** submenu.

The two are the same session. A cast started in the terminal can be seen and
stopped from the menu bar, and the other way round.

## Scripting

```sh
node scripts/list.mjs                        # known speakers, as JSON
node scripts/status.mjs                      # what is casting right now, as JSON
node scripts/cast.mjs --device "Kitchen"     # cast without the picker
node scripts/volume.mjs up                   # or: down, mute, or a number 0-100
node scripts/stop.mjs
```

`cast.mjs` is the headless twin of `start.mjs`: it stays in the foreground
holding the Cast connection open, so background it — that is what
`scripts/cast-launch.sh`, and therefore the menu bar, does. Anything it has to
say goes to `.state/cast.log`.

`volume.mjs` writes to `.state/control.fifo`, a named pipe the running session
reads. The Cast connection lives in that one process, so a one-shot command
cannot set the volume itself — it asks.

### Speaker list caching

The first run discovers Chromecasts over mDNS, which takes about five seconds.
After that the list is remembered in `.state/devices.json` and appears instantly
while a fresh scan runs in the background for next time. The cache stores each
speaker's address, so connecting skips discovery too — about 4 seconds instead
of 10. It is keyed by which network you are on and expires after a week. A
speaker that moved falls back to discovery and is corrected on the next run.

```sh
node scripts/start.mjs --rescan     # force a fresh scan now
```

## When something is wrong

Start with `node scripts/setup.mjs`, then `.state/server.log` and `.state/cast.log`.

**The Chromecast connects but plays nothing.** You hear the cast chime, then
silence. If `server.log` says `Streaming to <ip> has ended` a second after it
connected, the format is the problem: Chromecast will not hold an endless chunked
stream with no declared duration. WAV is the default for exactly that reason.
FLAC sounds better in theory and disconnects immediately on most Cast devices,
but `CAST_FORMAT=flac node scripts/start.mjs` will try it.

**Silence, or silence only from the menu bar.** Almost always microphone
permission. A bare binary launched from SwiftBar is denied without a prompt and
captures digital silence rather than failing — which is why `setup.mjs`
builds `bin/CastAudioHelper.app`, an app bundle that can hold the grant. Check
that Cast Audio Helper appears under Privacy & Security → Microphone.

**This Mac goes quiet while casting.** BlackHole has no speakers attached. Create
the Multi-Output Device described above; it is preferred whenever it exists.

**Several seconds of delay.** That is Chromecast buffering, and it cannot be
tuned away. Fine for music, not usable for video.

## Layout

```
scripts/
  start.mjs        pick a speaker and cast, with a live screen
  cast.mjs         the same thing headless, for the menu bar
  stop.mjs  status.mjs  list.mjs  volume.mjs   the one-shot commands
  menu.mjs         renders the SwiftBar dropdown
  setup.mjs        the dependency check
  caster.py        holds one Chromecast connection open, driven over stdin
  scan.py          mDNS discovery, as JSON
  lib/engine.mjs   one casting session, start to teardown - both front ends run it
  lib/             server, audio output, device cache, session file, terminal bits
bin/swyh-rs-cli    the audio server: captures BlackHole, serves it over HTTP
swiftbar/          the menu bar plugin and its icons
.state/            the running session, its control pipe, the logs (git-ignored)
```

Drop a maskable PNG at `swiftbar/Normal.png` to change the menu bar icon, and
optionally `swiftbar/Casting.png` for while it is casting. They are drawn as
template images — a solid black shape on transparency, and macOS handles light
and dark mode. A dense file (400×400) is fine; the plugin pins it to 20pt.

| What | Where | Job |
| --- | --- | --- |
| swyh-rs | `bin/swyh-rs-cli` | captures BlackHole, serves it over HTTP |
| pychromecast | catt's tool environment | discovers and drives the speaker |
| switchaudio-osx | `/opt/homebrew/bin/SwitchAudioSource` | switches the sound output and back |
| BlackHole 2ch | audio driver | the loopback that makes system audio capturable |

## Rebuilding the audio server

Only if you ever need to. `swyh-rs-macos-fixes.patch` holds the macOS fixes that
make the upstream project work here — CoreAudio has no loopback, so upstream
captures a device that cannot be captured.

```sh
brew install cmake ninja          # libFLAC and FLTK compile from C source
git clone https://github.com/dheijl/swyh-rs && cd swyh-rs
git apply /path/to/swyh-rs-macos-fixes.patch
cargo build --release --no-default-features --features cli
cp target/release/swyh-rs-cli /path/to/cast-audio/bin/
```

Then `node scripts/setup.mjs` to rebuild the helper app around the new binary.

## Licence

MIT — see [LICENSE](LICENSE). This repository redistributes a build of
[swyh-rs](https://github.com/dheijl/swyh-rs) (MIT); that and the other tools it
depends on are listed in [THIRD-PARTY.md](THIRD-PARTY.md).
