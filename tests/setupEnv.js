// Fija las variables de entorno antes de que Jest cargue los modulos bajo prueba.

'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'error';
