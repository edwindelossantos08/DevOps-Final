# Presentación Final — TaskFlow

Guion de la presentación grupal, demo en vivo y análisis del proyecto.
Duración objetivo: **15 minutos de exposición + 5 de preguntas**.

---

## Estructura de la presentación

| #   | Sección                         | Tiempo | Responsable |
| --- | ------------------------------- | ------ | ----------- |
| 1   | Introducción y objetivos        | 1 min  | —           |
| 2   | Arquitectura de la aplicación   | 2 min  | —           |
| 3   | Pipeline CI/CD                  | 3 min  | —           |
| 4   | **Demo en vivo**                | 5 min  | —           |
| 5   | Monitoreo y alertas             | 2 min  | —           |
| 6   | Desafíos y lecciones aprendidas | 2 min  | —           |
| 7   | Preguntas                       | 5 min  | Todos       |

---

## Diapositiva 1 — Portada

**TaskFlow — Pipeline DevOps de extremo a extremo**
Práctica Final · Integrantes · Fecha

> Frase de apertura: _"La aplicación es sencilla a propósito. Lo que construimos no es
> un gestor de tareas: es todo el camino automatizado que lleva un commit a producción
> con confianza."_

---

## Diapositiva 2 — El problema

Sin pipeline:

- El despliegue es manual, distinto cada vez y depende de quién lo haga.
- Los errores se descubren **en producción**, no antes.
- No hay forma de saber si el servicio está sano hasta que un usuario reclama.
- Volver atrás es improvisar.

Con pipeline: **cada commit atraviesa las mismas seis puertas de calidad, siempre.**

---

## Diapositiva 3 — Arquitectura de la aplicación

```
Navegador (HTML/CSS/JS)
        │ HTTP/JSON
        ▼
Express — rutas → controladores → servicio → SQLite
        │
        ├─► métricas Prometheus (/metrics)
        └─► logs JSON (Winston)
```

**Puntos a destacar:**

- Arquitectura **en capas**: los controladores no ejecutan SQL, el servicio no conoce Express.
- Esa separación es lo que permite tener **29 pruebas unitarias sin levantar un servidor**.
- `app.js` construye la aplicación; `server.js` la arranca. Supertest monta `app` directamente.

---

## Diapositiva 4 — Stack tecnológico

| Capa          | Herramienta                                   |
| ------------- | --------------------------------------------- |
| Aplicación    | Node.js 20 + Express + SQLite                 |
| Pruebas       | Jest + Supertest (54 pruebas, 92 % cobertura) |
| Calidad       | ESLint 9 + Prettier + npm audit               |
| Contenedores  | Docker multi-etapa + Compose (6 servicios)    |
| CI/CD         | GitHub Actions (8 jobs)                       |
| Métricas      | prom-client + Prometheus                      |
| Logs          | Winston + Promtail + Loki                     |
| Visualización | Grafana                                       |
| Alertas       | Alertmanager (6 reglas)                       |

---

## Diapositiva 5 — El pipeline

```
commit → [calidad ‖ pruebas ‖ seguridad] → imagen → smoke-test → despliegue
```

**Tres decisiones que vale la pena defender:**

1. **Las tres validaciones corren en paralelo.** Feedback de fallo en ~1 min en lugar de ~3.
   En un pipeline se optimiza el tiempo hasta el _fallo_, no hasta el éxito.

2. **Los pull requests validan pero no publican.** Código propuesto no es código aceptado;
   no debe poder inyectar artefactos en el registro antes de la revisión.

3. **Los smoke tests corren contra el contenedor real.** Jest valida el código; no detecta
   que el `Dockerfile` olvidó copiar `public/`. Son verificaciones de naturaleza distinta.

---

## Diapositiva 6 — Guion de la demo en vivo

> **Preparación previa (antes de la presentación, no en vivo):**
>
> ```bash
> docker compose up -d --build     # que el stack ya esté caliente
> node scripts/seed.js             # datos de ejemplo
> ```
>
> Tenga abiertas en pestañas: la app, GitHub Actions, Prometheus/alerts, Grafana.

### Paso 1 — La aplicación funciona (45 s)

http://localhost:3000 — crear una tarea, marcarla completada, ver el contador actualizarse.

> _"Frontend, API y base de datos. Es la parte simple. Ahora veamos lo que hay detrás."_

### Paso 2 — Las pruebas (45 s)

```bash
npm test
```

> _"54 pruebas en dos segundos y medio. Unitarias contra la lógica de negocio, de
> integración contra la API completa vía HTTP."_

### Paso 3 — La puerta de calidad se cierra (90 s) — **el momento clave**

Rompa algo a propósito, en vivo:

```bash
# Introducir un fallo real en la validación
sed -i '' 's/if (!titulo) {/if (false) {/' src/services/tasks.service.js
npm test
```

