// Cliente del frontend de TaskFlow.
// Consume la API REST del backend y renderiza la lista de tareas sin frameworks.

(function () {
  'use strict';

  // URL base de la API; el frontend se sirve desde el mismo origen que el backend
  var API = '/api/tasks';

  // Filtro activo: all | active | completed
  var filtroActual = 'all';

  // Referencias al DOM cacheadas una sola vez al cargar
  var $lista = document.getElementById('listaTareas');
  var $vacio = document.getElementById('mensajeVacio');
  var $formulario = document.getElementById('formularioTarea');
  var $titulo = document.getElementById('campoTitulo');
  var $descripcion = document.getElementById('campoDescripcion');
  var $prioridad = document.getElementById('campoPrioridad');
  var $botonCrear = document.getElementById('botonCrear');
  var $avisos = document.getElementById('avisos');

  // Etiquetas legibles para las prioridades del dominio
  var ETIQUETA_PRIORIDAD = { low: 'Baja', medium: 'Media', high: 'Alta' };

  /**
   * Muestra una notificacion efimera en la esquina inferior derecha.
   * @param {string} mensaje - Texto a mostrar.
   * @param {'ok'|'error'} tipo - Estilo visual del aviso.
   */
  function notificar(mensaje, tipo) {
    var aviso = document.createElement('div');
    aviso.className = 'aviso aviso--' + (tipo || 'ok');
    aviso.textContent = mensaje;
    $avisos.appendChild(aviso);
    // Se retira solo a los 3.5 segundos para no acumular ruido en pantalla
    setTimeout(function () {
      aviso.remove();
    }, 3500);
  }

  /**
   * Envoltorio de fetch que normaliza el manejo de errores de la API.
   * @param {string} url - Endpoint a invocar.
   * @param {object} opciones - Opciones de fetch.
   * @returns {Promise<object>} Cuerpo JSON de la respuesta.
   * @throws {Error} Con el mensaje devuelto por el backend si la respuesta no es 2xx.
   */
  function peticion(url, opciones) {
    var config = opciones || {};
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});

    return fetch(url, config).then(function (respuesta) {
      return respuesta
        .json()
        .catch(function () {
          // Respuestas sin cuerpo JSON valido (p. ej. 502 de un proxy)
          return {};
        })
        .then(function (cuerpo) {
          if (!respuesta.ok) {
            var mensaje = (cuerpo.error && cuerpo.error.message) || 'Error ' + respuesta.status;
            throw new Error(mensaje);
          }
          return cuerpo;
        });
    });
  }

  /**
   * Escapa texto antes de inyectarlo en el DOM para prevenir XSS almacenado.
   * @param {string} texto - Texto sin sanear proveniente de la API.
   * @returns {string} Texto seguro para innerHTML.
   */
  function escapar(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  /**
   * Formatea una fecha ISO de SQLite a formato local corto.
   * @param {string} iso - Fecha en formato 'YYYY-MM-DD HH:MM:SS'.
   * @returns {string} Fecha legible.
   */
  function formatearFecha(iso) {
    var fecha = new Date(String(iso).replace(' ', 'T') + 'Z');
    if (isNaN(fecha.getTime())) return iso;
    return fecha.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * Dibuja la coleccion de tareas en el listado.
   * @param {object[]} tareas - Tareas devueltas por la API.
   */
  function renderizar(tareas) {
    $lista.innerHTML = '';

    // Estado vacio: se muestra el mensaje guia en lugar de una lista en blanco
    if (!tareas.length) {
      $vacio.classList.remove('oculto');
      return;
    }
    $vacio.classList.add('oculto');

    tareas.forEach(function (tarea) {
      var item = document.createElement('li');
      item.className =
        'tarea tarea--' + tarea.priority + (tarea.completed ? ' tarea--completada' : '');
      item.dataset.id = tarea.id;

      item.innerHTML =
        '<input type="checkbox" class="tarea__check" data-accion="toggle" ' +
        (tarea.completed ? 'checked' : '') +
        ' aria-label="Marcar como completada" />' +
        '<div class="tarea__cuerpo">' +
        '<p class="tarea__titulo">' +
        escapar(tarea.title) +
        '</p>' +
        (tarea.description ? '<p class="tarea__desc">' + escapar(tarea.description) + '</p>' : '') +
        '<p class="tarea__meta">' +
        '<span class="insignia insignia--' +
        tarea.priority +
        '">' +
        ETIQUETA_PRIORIDAD[tarea.priority] +
        '</span>' +
        '<span>Creada: ' +
        escapar(formatearFecha(tarea.createdAt)) +
        '</span>' +
        '</p>' +
        '</div>' +
        '<button class="tarea__eliminar" data-accion="eliminar" title="Eliminar tarea" aria-label="Eliminar tarea">&times;</button>';

      $lista.appendChild(item);
    });
  }

  /**
   * Refresca el panel superior de estadisticas.
   */
  function cargarEstadisticas() {
    return peticion(API + '/stats').then(function (cuerpo) {
      var stats = cuerpo.data;
      document.getElementById('statTotal').textContent = stats.total;
      document.getElementById('statPendientes').textContent = stats.pending;
      document.getElementById('statCompletadas').textContent = stats.completed;
      document.getElementById('statAvance').textContent = stats.completionRate + '%';
      document.getElementById('barraAvance').style.width = stats.completionRate + '%';
    });
  }

  /**
   * Descarga y pinta las tareas segun el filtro activo, y actualiza las estadisticas.
   */
  function cargarTareas() {
    var url = filtroActual === 'all' ? API : API + '?status=' + filtroActual;
    return peticion(url)
      .then(function (cuerpo) {
        renderizar(cuerpo.data);
        return cargarEstadisticas();
      })
      .catch(function (error) {
        notificar('No se pudieron cargar las tareas: ' + error.message, 'error');
      });
  }

  /**
   * Consulta /health para reflejar el estado del backend en la cabecera.
   */
  function comprobarSalud() {
    var $punto = document.getElementById('estadoPunto');
    var $texto = document.getElementById('estadoTexto');

    fetch('/health')
      .then(function (r) {
        if (!r.ok) throw new Error('no disponible');
        return r.json();
      })
      .then(function (salud) {
        $punto.className = 'estado__punto estado__punto--ok';
        $texto.textContent = 'Operativo · ' + salud.env;
        document.getElementById('versionApp').textContent = salud.version;
      })
      .catch(function () {
        $punto.className = 'estado__punto estado__punto--error';
        $texto.textContent = 'Sin conexion';
      });
  }

  // Alta de tarea: valida en cliente y delega la validacion real al backend
  $formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();

    var titulo = $titulo.value.trim();
    if (!titulo) {
      $titulo.setAttribute('aria-invalid', 'true');
      notificar('El titulo es obligatorio.', 'error');
      return;
    }
    $titulo.removeAttribute('aria-invalid');

    // Se bloquea el boton para evitar envios duplicados por doble clic
    $botonCrear.disabled = true;

    peticion(API, {
      method: 'POST',
      body: JSON.stringify({
        title: titulo,
        description: $descripcion.value.trim(),
        priority: $prioridad.value,
      }),
    })
      .then(function () {
        $formulario.reset();
        $prioridad.value = 'medium';
        notificar('Tarea creada correctamente.', 'ok');
        return cargarTareas();
      })
      .catch(function (error) {
        notificar(error.message, 'error');
      })
      .finally(function () {
        $botonCrear.disabled = false;
      });
  });

  // Delegacion de eventos: un solo listener cubre toggles y eliminaciones
  $lista.addEventListener('click', function (evento) {
    var accion = evento.target.dataset.accion;
    if (!accion) return;

    var id = evento.target.closest('.tarea').dataset.id;

    if (accion === 'toggle') {
      peticion(API + '/' + id + '/toggle', { method: 'PATCH' })
        .then(cargarTareas)
        .catch(function (error) {
          notificar(error.message, 'error');
          cargarTareas();
        });
      return;
    }

    if (accion === 'eliminar') {
      // Confirmacion explicita: el borrado es irreversible
      if (!window.confirm('¿Eliminar esta tarea de forma permanente?')) return;
      peticion(API + '/' + id, { method: 'DELETE' })
        .then(function () {
          notificar('Tarea eliminada.', 'ok');
          return cargarTareas();
        })
        .catch(function (error) {
          notificar(error.message, 'error');
        });
    }
  });

  // Cambio de filtro activo
  document.querySelectorAll('.filtro').forEach(function (boton) {
    boton.addEventListener('click', function () {
      document.querySelectorAll('.filtro').forEach(function (b) {
        b.classList.remove('filtro--activo');
      });
      boton.classList.add('filtro--activo');
      filtroActual = boton.dataset.filtro;
      cargarTareas();
    });
  });

  // Arranque: estado del servicio + primera carga, y sondeo de salud cada 30 s
  comprobarSalud();
  cargarTareas();
  setInterval(comprobarSalud, 30000);
})();
