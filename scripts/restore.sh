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

# Netz vor dem Sprung: der Dump enthaelt --clean, das Einspielen wirft also
# alles weg, was seit der Sicherung entstanden ist. Ohne diesen Schnappschuss
# laesst sich hinterher nicht einmal mehr feststellen, was gefehlt hat.
SAFETY="./backups/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
mkdir -p ./backups
echo "[restore] sichere den Ist-Zustand nach $SAFETY"
docker compose exec -T db pg_dump -U "$PGUSER" -d "$PGDB" --clean --if-exists \
  | gzip -9 > "$SAFETY"

echo "[restore] Datenbank"
gunzip -c "$DB_DUMP" | docker compose exec -T db psql -U "$PGUSER" -d "$PGDB"

if [ -n "$UPLOADS" ]; then
  echo "[restore] Dateiablage"
  docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'tar xzf - -C /data' < "$UPLOADS"
fi

echo "[restore] fertig - App neu starten: docker compose restart app"
echo "[restore] Stand von vorher liegt in $SAFETY"
