# Guía de Instalación — TaskFlow

Esta guía cubre desde la puesta en marcha en una máquina de desarrollo hasta el
despliegue del stack completo en un servidor.

---

## 1. Requisitos previos

### Para ejecución local (sin Docker)

| Software | Versión mínima | Verificar con   |
| -------- | -------------- | --------------- |
| Node.js  | 20.x           | `node -v`       |
| npm      | 10.x           | `npm -v`        |
| Git      | 2.x            | `git --version` |

> **Node 20 o superior es obligatorio.** El proyecto usa `node:test`-era APIs de Node moderno
> y la dependencia nativa `better-sqlite3` publica binarios precompilados a partir de esa versión.

### Para el stack completo

| Software       | Versión mínima | Verificar con            |
| -------------- | -------------- | ------------------------ |
| Docker Engine  | 24.x           | `docker --version`       |
| Docker Compose | v2 (plugin)    | `docker compose version` |

En macOS y Windows basta con **Docker Desktop**; asegúrese de que esté **en ejecución**
antes de lanzar los comandos (`docker info` debe responder sin error).

### Recursos recomendados

El stack completo levanta 6 contenedores. Asigne a Docker al menos:

- **4 GB de RAM**
- **2 CPU**
- **10 GB de disco** (Prometheus retiene 15 días y Loki 7)

---

## 2. Obtener el código

```bash
git clone https://github.com/edwindelossantos08/DevOps-Final.git
cd DevOps-Final
```

---

## 3. Instalación local (desarrollo)

### 3.1 Instalar dependencias

```bash
npm install
```

`better-sqlite3` intentará descargar un binario precompilado. Si su plataforma no tiene uno,
lo compilará desde el código fuente, para lo cual necesita:

- **Linux**: `sudo apt-get install -y python3 make g++`
- **macOS**: `xcode-select --install`
- **Windows**: `npm install --global windows-build-tools` (como administrador)

### 3.2 Configurar las variables de entorno

```bash
cp .env.example .env
```

| Variable               | Por defecto          | Descripción                                      |
| ---------------------- | -------------------- | ------------------------------------------------ |
| `NODE_ENV`             | `development`        | Entorno: `development`, `test` o `production`    |
| `PORT`                 | `3000`               | Puerto HTTP de la API                            |
| `DB_PATH`              | `./data/taskflow.db` | Ruta del archivo SQLite                          |
| `LOG_LEVEL`            | `info`               | `error`, `warn`, `info`, `http` o `debug`        |
| `LOG_DIR`              | `./logs`             | Directorio de logs en JSON                       |
| `RATE_LIMIT_WINDOW_MS` | `60000`              | Ventana del rate limiting                        |
| `RATE_LIMIT_MAX`       | `300`                | Peticiones máximas por ventana                   |
| `INSTANCE_ID`          | `local`              | Identificador de la instancia en métricas y logs |

> El archivo `.env` está en `.gitignore` y **nunca debe subirse al repositorio**.

### 3.3 Arrancar

```bash
npm run dev     # con recarga automática (node --watch)
npm start       # sin recarga
```

Abra http://localhost:3000. La base de datos y el directorio de logs se crean solos
en el primer arranque.

### 3.4 Cargar datos de ejemplo (opcional)

```bash
node scripts/seed.js
```

Inserta 9 tareas que representan las fases del propio proyecto — útil para la demo
y para que los paneles de Grafana muestren datos desde el primer minuto.

### 3.5 Verificar la instalación

```bash
npm test                                  # 54 pruebas deben pasar
npm run lint                              # sin errores
./scripts/smoke-test.sh http://localhost:3000
```

---

## 4. Instalación con Docker (solo la aplicación)

```bash
# Construir la imagen
docker build --target runtime -t taskflow:local .

# Ejecutar con persistencia de datos
docker run -d \
  --name taskflow \
  -p 3000:3000 \
  -v taskflow-data:/app/data \
  -v taskflow-logs:/app/logs \
  taskflow:local

# Verificar el estado del healthcheck
docker ps --filter name=taskflow
docker logs -f taskflow
```

Notas sobre la imagen:

- Es **multi-etapa**: la etapa `deps` compila las dependencias nativas y la etapa
  `runtime` solo copia `node_modules` ya construido, `src/` y `public/`.
- Se ejecuta como el usuario **no privilegiado** `node`.
- Usa **tini** como PID 1 para que `SIGTERM` llegue a Node y el apagado sea ordenado.
- Incluye un **HEALTHCHECK** nativo que consulta `/health` cada 30 s.

---

## 5. Instalación del stack completo (aplicación + monitoreo)

```bash
docker compose up -d --build
```

Esto levanta 6 servicios:

| Contenedor              | Imagen                      | Puerto host | Función                 |
| ----------------------- | --------------------------- | ----------- | ----------------------- |
| `taskflow-app`          | build local                 | 3000        | Aplicación              |
| `taskflow-prometheus`   | `prom/prometheus:v2.54.1`   | 9090        | Recolección de métricas |
| `taskflow-alertmanager` | `prom/alertmanager:v0.27.0` | 9093        | Enrutado de alertas     |
| `taskflow-loki`         | `grafana/loki:3.1.1`        | 3100        | Almacén de logs         |
| `taskflow-promtail`     | `grafana/promtail:3.1.1`    | —           | Envío de logs a Loki    |
| `taskflow-grafana`      | `grafana/grafana:11.2.0`    | 3001        | Dashboards              |

