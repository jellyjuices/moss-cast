#!/bin/bash
# <bitbar.title>Moss Cast</bitbar.title>
# <bitbar.desc>Cast this Mac's system audio to a Chromecast.</bitbar.desc>
# <bitbar.dependencies>node</bitbar.dependencies>
#
# SwiftBar appends its own footer to every plugin menu; these switch it off so the
# dropdown carries only our items.
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
#
# The 3s in the filename is the redraw interval: enough that the icon catches up
# quickly once a speaker answers. Everything is rendered by scripts/menu.mjs.
SELF="${BASH_SOURCE[0]}"
while [[ -L "$SELF" ]]; do SELF="$(readlink "$SELF")"; done
ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"
source "$ROOT/scripts/shell/common.sh"

exec "$NODE" "$ROOT/scripts/menu.mjs"
