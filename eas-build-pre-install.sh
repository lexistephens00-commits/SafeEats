#!/usr/bin/env bash
set -euo pipefail

NETRC_PATH="$HOME/.netrc"

# Write netrc (no extra whitespace)
printf "machine api.mapbox.com\nlogin mapbox\npassword %s\n" "$MAPBOX_DOWNLOADS_TOKEN" > "$NETRC_PATH"

# Force correct permissions
chmod 600 "$NETRC_PATH"

# Sanity check: fail the build if permissions are wrong
PERM="$(stat -f '%Lp' "$NETRC_PATH" 2>/dev/null || true)"
if [ "$PERM" != "600" ]; then
  echo "❌ .netrc permissions are $PERM, expected 600"
  ls -la "$NETRC_PATH"
  exit 1
fi

echo "✅ Wrote $NETRC_PATH with 600 permissions"
