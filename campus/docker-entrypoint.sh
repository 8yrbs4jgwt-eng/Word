#!/bin/sh
# Запускается от root: смонтированный диск (Render, Docker volume) принадлежит root,
# поэтому выдаём права на /data и дальше работаем от обычного пользователя.
set -e
DATA_DIR="$(dirname "${DATABASE_PATH:-/data/campus.db}")"
mkdir -p "$DATA_DIR"
chown -R campus:campus "$DATA_DIR" 2>/dev/null || true
exec setpriv --reuid=1001 --regid=1001 --init-groups "$@"