> _"Cinco pruebas fallan de inmediato. Este commit no llega a construirse ni a desplegarse:
> el job `imagen` depende de que `pruebas` pase."_

Revertir:

```bash
git checkout src/services/tasks.service.js
npm test    # verde otra vez
```

### Paso 4 — El pipeline en GitHub (60 s)

Muestre una ejecución real: los tres jobs en paralelo, el fan-in hacia `imagen`,
el `smoke-test` y la tabla del resumen.

### Paso 5 — Métricas en vivo (60 s)

Genere tráfico y muestre Grafana reaccionando:

```bash
for i in $(seq 1 40); do
  curl -s -X POST localhost:3000/api/tasks -H 'Content-Type: application/json' \
    -d "{\"title\":\"Demo $i\"}" > /dev/null
done
```

> _"Peticiones por segundo, latencia p95, tareas creadas por minuto. Métricas técnicas
> y de negocio en el mismo panel."_

### Paso 6 — Una alerta real (60 s) — **el cierre fuerte**

```bash
docker compose stop app
```

- http://localhost:9090/alerts → `AplicacionCaida` pasa a **PENDING** y, tras 1 minuto, a **FIRING**.
- http://localhost:9093 → la alerta llega agrupada a Alertmanager.

> _"Un minuto de espera es deliberado: evita alertar por un reinicio de dos segundos."_

```bash
docker compose start app     # la alerta se resuelve sola
```

### Paso 7 — Los logs (30 s)

Grafana → Explore → Loki:

```logql
{job="taskflow"} | json | level="error"
```

> _"Cada línea trae un requestId que también viaja en la cabecera de la respuesta:
> un usuario reporta un error, pegamos su ID y tenemos la traza exacta."_

---

## Diapositiva 7 — Monitoreo: los tres pilares

| Pilar        | Herramienta          | Pregunta que responde                   |
| ------------ | -------------------- | --------------------------------------- |
| **Métricas** | Prometheus + Grafana | ¿Cómo se comporta el sistema?           |
| **Logs**     | Winston + Loki       | ¿Qué pasó exactamente en esta petición? |
| **Alertas**  | Alertmanager         | ¿Cuándo debo intervenir?                |

**Detalle técnico que demuestra criterio — cardinalidad:**

Las rutas se normalizan a `/api/tasks/:id` en lugar de `/api/tasks/42`. Sin esa
normalización, mil tareas generarían mil series temporales distintas y Prometheus
se degradaría. La misma lógica se aplicó en Promtail: solo `level`, `route` y
`statusCode` se promueven a etiquetas de Loki; `requestId` se queda como campo.

---

## Diapositiva 8 — Desafíos y soluciones

| #   | Desafío                                                                                             | Solución adoptada                                                                          | Qué se aprendió                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | **Las pruebas se contaminaban entre sí:** una suite dejaba datos que rompían a la siguiente         | `NODE_ENV=test` fuerza SQLite en `:memory:` y `resetDb()` corre en cada `beforeEach`       | Las pruebas deben ser independientes del orden de ejecución       |
| 2   | **`GET /api/tasks/stats` devolvía 400:** Express la capturaba como `/:id` con id `"stats"`          | Declarar la ruta literal **antes** que la paramétrica en el router                         | En Express el orden de las rutas es semántico, no cosmético       |
| 3   | **Cardinalidad explosiva en Prometheus:** cada id generaba una serie nueva                          | Normalizar la etiqueta `route` usando `req.route.path`                                     | Una métrica mal etiquetada es peor que no tener métrica           |
| 4   | **La imagen Docker pesaba más de 1 GB:** incluía compiladores y devDependencies                     | Build multi-etapa: la etapa `runtime` solo recibe `node_modules` de producción y el código | Menos superficie es menos peso _y_ menos riesgo                   |
| 5   | **`docker stop` cortaba peticiones en vuelo:** Node no recibía `SIGTERM` como PID 1                 | `tini` como init + `server.close()` con temporizador de 10 s                               | El apagado ordenado es parte del contrato con el orquestador      |
| 6   | **Alerta de caída con seis avisos simultáneos:** latencia, memoria y errores se disparaban a la vez | Regla de **inhibición** en Alertmanager sobre `AplicacionCaida`                            | Una alerta que satura el canal deja de ser útil                   |
| 7   | **La readiness reiniciaba el contenedor ante un fallo de BD**                                       | Separar liveness (`/health`, no toca la BD) de readiness (`/health/ready`, sí)             | Reiniciar no arregla un volumen corrupto: solo borra la evidencia |
| 8   | **La cobertura bajaba sin que nadie lo notara**                                                     | `coverageThreshold` en `jest.config.js` hace fallar la build                               | Una métrica que no bloquea nada se ignora en dos semanas          |

---

## Diapositiva 9 — Lecciones aprendidas

