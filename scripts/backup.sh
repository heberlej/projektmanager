#!/usr/bin/env bash
# Sichert Datenbank und Dateiablage in ein Zielverzeichnis.
#
#   ./scripts/backup.sh [zielverzeichnis]
#
# Standardziel ist ./backups. Alte Sicherungen werden nach BACKUP_KEEP Tagen
# entfernt (Vorgabe: 30).
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-./backups}"
KEEP_DAYS="${BACKUP_KEEP:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$TARGET"

# .env fuer POSTGRES_* einlesen
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PGUSER="${POSTGRES_USER:-pm}"
PGDB="${POSTGRES_DB:-pm}"

echo "[backup] Datenbank -> $TARGET/db-$STAMP.sql.gz"
docker compose exec -T db pg_dump -U "$PGUSER" -d "$PGDB" --clean --if-exists \
  | gzip -9 > "$TARGET/db-$STAMP.sql.gz"

echo "[backup] Dateiablage -> $TARGET/uploads-$STAMP.tar.gz"
# --entrypoint umgeht das Startskript des Images (Migration + Seed), --no-deps
# haelt die Datenbank aus dem Spiel. Das Archiv kommt ueber stdout.
docker compose run --rm --no-deps -T --entrypoint sh app \
  -c 'tar czf - -C /data uploads' > "$TARGET/uploads-$STAMP.tar.gz"

echo "[backup] raeume Sicherungen aelter als $KEEP_DAYS Tage auf"
find "$TARGET" -maxdepth 1 -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$TARGET" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "[backup] fertig"
ls -lh "$TARGET" | tail -n +2
