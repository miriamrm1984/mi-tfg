const API_URL = '';

const TIPOS_SOLICITUD = {
  2: { nombre: 'Anexo II-A: Solicitud transporte alumnado NEE', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  3: { nombre: 'Anexo III-A: Bonos de transporte regular de viajeros', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  4: { nombre: 'Anexo III-B: Solicitud alumnado de residencias escolares', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  5: { nombre: 'Anexo IV: Autorización excepcional', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  6: { nombre: 'Anexo IX: Uso de transporte escolar para alumnado', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  7: { nombre: 'Anexo X: Modificaciones en ruta de transporte escolar', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  8: { nombre: 'Anexo XI: Cambio de paradas y/o rutas', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] },
  9: { nombre: 'Anexo XII: Doble parada y/o ruta', campos: ['alumno', 'direccion', 'contacto', 'ruta', 'parada'] }
};

const ROLE_UI_CONFIG = {
  'Coordinador de transporte escolar': {
    showCreateForm: true,
    showEstadoPanel: false,
    createFields: ['tipo', 'empresa', 'centro', 'observaciones', 'estado', 'fechaConfirmacion'],
    editMode: 'full',
    roleMessage: 'Modo Coordinador: gestión completa de solicitudes y estados.'
  },
  'Centro Escolar': {
    showCreateForm: true,
    showEstadoPanel: false,
    createFields: ['tipo', 'empresa', 'centro', 'observaciones'],
    editMode: 'sin_estado',
    roleMessage: 'Modo Centro Escolar: creación y modificación de datos, sin cambio de estado.'
  },
  'Empresa de Transporte Escolar': {
    showCreateForm: false,
    showEstadoPanel: true,
    createFields: [],
    editMode: 'solo_estado',
    roleMessage: 'Modo Empresa: solo seguimiento y actualización del estado de tramitación.'
  }
};

let solicitudes = [];
let currentUser = null;
let notificacionesEstado = [];
let historialSolicitudActual = null;
let permisosActivos = {
  puede_crear_solicitudes: false,
  puede_ver_historial: false,
  puede_modificar_solicitudes: false,
  puede_cambiar_estado_tramitacion: false
};

let ordenTabla = {
  campo: 'id',
  direccion: 'desc'
};

document.addEventListener('DOMContentLoaded', () => {
  inicializarEventos();
  poblarTiposEdit();
  inicializarOrdenTabla();
});

function inicializarOrdenTabla() {
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      cambiarOrdenTabla(btn.dataset.sortKey);
    });
  });
  actualizarIndicadoresOrden();
}

function cambiarOrdenTabla(campo) {
  if (!campo) return;

  if (ordenTabla.campo === campo) {
    ordenTabla.direccion = ordenTabla.direccion === 'desc' ? 'asc' : 'desc';
  } else {
    ordenTabla.campo = campo;
    ordenTabla.direccion = 'desc';
  }

  actualizarIndicadoresOrden();
  mostrarTabla();
}

function actualizarIndicadoresOrden() {
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    const activo = btn.dataset.sortKey === ordenTabla.campo;
    const indicador = btn.querySelector('.sort-indicator');

    btn.classList.toggle('active', activo);
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');

    if (indicador) {
      indicador.textContent = activo
        ? (ordenTabla.direccion === 'desc' ? '▼' : '▲')
        : '↕';
    }
  });
}

function valorOrdenCampo(solicitud, campo) {
  switch (campo) {
    case 'id':
      return Number(solicitud.id) || 0;
    case 'tipo':
      return String(solicitud.tipo || '').toLowerCase();
    case 'alumno':
      return String(solicitud.alumno || '').toLowerCase();
    case 'centro':
      return String(solicitud.centro || '').toLowerCase();
    case 'empresa':
      return String(solicitud.empresa || '').toLowerCase();
    case 'estado':
      return normalizarEstado(solicitud.estado).toLowerCase();
    case 'fecha_recepcion': {
      const timestamp = Date.parse(solicitud.fecha_recepcion);
      if (!Number.isNaN(timestamp)) return timestamp;
      return String(solicitud.fecha_recepcion || '').toLowerCase();
    }
    default:
      return '';
  }
}

