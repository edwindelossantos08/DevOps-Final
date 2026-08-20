// Controladores HTTP de tareas. Traducen peticiones Express a llamadas del servicio
// y delegan cualquier error al manejador global mediante next().

'use strict';

const tasksService = require('../services/tasks.service');
const logger = require('../config/logger');

/**
 * GET /api/tasks - Lista tareas con filtros opcionales de estado y prioridad.
 */
function listar(req, res, next) {
  try {
    const tareas = tasksService.listarTareas({
      status: req.query.status,
      priority: req.query.priority,
    });
    res.json({ data: tareas, count: tareas.length });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/tasks/stats - Devuelve el resumen agregado de tareas.
 * Debe declararse antes de /:id en el router para no ser capturada por el parametro.
 */
function estadisticas(req, res, next) {
  try {
    res.json({ data: tasksService.obtenerEstadisticas() });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/tasks/:id - Devuelve una tarea puntual.
 */
function obtener(req, res, next) {
  try {
    res.json({ data: tasksService.obtenerTarea(req.params.id) });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/tasks - Crea una tarea y responde 201 con el recurso creado.
 */
function crear(req, res, next) {
  try {
    const tarea = tasksService.crearTarea(req.body || {});
    // Log de auditoria: permite rastrear altas desde Loki
    logger.info('Tarea creada', { taskId: tarea.id, priority: tarea.priority });
    res.status(201).json({ data: tarea });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/tasks/:id - Actualiza los campos enviados de una tarea.
 */
function actualizar(req, res, next) {
  try {
    const tarea = tasksService.actualizarTarea(req.params.id, req.body || {});
    logger.info('Tarea actualizada', { taskId: tarea.id, completed: tarea.completed });
    res.json({ data: tarea });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/tasks/:id/toggle - Invierte el estado completado/pendiente.
 */
function alternar(req, res, next) {
  try {
    const tarea = tasksService.alternarTarea(req.params.id);
    logger.info('Estado de tarea alternado', { taskId: tarea.id, completed: tarea.completed });
    res.json({ data: tarea });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/tasks/:id - Elimina la tarea indicada.
 */
function eliminar(req, res, next) {
  try {
    const resultado = tasksService.eliminarTarea(req.params.id);
    logger.warn('Tarea eliminada', { taskId: resultado.id });
    res.json({ data: resultado });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, estadisticas, obtener, crear, actualizar, alternar, eliminar };
