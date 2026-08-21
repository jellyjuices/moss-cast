#!/bin/bash
# Stops whatever is casting. scripts/stop.mjs signals the supervisor, which puts
# the sound output back on its way out.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${CAST_NODE:-/opt/homebrew/bin/node}"

"$NODE" "$ROOT/scripts/stop.mjs" >> "$ROOT/.state/cast.log" 2>&1