function ordenarSolicitudes(lista) {
  const copia = [...lista];

  copia.sort((a, b) => {
    const valorA = valorOrdenCampo(a, ordenTabla.campo);
    const valorB = valorOrdenCampo(b, ordenTabla.campo);

    let resultado = 0;
    if (typeof valorA === 'number' && typeof valorB === 'number') {
      resultado = valorA - valorB;
    } else {
      resultado = String(valorA).localeCompare(String(valorB), 'es', {
        sensitivity: 'base',
        numeric: true
      });
    }

    if (resultado === 0) {
      resultado = (Number(a.id) || 0) - (Number(b.id) || 0);
    }

    return ordenTabla.direccion === 'asc' ? resultado : -resultado;
  });

  return copia;
}

function inicializarEventos() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarTab(link.dataset.tab);
    });
  });

  document.getElementById('loginForm').addEventListener('submit', iniciarSesion);
  document.getElementById('logoutBtn').addEventListener('click', cerrarSesion);
  document.getElementById('notifBtn').addEventListener('click', togglePanelNotificaciones);

  document.getElementById('solicitudForm').addEventListener('submit', guardarSolicitud);
  document.getElementById('tipoSolicitud').addEventListener('change', mostrarCamposDinamicos);

  document.getElementById('estadoForm').addEventListener('submit', guardarCambioEstadoRapido);

  document.getElementById('busquedaAlumno').addEventListener('input', filtrarTabla);
  document.getElementById('busquedaCentro').addEventListener('input', filtrarTabla);
  document.getElementById('busquedaEmpresa').addEventListener('input', filtrarTabla);
  document.getElementById('filtroEstado').addEventListener('change', filtrarTabla);

  const modal = document.getElementById('editModal');
  document.querySelector('.close').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }

    const notifPanel = document.getElementById('notifPanel');
    const notifBtn = document.getElementById('notifBtn');
    if (notifPanel.classList.contains('hidden')) return;
    if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
      notifPanel.classList.add('hidden');
    }
  });

  document.getElementById('editForm').addEventListener('submit', guardarEdicion);
}

async function iniciarSesion(e) {
  e.preventDefault();

  const usuario = document.getElementById('loginUsuario').value.trim();
  const contrasena = document.getElementById('loginContrasena').value.trim();

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena })
    });

    if (!response.ok) {
      mostrarAlerta('Credenciales inválidas', 'error');
      return;
    }

    currentUser = await response.json();
    permisosActivos = currentUser.permisos;

    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('rolActualInfo').textContent = currentUser.rol;
    document.getElementById('usuarioActualInfo').textContent = `Usuario: ${currentUser.usuario}`;

    aplicarVistaPorRol();
    await cargarSolicitudes();
    await cargarNotificacionesEstado();
    cambiarTab('inicio');
    mostrarAlerta('Sesión iniciada correctamente', 'success');
  } catch (error) {
    console.error('Error en login:', error);
    mostrarAlerta('No fue posible iniciar sesión', 'error');
  }
}

function cerrarSesion() {
  currentUser = null;
  solicitudes = [];
  notificacionesEstado = [];
  historialSolicitudActual = null;
  permisosActivos = {
    puede_crear_solicitudes: false,
    puede_ver_historial: false,
    puede_modificar_solicitudes: false,
    puede_cambiar_estado_tramitacion: false
  };

  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('loginForm').reset();
  document.getElementById('solicitudForm').reset();
  document.getElementById('camposDinamicos').innerHTML = '';
  document.querySelector('#tablaSolicitudes tbody').innerHTML = '';
  document.getElementById('notifPanel').classList.add('hidden');
  document.getElementById('notifList').innerHTML = '';
  document.getElementById('notifBadge').classList.add('hidden');
  document.getElementById('historialMeta').innerHTML = '';
  document.getElementById('tablaHistorialBody').innerHTML = '';
  document.getElementById('historialEmpty').classList.remove('hidden');
  mostrarAlerta('Sesión cerrada', 'success');
}

