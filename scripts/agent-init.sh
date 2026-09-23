#!/bin/bash

set -euo pipefail

run_smoke=0

get_default_app_url() {
  if [ "${PORTLESS:-}" = "0" ]; then
    echo "http://localhost:3000"
    return
  fi

  local branch branch_label

  branch="$(git branch --show-current 2>/dev/null || true)"

  if [ -n "$branch" ] && [ "$branch" != "master" ] && [ "$branch" != "main" ]; then
    branch_label="$(
      printf '%s' "$branch" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
    )"

    if [ -n "$branch_label" ]; then
      echo "https://${branch_label}.5chan.localhost"
      return
    fi
  fi

  echo "https://5chan.localhost"
}

app_url="${AGENT_APP_URL:-$(get_default_app_url)}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --smoke)
      run_smoke=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: ./scripts/agent-init.sh [--smoke]" >&2
      exit 1
      ;;
  esac
  shift
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Repo root: $repo_root"
echo "App URL: $app_url"

if ! curl --max-time 10 -fsSk "$app_url" >/dev/null; then
  echo "No reachable task server. Start yarn start in an owned terminal, record its process/session, then rerun with AGENT_APP_URL set to its URL." >&2
  exit 1
fi

echo "Dev server is ready."

if [ "$run_smoke" -eq 1 ]; then
  echo "Running smoke flow against the live dev server..."
  SMOKE_BASE_URL="${app_url%/}/#/" node scripts/smoke-web-app.js
fi
