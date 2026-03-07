#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_DATA_DIR="$ROOT_DIR/pb_data"
BACKUP_DIR="$ROOT_DIR/backups"

if [[ ! -d "$PB_DATA_DIR" ]]; then
  echo "pb_data не найден: $PB_DATA_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +"%Y%m%d-%H%M%S")"
ARCHIVE="$BACKUP_DIR/pb_data_$STAMP.tgz"

# Создаём архив pb_data
( cd "$ROOT_DIR" && tar -czf "$ARCHIVE" "pb_data" )

echo "Backup создан: $ARCHIVE"
