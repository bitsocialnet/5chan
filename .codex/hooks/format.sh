#!/bin/bash
# afterFileEdit hook: Auto-format files after AI edits them
# Receives JSON via stdin: {"file_path": "...", "edits": [...]}

# Read stdin (required for hooks)
input=$(cat)

# Extract file_path using grep/sed (jq-free for portability)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Exit if no file path found
if [ -z "$file_path" ]; then
  exit 0
fi

# Only format JS/TS files
case "$file_path" in
  *.js|*.ts|*.tsx|*.mjs)
    # Run oxfmt on the file (silent on success)
    npx oxfmt "$file_path" 2>/dev/null || true
    ;;
esac

exit 0
