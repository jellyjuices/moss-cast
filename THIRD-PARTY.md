# Third-party software

moss-cast itself is MIT licensed (see [LICENSE](LICENSE)). It redistributes one
binary and depends on several tools you install yourself.

## Redistributed in this repository

| What | Where | Licence |
| --- | --- | --- |
| [swyh-rs](https://github.com/dheijl/swyh-rs) by dheijl — the audio server, built from source with the macOS fixes in `swyh-rs-macos-fixes.patch` | `bin/swyh-rs-cli` | MIT — [full text](licenses/swyh-rs-LICENSE) |

`bin/MossCastHelper.app` is that same binary wrapped in an app bundle by
`node scripts/setup.mjs`, and is covered by the same licence.

## Installed separately, not redistributed

| What | Licence | Why it is needed |
| --- | --- | --- |
| [SwiftBar](https://github.com/swiftbar/SwiftBar) (© 2020 Ameba Labs) | MIT — [full text](licenses/swiftbar-LICENSE) | Runs the menu bar plugin in `swiftbar/`. Only the plugin script lives here; SwiftBar is installed via Homebrew. |
| [catt](https://github.com/skorokithakis/catt) / [pychromecast](https://github.com/home-assistant-libs/pychromecast) | MIT | `scripts/python/scan.py` and `scripts/python/caster.py` run on catt's Python, which supplies pychromecast. |
| [switchaudio-osx](https://github.com/deweller/switchaudio-osx) | GPL-2.0 | Switches the Mac's sound output. Invoked as a separate binary; optional. |
| [BlackHole](https://github.com/ExistentialAudio/BlackHole) | GPL-3.0 | The loopback audio driver that makes system audio capturable. |
