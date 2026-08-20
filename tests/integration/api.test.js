// Pruebas de integracion de la API REST.
// Montan la app completa con Supertest: middlewares, rutas, servicio y SQLite.

'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { closeDb, resetDb } = require('../../src/db/database');

describe('API /api/tasks (integracion)', () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  describe('POST /api/tasks', () => {
    it('crea una tarea y responde 201 con el recurso', async () => {
      const respuesta = await request(app)
        .post('/api/tasks')
        .send({ title: 'Configurar CI', description: 'GitHub Actions', priority: 'high' })
        .expect(201);

      expect(respuesta.body.data).toMatchObject({
        title: 'Configurar CI',
        description: 'GitHub Actions',
        priority: 'high',
        completed: false,
      });
      expect(respuesta.body.data.id).toBeGreaterThan(0);
    });

    it('responde 400 cuando falta el titulo', async () => {
      const respuesta = await request(app).post('/api/tasks').send({ priority: 'low' }).expect(400);
      expect(respuesta.body.error.message).toMatch(/titulo es obligatorio/i);
    });

    it('responde 400 ante una prioridad no permitida', async () => {
      await request(app).post('/api/tasks').send({ title: 'x', priority: 'critica' }).expect(400);
    });

    it('incluye la cabecera de correlacion X-Request-Id', async () => {
      const respuesta = await request(app).post('/api/tasks').send({ title: 'Trazabilidad' });
      expect(respuesta.headers['x-request-id']).toBeTruthy();
    });
  });

  describe('GET /api/tasks', () => {
    it('devuelve una lista vacia cuando no hay tareas', async () => {
      const respuesta = await request(app).get('/api/tasks').expect(200);
      expect(respuesta.body).toEqual({ data: [], count: 0 });
    });

    it('devuelve las tareas creadas con su contador', async () => {
      await request(app).post('/api/tasks').send({ title: 'Uno' });
      await request(app).post('/api/tasks').send({ title: 'Dos' });

      const respuesta = await request(app).get('/api/tasks').expect(200);
      expect(respuesta.body.count).toBe(2);
      expect(respuesta.body.data).toHaveLength(2);
    });

    it('aplica el filtro de estado por query string', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Completar' });
      await request(app).patch(`/api/tasks/${creada.body.data.id}/toggle`);
      await request(app).post('/api/tasks').send({ title: 'Pendiente' });

      const completadas = await request(app).get('/api/tasks?status=completed').expect(200);
      expect(completadas.body.count).toBe(1);
      expect(completadas.body.data[0].title).toBe('Completar');

      const activas = await request(app).get('/api/tasks?status=active').expect(200);
      expect(activas.body.count).toBe(1);
      expect(activas.body.data[0].title).toBe('Pendiente');
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('devuelve la tarea solicitada', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Detalle' });
      const respuesta = await request(app).get(`/api/tasks/${creada.body.data.id}`).expect(200);
      expect(respuesta.body.data.title).toBe('Detalle');
    });

    it('responde 404 ante un id inexistente', async () => {
      const respuesta = await request(app).get('/api/tasks/99999').expect(404);
      expect(respuesta.body.error.statusCode).toBe(404);
    });

    it('responde 400 ante un id no numerico', async () => {
      await request(app).get('/api/tasks/abc').expect(400);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('actualiza los campos enviados', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Antes' });
      const respuesta = await request(app)
        .put(`/api/tasks/${creada.body.data.id}`)
        .send({ title: 'Despues', completed: true })
        .expect(200);

      expect(respuesta.body.data.title).toBe('Despues');
      expect(respuesta.body.data.completed).toBe(true);
    });

    it('responde 400 si completed no es booleano', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Tipos' });
      await request(app)
        .put(`/api/tasks/${creada.body.data.id}`)
        .send({ completed: 'true' })
        .expect(400);
    });
  });

  describe('PATCH /api/tasks/:id/toggle', () => {
    it('alterna el estado de la tarea en cada llamada', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Toggle' });
      const id = creada.body.data.id;

      const primera = await request(app).patch(`/api/tasks/${id}/toggle`).expect(200);
      expect(primera.body.data.completed).toBe(true);

      const segunda = await request(app).patch(`/api/tasks/${id}/toggle`).expect(200);
      expect(segunda.body.data.completed).toBe(false);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('elimina la tarea y luego devuelve 404 al consultarla', async () => {
      const creada = await request(app).post('/api/tasks').send({ title: 'Borrar' });
      const id = creada.body.data.id;

      await request(app).delete(`/api/tasks/${id}`).expect(200);
      await request(app).get(`/api/tasks/${id}`).expect(404);
    });
  });

  describe('GET /api/tasks/stats', () => {
    it('no colisiona con la ruta /:id y devuelve el agregado', async () => {
      await request(app).post('/api/tasks').send({ title: 'a' });
      const segunda = await request(app).post('/api/tasks').send({ title: 'b' });
      await request(app).patch(`/api/tasks/${segunda.body.data.id}/toggle`);

      const respuesta = await request(app).get('/api/tasks/stats').expect(200);
      expect(respuesta.body.data).toEqual({
        total: 2,
        completed: 1,
        pending: 1,
        completionRate: 50,
      });
    });
  });

  describe('Ciclo de vida completo (flujo de usuario)', () => {
    it('crea, lista, completa, verifica estadisticas y elimina', async () => {
      const creada = await request(app)
        .post('/api/tasks')
        .send({ title: 'Flujo end-to-end', priority: 'high' })
        .expect(201);
      const id = creada.body.data.id;

      await request(app).get('/api/tasks').expect(200);
      await request(app).patch(`/api/tasks/${id}/toggle`).expect(200);

      const stats = await request(app).get('/api/tasks/stats').expect(200);
      expect(stats.body.data.completionRate).toBe(100);

      await request(app).delete(`/api/tasks/${id}`).expect(200);

      const finales = await request(app).get('/api/tasks/stats').expect(200);
      expect(finales.body.data.total).toBe(0);
    });
  });
});
