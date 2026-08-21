#!/bin/bash
# Starts the headless supervisor and gets out of the way.
#
# scripts/cast.mjs has to outlive this script - it is what holds the Cast
# connection open - so it is detached from the menu's process group. Without the
# disown, quitting or refreshing SwiftBar would take the cast down with it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${CAST_NODE:-/opt/homebrew/bin/node}"

mkdir -p "$ROOT/.state"
nohup "$NODE" "$ROOT/scripts/cast.mjs" --device "$1" \
  >> "$ROOT/.state/cast.log" 2>&1 &
disown
