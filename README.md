# TaskFlow — Pipeline DevOps Completo

> Práctica Final · Diseño e Implementación de un Pipeline DevOps
> Aplicación web de gestión de tareas con CI/CD, contenedores, pruebas automatizadas y monitoreo.

[![CI/CD Pipeline](https://github.com/USUARIO/REPO/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/USUARIO/REPO/actions/workflows/ci-cd.yml)
![Node](https://img.shields.io/badge/node-20.x-green)
![Docker](https://img.shields.io/badge/docker-multi--stage-blue)
![Tests](https://img.shields.io/badge/tests-54%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-92%25-brightgreen)

---

## Tabla de contenidos

1. [Qué es este proyecto](#qué-es-este-proyecto)
2. [Arquitectura](#arquitectura)
3. [Stack tecnológico](#stack-tecnológico)
4. [Inicio rápido](#inicio-rápido)
5. [Estructura del repositorio](#estructura-del-repositorio)
6. [API REST](#api-rest)
7. [Pruebas](#pruebas)
8. [Pipeline CI/CD](#pipeline-cicd)
9. [Monitoreo](#monitoreo)
10. [Documentación adicional](#documentación-adicional)

---

## Qué es este proyecto

**TaskFlow** es un gestor de tareas sencillo (frontend + API REST + base de datos) que sirve
de vehículo para demostrar un **pipeline DevOps completo y funcional**: desde el commit hasta
el despliegue monitorizado.

El valor del proyecto no está en la complejidad de la aplicación, sino en todo lo que la rodea:

| Requisito del enunciado | Implementación en este repositorio                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Repositorio Git         | Ramas `main` / `develop`, `.gitignore`, commits convencionales                           |
| Pipeline CI/CD          | GitHub Actions con 8 jobs ([`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)) |
| Contenedores Docker     | Dockerfile multi-etapa + `docker-compose.yml` con 6 servicios                            |
| Pruebas automatizadas   | 54 pruebas Jest (unitarias + integración) + smoke tests en bash                          |
| Análisis estático       | ESLint 9 (flat config) + Prettier + `npm audit`                                          |
| Logs centralizados      | Winston (JSON) → Promtail → Loki → Grafana                                               |
| Métricas                | `prom-client` → `/metrics` → Prometheus → dashboard Grafana                              |
| Alertas                 | 6 reglas Prometheus enrutadas por Alertmanager                                           |

---

## Arquitectura

### Flujo de la aplicación

```
┌──────────────┐      HTTP/JSON      ┌─────────────────────────────┐
│   Navegador  │ ──────────────────► │      Express (Node 20)      │
│ HTML/CSS/JS  │ ◄────────────────── │                             │
└──────────────┘                     │  middlewares                │
                                     │   ├─ helmet / cors          │
                                     │   ├─ rate-limit             │
                                     │   ├─ requestLogger ─────────┼──► métricas + logs
                                     │   └─ errorHandler           │
                                     │  rutas ─► controladores     │
                                     │            └─► servicio     │
                                     └──────────────┬──────────────┘
                                                    │
                                            ┌───────▼────────┐
                                            │ SQLite (WAL)   │
                                            │ volumen Docker │
                                            └────────────────┘
```

Arquitectura en capas: **rutas → controladores → servicio → base de datos**.
Los controladores no ejecutan SQL y el servicio no conoce Express, lo que permite
probar la lógica de negocio sin levantar un servidor HTTP.

### Flujo del pipeline

```
 git push
    │
    ├──► [calidad]    ESLint + Prettier          ┐
    ├──► [pruebas]    Jest matriz Node 20 y 22   ├─ en paralelo
    └──► [seguridad]  npm audit                  ┘
                          │  (los tres deben pasar)
                          ▼
                    [imagen]  docker build ─► push a GHCR
                          ▼
                  [smoke-test]  contenedor real + 13 verificaciones
                          ▼
            ┌─────────────┴─────────────┐
     develop│                           │main
            ▼                           ▼
      [staging]                  [producción]
```

### Stack de monitoreo

```
  TaskFlow ──/metrics──► Prometheus ──► Alertmanager ──► notificaciones
     │                        │
     │                        └──────────┐
     └──logs JSON──► Promtail ──► Loki ──┴──► Grafana (dashboard)
```

---

## Stack tecnológico

| Capa              | Tecnología                    | Motivo de la elección                                |
| ----------------- | ----------------------------- | ---------------------------------------------------- |
| Frontend          | HTML5 + CSS3 + JavaScript ES5 | Sin build step; CSP restrictiva posible              |
| Backend           | Node.js 20 + Express 4        | Requisito del enunciado; ecosistema maduro           |
| Base de datos     | SQLite (better-sqlite3)       | Cero servicios externos; API síncrona y rápida       |
| Pruebas           | Jest 29 + Supertest 7         | Estándar de facto; cobertura integrada               |
| Análisis estático | ESLint 9 + Prettier 3         | Detecta errores antes de ejecutar                    |
| Contenedores      | Docker multi-etapa + Compose  | Imagen final mínima y sin root                       |
| CI/CD             | GitHub Actions                | Integrado al repositorio; sin infraestructura propia |
| Métricas          | prom-client + Prometheus      | Formato estándar de la industria                     |
| Logs              | Winston + Promtail + Loki     | JSON estructurado y consultable                      |
| Visualización     | Grafana 11                    | Dashboards y logs en un solo lugar                   |
| Alertas           | Alertmanager                  | Agrupación, inhibición y enrutado por severidad      |

---

## Inicio rápido

### Opción A — Stack completo con Docker (recomendado)

```bash
docker compose up -d --build
```

| Servicio            | URL                   | Credenciales      |
| ------------------- | --------------------- | ----------------- |
| Aplicación TaskFlow | http://localhost:3000 | —                 |
| Prometheus          | http://localhost:9090 | —                 |
| Grafana             | http://localhost:3001 | `admin` / `admin` |
| Alertmanager        | http://localhost:9093 | —                 |
| Loki (API)          | http://localhost:3100 | —                 |

Detener y limpiar todo:

```bash
docker compose down -v
```

### Opción B — Solo la aplicación, en local

```bash
npm install
cp .env.example .env
npm run dev
```

La aplicación queda en http://localhost:3000.
Para cargar datos de ejemplo:

```bash
node scripts/seed.js
```

La [guía de instalación detallada](docs/INSTALACION.md) cubre requisitos previos,
resolución de problemas y despliegue en un servidor.

---

## Estructura del repositorio

```
DevOps-Final/
├── .github/workflows/ci-cd.yml     # Pipeline completo de GitHub Actions
├── src/
│   ├── app.js                      # Construcción de la app Express (sin listen)
│   ├── server.js                   # Arranque HTTP y apagado ordenado
│   ├── config/
│   │   ├── env.js                  # Variables de entorno centralizadas
│   │   ├── logger.js               # Winston con salida JSON
│   │   └── metrics.js              # Registro de métricas Prometheus
│   ├── db/database.js              # Conexión SQLite, esquema y migraciones
│   ├── routes/                     # Definición de endpoints
│   ├── controllers/                # Adaptación HTTP ↔ servicio
│   ├── services/tasks.service.js   # Lógica de negocio y validaciones
│   └── middlewares/                # Logging/métricas y manejo de errores
├── public/                         # Frontend estático (HTML, CSS, JS)
├── tests/
│   ├── unit/                       # Pruebas unitarias (sin HTTP)
│   └── integration/                # Pruebas de integración (Supertest)
├── monitoring/
│   ├── prometheus/                 # Configuración y reglas de alerta
│   ├── alertmanager/               # Enrutado y agrupación de alertas
│   ├── loki/  promtail/            # Logs centralizados
│   └── grafana/                    # Datasources y dashboard aprovisionados
├── scripts/
│   ├── smoke-test.sh               # 13 verificaciones contra una instancia viva
│   ├── wait-for-health.sh          # Espera activa del healthcheck
│   └── seed.js                     # Datos de ejemplo para la demo
├── docs/                           # Instalación, pipeline, operaciones, presentación
├── Dockerfile                      # Imagen multi-etapa
├── docker-compose.yml              # Stack app + monitoreo
├── docker-compose.prod.yml         # Override: despliega la imagen publicada
├── eslint.config.js  jest.config.js
└── README.md
```

---

## API REST

Base: `http://localhost:3000`

### Endpoints de negocio

| Método   | Ruta                    | Descripción                                                                        | Códigos       |
| -------- | ----------------------- | ---------------------------------------------------------------------------------- | ------------- |
| `GET`    | `/api/tasks`            | Lista tareas. Query: `status=all\|active\|completed`, `priority=low\|medium\|high` | 200           |
| `GET`    | `/api/tasks/stats`      | Resumen agregado (total, completadas, pendientes, % avance)                        | 200           |
| `GET`    | `/api/tasks/:id`        | Obtiene una tarea                                                                  | 200, 400, 404 |
| `POST`   | `/api/tasks`            | Crea una tarea                                                                     | 201, 400      |
| `PUT`    | `/api/tasks/:id`        | Actualiza los campos enviados                                                      | 200, 400, 404 |
| `PATCH`  | `/api/tasks/:id/toggle` | Invierte el estado completado                                                      | 200, 404      |
| `DELETE` | `/api/tasks/:id`        | Elimina la tarea                                                                   | 200, 404      |

### Endpoints de observabilidad

| Método | Ruta            | Descripción                                               |
| ------ | --------------- | --------------------------------------------------------- |
| `GET`  | `/health`       | Liveness probe: el proceso está vivo                      |
| `GET`  | `/health/ready` | Readiness probe: verifica que SQLite responde (503 si no) |
| `GET`  | `/metrics`      | Métricas en formato Prometheus                            |

### Modelo de datos

```json
{
  "id": 1,
  "title": "Configurar el workflow de GitHub Actions",
  "description": "Lint, pruebas, build y despliegue",
  "priority": "high",
  "completed": false,
  "createdAt": "2026-08-19 20:14:36",
  "updatedAt": "2026-08-19 20:14:36"
}
```

**Reglas de validación** (aplicadas en `src/services/tasks.service.js`):

- `title`: obligatorio, no vacío tras recortar espacios, máximo 120 caracteres.
- `description`: opcional, máximo 500 caracteres.
- `priority`: uno de `low` | `medium` | `high` (por defecto `medium`).
- `completed`: booleano estricto — `"true"` como texto se rechaza con 400.

### Ejemplos

```bash
# Crear una tarea
curl -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Revisar el pipeline","priority":"high"}'

# Listar solo las pendientes
curl 'http://localhost:3000/api/tasks?status=active'

# Marcar como completada
curl -X PATCH http://localhost:3000/api/tasks/1/toggle

# Consultar el resumen
curl http://localhost:3000/api/tasks/stats
```

### Formato de errores

Todas las respuestas de error comparten la misma estructura:

```json
{
  "error": {
    "message": "El titulo es obligatorio.",
    "statusCode": 400,
    "requestId": "b3f1c2a4-..."
  }
}
```

El `requestId` viaja también en la cabecera `X-Request-Id` y aparece en los logs,
lo que permite correlacionar un error reportado por un usuario con su traza exacta en Loki.

---

## Pruebas

```bash
npm test               # Todas las suites (54 pruebas)
npm run test:unit      # Solo unitarias
npm run test:integration
npm run test:coverage  # Con reporte y umbrales
npm run lint           # Análisis estático
```

### Niveles de prueba

| Nivel           | Archivos                           | Qué cubre                                                 | Cantidad |
| --------------- | ---------------------------------- | --------------------------------------------------------- | -------- |
| **Unitarias**   | `tests/unit/tasks.service.test.js` | Validaciones, reglas de negocio, consultas y ordenamiento | 27       |
| **Unitarias**   | `tests/unit/errorHandler.test.js`  | Manejo de 404 y enmascarado de errores 500                | 4        |
| **Integración** | `tests/integration/api.test.js`    | CRUD completo vía HTTP, filtros, ciclo de vida end-to-end | 16       |
| **Integración** | `tests/integration/health.test.js` | `/health`, `/metrics`, cabeceras de seguridad, 404        | 7        |
| **Smoke**       | `scripts/smoke-test.sh`            | 13 verificaciones contra un contenedor real en CI         | —        |

### Cobertura actual

```
File                  | % Stmts | % Branch | % Funcs | % Lines
----------------------|---------|----------|---------|--------
All files             |   92.60 |    81.48 |   96.77 |   92.90
 src/services         |   94.68 |    92.53 |  100.00 |   95.69
 src/middlewares      |   96.87 |    92.85 |  100.00 |   96.87
 src/routes           |   91.89 |   100.00 |  100.00 |   91.89
```

Los umbrales mínimos están declarados en `jest.config.js` (70 % líneas, 60 % ramas).
**Si la cobertura baja de ese umbral, el pipeline falla** — no es un reporte informativo.

Las pruebas usan **SQLite en memoria** (`tests/setupEnv.js` fija `DB_PATH=:memory:`),
por lo que cada suite parte de una base limpia y no tocan datos reales.

---

## Pipeline CI/CD

El pipeline vive en [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) y se dispara con:

- `push` a `main` o `develop`
- `pull_request` hacia `main` o `develop`
- etiquetas `v*` (releases)
- ejecución manual (`workflow_dispatch`)

| #   | Job                    | Qué hace                                                 | Bloquea si falla |
| --- | ---------------------- | -------------------------------------------------------- | ---------------- |
| 1   | `calidad`              | ESLint + verificación de formato Prettier                | Sí               |
| 2   | `pruebas`              | Jest en Node 20 y 22 + cobertura con umbrales            | Sí               |
| 3   | `seguridad`            | `npm audit --audit-level=high`                           | Sí               |
| 4   | `imagen`               | Build multi-etapa y push a GHCR con etiquetas semánticas | Sí               |
| 5   | `smoke-test`           | Levanta el contenedor y ejecuta 13 verificaciones reales | Sí               |
| 6   | `desplegar-staging`    | Despliegue automático desde `develop`                    | —                |
| 7   | `desplegar-produccion` | Despliegue desde `main` (con environment protegido)      | —                |
| 8   | `resumen`              | Tabla de resultados en la interfaz de GitHub             | No               |

Decisiones destacadas, explicadas en detalle en [docs/PIPELINE.md](docs/PIPELINE.md):

- Los jobs 1–3 corren **en paralelo**: el feedback de fallo llega en ~1 minuto en lugar de ~3.
- `concurrency` con `cancel-in-progress` evita desplegar un commit ya superado.
- Los **pull requests validan pero no publican** imágenes ni despliegan.
- El caché de `npm` y de `buildx` reduce el tiempo de las ejecuciones sucesivas.

---

## Monitoreo

### Métricas expuestas

| Métrica                                         | Tipo      | Uso                               |
| ----------------------------------------------- | --------- | --------------------------------- |
| `http_requests_total{method,route,status_code}` | Counter   | Tráfico y tasa de error           |
| `http_request_duration_seconds{...}`            | Histogram | Percentiles p50 / p95 / p99       |
| `http_errors_total{...}`                        | Counter   | Alertas de errores                |
| `taskflow_tasks_created_total`                  | Counter   | Métrica de negocio                |
| `taskflow_tasks_completed_total`                | Counter   | Métrica de negocio                |
| `taskflow_tasks_in_database{status}`            | Gauge     | Estado actual de los datos        |
| `taskflow_process_*`                            | Varios    | CPU, memoria, event loop, handles |

Las etiquetas de ruta están **normalizadas** (`/api/tasks/:id` en lugar de `/api/tasks/42`)
para evitar la explosión de cardinalidad que rompería a Prometheus.

### Alertas configuradas

| Alerta                     | Condición                   | Espera    | Severidad |
| -------------------------- | --------------------------- | --------- | --------- |
| `AplicacionCaida`          | `up == 0`                   | 1 min     | critical  |
| `TasaDeErroresAlta`        | > 5 % de respuestas 5xx     | 2 min     | critical  |
| `ExcesoDeErroresDeCliente` | > 5 errores 4xx por segundo | 5 min     | warning   |
| `LatenciaAlta`             | p95 > 1 s                   | 3 min     | warning   |
| `MemoriaElevada`           | RSS > 400 MB                | 5 min     | warning   |
| `ReinicioDelServicio`      | uptime < 5 min              | inmediata | info      |

Alertmanager **agrupa** por `alertname` + `service`, enruta las críticas a un receptor
con reenvío cada 30 minutos, e **inhibe** las alertas de latencia y memoria cuando el
servicio ya está reportado como caído (evita la avalancha de avisos redundantes).

### Logs centralizados

Winston emite JSON con campos fijos (`service`, `version`, `instance`, `env`) más el
`requestId` de correlación. Promtail parsea ese JSON y promueve a etiqueta de Loki solo
los campos de **baja cardinalidad** (`level`, `route`, `statusCode`); `requestId` y
`durationMs` quedan como campos del log para no inflar el índice.

Consultas útiles en Grafana → Explore → Loki:

```logql
{job="taskflow"} | json | level="error"
{job="taskflow"} | json | durationMs > 500
{job="taskflow"} | json | requestId="b3f1c2a4-..."
```

---

## Documentación adicional

| Documento                                    | Contenido                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| [docs/INSTALACION.md](docs/INSTALACION.md)   | Requisitos, instalación paso a paso, despliegue y resolución de problemas |
| [docs/PIPELINE.md](docs/PIPELINE.md)         | Anatomía del pipeline, decisiones de diseño y cómo extenderlo             |
| [docs/OPERACIONES.md](docs/OPERACIONES.md)   | Manual de operaciones: runbooks, backups, rollback y checklists           |
| [docs/PRESENTACION.md](docs/PRESENTACION.md) | Guion de la presentación, demo en vivo y lecciones aprendidas             |

---

## Licencia

MIT — proyecto académico.
