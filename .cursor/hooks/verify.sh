#!/bin/bash
# stop hook: Run build, lint, type-check, and security audit when agent finishes
# This is informational - always exits 0

# Consume stdin (required for hooks)
cat > /dev/null

# Change to project directory
cd "$(dirname "$0")/../.." || exit 0

cleanup_generated_dir() {
  local path="$1"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return
  fi

  if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    if git diff --quiet -- "$path"; then
      return
    fi

    echo "=== git restore --worktree $path ==="
    git restore --worktree -- "$path" 2>&1 || true
    echo ""
    return
  fi

  if [ -e "$path" ]; then
    echo "=== rm -rf $path ==="
    rm -rf "$path" 2>&1 || true
    echo ""
  fi
}

echo "Running build, lint, type-check, and security audit..."
echo ""

# Run build (catches compilation errors)
echo "=== yarn build ==="
yarn build 2>&1 || true
echo ""

# Run lint
echo "=== yarn lint ==="
yarn lint 2>&1 || true
echo ""

# Run type-check
echo "=== yarn type-check ==="
yarn type-check 2>&1 || true
echo ""

# Run security audit
echo "=== yarn audit ==="
yarn audit 2>&1 || true
echo ""

cleanup_generated_dir build
cleanup_generated_dir dist

echo "Verification complete."
exit 0
