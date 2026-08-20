// Punto de entrada del proceso: arranca el servidor HTTP y gestiona el apagado ordenado.

'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const { getDb, closeDb } = require('./db/database');

// Se inicializa la base de datos al arrancar para fallar rapido si el volumen no esta listo
getDb();

const server = app.listen(config.port, () => {
  logger.info('Servidor TaskFlow iniciado', {
    port: config.port,
    env: config.nodeEnv,
    version: config.appVersion,
  });
});

/**
 * Apagado ordenado: deja de aceptar conexiones, cierra la base de datos y sale.
 * Docker envia SIGTERM al detener el contenedor; sin esto se perderian peticiones en vuelo.
 * @param {string} senal - Nombre de la senal recibida.
 */
function apagadoOrdenado(senal) {
  logger.info('Senal de apagado recibida, cerrando servidor', { senal });

  server.close(() => {
    closeDb();
    logger.info('Apagado completado correctamente');
    process.exit(0);
  });

  // Red de seguridad: si algo queda colgado, se fuerza la salida a los 10 segundos
  setTimeout(() => {
    logger.error('Apagado forzado tras exceder el tiempo de espera');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => apagadoOrdenado('SIGTERM'));
process.on('SIGINT', () => apagadoOrdenado('SIGINT'));

// Un error no capturado deja el proceso en estado inconsistente: se registra y se sale
process.on('uncaughtException', (error) => {
  logger.error('Excepcion no capturada', { message: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (razon) => {
  logger.error('Promesa rechazada sin manejar', { razon: String(razon) });
  process.exit(1);
});

module.exports = server;
