#!/usr/bin/env bash

set -euo pipefail

APP_PATH="${1:?usage: make-dmg.sh <app-path> <output-dmg> <volume-name>}"
OUT_DMG="${2:?usage: make-dmg.sh <app-path> <output-dmg> <volume-name>}"
VOL_NAME="${3:?usage: make-dmg.sh <app-path> <output-dmg> <volume-name>}"

if [ ! -d "$APP_PATH" ]; then
  echo "make-dmg: $APP_PATH not found — build the app first" >&2
  exit 1
fi

if ! command -v create-dmg >/dev/null 2>&1; then
  echo "make-dmg: create-dmg is not installed. Install via 'brew install create-dmg'." >&2
  exit 1
fi

OUT_DIR="$(dirname "$OUT_DMG")"
mkdir -p "$OUT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BG_PNG="$SCRIPT_DIR/assets/dmg-background.png"
APP_NAME="$(basename "$APP_PATH")"

if [ ! -f "$BG_PNG" ]; then
  echo "make-dmg: installer artwork missing; run node scripts/gen-installer-assets.mjs" >&2
  exit 1
fi

rm -f "$OUT_DMG"

create-dmg \
  --volname "$VOL_NAME" \
  --background "$BG_PNG" \
  --window-pos 200 120 \
  --window-size 720 500 \
  --icon-size 104 \
  --icon "$APP_NAME" 190 254 \
  --hide-extension "$APP_NAME" \
  --app-drop-link 530 254 \
  --no-internet-enable \
  "$OUT_DMG" \
  "$APP_PATH"
