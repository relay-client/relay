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
BG_RETINA_PNG="$SCRIPT_DIR/assets/dmg-background@2x.png"
APP_NAME="$(basename "$APP_PATH")"

if [ ! -f "$BG_PNG" ] || [ ! -f "$BG_RETINA_PNG" ]; then
  echo "make-dmg: installer artwork missing; run node scripts/gen-installer-assets.mjs" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d -t kurlo-dmg)"
trap 'rm -rf "$WORK_DIR"' EXIT
BG_TIFF="$WORK_DIR/dmg-background.tiff"
tiffutil -cathidpicheck "$BG_PNG" "$BG_RETINA_PNG" -out "$BG_TIFF"

STAGING_DIR="$WORK_DIR/contents"
mkdir -p "$STAGING_DIR/.background"
chflags hidden "$STAGING_DIR/.background"
ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME"

rm -f "$OUT_DMG"

create-dmg \
  --volname "$VOL_NAME" \
  --background "$BG_TIFF" \
  --window-pos 200 120 \
  --window-size 720 500 \
  --icon-size 104 \
  --icon "$APP_NAME" 190 254 \
  --hide-extension "$APP_NAME" \
  --icon ".background" 900 100 \
  --app-drop-link 530 254 \
  --no-internet-enable \
  "$OUT_DMG" \
  "$STAGING_DIR"
