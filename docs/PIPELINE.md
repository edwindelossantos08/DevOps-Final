# Documentación del Pipeline CI/CD

Archivo de definición: [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml)

---

## 1. Visión general

El pipeline transforma un commit en una imagen desplegada y verificada, atravesando
seis puertas de calidad. Cada puerta puede detener la entrega.

```
   commit / PR
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  VALIDACIÓN  (paralelo, ~1 min)                           │
│  ┌──────────┐  ┌───────────────────┐  ┌────────────────┐  │
│  │ calidad  │  │ pruebas (20 y 22) │  │   seguridad    │  │
│  │ ESLint   │  │ unit + integ +    │  │  npm audit     │  │
│  │ Prettier │  │ cobertura         │  │                │  │
│  └──────────┘  └───────────────────┘  └────────────────┘  │
└───────────────────────────┬───────────────────────────────┘
                            │  los tres deben pasar
                            ▼
                  ┌───────────────────┐
                  │      imagen       │  docker buildx → GHCR
                  │  tags: sha, rama, │  cache=gha
                  │  semver, latest   │
                  └─────────┬─────────┘
                            ▼
                  ┌───────────────────┐
                  │    smoke-test     │  contenedor real
                  │  13 verificaciones│  + logs si falla
                  └─────────┬─────────┘
                            ▼
              ┌─────────────┴──────────────┐
       develop│                            │main
              ▼                            ▼
     ┌────────────────┐          ┌──────────────────┐
     │    staging     │          │    producción    │
     │  (automático)  │          │ (env. protegido) │
     └────────────────┘          └──────────────────┘
```

---

## 2. Disparadores

| Evento              | Ramas / patrones        | Qué se ejecuta                                          |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| `push`              | `main`, `develop`       | Pipeline completo, incluido despliegue                  |
| `push`              | tags `v*`               | Pipeline completo con etiquetado semántico de la imagen |
| `pull_request`      | hacia `main`, `develop` | Solo validación: no construye ni despliega              |
| `workflow_dispatch` | manual                  | Pipeline completo desde la interfaz de GitHub           |

### Por qué los PR no publican imágenes

Un pull request es código **propuesto**, no aceptado. Construir y publicar una imagen
desde una rama de terceros permitiría inyectar artefactos en el registro antes de la
revisión. El condicional `if: github.event_name != 'pull_request'` en el job `imagen`
cierra esa puerta.

---

## 3. Control de concurrencia

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Si se empujan tres commits seguidos a `main`, las dos primeras ejecuciones se cancelan.
Sin esto podría ocurrir una **condición de carrera de despliegue**: el pipeline del
commit antiguo termina después del nuevo y deja producción en una versión atrasada.

---

## 4. Etapas en detalle

### 4.1 `calidad` — Análisis estático

```yaml
- run: npm run lint # ESLint 9 (flat config)
- run: npm run format:check # Prettier en modo verificación
```

ESLint está configurado en [`eslint.config.js`](../eslint.config.js) con dos contextos:

| Contexto  | Archivos                     | Globals     | Particularidad                                |
| --------- | ---------------------------- | ----------- | --------------------------------------------- |
| Servidor  | `src/`, `tests/`, `scripts/` | Node + Jest | `no-var`, `prefer-const`, `eqeqeq` como error |
| Navegador | `public/`                    | Browser     | ES5 permitido: `no-var` desactivado           |

Reglas elevadas a **error** (rompen la build): `no-unused-vars`, `no-undef`, `eqeqeq`,
`no-var`, `prefer-const`, `no-throw-literal`. Las de estilo puro se delegan a Prettier
mediante `eslint-config-prettier`, que se aplica al final para desactivar cualquier
regla en conflicto.

### 4.2 `pruebas` — Matriz de versiones

```yaml
strategy:
  fail-fast: false
  matrix:
    node: ['20', '22']
```

Se prueba contra la versión de producción (20 LTS) y contra la siguiente (22), lo que
anticipa roturas antes de la migración. `fail-fast: false` permite ver el resultado de
ambas: saber que _solo_ falla en 22 es un diagnóstico muy distinto a que falle en las dos.

