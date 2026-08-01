#!/usr/bin/env bash
# Startet Container neu, die Docker als "unhealthy" meldet.
#
#   ./scripts/watchdog.sh
#
# Warum ueberhaupt: Docker wertet den HEALTHCHECK aus, zieht daraus aber keine
# Konsequenz. `restart: unless-stopped` greift nur, wenn der Prozess endet - ein
# haengender Node-Prozess laeuft weiter und der Proxy liefert 502, bis jemand
# hinschaut. Genau diese Luecke schliesst dieses Skript, per Cron alle 5 Minuten.
set -euo pipefail

cd "$(dirname "$0")/.."

zeit() { date "+%Y-%m-%d %H:%M:%S"; }

for id in $(docker compose ps -q); do
  name="$(docker inspect "$id" --format '{{.Name}}' | sed 's|^/||')"
  # Container ohne HEALTHCHECK liefern kein State.Health - die sind hier nicht
  # zu beurteilen und bleiben in Ruhe.
  zustand="$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne{{end}}')"

  if [ "$zustand" = "unhealthy" ]; then
    echo "[$(zeit)] $name ist unhealthy - starte neu"
    docker restart "$id" >/dev/null
    echo "[$(zeit)] $name neu gestartet"
  fi
done
