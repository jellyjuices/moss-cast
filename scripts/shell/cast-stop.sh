#!/bin/bash
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$PROJECT_ROOT/scripts/shell/common.sh"

mkdir -p "$PROJECT_ROOT/.state"
"$NODE" "$PROJECT_ROOT/scripts/stop.mjs" >> "$PROJECT_ROOT/.state/cast.log" 2>&1