function aplicarVistaPorRol() {
  const roleConfig = ROLE_UI_CONFIG[currentUser.rol];
  if (!roleConfig) {
    mostrarAlerta('Rol no reconocido en el sistema', 'error');
    return;
  }

  document.getElementById('rolVistaMensaje').textContent = roleConfig.roleMessage;

  const navReportes = document.querySelector('.nav-link[data-tab="reportes"]');
  const navHistorial = document.querySelector('.nav-link[data-tab="historial"]');
  navReportes.style.display = permisosActivos.puede_ver_historial ? '' : 'none';
  navHistorial.style.display = permisosActivos.puede_ver_historial ? '' : 'none';

  document.getElementById('createFormSection').classList.toggle('hidden', !roleConfig.showCreateForm);
  document.getElementById('estadoOnlySection').classList.toggle('hidden', !roleConfig.showEstadoPanel);

  const allCreateFields = ['tipo', 'empresa', 'centro', 'observaciones', 'estado', 'fechaConfirmacion'];
  allCreateFields.forEach((field) => {
    const row = document.getElementById(`field-${field}`) || document.getElementById(`field-${field}-row`);
    if (!row) return;
    row.classList.toggle('hidden', !roleConfig.createFields.includes(field));
  });

  const canSeeTable = permisosActivos.puede_ver_historial;
  document.querySelector('.filters-section').classList.toggle('hidden', !canSeeTable);
  document.querySelector('.table-section').classList.toggle('hidden', !canSeeTable);

  if (roleConfig.showCreateForm && !roleConfig.createFields.includes('tipo')) {
    document.getElementById('tipoSolicitud').value = '2';
    mostrarCamposDinamicos();
  }

  if (!roleConfig.showCreateForm) {
    document.getElementById('solicitudForm').reset();
    document.getElementById('camposDinamicos').innerHTML = '';
  }
}

function cambiarTab(tabName) {
  document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.remove('active'));
  const targetTab = document.getElementById(`${tabName}-tab`);
  if (!targetTab) return;
  targetTab.classList.add('active');

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.tab === tabName);
  });

  if (tabName === 'reportes') {
    generarReportes();
  }
}

function poblarTiposEdit() {
  const editTipo = document.getElementById('editTipo');
  editTipo.innerHTML = '';

  Object.values(TIPOS_SOLICITUD).forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo.nombre;
    option.textContent = tipo.nombre;
    editTipo.appendChild(option);
  });
}

function normalizarEstado(estado) {
  const valor = String(estado || '').trim().toLowerCase();
  if (valor === 'finalizada' || valor === 'validada') return 'Validada';
  if (valor === 'en tramite' || valor === 'en trámite') return 'En trámite';
  if (valor === 'pendiente') return 'Pendiente';
  return estado || 'Pendiente';
}

function claseEstado(estado) {
  const clave = normalizarEstado(estado)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');

  return `estado-${clave}`;
}

function storageKeyNotificaciones() {
  return currentUser ? `notificaciones_estado_${currentUser.usuario}` : '';
}

