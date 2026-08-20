// Construccion de la aplicacion Express.
// Se exporta la app sin arrancar el servidor para que Supertest pueda montarla
// en las pruebas de integracion sin ocupar un puerto real.

'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const requestLogger = require('./middlewares/requestLogger');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const healthRoutes = require('./routes/health.routes');
const tasksRoutes = require('./routes/tasks.routes');

const app = express();

// Necesario para que req.ip refleje la IP real detras del proxy/balanceador
app.set('trust proxy', 1);

// Desactiva la cabecera X-Powered-By para no revelar el stack
app.disable('x-powered-by');

// Cabeceras de seguridad. Se relaja la CSP lo justo para servir el frontend estatico
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(cors());
app.use(compression());

// Limite de tamano del cuerpo: evita cargas maliciosas que agoten memoria
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Logging y metricas antes de las rutas para cubrir todas las peticiones
app.use(requestLogger);

// Rate limiting solo sobre la API; /health y /metrics quedan libres para el scrape
app.use(
  '/api',
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    // En pruebas se desactiva para no interferir con corridas rapidas y repetidas
    skip: () => config.isTest,
    message: {
      error: { message: 'Demasiadas peticiones, intente de nuevo mas tarde.', statusCode: 429 },
    },
  })
);

// Rutas de observabilidad (/health, /health/ready, /metrics)
app.use('/', healthRoutes);

// API REST del dominio
app.use('/api/tasks', tasksRoutes);

// Frontend estatico servido por el mismo proceso: simplifica el despliegue
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// Manejo de rutas inexistentes y errores, siempre al final de la cadena
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
