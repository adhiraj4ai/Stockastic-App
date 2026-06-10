#!/usr/bin/env bash
# Nightly NEPSE database backup. The price/floorsheet history is the product's
# moat — losing it is unrecoverable (no API to refetch).
#
# Install (host crontab):  0 2 * * * cd /path/to/Stockastic && ./scripts/backup_db.sh >> backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/stockastic-${STAMP}.sql.gz"

docker-compose exec -T postgres pg_dump -U postgres stockastic | gzip > "${OUT}"

SIZE=$(du -h "${OUT}" | cut -f1)
echo "$(date -Iseconds) backup written: ${OUT} (${SIZE})"

# Retention: keep 14 days.
find backups -name "stockastic-*.sql.gz" -mtime +14 -delete
