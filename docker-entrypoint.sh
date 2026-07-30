#!/bin/sh
set -e

echo "[entrypoint] warte auf Datenbank ..."
i=0
until npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1 <<'SQL'
SELECT 1;
SQL
do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] Datenbank nicht erreichbar - Abbruch" >&2
    exit 1
  fi
  sleep 1
done

# Solange noch keine Migration im Repo liegt, wird das Schema direkt angelegt.
# Sobald `npx prisma migrate dev --name init` einmal gelaufen ist, greift der
# regulaere Weg ueber migrate deploy.
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] wende Migrationen an ..."
  npx prisma migrate deploy
else
  echo "[entrypoint] keine Migrationen gefunden - Schema wird direkt synchronisiert"
  npx prisma db push --skip-generate
fi

echo "[entrypoint] seed (idempotent) ..."
node prisma/seed.mjs

echo "[entrypoint] starte App ..."
exec "$@"
