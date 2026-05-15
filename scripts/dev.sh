#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SOCKET_PATH="$HOME/Library/Application Support/ai-interview/sidecar.sock"

(cd sidecar && swift run SidecarApp) &
SIDECAR_PID=$!

trap "kill $SIDECAR_PID 2>/dev/null || true; rm -f \"$SOCKET_PATH\"" EXIT

pnpm --filter app dev