### 5.1 Verificar que todo arrancó

```bash
docker compose ps                          # todos en estado running/healthy
curl http://localhost:3000/health          # {"status":"ok",...}
curl http://localhost:9090/-/healthy       # Prometheus Server is Healthy
curl http://localhost:3100/ready           # ready
```

### 5.2 Comprobar que Prometheus ve la aplicación

Abra http://localhost:9090/targets — el target `taskflow-app` debe aparecer **UP**.

### 5.3 Abrir el dashboard

1. Entre a http://localhost:3001 con `admin` / `admin`.
2. El datasource y el dashboard ya están **aprovisionados**: menú **Dashboards → carpeta TaskFlow → TaskFlow — Visión General**.
3. Genere tráfico para ver movimiento en los paneles:

```bash
for i in $(seq 1 50); do
  curl -s -X POST http://localhost:3000/api/tasks \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"Carga $i\"}" > /dev/null
  curl -s http://localhost:3000/api/tasks > /dev/null
done
```

### 5.4 Cambiar las credenciales de Grafana

Las credenciales por defecto son solo para la demo. Para cambiarlas:

```bash
GRAFANA_USER=miusuario GRAFANA_PASSWORD='una-clave-larga' docker compose up -d grafana
```

### 5.5 Detener el stack

```bash
docker compose down       # detiene y borra los contenedores, conserva los volúmenes
docker compose down -v    # además borra los volúmenes (se pierden datos y métricas)
```

---

## 6. Despliegue en un servidor

### 6.1 Preparar el servidor

```bash
# Instalar Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # requiere volver a iniciar sesión
```

### 6.2 Desplegar desde la imagen publicada por el pipeline

El pipeline publica la imagen en GitHub Container Registry:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u edwindelossantos08 --password-stdin
docker pull ghcr.io/edwindelossantos08/devops-final:latest

docker run -d \
  --name taskflow \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e INSTANCE_ID=prod-1 \
  -v taskflow-data:/app/data \
  -v taskflow-logs:/app/logs \
  ghcr.io/edwindelossantos08/devops-final:latest
```

### 6.3 Actualizar a una versión nueva

En el servidor se usa el override [`docker-compose.prod.yml`](../docker-compose.prod.yml),
que reemplaza la construcción local por la imagen ya publicada y verificada por el pipeline:

```bash
export TASKFLOW_IMAGE=ghcr.io/edwindelossantos08/devops-final:latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Compose reemplaza los contenedores cuya imagen cambió y **conserva los volúmenes**,
por lo que no se pierden datos. Para volver a una versión anterior basta con fijar
`TASKFLOW_IMAGE` a la etiqueta por SHA de ese commit (véase el
[procedimiento de rollback](OPERACIONES.md#5-rollback)).

### 6.4 Proxy inverso con TLS (recomendado en producción)

La aplicación no termina TLS. Colóquela detrás de Nginx o Caddy:

```nginx
server {
    listen 443 ssl http2;
    server_name taskflow.example.com;

    ssl_certificate     /etc/letsencrypt/live/taskflow.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/taskflow.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # /metrics no debería quedar expuesto públicamente
    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

La aplicación ya tiene `trust proxy` activado, por lo que `req.ip` reflejará la IP real
del cliente y el rate limiting funcionará correctamente detrás del proxy.

---

## 7. Resolución de problemas

| Síntoma                               | Causa probable                              | Solución                                                                                    |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon` | Docker Desktop no está iniciado             | Ábralo y espere a que `docker info` responda                                                |
| `EADDRINUSE: port 3000`               | Otro proceso usa el puerto                  | `lsof -i :3000` y termine el proceso, o use `PORT=3001 npm start`                           |
| `node-gyp` falla al instalar          | Faltan herramientas de compilación          | Instale `python3`, `make` y `g++` (ver §3.1)                                                |
| `SQLITE_CANTOPEN`                     | El proceso no puede escribir en `DB_PATH`   | Verifique permisos del directorio; en Docker, que el volumen esté montado                   |
| Prometheus muestra el target DOWN     | La app no arrancó o no está en la misma red | `docker compose logs app` y confirme que ambos usan `taskflow-net`                          |
| Grafana sin datos                     | El datasource no resuelve Prometheus        | Compruebe que el `uid` del datasource es `prometheus` (está fijado en el aprovisionamiento) |
| Loki sin logs                         | Promtail no ve el volumen de logs           | Confirme que `taskflow-logs` está montado en ambos contenedores                             |
| Las pruebas fallan con `SQLITE_BUSY`  | Una instancia local tiene la base bloqueada | Las pruebas usan `:memory:`; verifique que `NODE_ENV=test` esté aplicado                    |
| `429 Too Many Requests`               | Se superó el rate limit                     | Suba `RATE_LIMIT_MAX` o espere a que pase la ventana                                        |

### Comandos de diagnóstico

```bash
docker compose ps                      # estado y salud de cada servicio
docker compose logs -f app             # logs en vivo de la aplicación
docker compose logs --tail=100 prometheus
docker stats                           # consumo de CPU y memoria
docker exec -it taskflow-app sh        # shell dentro del contenedor
curl -s localhost:3000/metrics | head  # verificar que las métricas salen
```

---

## 8. Desinstalación

```bash
docker compose down -v                 # contenedores, redes y volúmenes
docker rmi taskflow:local              # imagen local
rm -rf node_modules data logs coverage # artefactos locales
```
