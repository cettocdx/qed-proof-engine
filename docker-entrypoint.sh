#!/bin/sh
# QED entrypoint — wires the persistent /data volume into the app.
#
# All app code writes to <cwd>/lib/data (ledger, positions, caches, params).
# In the cloud that path must live on the mounted volume or every deploy
# wipes the track record. Strategy: symlink lib/data -> /data, seeding the
# volume from the image on first boot.

set -e

if [ -d /data ]; then
  # Seed the volume when the image carries a newer seed version.
  # Bump lib/data/.seed-version locally to force a one-time data refresh
  # on the next deploy (used to ship the local track record to the cloud).
  IMG_VER=$(cat /app/seed-data/.seed-version 2>/dev/null || echo 0)
  VOL_VER=$(cat /data/.seed-version 2>/dev/null || echo -1)
  if [ "$IMG_VER" != "$VOL_VER" ]; then
    cp -rf /app/seed-data/. /data/ 2>/dev/null || true
    echo "[entrypoint] reseeded /data from image (seed v$IMG_VER)"
  fi
  mkdir -p /app/lib
  rm -rf /app/lib/data
  ln -s /data /app/lib/data
  echo "[entrypoint] lib/data -> /data (persistent)"
else
  # No volume (local docker run) — keep image-local data
  mkdir -p /app/lib
  [ -e /app/lib/data ] || cp -r /app/seed-data /app/lib/data
  echo "[entrypoint] WARNING: no /data volume — track record is ephemeral"
fi

exec node server.js
