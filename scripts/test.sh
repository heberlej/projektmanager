#!/usr/bin/env bash
# Fuehrt die Tests aus, ohne dass Node auf dem Host installiert sein muss.
#
#   ./scripts/test.sh [weitere vitest-argumente]
#
# Laeuft in einem node-Container am Compose-Netz und benutzt eine eigene
# Datenbank `pm_test` neben der produktiven. Die Tests leeren Tabellen - deshalb
# ist die Trennung nicht optional, sondern der Grund fuer dieses Skript.
#
# Dieselben Schritte in derselben Reihenfolge wie die CI, inklusive `tsc`:
# vitest prueft keine Typen, ein Fehler faellt sonst erst auf GitHub auf.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PGUSER="${POSTGRES_USER:-pm}"
PGPASS="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD fehlt in .env}"
TESTDB="${TEST_DB:-pm_test}"

netz="$(docker compose ps --format '{{.Name}}' | head -1)"
[ -n "$netz" ] || { echo "Stack laeuft nicht - erst 'docker compose up -d'"; exit 1; }

echo "[test] lege '$TESTDB' an, falls noetig"
docker compose exec -T db psql -U "$PGUSER" -d postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '$TESTDB'" | grep -q 1 \
  || docker compose exec -T db createdb -U "$PGUSER" "$TESTDB"

echo "[test] los"
docker run --rm -i \
  --network "$(docker inspect "$netz" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')" \
  -v "$PWD:/app" -w /app \
  -e "DATABASE_URL=postgresql://$PGUSER:$PGPASS@db:5432/$TESTDB?schema=public" \
  -e CI=true \
  node:22-bookworm-slim \
  sh -c "npm ci --no-audit --no-fund || npm install --no-audit --no-fund \
    && npx prisma generate \
    && npx prisma migrate deploy \
    && npx tsc --noEmit \
    && npx vitest run $*"
