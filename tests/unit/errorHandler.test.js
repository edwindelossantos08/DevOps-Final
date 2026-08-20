// Pruebas unitarias de los middlewares de error, usando dobles de req/res.

'use strict';

const { notFoundHandler, errorHandler } = require('../../src/middlewares/errorHandler');
const { AppError } = require('../../src/services/tasks.service');

/**
 * Construye un doble de la respuesta de Express con status() y json() espiados.
 * @returns {object} Objeto res simulado.
 */
function crearRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middlewares/errorHandler', () => {
  const req = { method: 'GET', originalUrl: '/ruta/inexistente', requestId: 'req-1' };

  describe('notFoundHandler()', () => {
    it('responde 404 con el metodo y la ruta solicitada', () => {
      const res = crearRes();
      notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      const cuerpo = res.json.mock.calls[0][0];
      expect(cuerpo.error.statusCode).toBe(404);
      expect(cuerpo.error.message).toContain('/ruta/inexistente');
      expect(cuerpo.error.requestId).toBe('req-1');
    });
  });

  describe('errorHandler()', () => {
    it('propaga el statusCode y el mensaje de un AppError', () => {
      const res = crearRes();
      errorHandler(new AppError('Titulo invalido', 400), req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toBe('Titulo invalido');
    });

    it('enmascara los errores inesperados como 500 sin filtrar el mensaje interno', () => {
      const res = crearRes();
      errorHandler(new Error('SQLITE_CORRUPT: detalle interno'), req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      const cuerpo = res.json.mock.calls[0][0];
      expect(cuerpo.error.message).toBe('Error interno del servidor.');
      expect(cuerpo.error.message).not.toContain('SQLITE_CORRUPT');
    });

    it('trata un statusCode invalido como error 500', () => {
      const res = crearRes();
      const error = new Error('raro');
      error.statusCode = 99;
      errorHandler(error, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