El job ejecuta tres pasos separados — unitarias, integración y cobertura — en lugar de
uno solo. Al fallar, la interfaz de GitHub señala **qué nivel** de prueba se rompió sin
tener que abrir los logs.

La cobertura se publica como artefacto (`actions/upload-artifact`) con retención de 7 días.

### 4.3 `seguridad` — Auditoría de dependencias

```yaml
- run: npm audit --audit-level=high
```

Falla ante vulnerabilidades **high** o **critical**. Las moderadas y bajas se reportan
sin bloquear: un umbral demasiado estricto genera fatiga de alertas y termina ignorándose.

**Cómo extenderlo:** añadir un escaneo de la imagen con Trivy es un paso natural:

```yaml
- name: Escanear la imagen con Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: taskflow:ci
    severity: HIGH,CRITICAL
    exit-code: '1'
```

### 4.4 `imagen` — Construcción y publicación

```yaml
needs: [calidad, pruebas, seguridad]
```

La dependencia declarada garantiza que **no existe una imagen publicada que no haya
pasado las tres validaciones**. Es la propiedad central del pipeline.

`docker/metadata-action` genera automáticamente las etiquetas:

| Patrón                            | Ejemplo resultante  | Cuándo                            |
| --------------------------------- | ------------------- | --------------------------------- |
| `type=ref,event=branch`           | `ghcr.io/…:main`    | Siempre                           |
| `type=semver,pattern={{version}}` | `ghcr.io/…:1.2.0`   | Al empujar el tag `v1.2.0`        |
| `type=sha,format=short`           | `ghcr.io/…:a1b2c3d` | Siempre — permite rollback exacto |
| `type=raw,value=latest`           | `ghcr.io/…:latest`  | Solo en la rama por defecto       |

