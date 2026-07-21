#!/usr/bin/env bash
# Builds a Chrome Web Store-ready zip of the extension.
#
# What it does:
#  - copies only the files the published extension needs (not this script, the
#    icon generator, or the docs)
#  - strips the localhost host permission (dev-only; public-store reviewers
#    flag it) so the store build talks only to recruiterstack.in
#  - zips the result to extension/recruiterstack-extension.zip
#
# Run from the repo root:  bash extension/package.sh

set -euo pipefail
cd "$(dirname "$0")"                 # -> extension/

BUILD=build
ZIP=recruiterstack-extension.zip

rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD/icons"

# Runtime files only.
cp manifest.json background.js content.js content.css \
   options.html options.js popup.html popup.js "$BUILD/"
cp icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png "$BUILD/icons/"

# Remove the localhost host permission from the store build.
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("'"$BUILD"'/manifest.json", "utf8"));
  m.host_permissions = (m.host_permissions || []).filter(h => !h.includes("localhost"));
  fs.writeFileSync("'"$BUILD"'/manifest.json", JSON.stringify(m, null, 2) + "\n");
  console.log("  store manifest host_permissions:", JSON.stringify(m.host_permissions));
'

( cd "$BUILD" && zip -rq "../$ZIP" . -x "*.DS_Store" )
echo "  wrote $(pwd)/$ZIP"
echo "Done."
