#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/redalert2"
ANDROID="$ROOT/android"
GAMERES="$ROOT/gameres-export"

SKIP_WEB=0
RELEASE=0
INSTALL=0
VARIANT="yr"

for arg in "$@"; do
  case "$arg" in
    --no-web) SKIP_WEB=1 ;;
    --release) RELEASE=1 ;;
    --install) INSTALL=1 ;;
    --ra2) VARIANT="ra2" ;;
  esac
done

for csf in general.csf generalmd.csf; do
  if [ ! -s "$WEB/public/$csf" ]; then
    printf '\033[31merror:\033[0m redalert2/public/%s is missing.\n' "$csf" >&2
    echo "  Run ./scripts/setup-android.sh \"/path/to/your/ra2/install\" first." >&2
    exit 1
  fi
done

if [ ! -d "$GAMERES" ]; then
  echo "error: $GAMERES not found. Run setup first." >&2
  exit 1
fi

if [ $SKIP_WEB -eq 0 ]; then
  echo "==> Building web app"
  (cd "$WEB" && npx vite build)
fi

echo "==> Staging WebDist ($VARIANT)"
rm -rf "$ANDROID/app/src/main/assets/WebDist"
mkdir -p "$ANDROID/app/src/main/assets/WebDist"
cp -R "$WEB/dist/"* "$ANDROID/app/src/main/assets/WebDist/"
rm -rf "$ANDROID/app/src/main/assets/WebDist/local-pack"

echo "==> Staging GameRes ($VARIANT)"
rm -rf "$ANDROID/app/src/main/assets/GameRes"
mkdir -p "$ANDROID/app/src/main/assets/GameRes"
cp -R "$GAMERES/"* "$ANDROID/app/src/main/assets/GameRes/"

if [ "$VARIANT" == "ra2" ]; then
  rm -f "$ANDROID/app/src/main/assets/GameRes"/{ra2md.mix,langmd.mix,multimd.mix,expandmd01.mix}
  rm -f "$ANDROID/app/src/main/assets/GameRes"/*.yro
fi

echo "==> Building Android APK"
TASK="assembleDebug"
if [ $RELEASE -eq 1 ]; then TASK="assembleRelease"; fi

(cd "$ANDROID" && ./gradlew $TASK)

APK_PATH="$ANDROID/app/build/outputs/apk/debug/app-debug.apk"
if [ $RELEASE -eq 1 ]; then
  APK_PATH="$ANDROID/app/build/outputs/apk/release/app-release-unsigned.apk"
fi

echo "==> Build successful: $APK_PATH"

if [ $INSTALL -eq 1 ]; then
  echo "==> Installing to device"
  adb install -r "$APK_PATH"
  adb shell am start -n com.ammaar.ra2android.debug/com.ammaar.ra2android.MainActivity
fi