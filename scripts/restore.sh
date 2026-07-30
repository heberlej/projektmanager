#!/usr/bin/env bash
# Spielt eine Sicherung zurueck.
#
#   ./scripts/restore.sh backups/db-20260730-101500.sql.gz [backups/uploads-...tar.gz]
#
# Achtung: ueberschreibt den aktuellen Datenbankinhalt.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_DUMP="${1:?Pfad zum db-*.sql.gz fehlt}"
UPLOADS="${2:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PGUSER="${POSTGRES_USER:-pm}"
PGDB="${POSTGRES_DB:-pm}"

read -r -p "Datenbank '$PGDB' aus '$DB_DUMP' ueberschreiben? [ja/nein] " answer
[ "$answer" = "ja" ] || { echo "abgebrochen"; exit 1; }

echo "[restore] Datenbank"
gunzip -c "$DB_DUMP" | docker compose exec -T db psql -U "$PGUSER" -d "$PGDB"

if [ -n "$UPLOADS" ]; then
  echo "[restore] Dateiablage"
  docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'tar xzf - -C /data' < "$UPLOADS"
fi

echo "[restore] fertig - App neu starten: docker compose restart app"
