// Endpoints de salud y observabilidad consumidos por Docker, Prometheus y el orquestador.

'use strict';

const express = require('express');
const config = require('../config/env');
const logger = require('../config/logger');
const metrics = require('../config/metrics');
const { getDb } = require('../db/database');
const tasksService = require('../services/tasks.service');

const router = express.Router();

// Momento de arranque del proceso, usado para reportar el uptime real
const inicioProceso = Date.now();

/**
 * GET /health - Liveness probe. Responde 200 mientras el proceso siga vivo.
 * No toca la base de datos a proposito: un fallo de BD no debe reiniciar el contenedor.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'taskflow-api',
    version: config.appVersion,
    env: config.nodeEnv,
    uptimeSeconds: Math.floor((Date.now() - inicioProceso) / 1000),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready - Readiness probe. Verifica que SQLite responda antes de
 * declarar la instancia apta para recibir trafico.
 */
router.get('/health/ready', (req, res) => {
  try {
    // Consulta trivial: si la BD esta bloqueada o corrupta, lanza excepcion
    getDb().prepare('SELECT 1 AS ok').get();
    res.json({ status: 'ready', checks: { database: 'up' } });
  } catch (error) {
    // 503 para que el balanceador saque la instancia de rotacion sin matarla
    logger.error('Readiness fallido: la base de datos no responde', { error: error.message });
    res.status(503).json({ status: 'not_ready', checks: { database: 'down' } });
  }
});

/**
 * GET /metrics - Exposicion de metricas en formato Prometheus.
 * Antes de serializar se refresca el gauge con la foto actual de la base de datos.
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const stats = tasksService.obtenerEstadisticas();
    metrics.tasksInDatabase.set({ status: 'total' }, stats.total);
    metrics.tasksInDatabase.set({ status: 'completed' }, stats.completed);
    metrics.tasksInDatabase.set({ status: 'pending' }, stats.pending);

    res.set('Content-Type', metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
