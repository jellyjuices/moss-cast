#!/bin/bash
# Sourced by the shell entry points. Finds Node, since SwiftBar runs plugins with
# a bare PATH that has no Homebrew in it.
set -euo pipefail

find_node() {
  if [[ -n "${CAST_NODE:-}" ]]; then
    echo "$CAST_NODE"
    return
  fi
  for candidate in \
    "$(command -v node 2>/dev/null || true)" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME/.local/bin/node"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  echo "cast-audio: Node is not installed, or not where this script looked." >&2
  echo "Set CAST_NODE to its path, or: brew install node" >&2
  exit 1
}

NODE="$(find_node)"
