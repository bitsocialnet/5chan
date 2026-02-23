# Agent Hooks Setup

If your AI coding assistant supports lifecycle hooks, configure these for this repo.

## Recommended Hooks

| Hook | Command | Purpose |
|---|---|---|
| `afterFileEdit` | `npx oxfmt <file>` | Auto-format files after AI edits |
| `afterFileEdit` | `.cursor/hooks/yarn-install.sh` | Run `yarn install` when `package.json` changes |
| `stop` | `yarn build && yarn lint && yarn type-check && (yarn audit || true)` | Build, lint, type-check, and security audit at end |

## Why

- Consistent formatting
- Lockfile stays in sync
- Build/lint/type issues caught early
- Security visibility via `yarn audit`

## Example Hook Scripts

### Format Hook

```bash
#!/bin/bash
# Auto-format JS/TS files after AI edits
# Hook receives JSON via stdin with file_path

input=$(cat)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

case "$file_path" in
  *.js|*.ts|*.tsx|*.mjs) npx oxfmt "$file_path" 2>/dev/null ;;
esac
exit 0
```

### Verify Hook

```bash
#!/bin/bash
# Run build, lint, type-check, and security audit when agent finishes

cat > /dev/null  # consume stdin
echo "=== yarn build ===" && yarn build
echo "=== yarn lint ===" && yarn lint
echo "=== yarn type-check ===" && yarn type-check
echo "=== yarn audit ===" && (yarn audit || true)  # informational
exit 0
```

### Yarn Install Hook

```bash
#!/bin/bash
# Run yarn install when package.json is changed
# Hook receives JSON via stdin with file_path

input=$(cat)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

if [ -z "$file_path" ]; then
  exit 0
fi

if [ "$file_path" = "package.json" ]; then
  cd "$(dirname "$0")/../.." || exit 0
  echo "package.json changed - running yarn install to update yarn.lock..."
  yarn install
fi

exit 0
```

Configure hook wiring according to your agent tool docs (`hooks.json`, equivalent, etc.).
