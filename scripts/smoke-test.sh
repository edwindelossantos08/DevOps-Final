#!/usr/bin/env bash
# Pruebas de humo contra una instancia ya desplegada de TaskFlow.
# Validan el camino critico end-to-end: salud, metricas y CRUD de tareas.
# Uso: ./scripts/smoke-test.sh [url_base]

set -euo pipefail

BASE="${1:-http://localhost:3000}"
FALLOS=0

# Colores solo si la salida es una terminal interactiva
if [ -t 1 ]; then
  VERDE='\033[0;32m'; ROJO='\033[0;31m'; RESET='\033[0m'
else
  VERDE=''; ROJO=''; RESET=''
fi

# Ejecuta una comprobacion y acumula el resultado
# $1 descripcion, $2 valor esperado, $3 valor obtenido
comprobar() {
  if [ "$2" = "$3" ]; then
    printf "${VERDE}  OK${RESET}   %s\n" "$1"
  else
    printf "${ROJO}  FALLO${RESET} %s (esperado: %s, obtenido: %s)\n" "$1" "$2" "$3"
    FALLOS=$((FALLOS + 1))
  fi
}

# Devuelve el codigo HTTP de una peticion
codigo_http() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

echo "Smoke tests contra ${BASE}"
echo "-------------------------------------------"

# 1. Salud del servicio
comprobar "GET /health responde 200" "200" "$(codigo_http "${BASE}/health")"
comprobar "GET /health/ready responde 200" "200" "$(codigo_http "${BASE}/health/ready")"

# 2. Metricas expuestas para Prometheus
comprobar "GET /metrics responde 200" "200" "$(codigo_http "${BASE}/metrics")"
if curl -fsS "${BASE}/metrics" | grep -q "http_requests_total"; then
  printf "${VERDE}  OK${RESET}   /metrics expone http_requests_total\n"
else
  printf "${ROJO}  FALLO${RESET} /metrics no expone http_requests_total\n"
  FALLOS=$((FALLOS + 1))
fi

# 3. Frontend estatico servido correctamente
comprobar "GET / sirve el frontend" "200" "$(codigo_http "${BASE}/")"

# 4. Listado inicial de la API
comprobar "GET /api/tasks responde 200" "200" "$(codigo_http "${BASE}/api/tasks")"

# 5. Alta de tarea y captura del identificador generado
RESPUESTA=$(curl -fsS -X POST "${BASE}/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test","description":"Creada por el pipeline","priority":"high"}')

ID=$(echo "${RESPUESTA}" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')

if [ -n "${ID}" ]; then
  printf "${VERDE}  OK${RESET}   POST /api/tasks creo la tarea id=%s\n" "${ID}"
else
  printf "${ROJO}  FALLO${RESET} POST /api/tasks no devolvio un id\n"
  FALLOS=$((FALLOS + 1))
fi

# 6. Validacion de entrada: un titulo vacio debe rechazarse
comprobar "POST sin titulo responde 400" "400" \
  "$(codigo_http -X POST "${BASE}/api/tasks" -H 'Content-Type: application/json' -d '{}')"

# 7. Recuperacion, alternado y borrado de la tarea creada
if [ -n "${ID}" ]; then
  comprobar "GET /api/tasks/${ID} responde 200" "200" "$(codigo_http "${BASE}/api/tasks/${ID}")"
  comprobar "PATCH toggle responde 200" "200" "$(codigo_http -X PATCH "${BASE}/api/tasks/${ID}/toggle")"
  comprobar "DELETE responde 200" "200" "$(codigo_http -X DELETE "${BASE}/api/tasks/${ID}")"
  comprobar "GET tras el borrado responde 404" "404" "$(codigo_http "${BASE}/api/tasks/${ID}")"
fi

# 8. Ruta inexistente
comprobar "Ruta desconocida responde 404" "404" "$(codigo_http "${BASE}/api/ruta-que-no-existe")"

echo "-------------------------------------------"
if [ "${FALLOS}" -eq 0 ]; then
  printf "${VERDE}Todas las pruebas de humo pasaron.${RESET}\n"
  exit 0
fi

printf "${ROJO}%s prueba(s) de humo fallaron.${RESET}\n" "${FALLOS}"
exit 1
