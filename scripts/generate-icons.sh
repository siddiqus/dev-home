#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE="$PROJECT_ROOT/devhomelogo.png"
ICONSET="$PROJECT_ROOT/build/icon.iconset"
ICNS="$PROJECT_ROOT/build/icon.icns"
FAVICON="$PROJECT_ROOT/public/favicon.png"

if [ ! -f "$SOURCE" ]; then
  echo "Error: devhomelogo.png not found in project root"
  exit 1
fi

# Generate .icns for macOS app
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16     "$SOURCE" --out "$ICONSET/icon_16x16.png"      > /dev/null
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"   > /dev/null
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_32x32.png"      > /dev/null
sips -z 64 64     "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"   > /dev/null
sips -z 128 128   "$SOURCE" --out "$ICONSET/icon_128x128.png"    > /dev/null
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_256x256.png"    > /dev/null
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_512x512.png"    > /dev/null
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png" > /dev/null

iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"

# Generate 256x256 PNG for Windows (electron-builder converts to .ico automatically)
ICON_PNG="$PROJECT_ROOT/build/icon.png"
sips -z 256 256 "$SOURCE" --out "$ICON_PNG" > /dev/null

# Copy favicon
mkdir -p "$PROJECT_ROOT/public"
cp "$SOURCE" "$FAVICON"

echo "Generated: $ICNS"
echo "Generated: $ICON_PNG"
echo "Generated: $FAVICON"
