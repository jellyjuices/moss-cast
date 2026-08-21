#!/bin/bash
# Stops whatever is casting. scripts/stop.mjs signals the session owner, which
# puts the sound output back on its way out.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib/common.sh"

mkdir -p "$ROOT/.state"
"$NODE" "$ROOT/scripts/stop.mjs" >> "$ROOT/.state/cast.log" 2>&1
