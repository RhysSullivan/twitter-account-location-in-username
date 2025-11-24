#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist/chrome"
ARTIFACT="$ROOT_DIR/dist/chrome.zip"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

rsync -av \
  --exclude 'server/' \
  --exclude 'web-ext-artifacts/' \
  --exclude 'dist/' \
  --exclude '.git/' \
  --exclude '*.env' \
  --exclude 'output.xpi' \
  --exclude 'output.zip' \
  --exclude '*.bash' \
  --exclude '*.sh' \
  --exclude 'manifest.firefox.json' \
  "$ROOT_DIR/" "$DIST_DIR/"

# Ensure the Chrome manifest is used
cp "$ROOT_DIR/manifest.json" "$DIST_DIR/manifest.json"

rm -f "$ARTIFACT"
if command -v zip >/dev/null 2>&1; then
  (cd "$DIST_DIR" && zip -r "$ARTIFACT" . >/dev/null)
else
  echo "zip not found; using python to create archive..."
  (cd "$DIST_DIR" && python3 - <<'PY'
import os, zipfile
artifact = os.path.join(os.getcwd(), "../chrome.zip")
with zipfile.ZipFile(artifact, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk("."):
        for f in files:
            path = os.path.join(root, f)
            zf.write(path, arcname=os.path.relpath(path, "."))
PY
  )
fi
echo "Chrome package created at $ARTIFACT"
