// Centraliza la lectura de variables de entorno y sus valores por defecto.
// Cualquier configuracion externa del servicio debe pasar por este modulo.

'use strict';

// Convierte una variable de entorno a numero, con valor por defecto si es invalida
function toNumber(valor, porDefecto) {
  const numero = Number.parseInt(valor, 10);
  return Number.isNaN(numero) ? porDefecto : numero;
}

const config = {
  // Entorno de ejecucion: development | test | production
  nodeEnv: process.env.NODE_ENV || 'development',

  // Puerto HTTP donde escucha Express
  port: toNumber(process.env.PORT, 3000),

  // Ruta del archivo SQLite. ':memory:' se usa en las pruebas automatizadas
  dbPath: process.env.DB_PATH || './data/taskflow.db',

  // Nivel de detalle de los logs de Winston
  logLevel: process.env.LOG_LEVEL || 'info',

  // Directorio donde se escriben los logs en formato JSON (para Promtail/Loki)
  logDir: process.env.LOG_DIR || './logs',

  // Ventana y limite del rate limiting expresados en milisegundos y peticiones
  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 300),

  // Version de la aplicacion, inyectada por el pipeline al construir la imagen
  appVersion: process.env.APP_VERSION || require('../../package.json').version,

  // Identificador de la instancia, util cuando hay varias replicas
  instanceId: process.env.INSTANCE_ID || 'local',
};

// Indica si estamos en el entorno de pruebas para silenciar logs ruidosos
config.isTest = config.nodeEnv === 'test';

module.exports = config;
