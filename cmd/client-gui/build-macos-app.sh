#!/bin/bash
# ABOUTME: Builds SuperChat.app bundle for macOS with icon
# ABOUTME: Creates proper .app structure with icon and Info.plist

set -e

echo "Building SuperChat for macOS..."

# Build the binary
go build -o superchat-gui .

# Create .app bundle structure
APP_NAME="SuperChat.app"
CONTENTS="$APP_NAME/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

rm -rf "$APP_NAME"
mkdir -p "$MACOS"
mkdir -p "$RESOURCES"

# Move binary into bundle
mv superchat-gui "$MACOS/SuperChat"

# Convert PNG to ICNS (requires imagemagick or sips)
if command -v sips &> /dev/null; then
    # Use macOS built-in sips
    sips -s format icns ../../pkg/client/assets/icon.png --out "$RESOURCES/icon.icns"
elif command -v convert &> /dev/null; then
    # Use ImageMagick
    convert ../../pkg/client/assets/icon.png -resize 512x512 "$RESOURCES/icon.icns"
else
    echo "Warning: Neither sips nor imagemagick found. Skipping icon conversion."
    echo "Install imagemagick: brew install imagemagick"
fi

# Create Info.plist
cat > "$CONTENTS/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>SuperChat</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleIdentifier</key>
    <string>win.superchat.client</string>
    <key>CFBundleName</key>
    <string>SuperChat</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>2.0</string>
    <key>CFBundleVersion</key>
    <string>2.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "✓ Created $APP_NAME"
echo "To run: open $APP_NAME"
echo "Or: ./$APP_NAME/Contents/MacOS/SuperChat"
