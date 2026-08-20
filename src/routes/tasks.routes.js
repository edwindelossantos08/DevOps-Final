// Definicion de rutas REST para el recurso "tasks".

'use strict';

const express = require('express');
const controller = require('../controllers/tasks.controller');

const router = express.Router();

// /stats va antes que /:id para que Express no la interprete como un identificador
router.get('/stats', controller.estadisticas);

router.get('/', controller.listar);
router.post('/', controller.crear);
router.get('/:id', controller.obtener);
router.put('/:id', controller.actualizar);
router.patch('/:id/toggle', controller.alternar);
router.delete('/:id', controller.eliminar);

module.exports = router;
