#!/usr/bin/env bash
set -e

cat > ~/.netrc <<EOF
machine api.mapbox.com
login mapbox
password ${MAPBOX_DOWNLOADS_TOKEN}
EOF

chmod 600 ~/.netrc
echo "✅ Wrote ~/.netrc for Mapbox downloads"
