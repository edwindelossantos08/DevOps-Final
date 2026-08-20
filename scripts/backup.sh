#!/usr/bin/env bash
# Copia de seguridad del volumen de datos de TaskFlow.
# Genera un tar.gz con marca de tiempo y aplica la politica de retencion.
# Uso: ./scripts/backup.sh [directorio_destino] [dias_de_retencion]

set -euo pipefail

DESTINO="${1:-./backups}"
RETENCION_DIAS="${2:-7}"
VOLUMEN="taskflow_taskflow-data"
MARCA="$(date +%F-%H%M)"
ARCHIVO="taskflow-${MARCA}.tar.gz"

mkdir -p "${DESTINO}"

# Verifica que el volumen exista antes de intentar copiarlo
if ! docker volume inspect "${VOLUMEN}" > /dev/null 2>&1; then
  echo "ERROR: no se encontro el volumen ${VOLUMEN}" >&2
  echo "Volumenes disponibles:" >&2
  docker volume ls --format '  {{.Name}}' >&2
  exit 1
fi

echo "Creando copia de seguridad de ${VOLUMEN}..."

# Se monta el volumen en solo lectura dentro de un contenedor efimero:
# asi no hace falta conocer la ruta del volumen en el host
docker run --rm \
  -v "${VOLUMEN}:/data:ro" \
  -v "$(cd "${DESTINO}" && pwd):/backup" \
  alpine tar czf "/backup/${ARCHIVO}" -C /data .

TAMANO=$(du -h "${DESTINO}/${ARCHIVO}" | cut -f1)
echo "Copia creada: ${DESTINO}/${ARCHIVO} (${TAMANO})"

# Politica de retencion: elimina las copias mas antiguas que el umbral
echo "Eliminando copias con mas de ${RETENCION_DIAS} dias..."
find "${DESTINO}" -name 'taskflow-*.tar.gz' -type f -mtime "+${RETENCION_DIAS}" -print -delete

echo "Copias conservadas:"
ls -1t "${DESTINO}"/taskflow-*.tar.gz 2>/dev/null | head -10 || echo "  (ninguna)"
