#!/usr/bin/env bash
# Generate or verify visual baselines inside the Playwright container.
#
# Never run `--update-snapshots` on a developer machine. Font rasterisation and
# subpixel hinting differ between operating systems and even between font
# versions, so a locally generated baseline fails for everybody else and for CI.
# The container is the only rendering environment that reproduces, which makes
# it the only place a baseline is allowed to come from (TESTING.md §2, L6).
#
#   scripts/visual-baselines.sh update   # (re)generate baselines
#   scripts/visual-baselines.sh          # verify against them
#
# The image tag is derived from the installed @playwright/test version rather
# than hard-coded: a mismatch means the container's bundled browser is not the
# one the test runner expects, which produces baselines nobody can reproduce.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
MODE="${1:-verify}"

ARGS="--project=visual"
if [ "$MODE" = "update" ]; then
  ARGS="$ARGS --update-snapshots"
fi

echo "Playwright $VERSION -> $IMAGE ($MODE)"

# The visual specs run against the emulator-mode build, which means the suite
# boots the Firestore emulator — and that is a JVM. The Playwright image does
# not ship a JRE, so install one inside the container if it is missing. Doing it
# here rather than in a Dockerfile keeps this to one file and one command.
# The container runs as root — installing the JRE requires it — but everything
# it writes into the mounted tree would then be root-owned, and the next local
# run cannot even delete its own build output. So hand ownership back on the way
# out, including when the tests fail, which is exactly when the artifacts matter.
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

RUN_SCRIPT='
set -e
give_back() { chown -R '"$HOST_UID:$HOST_GID"' /work/test/e2e /work/reports /work/dist-emulator 2>/dev/null || true; }
trap give_back EXIT

if ! command -v java >/dev/null 2>&1; then
  echo "[visual] installing a headless JRE for the Firestore emulator"
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends default-jre-headless >/dev/null
fi
java -version 2>&1 | head -1
npx playwright test '"$ARGS"'
'

docker run --rm --init --ipc=host \
  -v "$PWD":/work -w /work \
  -e CI=1 \
  -e HOME=/tmp \
  "$IMAGE" \
  bash -lc "$RUN_SCRIPT"

if [ "$MODE" = "update" ]; then
  echo
  echo "Baselines written. Review the images before committing them —"
  echo "an accepted-but-wrong baseline silently blesses a visual bug."
  git status --short "test/e2e" | sed 's/^/  /'
fi
