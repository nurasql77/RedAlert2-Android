#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RETAIL="${1:-${RA2_RETAIL_DIR:-}}"

if [ -z "$RETAIL" ]; then
  echo "Usage: ./scripts/setup-android.sh <path-to-ra2-install>"
  echo "Example: ./scripts/setup-android.sh \"/path/to/Command & Conquer Red Alert 2\""
  exit 1
fi

if [ ! -d "$RETAIL" ]; then
  echo "error: directory not found: $RETAIL" >&2
  exit 1
fi

echo "==> Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "error: Node.js is required" >&2; exit 1; }

if [ ! -d "$ROOT/redalert2/node_modules" ]; then
  echo "==> Installing web dependencies in redalert2/..."
  (cd "$ROOT/redalert2" && npm install)
fi

echo "==> Running asset preparation script..."
export RA2_RETAIL_DIR="$RETAIL"
npx tsx "$ROOT/scripts/prepare-gameres.ts"

echo "==> Setup complete! Next step: ./scripts/build-android.sh"