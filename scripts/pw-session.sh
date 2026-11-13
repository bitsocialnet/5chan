#!/bin/bash

set -euo pipefail
umask 077

# pw-session.sh — shared resource lock for playwright-cli browser sessions.
#
# Playwright disables normal background throttling, so a hidden 5chan page keeps
# doing P2P and rendering work after a check finishes. Agents verifying in
# parallel therefore stack whole browser engines on one machine. This wrapper
# permits one active Playwright browser at a time and records who holds it.
#
# The lock is machine-wide, not per-repository: the contended resource is RAM and
# CPU, so every checkout that ships this script shares a single slot. Set
# PLAYWRIGHT_RESOURCE_LOCK_DIR to isolate a lock (tests, or a deliberate second
# slot on a machine with headroom).
#
# Liveness comes from `playwright-cli list --all`, which reports `status: open`
# for a running browser. A lock whose recorded session is no longer open is
# stale, and is reclaimed automatically rather than blocking every later
# workflow. A lock younger than the launch grace period is never stale: its
# owner may still be writing it, and playwright-cli lists a new browser only
# once it is running. When playwright-cli cannot be queried the lock is left
# alone, so a broken CLI never silently disables the budget.
#
# PW_SESSION_POLL_SECONDS overrides how often `--wait` re-checks the slot.

usage() {
  cat <<'EOF'
Usage:
  ./scripts/pw-session.sh open [--wait[=SECONDS]] <session> [playwright-cli open arguments...]
  ./scripts/pw-session.sh close <session>
  ./scripts/pw-session.sh status
  ./scripts/pw-session.sh release <session>

One browser slot is shared by every worktree and repository on this machine.

  open     Acquire the slot, then start the browser. Exits 75 when the slot is
           held by a live or starting session; --wait polls until it frees
           (default 300s). A slot whose browser is gone is reclaimed
           automatically once it is a minute old.
  close    Stop the named browser, then release the slot. Always attempts the
           browser close, even when the lock was already lost, and never
           releases a slot held by a different session.
  status   Report the holder and whether its browser is still running.
  release  Drop a lock without closing a browser. Normal cleanup uses `close`.
EOF
}

playwright_cli="${PLAYWRIGHT_CLI_BIN:-playwright-cli}"

# Resolved in order so an explicit override never depends on HOME being set:
# some sandboxes, CI runners, and test harnesses start without it.
if [ -n "${PLAYWRIGHT_RESOURCE_LOCK_DIR:-}" ]; then
  lock_dir="$PLAYWRIGHT_RESOURCE_LOCK_DIR"
elif [ -n "${XDG_CACHE_HOME:-}" ]; then
  lock_dir="$XDG_CACHE_HOME/bitsocial/playwright-session.lock"
elif [ -n "${HOME:-}" ]; then
  lock_dir="$HOME/.cache/bitsocial/playwright-session.lock"
else
  echo "pw-session: set HOME, XDG_CACHE_HOME, or PLAYWRIGHT_RESOURCE_LOCK_DIR so the lock has a home" >&2
  exit 1
fi

owner_file="$lock_dir/owner"
started_file="$lock_dir/started-at"
workspace_file="$lock_dir/workspace"
default_wait_seconds=300
poll_seconds="${PW_SESSION_POLL_SECONDS:-5}"
# Matches the 60s that scripts/react-perf/browser.mjs allows `open` to take.
launch_grace_seconds=60
reclaim_mutex="${lock_dir}.reclaim"
# A reclaim holds its mutex for milliseconds; one left by a killed reclaimer is broken after this.
reclaim_mutex_timeout_seconds=10
# Waits for the mutex poll every 0.1s, so this outlasts the timeout above before giving up.
reclaim_mutex_max_polls=120

# Recorded for diagnostics only: the lock is machine-wide, so a checkout outside
# a Git worktree is unusual but not an error.
workspace="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

validate_session() {
  local session="$1"

  if [[ ! "$session" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$ ]]; then
    echo "pw-session: session must be 1-40 characters using letters, numbers, '.', '_', or '-'" >&2
    exit 1
  fi
}

current_owner() {
  if [ -f "$owner_file" ]; then
    sed -n '1p' "$owner_file"
  fi
}

# Echoes `live`, `dead`, or `unknown` for a session name. `unknown` means the
# browser list could not be read, and callers must treat the lock as held.
session_state() {
  local session="$1" listing line current=''

  if ! listing="$("$playwright_cli" list --all 2>/dev/null)"; then
    echo unknown
    return 0
  fi

  # `playwright-cli list --all` prints a `- <session>:` header per browser,
  # followed by indented fields including `  - status: open|closed`.
  while IFS= read -r line; do
    case "$line" in
      '- '*':')
        current="${line#- }"
        current="${current%:}"
        ;;
      '  - status: open')
        if [ "$current" = "$session" ]; then
          echo live
          return 0
        fi
        ;;
    esac
  done <<<"$listing"

  echo dead
}

