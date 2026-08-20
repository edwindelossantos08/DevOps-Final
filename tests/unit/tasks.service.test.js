// Pruebas unitarias de la capa de servicio: validaciones, reglas de negocio y
// consultas. No levantan servidor HTTP; trabajan directo contra SQLite en memoria.

'use strict';

const service = require('../../src/services/tasks.service');
const { closeDb, resetDb } = require('../../src/db/database');

describe('tasks.service', () => {
  // Cada prueba parte de una base limpia para que el orden no afecte el resultado
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  describe('validarTarea()', () => {
    it('acepta una tarea minima valida y aplica los valores por defecto', () => {
      const resultado = service.validarTarea({ title: '  Desplegar  ' });
      expect(resultado).toEqual({ title: 'Desplegar', description: '', priority: 'medium' });
    });

    it('rechaza un titulo vacio o compuesto solo por espacios', () => {
      expect(() => service.validarTarea({ title: '   ' })).toThrow(/titulo es obligatorio/i);
      expect(() => service.validarTarea({})).toThrow(/titulo es obligatorio/i);
    });

    it('rechaza un titulo que excede la longitud maxima', () => {
      const largo = 'x'.repeat(service.MAX_TITULO + 1);
      expect(() => service.validarTarea({ title: largo })).toThrow(/no puede exceder/i);
    });

    it('rechaza una descripcion que excede la longitud maxima', () => {
      const largo = 'y'.repeat(service.MAX_DESCRIPCION + 1);
      expect(() => service.validarTarea({ title: 'ok', description: largo })).toThrow(
        /descripcion no puede exceder/i
      );
    });

    it('rechaza prioridades fuera del catalogo', () => {
      expect(() => service.validarTarea({ title: 'ok', priority: 'urgente' })).toThrow(
        /prioridad debe ser/i
      );
    });

    it('rechaza completed cuando no es booleano', () => {
      expect(() => service.validarTarea({ title: 'ok', completed: 'si' })).toThrow(
        /debe ser booleano/i
      );
    });

    it('en modo parcial no exige el titulo', () => {
      expect(service.validarTarea({ priority: 'high' }, true)).toEqual({ priority: 'high' });
    });

    it('asigna un statusCode 400 al error de validacion', () => {
      expect.assertions(2);
      try {
        service.validarTarea({});
      } catch (error) {
        expect(error).toBeInstanceOf(service.AppError);
        expect(error.statusCode).toBe(400);
      }
    });
  });

  describe('crearTarea()', () => {
    it('persiste la tarea con completed en false y devuelve un id', () => {
      const tarea = service.crearTarea({ title: 'Escribir pruebas', priority: 'high' });
      expect(tarea.id).toBeGreaterThan(0);
      expect(tarea.title).toBe('Escribir pruebas');
      expect(tarea.priority).toBe('high');
      expect(tarea.completed).toBe(false);
      expect(tarea.createdAt).toBeTruthy();
    });

    it('normaliza completed a booleano y no a 0/1 de SQLite', () => {
      const tarea = service.crearTarea({ title: 'Normalizacion' });
      expect(typeof tarea.completed).toBe('boolean');
    });
  });

  describe('obtenerTarea()', () => {
    it('devuelve la tarea existente', () => {
      const creada = service.crearTarea({ title: 'Buscar' });
      expect(service.obtenerTarea(creada.id).title).toBe('Buscar');
    });

    it('lanza 404 cuando el id no existe', () => {
      expect(() => service.obtenerTarea(9999)).toThrow(/No existe una tarea/);
    });

    it('lanza 400 cuando el id no es un entero positivo', () => {
      expect(() => service.obtenerTarea('abc')).toThrow(/entero positivo/);
      expect(() => service.obtenerTarea(-1)).toThrow(/entero positivo/);
    });
  });

  describe('listarTareas()', () => {
    beforeEach(() => {
      service.crearTarea({ title: 'Baja', priority: 'low' });
      service.crearTarea({ title: 'Alta', priority: 'high' });
      const media = service.crearTarea({ title: 'Media', priority: 'medium' });
      service.actualizarTarea(media.id, { completed: true });
    });

    it('devuelve todas las tareas sin filtros', () => {
      expect(service.listarTareas()).toHaveLength(3);
    });

    it('filtra por tareas pendientes', () => {
      const activas = service.listarTareas({ status: 'active' });
      expect(activas).toHaveLength(2);
      expect(activas.every((t) => t.completed === false)).toBe(true);
    });

    it('filtra por tareas completadas', () => {
      const completadas = service.listarTareas({ status: 'completed' });
      expect(completadas).toHaveLength(1);
      expect(completadas[0].title).toBe('Media');
    });

    it('filtra por prioridad', () => {
      expect(service.listarTareas({ priority: 'high' })).toHaveLength(1);
    });

    it('ignora prioridades invalidas en lugar de fallar', () => {
      expect(service.listarTareas({ priority: "'; DROP TABLE tasks; --" })).toHaveLength(3);
    });

    it('ordena las pendientes primero y por prioridad descendente', () => {
      const titulos = service.listarTareas().map((t) => t.title);
      expect(titulos).toEqual(['Alta', 'Baja', 'Media']);
    });
  });

  describe('actualizarTarea()', () => {
    it('modifica solo los campos enviados', () => {
      const creada = service.crearTarea({ title: 'Original', description: 'desc' });
      const actualizada = service.actualizarTarea(creada.id, { title: 'Modificado' });
      expect(actualizada.title).toBe('Modificado');
      expect(actualizada.description).toBe('desc');
    });

    it('lanza error si no se envia ningun campo valido', () => {
      const creada = service.crearTarea({ title: 'Sin cambios' });
      expect(() => service.actualizarTarea(creada.id, {})).toThrow(/ningun campo valido/);
    });

    it('lanza 404 al actualizar una tarea inexistente', () => {
      expect(() => service.actualizarTarea(4242, { title: 'x' })).toThrow(/No existe una tarea/);
    });
  });

  describe('alternarTarea()', () => {
    it('invierte el estado de completitud en cada llamada', () => {
      const creada = service.crearTarea({ title: 'Alternar' });
      expect(service.alternarTarea(creada.id).completed).toBe(true);
      expect(service.alternarTarea(creada.id).completed).toBe(false);
    });
  });

  describe('eliminarTarea()', () => {
    it('borra la tarea y la deja inaccesible', () => {
      const creada = service.crearTarea({ title: 'Temporal' });
      expect(service.eliminarTarea(creada.id)).toEqual({ id: creada.id, deleted: true });
      expect(() => service.obtenerTarea(creada.id)).toThrow(/No existe una tarea/);
    });

    it('lanza 404 al eliminar dos veces la misma tarea', () => {
      const creada = service.crearTarea({ title: 'Doble borrado' });
      service.eliminarTarea(creada.id);
      expect(() => service.eliminarTarea(creada.id)).toThrow(/No existe una tarea/);
    });
  });

  describe('obtenerEstadisticas()', () => {
    it('devuelve ceros cuando no hay tareas', () => {
      expect(service.obtenerEstadisticas()).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        completionRate: 0,
      });
    });

    it('calcula el porcentaje de avance correctamente', () => {
      service.crearTarea({ title: 'a' });
      service.crearTarea({ title: 'b' });
      service.crearTarea({ title: 'c' });
      service.crearTarea({ title: 'd' });
      const primera = service.listarTareas()[0];
      service.actualizarTarea(primera.id, { completed: true });

      const stats = service.obtenerEstadisticas();
      expect(stats).toEqual({ total: 4, completed: 1, pending: 3, completionRate: 25 });
    });
  });
});
