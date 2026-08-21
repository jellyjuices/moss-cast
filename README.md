# moss-cast

Send macOS system audio to a Chromecast — from the terminal, or from the menu bar.

Whatever your Mac is playing (Spotify, YouTube, anything) comes out of a speaker
in another room. Pick a speaker, press Enter, done.

**What you need**

- A Mac, and a Chromecast-compatible speaker or display on the same Wi-Fi —
  Chromecast Audio, Google/Nest speakers, Android TV, most Cast-enabled soundbars.
  Not AirPlay, not Sonos, not Bluetooth.
- Node 18 or newer. Nothing to install with npm, nothing to compile: the scripts
  use only what ships with Node, and each command below is the script it runs.

**What it will not do**

- Cast one app only. It takes the whole system output, all of it or none.
- Stay in sync with video. Chromecast buffers a few seconds and that cannot be
  tuned away. Fine for music, not for anything you are watching.

## Setup

**1. Install the tools.**

```sh
brew install node blackhole-2ch switchaudio-osx
brew install --cask swiftbar          # optional, for the menu bar
brew install uv && uv tool install catt
```

| | what it does for you |
| --- | --- |
| `blackhole-2ch` | the virtual cable that makes system audio capturable — required |
| `catt` | supplies the Python library that finds and drives your Chromecast — required |
| `switchaudio-osx` | switches your sound output for you, and switches it back — optional, you can do it by hand |
| `swiftbar` | hosts the menu bar icon — optional, only for the menu bar |

**2. Clone and check.**

```sh
git clone https://github.com/jjbastida/moss-cast.git && cd moss-cast
node scripts/setup.mjs
```

`setup.mjs` checks each tool, builds the capture helper app, and prints a line
per item. Anything marked `x` is blocking: install it, then run `setup.mjs`
again — it is safe to re-run as often as you like. It finishes with `Ready.`
when there is nothing left to fix.

**3. Grant microphone permission.** macOS counts audio capture as microphone
input, and this is the one step nobody can do for you. Open System Settings →
Privacy & Security → Microphone and enable it for your terminal. The menu bar
asks separately, for **Moss Cast Helper**, on your first cast from it — say yes.
Skip this and you will cast perfect silence.

## Quick start

```sh
node scripts/start.mjs
```

Pick a speaker with the arrow keys and press Enter. Within a few seconds you
hear the Cast chime, the display switches to `PLAYING`, and your audio follows.
Your sound output is switched for you and switched back when you quit.

Your Mac goes quiet while casting — the audio goes to the Chromecast and nowhere
else, which is the point of casting to a speaker in another room.

| Key | Action |
| --- | --- |
| up / down | volume |
| space | pause and resume |
| q or esc | stop casting |

## From the menu bar

Point SwiftBar at the `swiftbar/` folder inside this repo (it asks on first
launch, or Preferences → Plugin Folder). Click the icon, pick a speaker, click
**Stop casting** when you are done. While casting, the dropdown carries the
speaker's volume: a level bar, **Mute**, and a **Set volume** submenu.

The two are the same session. A cast started in the terminal can be seen and
stopped from the menu bar, and the other way round.

## Options

| Flag | Variable | |
| --- | --- | --- |
| `--rescan` | `MOSS_RESCAN=1` | forget the remembered speakers and search the network again |
| | `MOSS_FORMAT=flac` | stream FLAC instead of WAV (see the troubleshooting note) |
| | `MOSS_NODE=/path/to/node` | where Node lives, if the menu bar cannot find it |

The menu bar runs with SwiftBar's own environment, so variables exported in your
shell profile never reach it. Put them in a `moss.env` file at the top of the
repo instead, which both the terminal and the menu bar read:

```sh
echo 'MOSS_FORMAT=flac' > moss.env
```

It is untracked, so a `git pull` will not overwrite it.

## Troubleshooting

**Where to look first.** Re-run `node scripts/setup.mjs` — most breakage is a
missing tool or a revoked permission, and it names both. After that, the logs:
`.state/server.log` for the audio server, `.state/cast.log` for the menu bar.

**Silence, or silence only from the menu bar.** Almost always microphone
permission. A bare binary launched from SwiftBar is denied without a prompt and
captures digital silence rather than failing — which is why `setup.mjs` builds
`bin/MossCastHelper.app`, an app bundle that can hold the grant. Check that
**Moss Cast Helper** appears, and is ticked, under Privacy & Security →
Microphone.

**The Chromecast connects but plays nothing.** You hear the cast chime, then
silence. If `server.log` says `Streaming to <ip> has ended` a second after it
connected, the format is the problem: Chromecast will not hold an endless chunked
stream with no declared duration. WAV is the default for exactly that reason.
FLAC sounds better in theory and disconnects immediately on most Cast devices,
but `MOSS_FORMAT=flac node scripts/start.mjs` will try it.

**My speaker is not in the list.** Same Wi-Fi as the Mac? The list is
remembered between runs, so a speaker that has moved or changed IP needs
`node scripts/start.mjs --rescan`.

**My Mac went quiet while casting.** By design: BlackHole has no speakers
attached, so the audio goes only to the Chromecast. If you would rather hear
both, make a Multi-Output Device in Audio MIDI Setup containing BlackHole and
your speakers — moss-cast falls back to it when there is no plain BlackHole.

**Several seconds of delay.** That is Chromecast buffering, and it cannot be
tuned away. Fine for music, not usable for video.

## Licence

MIT — see [LICENSE](LICENSE). The audio server is a prebuilt, committed binary
at `bin/swyh-rs-cli`: a build of [swyh-rs](https://github.com/dheijl/swyh-rs)
(MIT) with the macOS fixes in [swyh-rs-macos-fixes.patch](swyh-rs-macos-fixes.patch)
applied, which is why nothing here needs a Rust toolchain. To rebuild it
yourself, clone swyh-rs, apply that patch, `cargo build --release --bin
swyh-rs-cli`, and drop the result in `bin/`. That and the other tools it depends
on are listed in [THIRD-PARTY.md](THIRD-PARTY.md).
