#!/usr/bin/env bash
# Genera los PDF de entrega a partir de las fuentes del repositorio:
#   1. La presentacion, imprimiendo docs/slides.html en formato 16:9.
#   2. La documentacion completa, uniendo los cinco documentos Markdown
#      en un solo PDF A4 con portada, indice y numeros de pagina.
#
# Requiere Google Chrome (modo headless) y npx. No instala nada de forma
# permanente: marked se descarga en la cache de npx.
#
# Uso: ./scripts/generar-pdfs.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SALIDA="${RAIZ}/entrega-pdf"
TEMP="$(mktemp -d)"
# El directorio temporal se borra pase lo que pase
trap 'rm -rf "${TEMP}"' EXIT

# Localiza un navegador basado en Chromium capaz de imprimir a PDF
CHROME=""
for ruta in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  if [ -n "${ruta}" ] && [ -x "${ruta}" ]; then CHROME="${ruta}"; break; fi
done

if [ -z "${CHROME}" ]; then
  echo "ERROR: no se encontro Chrome ni Chromium para generar los PDF." >&2
  exit 1
fi

mkdir -p "${SALIDA}"

# --------------------------------------------------------------------
# 1. Presentacion: el deck ya trae una hoja de estilos @media print que
#    revela las 14 diapositivas y fuerza un salto de pagina entre ellas
# --------------------------------------------------------------------
echo "Generando la presentacion..."
"${CHROME}" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="${SALIDA}/TaskFlow-Presentacion-Edwin-De-Los-Santos.pdf" \
  "file://${RAIZ}/docs/slides.html" 2>/dev/null

# --------------------------------------------------------------------
# 2. Documentacion: se concatenan los Markdown en un unico HTML A4
# --------------------------------------------------------------------
echo "Generando la documentacion..."

DOCS=(
  "${RAIZ}/README.md"
  "${RAIZ}/docs/INSTALACION.md"
  "${RAIZ}/docs/PIPELINE.md"
  "${RAIZ}/docs/OPERACIONES.md"
  "${RAIZ}/docs/PRESENTACION.md"
)

HTML="${TEMP}/documentacion.html"
ESTILOS="${RAIZ}/scripts/plantilla-pdf.html"

# La plantilla trae la portada, el indice y la hoja de estilos de impresion
cat "${ESTILOS}" > "${HTML}"

# Convierte cada Markdown y lo envuelve en su propia seccion paginada
for doc in "${DOCS[@]}"; do
  echo "  - $(basename "${doc}")"
  printf '<div class="documento">\n' >> "${HTML}"
  npx -y marked@15 --gfm -i "${doc}" >> "${HTML}"
  printf '</div>\n' >> "${HTML}"
done

printf '</body>\n</html>\n' >> "${HTML}"

# Se desactiva el encabezado por defecto de Chrome: imprime la fecha y la ruta
# local del archivo. La plantilla aporta su propio pie repetido en cada pagina.
"${CHROME}" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="${SALIDA}/TaskFlow-Documentacion-Edwin-De-Los-Santos.pdf" \
  "file://${HTML}" 2>/dev/null

echo
echo "PDF generados en ${SALIDA}:"
ls -lh "${SALIDA}"/*.pdf | awk '{printf "  %s  %s\n", $5, $9}'
