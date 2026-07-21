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

WORK_DIR="$(mktemp -d -t relay-dmg)"
trap 'rm -rf "$WORK_DIR"' EXIT

BG_PNG="$WORK_DIR/dmg-bg.png"


python3 - "$BG_PNG" << 'PYEOF'
import struct, sys, zlib

out_path = sys.argv[1]
W, H = 660, 400

def chunk(tag, data):
    buf = tag + data
    return struct.pack('>I', len(data)) + buf + struct.pack('>I', zlib.crc32(buf) & 0xFFFFFFFF)


raw = b''
for y in range(H):
    raw += b'\x00'
    for x in range(W):
        tx = x / (W - 1)
        ty = y / (H - 1)
        t = tx * 0.7 + (1 - ty) * 0.3
        r = int(14  + t * (52  - 14))
        g = int(30  + t * (82  - 30))
        b = int(74  + t * (184 - 74))
        raw += bytes([r, g, b])

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9))
       + chunk(b'IEND', b''))

with open(out_path, 'wb') as f:
    f.write(png)
PYEOF

rm -f "$OUT_DMG"

create-dmg \
  --volname "$VOL_NAME" \
  --background "$BG_PNG" \
  --window-pos 200 120 \
  --window-size 660 400 \
  --icon-size 120 \
  --icon "Relay.app" 180 200 \
  --hide-extension "Relay.app" \
  --app-drop-link 480 200 \
  --no-internet-enable \
  "$OUT_DMG" \
  "$APP_PATH"
