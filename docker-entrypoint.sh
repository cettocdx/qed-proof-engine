#!/bin/sh
# QED entrypoint — wires the persistent /data volume into the app.
#
# All app code writes to <cwd>/lib/data (ledger, positions, caches, params).
# In the cloud that path must live on the mounted volume or every deploy
# wipes the track record. Strategy: symlink lib/data -> /data, seeding the
# volume from the image on first boot.

set -e

if [ -d /data ]; then
  # First boot: seed the volume with whatever shipped in the image
  if [ ! -f /data/.seeded ]; then
    cp -rn /app/seed-data/. /data/ 2>/dev/null || true
    touch /data/.seeded
    echo "[entrypoint] seeded /data from image"
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
