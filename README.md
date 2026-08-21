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

One thing macOS needs from you by hand: **microphone permission**. Capture counts
as microphone input, so grant it to your terminal (System Settings → Privacy &
Security → Microphone), and to **Cast Audio Helper** when it asks on the first
cast from the menu bar.

## How to use it
### From the terminal

```sh
node scripts/start.mjs
```

Pick a speaker with the arrow keys and press Enter. The sound output switches
itself and switches back when you quit. The audio goes to the Chromecast and
nowhere else — this Mac stays quiet, which is the point of casting to a speaker
in another room.

To hear it here as well, create a **Multi-Output Device** in Audio MIDI Setup
containing BlackHole *and* your speakers, then:

```sh
node scripts/start.mjs --keep-local
```

`CAST_KEEP_LOCAL=1` does the same thing. For the menu bar, which runs with its
own environment, add `export CAST_KEEP_LOCAL=1` to `scripts/lib/common.sh`.

Be warned that the two outputs are a few seconds out of step: Chromecast buffers,
and the local one does not.

| Key | |
| --- | --- |
| up / down | volume |
| space | pause and resume |
| q or esc | stop casting |

### From the menu bar
Open SwiftBar's plugin folder and point it at `swiftbar/` folder inside this repo
(it asks on first launch, or Preferences → Plugin Folder). Click the icon, pick a
speaker, click **Stop casting** when you are done. While casting, the dropdown
carries the speaker's volume: a level bar, **Mute**, and a **Set volume** submenu.

The two are the same session. A cast started in the terminal can be seen and
stopped from the menu bar, and the other way round.

## FAQ

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

**My Mac went quiet while casting.** That is the default: BlackHole has no
speakers attached, so the audio goes only to the Chromecast. Use `--keep-local`
if you want both.

**Several seconds of delay.** That is Chromecast buffering, and it cannot be
tuned away. Fine for music, not usable for video.

## Licence

MIT — see [LICENSE](LICENSE). This repository redistributes a build of
[swyh-rs](https://github.com/dheijl/swyh-rs) (MIT); that and the other tools it
depends on are listed in [THIRD-PARTY.md](THIRD-PARTY.md).
