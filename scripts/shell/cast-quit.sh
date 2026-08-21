#!/bin/bash
# Tear down any running session, then quit SwiftBar itself - the menu bar item
# only exists as long as SwiftBar is running, so "Quit" has to end both.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$PROJECT_ROOT/scripts/shell/common.sh"

mkdir -p "$PROJECT_ROOT/.state"
"$NODE" "$PROJECT_ROOT/scripts/stop.mjs" >> "$PROJECT_ROOT/.state/cast.log" 2>&1
osascript -e 'tell application "SwiftBar" to quit'