dir_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

# Succeeds while the slot is younger than the launch grace period. The lock
# directory's modification time is when its metadata was written. A time more
# than the grace period ahead, such as after the clock was set back, does not
# count as young, so a dead lock is not kept until that date.
lock_is_young() {
  local modified age

  modified="$(dir_mtime "$lock_dir")" || return 1
  age=$(($(date +%s) - modified))
  [ "$age" -gt "-$launch_grace_seconds" ] && [ "$age" -lt "$launch_grace_seconds" ]
}

# Echoes `live`, `starting`, `dead`, or `unknown` for the held slot. `starting`
# is a young slot without a running browser, which is not stale yet.
slot_state() {
  local owner="$1" state=dead

  if [ -n "$owner" ]; then
    state="$(session_state "$owner")"
  fi
  if [ "$state" = dead ] && lock_is_young; then
    state=starting
  fi
  echo "$state"
}

write_lock_metadata() {
  printf '%s\n' "$1" >"$owner_file"
  date -u '+%Y-%m-%dT%H:%M:%SZ' >"$started_file"
  printf '%s\n' "$workspace" >"$workspace_file"
}

print_status() {
  local owner started held_workspace state

  if [ ! -d "$lock_dir" ]; then
    echo "pw-session: browser slot is available"
    return 0
  fi

  owner="$(current_owner)"
  started="$(sed -n '1p' "$started_file" 2>/dev/null || true)"
  held_workspace="$(sed -n '1p' "$workspace_file" 2>/dev/null || true)"
  state="$(slot_state "$owner")"

  case "$state" in
    live) echo "pw-session: browser slot is held" ;;
    starting) echo "pw-session: browser slot is held (browser starting)" ;;
    dead) echo "pw-session: browser slot is held by a stale lock" ;;
    *) echo "pw-session: browser slot is held (browser state unverifiable)" ;;
  esac

  echo "Session: ${owner:-unknown}"
  echo "Started: ${started:-unknown}"
  echo "Workspace: ${held_workspace:-unknown}"
  echo "Lock: $lock_dir"

  case "$state" in
    live) echo "Browser: running" ;;
    starting)
      echo "Browser: not running yet — the slot counts as stale only once it is ${launch_grace_seconds}s old"
      ;;
    dead)
      echo "Browser: not running — the next 'open' reclaims this slot automatically"
      ;;
    *)
      echo "Browser: unverifiable — '$playwright_cli list --all' failed, so the lock is left alone"
      ;;
  esac
}

# Bounded so a stuck mutex fails loudly instead of spinning or waiting forever. Fails when the
# mutex can be neither created nor broken, such as in an unwritable directory or when it is not an
# empty directory, or is still held once the polls run out, such as one dated in the future.
take_reclaim_mutex() {
  local misses=0 polls=0 modified

  until mkdir "$reclaim_mutex" 2>/dev/null; do
    if ! modified="$(dir_mtime "$reclaim_mutex")"; then
      misses=$((misses + 1))
    elif [ "$(($(date +%s) - modified))" -ge "$reclaim_mutex_timeout_seconds" ]; then
      rmdir "$reclaim_mutex" 2>/dev/null || misses=$((misses + 1))
    else
      misses=0
      polls=$((polls + 1))
      [ "$polls" -le "$reclaim_mutex_max_polls" ] || return 1
      sleep 0.1
    fi
    [ "$misses" -lt 3 ] || return 1
  done
}

# Drop a lock judged stale. The verdict can be out of date by the time it is acted
# on: another opener may have reclaimed that lock and taken the slot since, or its
# browser may have come up. So reclaimers take turns through a mutex, and each one
# moves the lock only if it is still the one it judged: same owner, past the launch
# grace period, and still without a running browser. A lock taken after an earlier
# reclaim is young, so it is left alone. Fails only when the mutex cannot be taken.
reclaim_stale_lock() {
  local owner="$1" staged="${lock_dir}.stale.$$" moved=0

  if ! take_reclaim_mutex; then
    if [ -e "$reclaim_mutex" ]; then
      echo "pw-session: could not take or break the reclaim mutex at $reclaim_mutex; remove it by hand if no 'open' is running" >&2
    fi
    return 1
  fi
  if [ -d "$lock_dir" ] && [ "$(current_owner)" = "$owner" ] && [ "$(slot_state "$owner")" = dead ] &&
    mv "$lock_dir" "$staged" 2>/dev/null; then
    moved=1
  fi
  rmdir "$reclaim_mutex" 2>/dev/null || true

  if [ "$moved" = 1 ]; then
    rm -rf "$staged"
    echo "pw-session: reclaimed stale slot from '${owner:-unknown}' (its browser is no longer running)" >&2
  fi
}

