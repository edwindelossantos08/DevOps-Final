// Logger centralizado basado en Winston.
// Emite JSON estructurado para que Promtail lo envie a Loki sin transformaciones.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const winston = require('winston');
const config = require('./env');

// Crea el directorio de logs si no existe; sin el, los transports de archivo fallan
if (!config.isTest && !fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

// Formato JSON con timestamp ISO y stack completo en los errores
const formatoJson = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato legible para desarrollo local
const formatoConsola = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${extra}`;
  })
);

const transports = [
  new winston.transports.Console({
    // En produccion la consola tambien emite JSON: docker logs se vuelve parseable
    format: config.nodeEnv === 'production' ? formatoJson : formatoConsola,
    silent: config.isTest,
  }),
];

// En ejecucion real se persisten los logs a disco para el stack de logs centralizados
if (!config.isTest) {
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logDir, 'app.log'),
      format: formatoJson,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(config.logDir, 'error.log'),
      level: 'error',
      format: formatoJson,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: config.logLevel,
  // Campos fijos que permiten filtrar por servicio, version e instancia en Loki
  defaultMeta: {
    service: 'taskflow-api',
    version: config.appVersion,
    instance: config.instanceId,
    env: config.nodeEnv,
  },
  transports,
});

module.exports = logger;
