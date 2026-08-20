// Registro de metricas Prometheus expuestas en /metrics.
// Incluye metricas por defecto de Node.js mas metricas de negocio propias.

'use strict';

const client = require('prom-client');
const config = require('./env');

// Registro aislado: evita colisiones cuando Jest recarga el modulo entre suites
const registry = new client.Registry();

// Etiquetas comunes a todas las series de este servicio
registry.setDefaultLabels({
  app: 'taskflow',
  version: config.appVersion,
  instance: config.instanceId,
});

// Metricas de proceso: CPU, memoria, event loop lag, handles abiertos
client.collectDefaultMetrics({ register: registry, prefix: 'taskflow_' });

// Contador de peticiones HTTP segmentado por metodo, ruta y codigo de estado
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Numero total de peticiones HTTP atendidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// Histograma de latencia: base para calcular p95/p99 y la alerta de lentitud
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duracion de las peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  // Buckets afinados para una API web: de 5ms a 5s
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Contador de errores no controlados que llegan al manejador global
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Numero total de respuestas de error (>=400)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// Metrica de negocio: tareas creadas desde que arranco el proceso
const tasksCreatedTotal = new client.Counter({
  name: 'taskflow_tasks_created_total',
  help: 'Numero total de tareas creadas',
  registers: [registry],
});

// Metrica de negocio: tareas completadas desde que arranco el proceso
const tasksCompletedTotal = new client.Counter({
  name: 'taskflow_tasks_completed_total',
  help: 'Numero total de tareas marcadas como completadas',
  registers: [registry],
});

// Gauge con la foto actual de la base de datos, refrescado en cada scrape
const tasksInDatabase = new client.Gauge({
  name: 'taskflow_tasks_in_database',
  help: 'Cantidad de tareas almacenadas actualmente, segmentada por estado',
  labelNames: ['status'],
  registers: [registry],
});

module.exports = {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal,
  tasksCreatedTotal,
  tasksCompletedTotal,
  tasksInDatabase,
};
