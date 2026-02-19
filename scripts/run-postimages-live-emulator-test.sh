#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"

API_LEVEL="${ANDROID_API_LEVEL:-35}"
HOST_ARCH="$(uname -m)"
DEFAULT_ABI="x86_64"
if [[ "$HOST_ARCH" == "arm64" || "$HOST_ARCH" == "aarch64" ]]; then
  DEFAULT_ABI="arm64-v8a"
fi
ABI="${ANDROID_ABI:-$DEFAULT_ABI}"
TAG="${ANDROID_TAG:-google_apis}"
SYSTEM_IMAGE_PACKAGE="system-images;android-${API_LEVEL};${TAG};${ABI}"
SYSTEM_IMAGE_DIR="system-images/android-${API_LEVEL}/${TAG}/${ABI}"
AVD_NAME="${ANDROID_AVD_NAME:-fivechan-postimages-api${API_LEVEL}}"
DEVICE_PROFILE="${ANDROID_DEVICE_PROFILE:-pixel_6}"
TEST_CLASS="${ANDROID_TEST_CLASS:-fivechan.android.PostimagesLiveUploadTest}"
KEEP_EMULATOR="${KEEP_EMULATOR:-0}"

if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  SDK_ROOT="$ANDROID_SDK_ROOT"
elif [[ -n "${ANDROID_HOME:-}" ]]; then
  SDK_ROOT="$ANDROID_HOME"
elif [[ -d "$HOME/Library/Android/sdk" ]]; then
  SDK_ROOT="$HOME/Library/Android/sdk"
else
  SDK_ROOT=""
fi

resolve_tool() {
  local tool="$1"
  shift || true
  local candidate=""
  for dir in "$@"; do
    if [[ -n "$dir" && -x "$dir/$tool" ]]; then
      candidate="$dir/$tool"
      break
    fi
  done
  if [[ -z "$candidate" ]] && command -v "$tool" >/dev/null 2>&1; then
    candidate="$(command -v "$tool")"
  fi
  printf '%s' "$candidate"
}

sdk_tool_dir() {
  local relative="$1"
  if [[ -z "$SDK_ROOT" ]]; then
    printf ''
    return
  fi
  printf '%s/%s' "$SDK_ROOT" "$relative"
}

SDKMANAGER_BIN="$(resolve_tool "sdkmanager" "$(sdk_tool_dir "cmdline-tools/latest/bin")" "$(sdk_tool_dir "cmdline-tools/bin")" "$(sdk_tool_dir "tools/bin")")"
AVDMANAGER_BIN="$(resolve_tool "avdmanager" "$(sdk_tool_dir "cmdline-tools/latest/bin")" "$(sdk_tool_dir "cmdline-tools/bin")" "$(sdk_tool_dir "tools/bin")")"
ADB_BIN="$(resolve_tool "adb" "$(sdk_tool_dir "platform-tools")")"
EMULATOR_BIN="$(resolve_tool "emulator" "$(sdk_tool_dir "emulator")")"

missing_sdk_component=0
if [[ -z "$SDK_ROOT" || ! -d "$SDK_ROOT" ]]; then
  missing_sdk_component=1
fi
if [[ -z "$ADB_BIN" || -z "$EMULATOR_BIN" || -z "$AVDMANAGER_BIN" ]]; then
  missing_sdk_component=1
fi
if [[ -n "$SDK_ROOT" ]]; then
  if [[ ! -d "$SDK_ROOT/platforms/android-${API_LEVEL}" ]]; then
    missing_sdk_component=1
  fi
  if [[ ! -d "$SDK_ROOT/$SYSTEM_IMAGE_DIR" ]]; then
    missing_sdk_component=1
  fi
fi