acquire() {
  local session="$1" wait_seconds="$2" owner state reclaims=0

  validate_session "$session"
  mkdir -p "$(dirname "$lock_dir")"

  SECONDS=0
  while true; do
    if mkdir "$lock_dir" 2>/dev/null; then
      write_lock_metadata "$session"
      echo "pw-session: acquired browser slot for '$session'"
      return 0
    fi

    owner="$(current_owner)"
    state="$(slot_state "$owner")"

    # Bounded so an unremovable lock directory fails loudly instead of spinning.
    if [ "$state" = dead ] && [ "$reclaims" -lt 3 ]; then
      reclaims=$((reclaims + 1))
      # Without the reclaim mutex, another attempt would fail the same way.
      reclaim_stale_lock "$owner" || reclaims=3
      continue
    fi

    if [ "$state" = dead ]; then
      print_status >&2
      echo "pw-session: could not reclaim the stale slot at $lock_dir; remove it by hand" >&2
      return 75
    fi

    if [ "$wait_seconds" -gt 0 ] && [ "$SECONDS" -lt "$wait_seconds" ]; then
      echo "pw-session: slot held by '${owner:-unknown}'; retrying in ${poll_seconds}s (waited ${SECONDS}s of ${wait_seconds}s)" >&2
      sleep "$poll_seconds"
      continue
    fi

    print_status >&2
    if [ "$wait_seconds" -gt 0 ]; then
      echo "pw-session: gave up after ${wait_seconds}s; do not bypass the lock" >&2
    else
      echo "pw-session: another browser workflow is active; do not bypass the lock" >&2
    fi
    return 75
  done
}

release() {
  local session="$1" owner

  validate_session "$session"
  if [ ! -d "$lock_dir" ]; then
    echo "pw-session: browser slot is already available"
    return 0
  fi

  owner="$(current_owner)"
  if [ "$owner" != "$session" ]; then
    echo "pw-session: '$session' cannot release the slot held by '${owner:-unknown}'" >&2
    if [ -n "$owner" ] && [ "$(slot_state "$owner")" = dead ]; then
      echo "pw-session: that lock is stale; the next 'open' reclaims it automatically" >&2
    fi
    return 1
  fi

  rm -f "$owner_file" "$started_file" "$workspace_file"
  rmdir "$lock_dir"
  echo "pw-session: released browser slot for '$session'"
}

command="${1:-}"
case "$command" in
  open)
    shift
    wait_seconds=0
    session=''
    open_args=()

    # `--wait` is accepted anywhere so `open <session> --wait` is not a silent
    # no-op. `playwright-cli open` has no --wait of its own, so nothing that
    # belongs to it is swallowed here. The first bare argument is the session;
    # the rest pass through untouched.
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --wait)
          wait_seconds="$default_wait_seconds"
          ;;
        --wait=*)
          wait_seconds="${1#--wait=}"
          if [[ ! "$wait_seconds" =~ ^[0-9]+$ ]]; then
            echo "pw-session: --wait expects a whole number of seconds" >&2
            exit 1
          fi
          ;;
        *)
          if [ -z "$session" ]; then
            session="$1"
          else
            open_args+=("$1")
          fi
          ;;
      esac
      shift
    done

    if [ -z "$session" ]; then
      usage >&2
      exit 1
    fi

    acquire "$session" "$wait_seconds"
    # Guarded expansion: Bash 3.2 (macOS /bin/bash) errors on an empty array
    # under `set -u`.
    if ! "$playwright_cli" -s="$session" open ${open_args[@]+"${open_args[@]}"}; then
      release "$session"
      exit 1
    fi
    ;;
  close)
    session="${2:-}"
    if [ -z "$session" ] || [ "$#" -ne 2 ]; then
      usage >&2
      exit 1
    fi
    validate_session "$session"

    # Cleanup must always stop the browser, even when the lock was lost, so a
    # failed workflow cannot strand a running engine.
    owner="$(current_owner)"
    close_status=0
    "$playwright_cli" -s="$session" close || close_status=$?
    if [ "$close_status" -ne 0 ]; then
      echo "pw-session: warning: closing browser '$session' exited $close_status" >&2
    fi

    if [ -z "$owner" ]; then
      echo "pw-session: browser slot was already free; closed '$session' anyway"
    elif [ "$owner" = "$session" ]; then
      release "$session"
    else
      echo "pw-session: closed '$session'; left the slot held by '$owner' untouched" >&2
    fi
    ;;
  status)
    if [ "$#" -ne 1 ]; then
      usage >&2
      exit 1
    fi
    print_status
    ;;
  release)
    session="${2:-}"
    if [ -z "$session" ] || [ "$#" -ne 2 ]; then
      usage >&2
      exit 1
    fi
    release "$session"
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