function fechaVisible(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function mostrarCamposDinamicos() {
  const tipo = document.getElementById('tipoSolicitud').value;
  const contenedor = document.getElementById('camposDinamicos');

  if (!tipo || !TIPOS_SOLICITUD[tipo]) {
    contenedor.innerHTML = '';
    return;
  }

  let html = '<h4>Campos Específicos del Tipo de Solicitud:</h4>';
  TIPOS_SOLICITUD[tipo].campos.forEach((campo) => {
    const label = {
      alumno: 'Alumno/a',
      direccion: 'Dirección',
      contacto: 'Contacto',
      ruta: 'Ruta',
      parada: 'Parada'
    }[campo] || campo;

    html += `
      <div class="form-group">
        <label for="${campo}">${label}</label>
        <input type="text" id="${campo}" placeholder="Ingresa ${label.toLowerCase()}">
      </div>
    `;
  });

  contenedor.innerHTML = html;
}

async function cargarSolicitudes() {
  if (!currentUser) return;

  try {
    const response = await fetch(`${API_URL}/api/solicitudes`);
    const data = await response.json();
    solicitudes = (data || []).map((s) => ({
      ...s,
      estado: normalizarEstado(s.estado)
    }));
    mostrarTabla();
    actualizarDashboard();
    actualizarSelectSolicitudEstado();
  } catch (error) {
    console.error('Error al cargar solicitudes:', error);
    mostrarAlerta('Error al cargar las solicitudes', 'error');
  }
}

async function guardarSolicitud(e) {
  e.preventDefault();

  if (!permisosActivos.puede_crear_solicitudes) {
    mostrarAlerta('Tu rol no puede crear solicitudes', 'error');
    return;
  }

  const roleConfig = ROLE_UI_CONFIG[currentUser.rol];
  const tipoSelect = document.getElementById('tipoSolicitud');
  const tipoTexto = roleConfig.createFields.includes('tipo')
    ? tipoSelect.options[tipoSelect.selectedIndex].text
    : 'Otros trámites';

  const empresa = roleConfig.createFields.includes('empresa')
    ? document.getElementById('empresa').value
    : (currentUser.empresa || 'Empresa A');

  const centro = roleConfig.createFields.includes('centro')
    ? document.getElementById('centro').value
    : (currentUser.centro || 'Centro sin asignar');

  const solicitud = {
    tipo: tipoTexto,
    empresa,
    alumno: document.getElementById('alumno')?.value || '',
    centro,
    estado: permisosActivos.puede_cambiar_estado_tramitacion ? normalizarEstado(document.getElementById('estado').value) : 'Pendiente',
    observaciones: document.getElementById('observaciones').value,
    fecha_confirmacion: permisosActivos.puede_cambiar_estado_tramitacion ? document.getElementById('fechaConfirmacion').value : null,
    usuario_accion: currentUser.usuario
  };

  try {
    const response = await fetch(`${API_URL}/api/solicitudes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(solicitud)
    });

    if (!response.ok) {
      mostrarAlerta('Error al registrar la solicitud', 'error');
      return;
    }

    mostrarAlerta('Solicitud registrada correctamente', 'success');
    document.getElementById('solicitudForm').reset();
    document.getElementById('camposDinamicos').innerHTML = '';
    await cargarSolicitudes();
  } catch (error) {
    console.error('Error al crear:', error);
    mostrarAlerta('Error en la solicitud', 'error');
  }
}

function actualizarSelectSolicitudEstado() {
  const select = document.getElementById('estadoSolicitudId');
  if (!select) return;

  select.innerHTML = '';
  solicitudes.forEach((s) => {
    const option = document.createElement('option');
    option.value = s.id;
    option.textContent = `#${s.id} - ${s.centro} - ${s.estado}`;
    select.appendChild(option);
  });
}

async function guardarCambioEstadoRapido(e) {
  e.preventDefault();

  if (!permisosActivos.puede_cambiar_estado_tramitacion) {
    mostrarAlerta('Tu rol no puede cambiar estados', 'error');
    return;
  }

  const id = Number(document.getElementById('estadoSolicitudId').value);
  const nuevoEstado = document.getElementById('nuevoEstado').value;
  const observacionesExtra = document.getElementById('estadoObservaciones').value;
  const solicitud = solicitudes.find((s) => s.id === id);

  if (!solicitud) {
    mostrarAlerta('Solicitud no encontrada', 'error');
    return;
  }

  const payload = {
    tipo: solicitud.tipo,
    empresa: solicitud.empresa,
    alumno: solicitud.alumno,
    centro: solicitud.centro,
    estado: normalizarEstado(nuevoEstado),
    observaciones: observacionesExtra || solicitud.observaciones,
    fecha_confirmacion: new Date().toISOString().split('T')[0],
    usuario_accion: currentUser.usuario
  };

  try {
    const response = await fetch(`${API_URL}/api/solicitudes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      mostrarAlerta('Error al actualizar estado', 'error');
      return;
    }

    mostrarAlerta('Estado actualizado correctamente', 'success');
    document.getElementById('estadoForm').reset();
    await cargarSolicitudes();
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    mostrarAlerta('Error al actualizar estado', 'error');
  }
}

function mostrarTabla() {
  const tbody = document.querySelector('#tablaSolicitudes tbody');
  tbody.innerHTML = '';

  if (!permisosActivos.puede_ver_historial) return;

  const solicitudesOrdenadas = ordenarSolicitudes(solicitudes);

  solicitudesOrdenadas.forEach((solicitud) => {
    const fila = document.createElement('tr');
    const estadoNormalizado = normalizarEstado(solicitud.estado);
    const estadoClase = claseEstado(estadoNormalizado);
    const puedeEditar = permisosActivos.puede_modificar_solicitudes || permisosActivos.puede_cambiar_estado_tramitacion;
    const puedeEliminar = permisosActivos.puede_modificar_solicitudes;

    const editarBtn = puedeEditar
      ? `<button onclick="abrirEditar(${solicitud.id})" class="btn btn-edit">Editar</button>`
      : '';

    const verHistorialBtn = permisosActivos.puede_ver_historial
      ? `<button onclick="verHistorialSolicitud(${solicitud.id})" class="btn btn-info">Ver</button>`
      : '';

    const eliminarBtn = puedeEliminar
      ? `<button onclick="eliminarSolicitud(${solicitud.id})" class="btn btn-danger">Eliminar</button>`
      : '';

    fila.innerHTML = `
      <td>${solicitud.id}</td>
      <td>${solicitud.tipo}</td>
      <td>${solicitud.alumno || '-'}</td>
      <td>${solicitud.centro}</td>
      <td>${solicitud.empresa}</td>
      <td><span class="${estadoClase}">${estadoNormalizado}</span></td>
      <td class="fecha-col">${solicitud.fecha_recepcion}</td>
      <td><div class="acciones">${verHistorialBtn}${editarBtn}${eliminarBtn}</div></td>
    `;

    tbody.appendChild(fila);
  });

  filtrarTabla();
}

async function verHistorialSolicitud(id) {
  if (!permisosActivos.puede_ver_historial) {
    mostrarAlerta('Tu rol no puede ver historial', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/solicitudes/${id}/historial-estados`);
    if (!response.ok) {
      mostrarAlerta('No se pudo cargar el historial de estados', 'error');
      return;
    }

    const payload = await response.json();
    historialSolicitudActual = payload;
    renderHistorialSolicitud(payload);
    cambiarTab('historial');
  } catch (error) {
    console.error('Error al cargar historial:', error);
    mostrarAlerta('Error al cargar historial de estados', 'error');
  }
}

function renderHistorialSolicitud(payload) {
  const meta = document.getElementById('historialMeta');
  const tbody = document.getElementById('tablaHistorialBody');
  const empty = document.getElementById('historialEmpty');

  if (!meta || !tbody || !empty) return;

  const solicitud = payload?.solicitud || {};
  const historial = payload?.historial || [];

  meta.innerHTML = `
    <div class="historial-card-item"><strong>Solicitud:</strong> #${solicitud.id || '-'}</div>
    <div class="historial-card-item"><strong>Alumno:</strong> ${solicitud.alumno || '-'}</div>
    <div class="historial-card-item"><strong>Centro:</strong> ${solicitud.centro || '-'}</div>
    <div class="historial-card-item"><strong>Empresa:</strong> ${solicitud.empresa || '-'}</div>
    <div class="historial-card-item"><strong>Estado actual:</strong> ${normalizarEstado(solicitud.estado)}</div>
  `;

  tbody.innerHTML = '';
  if (historial.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  historial.forEach((paso, index) => {
    const fila = document.createElement('tr');
    const estado = normalizarEstado(paso.estado);

    fila.innerHTML = `
      <td>${index + 1}</td>
      <td><span class="${claseEstado(estado)}">${estado}</span></td>
      <td>${fechaVisible(paso.fecha)}</td>
      <td>${paso.usuario || 'sistema'}</td>
      <td>${paso.origen || '-'}</td>
    `;

    tbody.appendChild(fila);
  });
}

function volverASolicitudes() {
  cambiarTab('solicitudes');
}

function abrirEditar(id) {
  const puedeEditar = permisosActivos.puede_modificar_solicitudes || permisosActivos.puede_cambiar_estado_tramitacion;
  if (!puedeEditar) {
    mostrarAlerta('Tu rol no tiene permiso para editar', 'error');
    return;
  }

  const solicitud = solicitudes.find((s) => s.id === id);
  if (!solicitud) return;

  document.getElementById('editId').value = id;
  document.getElementById('editTipo').value = solicitud.tipo;
  document.getElementById('editAlumno').value = solicitud.alumno || '';
  document.getElementById('editCentro').value = solicitud.centro;
  document.getElementById('editEmpresa').value = solicitud.empresa;
  document.getElementById('editEstado').value = solicitud.estado;
  document.getElementById('editObservaciones').value = solicitud.observaciones || '';

  const mode = ROLE_UI_CONFIG[currentUser.rol].editMode;
  document.getElementById('edit-field-tipo').classList.toggle('hidden', mode === 'solo_estado');
  document.getElementById('edit-field-alumno').classList.toggle('hidden', mode === 'solo_estado');
  document.getElementById('edit-field-centro').classList.toggle('hidden', mode === 'solo_estado');
  document.getElementById('edit-field-empresa').classList.toggle('hidden', mode === 'solo_estado');
  document.getElementById('edit-field-observaciones').classList.toggle('hidden', false);
  document.getElementById('edit-field-estado').classList.toggle('hidden', mode === 'sin_estado');

  document.getElementById('editModal').style.display = 'block';
}

async function guardarEdicion(e) {
  e.preventDefault();

  const id = document.getElementById('editId').value;
  const original = solicitudes.find((s) => String(s.id) === String(id));
  if (!original) return;

  const mode = ROLE_UI_CONFIG[currentUser.rol].editMode;
  const payload = {
    tipo: mode === 'solo_estado' ? original.tipo : document.getElementById('editTipo').value,
    alumno: mode === 'solo_estado' ? original.alumno : document.getElementById('editAlumno').value,
    centro: mode === 'solo_estado' ? original.centro : document.getElementById('editCentro').value,
    empresa: mode === 'solo_estado' ? original.empresa : document.getElementById('editEmpresa').value,
    estado: mode === 'sin_estado' ? normalizarEstado(original.estado) : normalizarEstado(document.getElementById('editEstado').value),
    observaciones: document.getElementById('editObservaciones').value,
    fecha_confirmacion: new Date().toISOString().split('T')[0],
    usuario_accion: currentUser.usuario
  };

  try {
    const response = await fetch(`${API_URL}/api/solicitudes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      mostrarAlerta('Error al actualizar', 'error');
      return;
    }

    mostrarAlerta('Solicitud actualizada correctamente', 'success');
    document.getElementById('editModal').style.display = 'none';
    await cargarSolicitudes();
  } catch (error) {
    console.error('Error al editar:', error);
    mostrarAlerta('Error al actualizar', 'error');
  }
}

async function eliminarSolicitud(id) {
  if (!permisosActivos.puede_modificar_solicitudes) {
    mostrarAlerta('Tu rol no puede eliminar', 'error');
    return;
  }

  if (!confirm('¿Está seguro de que desea eliminar esta solicitud?')) return;

  try {
    const response = await fetch(`${API_URL}/api/solicitudes/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      mostrarAlerta('Error al eliminar', 'error');
      return;
    }

    mostrarAlerta('Solicitud eliminada correctamente', 'success');
    await cargarSolicitudes();
  } catch (error) {
    console.error('Error al eliminar:', error);
    mostrarAlerta('Error al eliminar', 'error');
  }
}

function filtrarTabla() {
  if (!permisosActivos.puede_ver_historial) return;

  const alumno = document.getElementById('busquedaAlumno').value.toLowerCase();
  const centro = document.getElementById('busquedaCentro').value.toLowerCase();
  const empresa = document.getElementById('busquedaEmpresa').value.toLowerCase();
  const estado = document.getElementById('filtroEstado').value;

  document.querySelectorAll('#tablaSolicitudes tbody tr').forEach((fila) => {
    const filaEstado = normalizarEstado(fila.querySelector('span').textContent);
    const coincideAlumno = fila.children[2].textContent.toLowerCase().includes(alumno);
    const coincideCentro = fila.children[3].textContent.toLowerCase().includes(centro);
    const coincideEmpresa = fila.children[4].textContent.toLowerCase().includes(empresa);
    const coincideEstado = !estado || filaEstado === normalizarEstado(estado);

    fila.style.display = coincideAlumno && coincideCentro && coincideEmpresa && coincideEstado ? '' : 'none';
  });
}

function actualizarDashboard() {
  const total = solicitudes.length;
  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length;
  const enTramite = solicitudes.filter((s) => s.estado === 'En trámite').length;
  const validadas = solicitudes.filter((s) => normalizarEstado(s.estado) === 'Validada').length;

  document.getElementById('total-solicitudes').textContent = total;
  document.getElementById('pendientes').textContent = pendientes;
  document.getElementById('en-tramite').textContent = enTramite;
  document.getElementById('validadas').textContent = validadas;
}

function togglePanelNotificaciones() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');

  if (!panel.classList.contains('hidden')) {
    marcarNotificacionesComoLeidas();
  }
}

function marcarNotificacionesComoLeidas() {
  const storageKey = storageKeyNotificaciones();
  if (!storageKey) return;
  localStorage.setItem(storageKey, new Date().toISOString());
  const badge = document.getElementById('notifBadge');
  badge.classList.add('hidden');
  badge.textContent = '0';
}

function renderNotificaciones() {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (notificacionesEstado.length === 0) {
    list.innerHTML = '<div class="notif-item"><p>No hay cambios de estado nuevos.</p></div>';
    return;
  }

  let html = '';
  notificacionesEstado.forEach((n) => {
    let detalle = {};
    if (n.cambios) {
      try {
        detalle = JSON.parse(n.cambios);
      } catch (error) {
        detalle = {};
      }
    }
    const estadoAnterior = normalizarEstado(detalle.estado_anterior || '-');
    const estadoNuevo = normalizarEstado(detalle.estado_nuevo || '-');
    html += `
      <div class="notif-item">
        <p><strong>Solicitud #${n.solicitud_id}</strong>: ${estadoAnterior} -> ${estadoNuevo}</p>
        <p>${fechaVisible(n.fecha)} | Usuario: ${n.usuario || 'sistema'}</p>
      </div>
    `;
  });

  list.innerHTML = html;
}

async function cargarNotificacionesEstado() {
  if (!currentUser) return;

  const storageKey = storageKeyNotificaciones();
  const desde = localStorage.getItem(storageKey)
    || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();

  try {
    const response = await fetch(`${API_URL}/api/notificaciones/estado?desde=${encodeURIComponent(desde)}`);
    if (!response.ok) return;

    const payload = await response.json();
    notificacionesEstado = payload.eventos || [];
    renderNotificaciones();

    const badge = document.getElementById('notifBadge');
    if (payload.totalNoLeidas > 0) {
      badge.textContent = String(payload.totalNoLeidas);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '0';
      badge.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error al cargar notificaciones:', error);
  }
}

function generarReportes() {
  const centros = {};
  const empresas = {};
  const estados = {
    Pendiente: 0,
    'En trámite': 0,
    Validada: 0
  };

  solicitudes.forEach((s) => {
    centros[s.centro] = (centros[s.centro] || 0) + 1;
    empresas[s.empresa] = (empresas[s.empresa] || 0) + 1;
    const estado = normalizarEstado(s.estado);
    estados[estado] = (estados[estado] || 0) + 1;
  });

  renderEstadoSolicitudesChart(estados);

  let centrosHtml = '<ul>';
  Object.entries(centros).forEach(([centro, cantidad]) => {
    centrosHtml += `<li>${centro}: <strong>${cantidad}</strong></li>`;
  });
  centrosHtml += '</ul>';
  document.getElementById('centrosReport').innerHTML = centrosHtml;

  let empresasHtml = '<ul>';
  Object.entries(empresas).forEach(([empresa, cantidad]) => {
    empresasHtml += `<li>${empresa}: <strong>${cantidad}</strong></li>`;
  });
  empresasHtml += '</ul>';
  document.getElementById('empresasReport').innerHTML = empresasHtml;
}

function renderEstadoSolicitudesChart(estados) {
  const canvas = document.getElementById('cantidadChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = 220;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const labels = ['Pendiente', 'En trámite', 'Validada'];
  const values = labels.map((label) => estados[label] || 0);
  const total = values.reduce((acc, n) => acc + n, 0);

  if (total === 0) {
    ctx.fillStyle = '#607080';
    ctx.font = '14px sans-serif';
    ctx.fillText('No hay datos para mostrar.', 14, 30);
    return;
  }

  const colors = ['#F39C12', '#0398CC', '#27AE60'];
  const left = 20;
  const bottom = 190;
  const chartHeight = 130;
  const barWidth = 72;
  const gap = 24;
  const maxValue = Math.max(...values, 1);

  ctx.strokeStyle = '#d4dde7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(cssWidth - 12, bottom);
  ctx.stroke();

  values.forEach((value, index) => {
    const barHeight = Math.max((value / maxValue) * chartHeight, value > 0 ? 4 : 0);
    const x = left + index * (barWidth + gap);
    const y = bottom - barHeight;

    ctx.fillStyle = colors[index];
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#2f4254';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), x + barWidth / 2, y - 8);

    ctx.fillStyle = '#526577';
    ctx.font = '12px sans-serif';
    ctx.fillText(labels[index], x + barWidth / 2, bottom + 18);
  });

  ctx.textAlign = 'left';
}

function exportarCSV() {
  if (!permisosActivos.puede_ver_historial || solicitudes.length === 0) {
    mostrarAlerta('No hay datos para exportar', 'error');
    return;
  }

  const headers = ['ID', 'Tipo', 'Alumno', 'Centro', 'Empresa', 'Estado', 'Fecha Recepción'];
  const rows = solicitudes.map((s) => [
    s.id,
    s.tipo,
    s.alumno || '-',
    s.centro,
    s.empresa,
    s.estado,
    s.fecha_recepcion
  ]);

  let csv = `${headers.join(',')}\n`;
  rows.forEach((row) => {
    csv += `${row.map((cell) => `"${cell}"`).join(',')}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solicitudes_${Date.now()}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);

  mostrarAlerta('Archivo CSV descargado correctamente', 'success');
}

function mostrarAlerta(mensaje, tipo) {
  const alerta = document.createElement('div');
  alerta.className = `alert alert-${tipo}`;
  alerta.textContent = mensaje;

  document.body.insertBefore(alerta, document.body.firstChild);

  setTimeout(() => {
    alerta.remove();
  }, 3000);
}
