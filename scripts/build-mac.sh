#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

swift build -c release --package-path sidecar

mkdir -p app/resources
install -m 755 sidecar/.build/release/SidecarApp app/resources/sidecar

pnpm --filter app build
