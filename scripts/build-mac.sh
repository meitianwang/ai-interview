#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

swift build -c release --package-path sidecar

mkdir -p app/resources
install -m 755 sidecar/.build/release/SidecarApp app/resources/sidecar

builder_args=()
if [[ -n "${MAC_CODESIGN_IDENTITY:-}" ]]; then
  builder_args+=(--config.mac.identity="$MAC_CODESIGN_IDENTITY")
else
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  builder_args+=(--config.mac.identity=null)
fi

pnpm --filter app exec vite build
pnpm --filter app exec electron-builder "${builder_args[@]}"
