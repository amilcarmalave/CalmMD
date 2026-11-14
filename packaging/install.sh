#!/bin/sh
# CalmMD installer for macOS and Linux (technical users):
#
#   curl -fsSL https://calmmd.app/install.sh | sh
#
# Downloads the latest release from GitHub, checks it against the release's SHA256SUMS, and installs
# it for the current user: macOS → ~/Applications/CalmMD.app (or /Applications if writable);
# Linux → ~/.local/bin/calmmd (AppImage) plus a menu entry. Files fetched with curl aren't
# quarantined, so Gatekeeper doesn't interrupt.
#
set -eu

REPO="amilcarmalave/CalmMD"

say() { printf '%s\n' "$*"; }
fail() { say "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required"; }
need curl

OS=$(uname -s)
case "$OS" in
  Darwin) PATTERN='_universal\.dmg$' ;;
  Linux)
    case "$(uname -m)" in
      x86_64 | amd64) PATTERN='_amd64\.AppImage$' ;;
      *) fail "no Linux build for $(uname -m) yet" ;;
    esac ;;
  *) fail "unsupported system: $OS" ;;
esac

if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"; else need shasum; SHA="shasum -a 256"; fi

say "Finding the latest CalmMD release..."
JSON=$(curl -fsSL -H 'User-Agent: calmmd-installer' "https://api.github.com/repos/$REPO/releases/latest")
urls() { printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/'; }
URL=$(urls | grep -E "$PATTERN" | head -n 1)
SUMS=$(urls | grep '/SHA256SUMS$' | head -n 1)
[ -n "$URL" ] || fail "no download for this system in the latest release"
[ -n "$SUMS" ] || fail "the release has no SHA256SUMS, so the download can't be verified"
NAME=$(basename "$URL")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
say "Downloading $NAME..."
curl -fsSL -o "$TMP/$NAME" "$URL"
curl -fsSL -o "$TMP/SHA256SUMS" "$SUMS"
EXPECTED=$(grep " $NAME\$" "$TMP/SHA256SUMS" | awk '{print $1}')
ACTUAL=$(cd "$TMP" && $SHA "$NAME" | awk '{print $1}')
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "checksum mismatch for $NAME; nothing was installed"

if [ "$OS" = Darwin ]; then
  DEST="$HOME/Applications"
  [ -w /Applications ] && DEST=/Applications
  mkdir -p "$DEST"
  MNT=$(hdiutil attach -nobrowse -readonly "$TMP/$NAME" | awk -F'\t' '/\/Volumes\// {print $NF; exit}')
  [ -n "$MNT" ] || fail "couldn't open the disk image"
  rm -rf "$DEST/CalmMD.app"
  cp -R "$MNT/CalmMD.app" "$DEST/"
  hdiutil detach "$MNT" -quiet || true
  say "Installed to $DEST/CalmMD.app"
else
  BIN="$HOME/.local/bin"
  APPS="$HOME/.local/share/applications"
  mkdir -p "$BIN" "$APPS"
  install -m 755 "$TMP/$NAME" "$BIN/calmmd"
  cat > "$APPS/calmmd.desktop" <<EOF
[Desktop Entry]
Name=CalmMD
Comment=Markdown, calmly.
Exec=$BIN/calmmd %F
Terminal=false
Type=Application
Categories=Office;TextEditor;
MimeType=text/markdown;text/x-markdown;
EOF
  say "Installed to $BIN/calmmd (make sure $BIN is on your PATH)"
fi
