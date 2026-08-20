// Middleware que registra cada peticion HTTP y alimenta las metricas de Prometheus.
// Se apoya en el evento 'finish' de la respuesta para medir la latencia real.

'use strict';

const crypto = require('node:crypto');
const logger = require('../config/logger');
const metrics = require('../config/metrics');

/**
 * Normaliza la ruta para las etiquetas de Prometheus.
 * Sin esto, cada /api/tasks/123 generaria una serie distinta (cardinalidad infinita).
 * @param {import('express').Request} req - Peticion en curso.
 * @param {import('express').Response} res - Respuesta ya finalizada.
 * @returns {string} Patron de ruta, por ejemplo '/api/tasks/:id'.
 */
function rutaNormalizada(req, res) {
  // req.route existe solo cuando un handler concreto atendio la peticion
  if (req.route && req.baseUrl !== undefined) {
    return `${req.baseUrl}${req.route.path}`.replace(/\/$/, '') || '/';
  }
  // express.static resuelve sin dejar req.route. Se distingue de un 404 real
  // para no mezclar el trafico del frontend con las rutas inexistentes.
  if (res.statusCode < 400) {
    return 'static';
  }
  // Peticiones no enrutadas se agrupan bajo una etiqueta unica de baja cardinalidad
  return 'unmatched';
}

function requestLogger(req, res, next) {
  // Identificador de correlacion: viaja al cliente y a los logs para trazar la peticion
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const inicio = process.hrtime.bigint();

  res.on('finish', () => {
    // Diferencia en nanosegundos convertida a segundos, que es la unidad de Prometheus
    const duracionSegundos = Number(process.hrtime.bigint() - inicio) / 1e9;
    const etiquetas = {
      method: req.method,
      route: rutaNormalizada(req, res),
      status_code: String(res.statusCode),
    };

    metrics.httpRequestsTotal.inc(etiquetas);
    metrics.httpRequestDuration.observe(etiquetas, duracionSegundos);

    // Las respuestas de error se contabilizan aparte para la alerta de error rate
    if (res.statusCode >= 400) {
      metrics.httpErrorsTotal.inc(etiquetas);
    }

    // Los errores se registran en nivel warn/error; el trafico normal en info
    const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(nivel, 'peticion_http', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      route: etiquetas.route,
      statusCode: res.statusCode,
      durationMs: Math.round(duracionSegundos * 1000),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}

module.exports = requestLogger;