1. **Automatizar temprano cuesta menos que automatizar tarde.**
   Montamos el pipeline con la aplicación a medias. Cada funcionalidad posterior nació
   ya validada; no hubo una fase de "ahora hay que hacer que todo esto pase las pruebas".

2. **La observabilidad se diseña, no se añade.**
   El `requestId` que correlaciona logs, la normalización de rutas y la separación
   liveness/readiness son decisiones de diseño de la aplicación, no configuración del
   stack de monitoreo. Añadirlas después habría implicado tocar todos los middlewares.

3. **Las pruebas de humo cubren un hueco que las unitarias no ven.**
   El primer contenedor que construimos arrancaba y pasaba `npm test`, pero devolvía
   404 en `/` porque el `.dockerignore` excluía `public/`. Solo un smoke test contra el
   contenedor real detecta esa clase de fallo.

4. **Una alerta ruidosa es peor que ninguna alerta.**
   Nuestra primera versión disparaba `LatenciaAlta` en cada despliegue. Los `for` de
   1 a 5 minutos y las reglas de inhibición son la diferencia entre un sistema que se
   consulta y uno que se silencia.

5. **La documentación operativa se escribe pensando en el incidente.**
   `OPERACIONES.md` va del síntoma a la acción porque a las 3 de la madrugada nadie lee
   una explicación de arquitectura: busca el comando.

---

## Diapositiva 10 — Cumplimiento del enunciado

| Requisito              | Evidencia                                                       |
| ---------------------- | --------------------------------------------------------------- |
| Repositorio Git        | Ramas `main`/`develop`, `.gitignore`, historial limpio          |
| Pipeline CI/CD         | `.github/workflows/ci-cd.yml` — 8 jobs                          |
| Contenedores Docker    | `Dockerfile` multi-etapa + `docker-compose.yml` con 6 servicios |
| Pruebas unitarias      | 33 pruebas en `tests/unit/`                                     |
| Pruebas de integración | 21 pruebas en `tests/integration/`                              |
| Análisis estático      | ESLint 9 + Prettier + `npm audit`, bloqueantes en CI            |
| Logs centralizados     | Winston JSON → Promtail → Loki → Grafana                        |
| Métricas               | 7 familias de métricas → Prometheus → dashboard de 11 paneles   |
| Alertas                | 6 reglas con severidad, agrupación e inhibición                 |
| Documentación          | README + Instalación + Pipeline + Operaciones + Presentación    |

---

## Diapositiva 11 — Trabajo futuro

- Escaneo de la imagen con **Trivy** en el pipeline.
- Pruebas **end-to-end** de navegador con Playwright.
- Migración a **PostgreSQL** para permitir múltiples réplicas.
- **Despliegue canario** con incremento progresivo de tráfico.
- **Trazas distribuidas** con OpenTelemetry, completando el tercer pilar de la observabilidad.
- **Autenticación** de usuarios y autorización por rol.

---

## Preguntas frecuentes previstas

**¿Por qué SQLite y no MongoDB o PostgreSQL?**
El enunciado admite SQLite y aporta una ventaja concreta para este proyecto: cero
servicios externos, lo que mantiene el foco en el pipeline. Además, todo el SQL está
aislado en dos archivos, por lo que migrar a PostgreSQL cuando haga falta escalar
horizontalmente es un cambio acotado.

**¿Qué pasa si falla el despliegue en producción?**
Rollback por SHA: el pipeline etiqueta cada imagen con el hash del commit, así que se
vuelve a una versión exacta con `APP_VERSION=<sha> docker compose up -d`. El criterio
operativo es: si no se identifica la causa en 10 minutos, primero se revierte.

**¿Por qué liveness y readiness separados?**
Liveness responde "¿el proceso está vivo?" y readiness "¿puede atender tráfico?".
Si la base de datos falla, queremos sacar la instancia de rotación (readiness en 503),
no reiniciar el contenedor: reiniciar no arregla un volumen corrupto y destruye el
estado que permitiría diagnosticarlo.

**¿Cómo evitan las alertas falsas?**
Con tres mecanismos: la cláusula `for` (la condición debe sostenerse entre 1 y 5 minutos),
las reglas de inhibición (una caída suprime las alertas derivadas) y la agrupación por
`alertname` + `service` en Alertmanager.

**¿La cobertura del 92 % garantiza que no hay errores?**
No. La cobertura mide qué líneas se ejecutan, no si las aserciones son correctas.
Por eso el pipeline combina cobertura con pruebas de integración sobre HTTP real y
smoke tests contra el contenedor: son tres formas distintas de equivocarse.

**¿Cuánto tarda el pipeline completo?**
Unos 7 minutos la primera vez y cerca de 3 con la caché de npm y de Docker buildx
caliente. El feedback de un fallo de lint o de pruebas llega en menos de 1 minuto.
