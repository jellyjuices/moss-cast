set -euo pipefail

find_node() {
  if [[ -n "${MOSS_NODE:-}" ]]; then
    echo "$MOSS_NODE"
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
  echo "moss-cast: Node is not installed, or not where this script looked." >&2
  echo "Set MOSS_NODE to its path, or: brew install node" >&2
  exit 1
}

NODE="$(find_node)"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOSS_ENV_FILE="$PROJECT_ROOT/moss.env"
if [[ -f "$MOSS_ENV_FILE" ]]; then
  set -a
  source "$MOSS_ENV_FILE"
  set +a
fi
