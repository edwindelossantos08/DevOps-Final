// Logica de negocio de las tareas: validaciones, reglas y consultas SQL.
// Los controladores no hablan directamente con la base de datos, solo con este modulo.

'use strict';

const { getDb } = require('../db/database');
const metrics = require('../config/metrics');

// Prioridades admitidas por el dominio; cualquier otro valor se rechaza
const PRIORIDADES_VALIDAS = ['low', 'medium', 'high'];

// Longitud maxima del titulo, alineada con el maxlength del formulario del frontend
const MAX_TITULO = 120;

// Longitud maxima de la descripcion
const MAX_DESCRIPCION = 500;

/**
 * Error de dominio con codigo HTTP asociado, para que el manejador global
 * pueda traducirlo a una respuesta sin conocer detalles del negocio.
 */
class AppError extends Error {
  /**
   * @param {string} message - Mensaje legible para el cliente.
   * @param {number} statusCode - Codigo HTTP a devolver.
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    // Marca el error como esperado: no debe alertar como fallo del servidor
    this.isOperational = true;
  }
}

/**
 * Convierte una fila de SQLite al objeto que consume la API.
 * SQLite no tiene booleanos, por eso `completed` se normaliza aqui.
 * @param {object} fila - Fila cruda devuelta por better-sqlite3.
 * @returns {object|null} Tarea normalizada, o null si la fila no existe.
 */
function mapearTarea(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    title: fila.title,
    description: fila.description,
    priority: fila.priority,
    completed: Boolean(fila.completed),
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

/**
 * Valida y normaliza los datos entrantes de una tarea.
 * @param {object} datos - Cuerpo de la peticion.
 * @param {boolean} esParcial - true en PUT/PATCH: solo valida lo que venga presente.
 * @returns {object} Datos saneados listos para persistir.
 * @throws {AppError} Si algun campo incumple las reglas de negocio.
 */
function validarTarea(datos, esParcial = false) {
  const limpio = {};

  // El titulo es obligatorio al crear y opcional al actualizar parcialmente
  if (datos.title !== undefined || !esParcial) {
    const titulo = typeof datos.title === 'string' ? datos.title.trim() : '';
    if (!titulo) {
      throw new AppError('El titulo es obligatorio.', 400);
    }
    if (titulo.length > MAX_TITULO) {
      throw new AppError(`El titulo no puede exceder ${MAX_TITULO} caracteres.`, 400);
    }
    limpio.title = titulo;
  }

  // La descripcion es opcional pero tiene tope de longitud
  if (datos.description !== undefined) {
    const descripcion = typeof datos.description === 'string' ? datos.description.trim() : '';
    if (descripcion.length > MAX_DESCRIPCION) {
      throw new AppError(`La descripcion no puede exceder ${MAX_DESCRIPCION} caracteres.`, 400);
    }
    limpio.description = descripcion;
  } else if (!esParcial) {
    limpio.description = '';
  }

  // La prioridad debe pertenecer al catalogo cerrado
  if (datos.priority !== undefined) {
    if (!PRIORIDADES_VALIDAS.includes(datos.priority)) {
      throw new AppError(`La prioridad debe ser una de: ${PRIORIDADES_VALIDAS.join(', ')}.`, 400);
    }
    limpio.priority = datos.priority;
  } else if (!esParcial) {
    limpio.priority = 'medium';
  }

  // `completed` solo acepta booleanos reales para evitar valores ambiguos
  if (datos.completed !== undefined) {
    if (typeof datos.completed !== 'boolean') {
      throw new AppError('El campo completed debe ser booleano.', 400);
    }
    limpio.completed = datos.completed;
  }

  return limpio;
}

/**
 * Lista tareas aplicando filtros opcionales.
 * @param {object} filtros - { status: 'all'|'active'|'completed', priority?: string }
 * @returns {object[]} Coleccion de tareas ordenadas por prioridad y fecha.
 */
function listarTareas(filtros = {}) {
  const condiciones = [];
  const parametros = [];

  // Filtro por estado de completitud
  if (filtros.status === 'active') {
    condiciones.push('completed = 0');
  } else if (filtros.status === 'completed') {
    condiciones.push('completed = 1');
  }

  // Filtro por prioridad, validado contra el catalogo para no inyectar valores libres
  if (filtros.priority && PRIORIDADES_VALIDAS.includes(filtros.priority)) {
    condiciones.push('priority = ?');
    parametros.push(filtros.priority);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  // Se ordena por prioridad de negocio (high > medium > low) y luego por antiguedad
  const sql = `
    SELECT * FROM tasks
    ${where}
    ORDER BY
      completed ASC,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
      created_at DESC
  `;

  return getDb()
    .prepare(sql)
    .all(...parametros)
    .map(mapearTarea);
}

/**
 * Obtiene una tarea por su identificador.
 * @param {number} id - Identificador numerico de la tarea.
 * @returns {object} La tarea encontrada.
 * @throws {AppError} 400 si el id no es valido, 404 si no existe.
 */
function obtenerTarea(id) {
  const identificador = Number.parseInt(id, 10);
  if (!Number.isInteger(identificador) || identificador <= 0) {
    throw new AppError('El identificador debe ser un entero positivo.', 400);
  }

  const fila = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(identificador);
  if (!fila) {
    throw new AppError(`No existe una tarea con id ${identificador}.`, 404);
  }
  return mapearTarea(fila);
}

/**
 * Crea una tarea nueva.
 * @param {object} datos - Cuerpo con title, description y priority.
 * @returns {object} La tarea recien creada.
 * @throws {AppError} Si la validacion falla.
 */
function crearTarea(datos) {
  const limpio = validarTarea(datos, false);

  const resultado = getDb()
    .prepare(
      `INSERT INTO tasks (title, description, priority, completed)
       VALUES (?, ?, ?, 0)`
    )
    .run(limpio.title, limpio.description, limpio.priority);

  // Metrica de negocio: alimenta el panel de tareas creadas por minuto
  metrics.tasksCreatedTotal.inc();

  return obtenerTarea(resultado.lastInsertRowid);
}

/**
 * Actualiza parcialmente una tarea existente.
 * @param {number} id - Identificador de la tarea a modificar.
 * @param {object} datos - Campos a actualizar.
 * @returns {object} La tarea con los cambios aplicados.
 * @throws {AppError} 404 si no existe, 400 si no hay campos validos.
 */
function actualizarTarea(id, datos) {
  // Se valida la existencia antes de construir el UPDATE
  const actual = obtenerTarea(id);
  const limpio = validarTarea(datos, true);

  if (Object.keys(limpio).length === 0) {
    throw new AppError('No se recibio ningun campo valido para actualizar.', 400);
  }

  const asignaciones = [];
  const parametros = [];

  if (limpio.title !== undefined) {
    asignaciones.push('title = ?');
    parametros.push(limpio.title);
  }
  if (limpio.description !== undefined) {
    asignaciones.push('description = ?');
    parametros.push(limpio.description);
  }
  if (limpio.priority !== undefined) {
    asignaciones.push('priority = ?');
    parametros.push(limpio.priority);
  }
  if (limpio.completed !== undefined) {
    asignaciones.push('completed = ?');
    parametros.push(limpio.completed ? 1 : 0);
  }

  // `updated_at` siempre se refresca para trazar la ultima modificacion
  asignaciones.push("updated_at = datetime('now')");
  parametros.push(actual.id);

  getDb()
    .prepare(`UPDATE tasks SET ${asignaciones.join(', ')} WHERE id = ?`)
    .run(...parametros);

  // Solo cuenta como completada la transicion de pendiente a completada
  if (limpio.completed === true && actual.completed === false) {
    metrics.tasksCompletedTotal.inc();
  }

  return obtenerTarea(actual.id);
}

/**
 * Invierte el estado de completitud de una tarea.
 * @param {number} id - Identificador de la tarea.
 * @returns {object} La tarea con el estado invertido.
 */
function alternarTarea(id) {
  const actual = obtenerTarea(id);
  return actualizarTarea(actual.id, { completed: !actual.completed });
}

/**
 * Elimina una tarea de forma permanente.
 * @param {number} id - Identificador de la tarea.
 * @returns {{ id: number, deleted: boolean }} Confirmacion del borrado.
 * @throws {AppError} 404 si la tarea no existe.
 */
function eliminarTarea(id) {
  const actual = obtenerTarea(id);
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(actual.id);
  return { id: actual.id, deleted: true };
}

/**
 * Calcula el resumen agregado que consume el frontend y el gauge de Prometheus.
 * @returns {{total:number, completed:number, pending:number, completionRate:number}}
 */
function obtenerEstadisticas() {
  const fila = getDb()
    .prepare(
      `SELECT
         COUNT(*)                                   AS total,
         COALESCE(SUM(completed), 0)                AS completed,
         COALESCE(SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END), 0) AS pending
       FROM tasks`
    )
    .get();

  // Porcentaje de avance redondeado a un decimal; 0 cuando no hay tareas
  const completionRate =
    fila.total === 0 ? 0 : Math.round((fila.completed / fila.total) * 1000) / 10;

  return {
    total: fila.total,
    completed: fila.completed,
    pending: fila.pending,
    completionRate,
  };
}

module.exports = {
  AppError,
  PRIORIDADES_VALIDAS,
  MAX_TITULO,
  MAX_DESCRIPCION,
  validarTarea,
  mapearTarea,
  listarTareas,
  obtenerTarea,
  crearTarea,
  actualizarTarea,
  alternarTarea,
  eliminarTarea,
  obtenerEstadisticas,
};
