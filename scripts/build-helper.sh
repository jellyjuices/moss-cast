#!/bin/bash
# Wraps swyh-rs-cli in a minimal .app bundle.
#
# macOS gates audio capture behind microphone permission, and only an app with
# NSMicrophoneUsageDescription can be asked for it. A bare CLI binary launched
# from SwiftBar has no such identity, so the request is auto-denied - silently,
# with CoreAudio handing back digital silence rather than an error. That is why
# casting works from the terminal (it inherits Terminal's grant) and streams
# silence from the menu bar. The bundle gives capture its own identity to hold
# the grant under, whoever launches it.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/bin/CastAudioHelper.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$ROOT/bin/swyh-rs-cli" "$APP/Contents/MacOS/CastAudioHelper"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>CastAudioHelper</string>
  <key>CFBundleIdentifier</key><string>com.jjbastida.castaudio.helper</string>
  <key>CFBundleName</key><string>Cast Audio Helper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSBackgroundOnly</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Cast Audio captures the BlackHole audio device to stream this Mac's sound to a Chromecast.</string>
</dict>
</plist>
PLIST

# Ad-hoc is enough: TCC keys off the bundle identity, not a Developer ID.
codesign --force --sign - --identifier com.jjbastida.castaudio.helper "$APP"
echo "Built $APP"
