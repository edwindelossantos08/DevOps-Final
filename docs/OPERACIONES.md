# Manual de Operaciones — TaskFlow

Documento de referencia para quien opera el servicio en ejecución.
Está escrito para consultarse **durante** un incidente: cada sección va del síntoma a la acción.

---

## 1. Fichas del servicio

| Dato                   | Valor                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Servicio               | `taskflow-api`                                              |
| Runtime                | Node.js 20 sobre Debian slim                                |
| Puerto                 | 3000                                                        |
| Base de datos          | SQLite en `/app/data/taskflow.db` (volumen `taskflow-data`) |
| Logs                   | `/app/logs/{app,error}.log` (volumen `taskflow-logs`)       |
| Liveness               | `GET /health`                                               |
| Readiness              | `GET /health/ready`                                         |
| Métricas               | `GET /metrics`                                              |
| Usuario del contenedor | `node` (sin privilegios)                                    |
| Init                   | `tini` como PID 1                                           |

### Consolas

| Herramienta     | URL                          |
| --------------- | ---------------------------- |
| Aplicación      | http://localhost:3000        |
| Prometheus      | http://localhost:9090        |
| Alertas activas | http://localhost:9090/alerts |
| Alertmanager    | http://localhost:9093        |
| Grafana         | http://localhost:3001        |

---

## 2. Operaciones cotidianas

### Arrancar y detener

```bash
docker compose up -d              # arrancar todo
docker compose up -d app          # arrancar solo la aplicación
docker compose stop app           # detener sin borrar
docker compose restart app        # reiniciar
docker compose down               # bajar todo (conserva volúmenes)
docker compose down -v            # bajar y BORRAR los datos
```

### Estado y logs

```bash
docker compose ps                            # estado y salud
docker compose logs -f --tail=100 app        # logs en vivo
docker stats --no-stream                     # CPU y memoria
docker inspect --format='{{.State.Health.Status}}' taskflow-app
```

### Consultas rápidas de salud

```bash
curl -s localhost:3000/health | jq
curl -s localhost:3000/health/ready | jq
curl -s localhost:3000/api/tasks/stats | jq
curl -s localhost:3000/metrics | grep -E '^http_requests_total'
```

### Actualizar a una versión nueva

```bash
# En un servidor, con la imagen publicada por el pipeline
export TASKFLOW_IMAGE=ghcr.io/USUARIO/DevOps-Final:latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# En desarrollo, reconstruyendo desde el código local
docker compose up -d --build

./scripts/smoke-test.sh http://localhost:3000   # verificación posterior
```

---

## 3. Runbooks de incidentes

Cada alerta de Prometheus apunta a una de estas secciones.

### 3.1 Aplicación caída

> **Alerta:** `AplicacionCaida` · severidad **critical** · `up{job="taskflow-app"} == 0` durante 1 min

**Impacto:** el servicio no atiende ninguna petición.

**Diagnóstico:**

```bash
docker compose ps app                     # ¿está corriendo o en restart loop?
docker compose logs --tail=200 app        # ¿qué dijo antes de morir?
docker inspect taskflow-app --format='{{.State.ExitCode}} {{.State.OOMKilled}}'
```

| Código de salida | Significado            | Acción                                                    |
| ---------------- | ---------------------- | --------------------------------------------------------- |
| `0`              | Apagado ordenado       | Alguien lo detuvo: `docker compose up -d app`             |
| `1`              | Excepción no capturada | Busque el stack en los logs; véase §3.5                   |
| `137`            | `SIGKILL` / OOM        | Falta memoria: suba el límite o investigue la fuga (§3.4) |
| `143`            | `SIGTERM`              | Reinicio provocado por un despliegue: normal              |

**Resolución:**

```bash
docker compose up -d app
./scripts/wait-for-health.sh http://localhost:3000/health 60
./scripts/smoke-test.sh http://localhost:3000
```

Si vuelve a caer inmediatamente, haga **rollback** (§5) antes de seguir investigando:
primero se restablece el servicio, después se busca la causa.

---

### 3.2 Tasa de errores 5xx alta

