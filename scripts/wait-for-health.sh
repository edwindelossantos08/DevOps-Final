#!/usr/bin/env bash
# Espera a que un endpoint de salud responda 200 antes de continuar.
# Uso: ./scripts/wait-for-health.sh <url> [segundos_maximos]

set -euo pipefail

URL="${1:-http://localhost:3000/health}"
TIMEOUT="${2:-60}"
INTERVALO=2
TRANSCURRIDO=0

echo "Esperando a que ${URL} responda (maximo ${TIMEOUT}s)..."

while [ "${TRANSCURRIDO}" -lt "${TIMEOUT}" ]; do
  # -f hace que curl devuelva error en respuestas >=400
  if curl -fsS "${URL}" > /dev/null 2>&1; then
    echo "Servicio disponible tras ${TRANSCURRIDO}s"
    exit 0
  fi
  sleep "${INTERVALO}"
  TRANSCURRIDO=$((TRANSCURRIDO + INTERVALO))
done

echo "ERROR: el servicio no respondio en ${TIMEOUT}s" >&2
exit 1
