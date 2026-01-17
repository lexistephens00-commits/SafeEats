#!/usr/bin/env bash
set -e

NETRC_PATH="$HOME/.netrc"

printf "machine api.mapbox.com\nlogin mapbox\npassword %s\n" "$MAPBOX_DOWNLOADS_TOKEN" > "$NETRC_PATH"

chmod 600 "$NETRC_PATH" || true

echo "âœ… Wrote $NETRC_PATH (attempted chmod 600)"
ls -la "$NETRC_PATH" || true