if [[ "$missing_sdk_component" -eq 1 ]]; then
  if [[ -z "$SDKMANAGER_BIN" ]]; then
    echo "Android SDK components are missing and sdkmanager was not found."
    echo "Install Android command-line tools, then rerun this script."
    exit 1
  fi
  echo "Installing/updating Android SDK components for API ${API_LEVEL}..."
  yes | "$SDKMANAGER_BIN" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER_BIN" --install \
    "platform-tools" \
    "emulator" \
    "platforms;android-${API_LEVEL}" \
    "$SYSTEM_IMAGE_PACKAGE"

  # Re-resolve after installation
  if [[ -z "$SDK_ROOT" ]]; then
    SDK_ROOT="$(dirname "$(dirname "$(dirname "$SDKMANAGER_BIN")")")"
  fi
  ADB_BIN="$(resolve_tool "adb" "$(sdk_tool_dir "platform-tools")")"
  EMULATOR_BIN="$(resolve_tool "emulator" "$(sdk_tool_dir "emulator")")"
  AVDMANAGER_BIN="$(resolve_tool "avdmanager" "$(sdk_tool_dir "cmdline-tools/latest/bin")" "$(sdk_tool_dir "cmdline-tools/bin")" "$(sdk_tool_dir "tools/bin")")"
fi

if [[ -z "$ADB_BIN" || -z "$EMULATOR_BIN" || -z "$AVDMANAGER_BIN" ]]; then
  echo "Could not locate required Android tools (adb/emulator/avdmanager)."
  exit 1
fi

first_online_emulator() {
  "$ADB_BIN" devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1; exit }'
}

if ! "$EMULATOR_BIN" -list-avds | awk -v avd="$AVD_NAME" '$0 == avd { found = 1 } END { exit found ? 0 : 1 }'; then
  echo "Creating AVD: $AVD_NAME ($SYSTEM_IMAGE_PACKAGE)"
  echo "no" | "$AVDMANAGER_BIN" create avd --name "$AVD_NAME" --package "$SYSTEM_IMAGE_PACKAGE" --device "$DEVICE_PROFILE" --force
fi

avd_config="$HOME/.android/avd/${AVD_NAME}.avd/config.ini"
if [[ -f "$avd_config" ]] && ! awk -v expected="abi.type=${ABI}" '$0 == expected { found = 1 } END { exit found ? 0 : 1 }' "$avd_config"; then
  echo "Recreating AVD $AVD_NAME for ABI $ABI"
  "$AVDMANAGER_BIN" delete avd --name "$AVD_NAME" >/dev/null 2>&1 || true
  echo "no" | "$AVDMANAGER_BIN" create avd --name "$AVD_NAME" --package "$SYSTEM_IMAGE_PACKAGE" --device "$DEVICE_PROFILE" --force
fi

started_emulator=0
serial="${ANDROID_SERIAL:-}"
if [[ -z "$serial" ]]; then
  serial="$(first_online_emulator)"
fi

if [[ -z "$serial" ]]; then
  echo "Starting emulator AVD: $AVD_NAME"
  "$EMULATOR_BIN" -avd "$AVD_NAME" -no-boot-anim -no-snapshot-save -netdelay none -netspeed full >/tmp/postimages-live-emulator.log 2>&1 &
  emulator_pid=$!
  started_emulator=1

  for _ in {1..90}; do
    if ! kill -0 "$emulator_pid" >/dev/null 2>&1; then
      break
    fi
    serial="$(first_online_emulator)"
    if [[ -n "$serial" ]]; then
      break
    fi
    sleep 2
  done
fi

if [[ -z "$serial" ]]; then
  echo "Failed to detect running emulator serial. Check /tmp/postimages-live-emulator.log"
  exit 1
fi

cleanup() {
  if [[ "$started_emulator" -eq 1 && "$KEEP_EMULATOR" != "1" ]]; then
    "$ADB_BIN" -s "$serial" emu kill >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Using emulator serial: $serial"
"$ADB_BIN" -s "$serial" wait-for-device

boot_completed=""
for _ in {1..180}; do
  boot_completed="$("$ADB_BIN" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  if [[ "$boot_completed" == "1" ]]; then
    break
  fi
  sleep 2
done

if [[ "$boot_completed" != "1" ]]; then
  echo "Emulator did not finish booting in time."
  exit 1
fi

"$ADB_BIN" -s "$serial" shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
"$ADB_BIN" -s "$serial" shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
"$ADB_BIN" -s "$serial" shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true

echo "Running live postimages upload instrumentation test..."
pushd "$ANDROID_DIR" >/dev/null
ANDROID_SERIAL="$serial" ./gradlew \
  :app:connectedDebugAndroidTest \
  -Pandroid.experimental.androidTest.useUnifiedTestPlatform=false \
  -Pandroid.testInstrumentationRunnerArguments.class="$TEST_CLASS"
popd >/dev/null

echo "Live postimages upload test completed."
