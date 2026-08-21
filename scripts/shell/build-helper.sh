#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$PROJECT_ROOT/bin/MossCastHelper.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$PROJECT_ROOT/bin/swyh-rs-cli" "$APP/Contents/MacOS/MossCastHelper"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>MossCastHelper</string>
  <key>CFBundleIdentifier</key><string>com.jjbastida.mosscast.helper</string>
  <key>CFBundleName</key><string>Moss Cast Helper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSBackgroundOnly</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Moss Cast captures the BlackHole audio device to stream this Mac's sound to a Chromecast.</string>
</dict>
</plist>
PLIST

codesign --force --sign - --identifier com.jjbastida.mosscast.helper "$APP"
echo "Built $APP"
