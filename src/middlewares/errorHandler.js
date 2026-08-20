// Manejadores de 404 y de errores. Centralizan el formato de respuesta de fallos
// para que el frontend siempre reciba la misma estructura { error: { ... } }.

'use strict';

const logger = require('../config/logger');
const config = require('../config/env');

/**
 * Middleware para rutas no registradas. Responde 404 en JSON.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
      requestId: req.requestId,
    },
  });
}

/**
 * Manejador global de errores de Express.
 * Los errores de dominio (AppError) se devuelven tal cual; el resto se enmascara
 * como 500 para no filtrar detalles internos al cliente.
 */
// Express identifica el manejador de errores por su firma de 4 argumentos,
// por eso `next` debe declararse aunque no se use.
function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  // Solo los fallos inesperados se registran con stack completo
  if (statusCode >= 500) {
    logger.error('Error no controlado', {
      requestId: req.requestId,
      message: error.message,
      stack: error.stack,
      path: req.originalUrl,
    });
  } else {
    logger.warn('Error de validacion o recurso', {
      requestId: req.requestId,
      message: error.message,
      statusCode,
      path: req.originalUrl,
    });
  }

  res.status(statusCode).json({
    error: {
      message: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
      statusCode,
      requestId: req.requestId,
      // El stack se expone unicamente fuera de produccion, para depurar
      ...(config.nodeEnv !== 'production' && statusCode >= 500 ? { stack: error.stack } : {}),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
