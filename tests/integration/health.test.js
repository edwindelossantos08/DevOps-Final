// Pruebas de integracion de los endpoints de observabilidad y del manejo de 404.

'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { closeDb, resetDb } = require('../../src/db/database');

describe('Observabilidad (integracion)', () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  describe('GET /health', () => {
    it('responde 200 con el estado del servicio', async () => {
      const respuesta = await request(app).get('/health').expect(200);
      expect(respuesta.body.status).toBe('ok');
      expect(respuesta.body.service).toBe('taskflow-api');
      expect(respuesta.body.version).toBeTruthy();
      expect(typeof respuesta.body.uptimeSeconds).toBe('number');
    });
  });

  describe('GET /health/ready', () => {
    it('responde 200 cuando la base de datos esta disponible', async () => {
      const respuesta = await request(app).get('/health/ready').expect(200);
      expect(respuesta.body).toEqual({ status: 'ready', checks: { database: 'up' } });
    });
  });

  describe('GET /metrics', () => {
    it('expone metricas en formato Prometheus', async () => {
      const respuesta = await request(app).get('/metrics').expect(200);
      expect(respuesta.headers['content-type']).toMatch(/text\/plain/);
      expect(respuesta.text).toContain('http_requests_total');
      expect(respuesta.text).toContain('http_request_duration_seconds');
      expect(respuesta.text).toContain('taskflow_tasks_in_database');
    });

    it('refleja en el gauge las tareas realmente almacenadas', async () => {
      await request(app).post('/api/tasks').send({ title: 'Metrica 1' });
      await request(app).post('/api/tasks').send({ title: 'Metrica 2' });

      const respuesta = await request(app).get('/metrics').expect(200);
      expect(respuesta.text).toMatch(/taskflow_tasks_in_database\{[^}]*status="total"[^}]*\}\s+2/);
    });

    it('incrementa el contador de peticiones HTTP', async () => {
      await request(app).get('/api/tasks');
      const respuesta = await request(app).get('/metrics').expect(200);
      expect(respuesta.text).toMatch(/http_requests_total\{[^}]*route="\/api\/tasks"/);
    });
  });

  describe('Rutas inexistentes', () => {
    it('responde 404 en JSON con la ruta solicitada', async () => {
      const respuesta = await request(app).get('/api/no-existe').expect(404);
      expect(respuesta.body.error.message).toContain('/api/no-existe');
    });
  });

  describe('Cabeceras de seguridad', () => {
    it('aplica Helmet y oculta X-Powered-By', async () => {
      const respuesta = await request(app).get('/health');
      expect(respuesta.headers['x-powered-by']).toBeUndefined();
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['content-security-policy']).toBeTruthy();
    });
  });
});