La etiqueta por SHA es la que hace posible el rollback preciso descrito en
[OPERACIONES.md](OPERACIONES.md#rollback).

**Caché de capas:**

```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

Si `package*.json` no cambió, la capa de `npm ci` se reutiliza y el build baja de
varios minutos a segundos.

### 4.5 `smoke-test` — Verificación sobre el contenedor real

Esta etapa existe porque **las pruebas de Jest validan el código, no el artefacto**.
Un `Dockerfile` puede olvidar copiar `public/`, fijar mal una variable de entorno o
romper los permisos del volumen: nada de eso lo detecta una prueba unitaria.

Secuencia:

1. `docker build --target runtime -t taskflow:ci .`
2. `docker run -d -p 3000:3000 taskflow:ci`
3. `./scripts/wait-for-health.sh http://localhost:3000/health 60` — espera activa
4. `./scripts/smoke-test.sh http://localhost:3000` — 13 verificaciones
5. `if: failure()` → `docker logs taskflow-ci` — sin esto, un fallo aquí sería opaco
6. `if: always()` → `docker rm -f` — limpieza garantizada

Las verificaciones cubren: salud, readiness, métricas, frontend estático, listado,
alta, validación de entrada, obtención, alternado, borrado, 404 tras borrado y ruta
inexistente.

### 4.6 Despliegues

| Rama      | Entorno      | Aprobación                                              |
| --------- | ------------ | ------------------------------------------------------- |
| `develop` | `staging`    | Automática                                              |
| `main`    | `production` | Configurable como _required reviewer_ en el repositorio |

Los jobs usan la clave `environment:` de GitHub, que aporta dos cosas: la URL visible
en la interfaz y la posibilidad de exigir **aprobación manual** y secretos propios por
entorno sin tocar el YAML.

En este proyecto académico los pasos de despliegue imprimen el comando equivalente
(`docker compose pull && docker compose up -d`) en lugar de ejecutar SSH contra un
servidor real. La estructura del pipeline es la definitiva; solo se sustituye el
contenido de ese paso por, por ejemplo:

```yaml
- name: Desplegar por SSH
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    script: |
      cd /opt/taskflow
      docker compose pull
      docker compose up -d
      ./scripts/smoke-test.sh http://localhost:3000
```

### 4.7 `resumen`

Se ejecuta con `if: always()` y escribe una tabla en `$GITHUB_STEP_SUMMARY` con el
resultado de cada etapa. Aparece en la portada de la ejecución, sin necesidad de
desplegar logs.

---

## 5. Gestión de secretos

| Secreto                                        | Uso                   | Origen                                       |
| ---------------------------------------------- | --------------------- | -------------------------------------------- |
| `GITHUB_TOKEN`                                 | Autenticación en GHCR | Provisto automáticamente por Actions         |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` | Despliegue por SSH    | _Settings → Secrets and variables → Actions_ |

Reglas seguidas:

- **Ningún secreto en el repositorio.** `.env` está en `.gitignore`; solo se versiona `.env.example`.
- **Permisos mínimos.** El job `imagen` declara explícitamente `contents: read` y
  `packages: write`, en lugar del token con permisos amplios por defecto.
- Los secretos de despliegue se asocian al **environment**, no al repositorio, de modo
  que una rama cualquiera no puede leer las credenciales de producción.

---

## 6. Tiempos de ejecución aproximados

| Etapa                         | Primera ejecución | Con caché  |
| ----------------------------- | ----------------- | ---------- |
| `calidad`                     | ~50 s             | ~35 s      |
| `pruebas` (por versión)       | ~70 s             | ~45 s      |
| `seguridad`                   | ~45 s             | ~30 s      |
| `imagen`                      | ~3 min            | ~40 s      |
| `smoke-test`                  | ~2 min            | ~1 min     |
| **Total (extremo a extremo)** | **~7 min**        | **~3 min** |

El paralelismo de las tres primeras etapas ahorra alrededor de 2 minutos por ejecución.

---

## 7. Estrategia de ramas

```
main      ●────────────●────────────●        producción (protegida)
           \          /            /
develop     ●────●───●────●───────●          staging
             \      /      \     /
feature/x     ●────●        ●───●            validación por PR
```

| Rama        | Propósito            | Protección recomendada                          |
| ----------- | -------------------- | ----------------------------------------------- |
| `main`      | Código en producción | PR obligatorio, checks verdes, sin push directo |
| `develop`   | Integración continua | Checks verdes                                   |
| `feature/*` | Trabajo individual   | —                                               |

Reglas a activar en _Settings → Branches_ para `main`:

- Require a pull request before merging
- Require status checks to pass: `calidad`, `pruebas (20)`, `pruebas (22)`, `seguridad`
- Require branches to be up to date before merging

---

## 8. Cómo extender el pipeline

| Objetivo                                 | Cómo                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Escaneo de vulnerabilidades de la imagen | Añadir `aquasecurity/trivy-action` tras el build                              |
| Pruebas end-to-end de navegador          | Job con Playwright que ataque el contenedor de `smoke-test`                   |
| Análisis de calidad con SonarQube        | Job que consuma `coverage/lcov.info` (ya se genera)                           |
| Despliegue canario                       | Rolling update en Kubernetes o dos servicios en Compose con pesos en el proxy |
| Notificaciones a Slack                   | Paso final con `slackapi/slack-github-action` y `if: always()`                |
| Publicar releases                        | Job en tags `v*` con `softprops/action-gh-release`                            |

---

## 9. Depuración de fallos del pipeline

| Síntoma                         | Diagnóstico                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `calidad` falla                 | Reproduzca en local con `npm run lint`; `npm run lint:fix` corrige lo automatizable        |
| `pruebas` falla solo en Node 22 | Incompatibilidad de una dependencia con la versión nueva; revise el changelog              |
| Cobertura por debajo del umbral | `npm run test:coverage` y abra `coverage/lcov-report/index.html`                           |
| `imagen` falla en `npm ci`      | Lockfile desincronizado: ejecute `npm install` y haga commit de `package-lock.json`        |
| `smoke-test` falla              | El paso `docker logs` del job muestra el error real de la aplicación                       |
| El despliegue no se dispara     | Verifique la condición `if: github.ref == 'refs/heads/main'` y desde qué rama vino el push |