> **Alerta:** `TasaDeErroresAlta` · severidad **critical** · > 5 % de respuestas 5xx durante 2 min

**Diagnóstico — qué endpoint falla:**

En Prometheus (http://localhost:9090):

```promql
sum by (route, status_code) (rate(http_requests_total{status_code=~"5.."}[5m]))
```

**Ver los errores concretos** en Grafana → Explore → Loki:

```logql
{job="taskflow"} | json | level="error"
```

Cada línea trae `requestId`, `path`, `message` y `stack`. Con el `requestId` se recupera
la traza completa de esa petición:

```logql
{job="taskflow"} | json | requestId="<el-id>"
```

**Causas frecuentes:**

| Causa                     | Señal                                     | Acción                  |
| ------------------------- | ----------------------------------------- | ----------------------- |
| Base de datos inaccesible | `/health/ready` devuelve 503              | Véase §3.3              |
| Despliegue defectuoso     | Los errores empiezan justo tras un deploy | Rollback (§5)           |
| Disco lleno               | `SQLITE_FULL` en los logs                 | `df -h`, libere espacio |
| Fuga de memoria           | Sube junto con `MemoriaElevada`           | Reinicio + §3.4         |

---

### 3.3 La base de datos no responde

> **Señal:** `GET /health/ready` devuelve `503` con `{"checks":{"database":"down"}}`

Nótese que `/health` **sigue devolviendo 200**: es deliberado. Un fallo de base de datos
saca la instancia de rotación (readiness) pero no reinicia el contenedor (liveness),
porque reiniciar no arregla un volumen corrupto y sí pierde el diagnóstico.

**Diagnóstico:**

```bash
docker exec taskflow-app ls -la /app/data          # ¿existe el archivo?
docker exec taskflow-app sh -c 'df -h /app/data'   # ¿hay espacio?
docker volume inspect taskflow_taskflow-data
```

**Verificar integridad:**

```bash
docker exec taskflow-app node -e "
  const db = require('better-sqlite3')('/app/data/taskflow.db');
  console.log(db.pragma('integrity_check'));
"
```

Si el resultado no es `ok`, restaure desde copia de seguridad (§4.2).

---

### 3.4 Memoria elevada

> **Alerta:** `MemoriaElevada` · severidad **warning** · RSS > 400 MB durante 5 min

**Diagnóstico:**

```promql
taskflow_process_resident_memory_bytes
taskflow_nodejs_heap_size_used_bytes
taskflow_nodejs_external_memory_bytes
```

Un heap que crece de forma **monótona** entre reinicios indica fuga; si sube y baja con
el tráfico, es carga normal y lo que procede es subir el límite.

**Mitigación inmediata:**

```bash
docker compose restart app
```

**Mitigación permanente** — fijar el límite de heap y el del contenedor en `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      NODE_OPTIONS: '--max-old-space-size=384'
    deploy:
      resources:
        limits:
          memory: 512M
```

---

### 3.5 Latencia alta

> **Alerta:** `LatenciaAlta` · severidad **warning** · p95 > 1 s durante 3 min

**Localizar la ruta lenta:**

```promql
histogram_quantile(0.95,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m]))
)
```

**Ver las peticiones lentas concretas** en Loki:

```logql
{job="taskflow"} | json | durationMs > 500
```

| Causa                             | Verificación                                              | Acción                                        |
| --------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| CPU saturada                      | `rate(taskflow_process_cpu_seconds_total[5m])` cerca de 1 | Escalar réplicas o subir CPU                  |
| Event loop bloqueado              | `taskflow_nodejs_eventloop_lag_seconds` alto              | Revisar operaciones síncronas pesadas         |
| Tabla sin índice                  | Latencia proporcional al número de filas                  | Añadir índice en `src/db/database.js`         |
| Contención de escritura en SQLite | Picos coincidentes con altas de tareas                    | WAL ya activo; considerar migrar a PostgreSQL |

---

### 3.6 Exceso de errores 4xx

> **Alerta:** `ExcesoDeErroresDeCliente` · severidad **warning** · > 5 req/s con 4xx durante 5 min

Normalmente **no** es un fallo del servidor, pero sí una señal:

```promql
sum by (route, status_code) (rate(http_requests_total{status_code=~"4.."}[5m]))
```

| Código dominante | Interpretación                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| `400`            | El frontend envía datos que la API rechaza: contrato desalineado tras un deploy |
| `404`            | Enlaces rotos, o un escáner automatizado sondeando rutas                        |
| `429`            | Rate limit activándose: tráfico legítimo en aumento o abuso                     |

Para `429`, decida entre subir `RATE_LIMIT_MAX` (si el tráfico es legítimo) o mantener
el límite y bloquear el origen en el proxy.

---

### 3.7 Reinicio del servicio

> **Alerta:** `ReinicioDelServicio` · severidad **info**

Esperada tras un despliegue. Si **no** hubo despliegue, es un crash: revise el código de
salida (§3.1) y busque `uncaughtException` en los logs.

---

## 4. Copias de seguridad

### 4.1 Realizar una copia

```bash
# Copia consistente del volumen completo
docker run --rm \
  -v taskflow_taskflow-data:/data:ro \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf "/backup/taskflow-$(date +%F-%H%M).tar.gz" -C /data .
```

Para una copia en caliente sin detener el servicio, SQLite ofrece `VACUUM INTO`:

```bash
docker exec taskflow-app node -e "
  const db = require('better-sqlite3')('/app/data/taskflow.db');
  db.exec(\"VACUUM INTO '/app/data/backup-\$(date +%F).db'\");
"
```

### 4.2 Restaurar

```bash
docker compose stop app

docker run --rm \
  -v taskflow_taskflow-data:/data \
  -v "$(pwd)/backups:/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/taskflow-FECHA.tar.gz -C /data'

docker compose start app
./scripts/smoke-test.sh http://localhost:3000
```

### 4.3 Política recomendada

| Aspecto      | Valor                           |
| ------------ | ------------------------------- |
| Frecuencia   | Diaria (cron a las 03:00)       |
| Retención    | 7 diarias + 4 semanales         |
| Ubicación    | Fuera del host de la aplicación |
| Verificación | Restauración de prueba mensual  |

> Una copia de seguridad **nunca probada** no es una copia de seguridad.

Cron sugerido:

```cron
0 3 * * * cd /opt/taskflow && ./scripts/backup.sh >> /var/log/taskflow-backup.log 2>&1
```

---

## 5. Rollback

El pipeline etiqueta cada imagen con el SHA corto del commit, lo que permite volver a
una versión exacta.

El despliegue en servidor usa el override [`docker-compose.prod.yml`](../docker-compose.prod.yml),
que sustituye la construcción local por la imagen publicada. Volver atrás es cambiar la etiqueta:

```bash
# 1. Identificar la versión estable anterior (por SHA del commit)
git log --oneline -10

# 2. Redesplegar esa imagen exacta
export TASKFLOW_IMAGE=ghcr.io/USUARIO/DevOps-Final:a1b2c3d
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app

# 3. Verificar
./scripts/wait-for-health.sh http://localhost:3000/health 60
./scripts/smoke-test.sh http://localhost:3000
```

En un entorno de desarrollo donde el compose base **construye** la imagen en lugar de
descargarla, el rollback equivalente es volver al commit y reconstruir:

```bash
git checkout a1b2c3d
docker compose up -d --build app
```

**Criterio de decisión:** si el servicio está degradado y la causa no se identifica en
**10 minutos**, haga rollback primero e investigue después con el servicio ya restablecido.

**Atención con los datos:** el rollback revierte el código, no el esquema. Si la versión
defectuosa aplicó una migración destructiva, hay que restaurar también desde copia (§4.2).

---

## 6. Escalado

SQLite escribe sobre un único archivo, por lo que **varias réplicas no pueden compartir
el mismo volumen de escritura**. Camino de crecimiento:

| Etapa | Situación                       | Acción                                      |
| ----- | ------------------------------- | ------------------------------------------- |
| 1     | Una instancia saturada de CPU   | Escalado vertical: más CPU al contenedor    |
| 2     | Se necesita alta disponibilidad | Migrar a PostgreSQL y luego replicar la app |
| 3     | Tráfico alto sostenido          | Balanceador + N réplicas sin estado + caché |

La aplicación ya está preparada para el paso 2: todo el SQL está aislado en
`src/services/tasks.service.js` y `src/db/database.js`.

---

## 7. Gestión de logs

### Consultas frecuentes en Loki

```logql
{job="taskflow"} | json | level="error"                  # solo errores
{job="taskflow"} | json | statusCode=~"5.."              # fallos de servidor
{job="taskflow"} | json | durationMs > 1000              # peticiones lentas
{job="taskflow"} | json | route="/api/tasks" | line_format "{{.method}} {{.statusCode}} {{.durationMs}}ms"
sum(rate({job="taskflow"} | json | level="error" [5m]))  # tasa de errores
```

### Rotación

Winston rota a los 5 MB y conserva 5 archivos por tipo (25 MB máximo por archivo de log).
Loki retiene 7 días (`retention_period: 168h`). Para ampliarlo, edite
`monitoring/loki/loki-config.yml` y reinicie el contenedor.

### Cambiar el nivel de log en caliente

```bash
docker compose up -d -e LOG_LEVEL=debug app
# recuerde volver a 'info' al terminar: 'debug' genera mucho volumen
```

---

## 8. Seguridad operativa

Medidas ya implementadas:

- Contenedor ejecutándose como usuario **no root** (`node`).
- **Helmet** con CSP restrictiva; `X-Powered-By` desactivado.
- **Rate limiting** en `/api` (300 req/min por IP por defecto).
- Límite de **100 kB** en el cuerpo de las peticiones.
- Consultas **parametrizadas** en todo el acceso a datos — sin concatenación de SQL.
- El frontend **escapa** todo texto antes de insertarlo en el DOM.
- Los mensajes de error 5xx se **enmascaran**: no se filtran detalles internos al cliente.
- `npm audit --audit-level=high` bloqueante en el pipeline.

Pendientes recomendados antes de una producción real:

- [ ] Terminar TLS en un proxy inverso (§6.4 de [INSTALACION.md](INSTALACION.md))
- [ ] Restringir `/metrics` a la red interna
- [ ] Cambiar las credenciales por defecto de Grafana
- [ ] Autenticación y autorización de usuarios en la API
- [ ] Escaneo de la imagen con Trivy en el pipeline

---

## 9. Checklists

### Antes de desplegar

- [ ] El pipeline está verde en la rama de origen
- [ ] Existe una copia de seguridad reciente
- [ ] Se conoce el SHA de la versión actual (para rollback)
- [ ] Se avisó al equipo si la ventana no es de bajo tráfico

### Después de desplegar

- [ ] `/health` y `/health/ready` responden 200
- [ ] `./scripts/smoke-test.sh` pasa completo
- [ ] El target de Prometheus está **UP**
- [ ] No hay alertas nuevas en http://localhost:9090/alerts
- [ ] La tasa de error y la latencia p95 se mantienen en los valores previos (10 min de observación)

### Revisión semanal

- [ ] Revisar alertas disparadas durante la semana y ajustar umbrales ruidosos
- [ ] Comprobar que las copias de seguridad se están generando
- [ ] `npm audit` sin vulnerabilidades altas nuevas
- [ ] Uso de disco de los volúmenes de Prometheus y Loki
- [ ] Tendencia de latencia y memoria a 7 días

---

## 10. Escalado de incidentes

| Severidad   | Ejemplo                          | Respuesta          | Notificación                     |
| ----------- | -------------------------------- | ------------------ | -------------------------------- |
| **Crítica** | Servicio caído, > 5 % de 5xx     | Inmediata          | Guardia (repetición cada 30 min) |
| **Warning** | Latencia p95 > 1 s, memoria alta | En horario laboral | Canal del equipo (cada 4 h)      |
| **Info**    | Reinicio del servicio            | Solo registro      | Sin notificación activa          |

Alertmanager aplica una regla de **inhibición**: cuando `AplicacionCaida` está activa,
se suprimen las alertas `warning` e `info` del mismo servicio. Un servicio caído genera
una sola página, no seis.
