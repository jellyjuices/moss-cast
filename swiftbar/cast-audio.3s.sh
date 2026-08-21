#!/bin/bash
# <bitbar.title>Cast Audio</bitbar.title>
# <bitbar.desc>Chromecast Mac audio.</bitbar.desc>
# <bitbar.dependencies>node</bitbar.dependencies>
#
# SwiftBar appends its own footer to every plugin menu - Run in Terminal, Refresh,
# Disable, Preferences. These switch it off so the dropdown is only our own items.
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
#
# Everything is rendered by scripts/menu.mjs; this only points SwiftBar at it.
# The 3s in the filename is how often the menu redraws - enough that the icon
# catches up quickly once a speaker answers.
ROOT="$(cd "$(dirname "$(readlink "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")")/.." && pwd)"
NODE="${CAST_NODE:-/opt/homebrew/bin/node}"
exec "$NODE" "$ROOT/scripts/menu.mjs"
