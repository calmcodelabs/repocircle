#!/usr/bin/env bash
# Generate or verify visual baselines inside the Playwright container.
#
# Never run `--update-snapshots` on a developer machine: font rasterisation and
# subpixel hinting differ between operating systems, so a locally generated
# baseline fails for everybody else and for CI. The container is the only
# environment whose rendering is reproducible, which makes it the only place a
# baseline is allowed to come from (TESTING.md §2, L6).
#
#   scripts/visual-baselines.sh update   # (re)generate baselines
#   scripts/visual-baselines.sh          # verify against them
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="mcr.microsoft.com/playwright:v1.56.0-noble"
MODE="${1:-verify}"
ARGS="--project=visual"
[ "$MODE" = "update" ] && ARGS="$ARGS --update-snapshots"

echo "Running the visual project in $IMAGE ($MODE)"
docker run --rm --init --ipc=host \
  -v "$PWD":/work -w /work \
  -e CI=1 \
  "$IMAGE" \
  bash -lc "npx playwright test $ARGS"
