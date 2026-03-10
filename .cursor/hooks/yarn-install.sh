#!/bin/bash
# afterFileEdit hook: Run yarn install when package.json is changed
# Receives JSON via stdin: {"file_path": "...", "edits": [...]}

# Read stdin (required for hooks)
input=$(cat)

# Extract file_path using grep/sed (jq-free for portability)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Exit if no file path found
if [ -z "$file_path" ]; then
  exit 0
fi

# Only run yarn install if package.json was changed
if [ "$file_path" = "package.json" ]; then
  # Change to project directory
  cd "$(dirname "$0")/../.." || exit 0
  
  echo "package.json changed - running yarn install to update yarn.lock..."
  yarn install
fi

exit 0
