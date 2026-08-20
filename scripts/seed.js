// Script de datos de ejemplo. Util para la demo en vivo y para probar
// los paneles de Grafana con informacion realista.
// Uso: node scripts/seed.js

'use strict';

const service = require('../src/services/tasks.service');
const { closeDb } = require('../src/db/database');

// Conjunto de tareas representativas del ciclo DevOps del propio proyecto
const TAREAS = [
  {
    title: 'Configurar el repositorio Git',
    description: 'Ramas main y develop',
    priority: 'high',
    completed: true,
  },
  {
    title: 'Implementar la API REST de tareas',
    description: 'CRUD completo con Express',
    priority: 'high',
    completed: true,
  },
  {
    title: 'Escribir pruebas unitarias',
    description: 'Cobertura del servicio de dominio',
    priority: 'high',
    completed: true,
  },
  {
    title: 'Crear el Dockerfile multi-etapa',
    description: 'Imagen sin root y con healthcheck',
    priority: 'medium',
    completed: true,
  },
  {
    title: 'Configurar GitHub Actions',
    description: 'Lint, pruebas, build y despliegue',
    priority: 'high',
    completed: false,
  },
  {
    title: 'Montar Prometheus y Grafana',
    description: 'Metricas y dashboard de la app',
    priority: 'medium',
    completed: false,
  },
  {
    title: 'Definir las reglas de alerta',
    description: 'Caida, errores 5xx y latencia',
    priority: 'medium',
    completed: false,
  },
  {
    title: 'Redactar el manual de operaciones',
    description: 'Runbooks de incidentes',
    priority: 'low',
    completed: false,
  },
  {
    title: 'Preparar la presentacion final',
    description: 'Demo en vivo del pipeline',
    priority: 'low',
    completed: false,
  },
];

// Se insertan una a una para que las metricas de negocio se incrementen igual
// que lo harian con trafico real
let creadas = 0;
for (const tarea of TAREAS) {
  const nueva = service.crearTarea(tarea);
  if (tarea.completed) {
    service.actualizarTarea(nueva.id, { completed: true });
  }
  creadas += 1;
}

process.stdout.write(`Datos de ejemplo insertados: ${creadas} tareas.\n`);
closeDb();
