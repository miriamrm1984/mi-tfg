const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Base de datos
const dbPath = path.join(__dirname, '../database/transporte_escolar.db');
let db;

function normalizarEstado(estado) {
  const valor = String(estado || '').trim().toLowerCase();
  if (valor === 'finalizada' || valor === 'validada') return 'Validada';
  if (valor === 'en tramite' || valor === 'en trámite') return 'En trámite';
  if (valor === 'pendiente') return 'Pendiente';
  return estado || 'Pendiente';
}

function registrarAuditoria(solicitudId, accion, usuario, cambios = null) {
  const sql = `INSERT INTO auditoria (solicitud_id, accion, usuario, cambios) VALUES (?, ?, ?, ?)`;
  db.run(sql, [solicitudId, accion, usuario || 'sistema', cambios ? JSON.stringify(cambios) : null], (err) => {
    if (err) {
      console.error('Error al registrar auditoría:', err.message);
    }
  });
}

function registrarAuditoriaConFecha(solicitudId, accion, usuario, cambios = null, fecha = null) {
  const sql = fecha
    ? `INSERT INTO auditoria (solicitud_id, accion, usuario, cambios, fecha) VALUES (?, ?, ?, ?, ?)`
    : `INSERT INTO auditoria (solicitud_id, accion, usuario, cambios) VALUES (?, ?, ?, ?)`;

  const params = fecha
    ? [solicitudId, accion, usuario || 'sistema', cambios ? JSON.stringify(cambios) : null, fecha]
    : [solicitudId, accion, usuario || 'sistema', cambios ? JSON.stringify(cambios) : null];

  db.run(sql, params, (err) => {
    if (err) {
      console.error('Error al registrar auditoría con fecha:', err.message);
    }
  });
}

// Inicializar base de datos
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else {
        console.log('✓ Base de datos conectada');
        resolve();
      }
    });
  });
}

// Rutas API
app.post('/api/auth/login', (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  const sql = `
    SELECT
      u.id,
      u.usuario,
      u.rol,
      u.centro,
      u.empresa,
      u.activo,
      r.puede_crear_solicitudes,
      r.puede_ver_historial,
      r.puede_modificar_solicitudes,
      r.puede_cambiar_estado_tramitacion
    FROM usuarios u
    LEFT JOIN roles r ON r.nombre = u.rol
    WHERE u.usuario = ? AND u.contrasena = ?
    LIMIT 1
  `;

  db.get(sql, [usuario, contrasena], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo' });
    }

    res.json({
      usuario: row.usuario,
      rol: row.rol,
      centro: row.centro,
      empresa: row.empresa,
      permisos: {
        puede_crear_solicitudes: !!row.puede_crear_solicitudes,
        puede_ver_historial: !!row.puede_ver_historial,
        puede_modificar_solicitudes: !!row.puede_modificar_solicitudes,
        puede_cambiar_estado_tramitacion: !!row.puede_cambiar_estado_tramitacion
      }
    });
  });
});

app.get('/api/roles', (req, res) => {
  db.all('SELECT * FROM roles ORDER BY nombre ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/solicitudes', (req, res) => {
  db.all('SELECT * FROM solicitudes ORDER BY fecha_recepcion DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const solicitudes = (rows || []).map((s) => ({
      ...s,
      estado: normalizarEstado(s.estado)
    }));
    res.json(solicitudes);
  });
});

app.get('/api/solicitudes/:id/historial-estados', (req, res) => {
  const { id } = req.params;

  const solicitudSql = `
    SELECT id, estado, fecha_recepcion, creado_en, actualizado_en, tipo, alumno, centro, empresa
    FROM solicitudes
    WHERE id = ?
    LIMIT 1
  `;

  db.get(solicitudSql, [id], (solicitudErr, solicitud) => {
    if (solicitudErr) return res.status(500).json({ error: solicitudErr.message });
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const auditoriaSql = `
      SELECT id, accion, usuario, cambios, fecha
      FROM auditoria
      WHERE solicitud_id = ? AND accion IN ('CREACION_SOLICITUD', 'CAMBIO_ESTADO')
      ORDER BY datetime(fecha) ASC, id ASC
    `;

    db.all(auditoriaSql, [id], (auditoriaErr, rows) => {
      if (auditoriaErr) return res.status(500).json({ error: auditoriaErr.message });

      const eventos = (rows || []).map((row) => {
        let cambios = {};
        if (row.cambios) {
          try {
            cambios = JSON.parse(row.cambios);
          } catch (parseErr) {
            cambios = {};
          }
        }
        return {
          ...row,
          cambios
        };
      });

      const primerCambio = eventos.find((evento) => evento.accion === 'CAMBIO_ESTADO');
      const eventoCreacion = eventos.find((evento) => evento.accion === 'CREACION_SOLICITUD');

      const fechaInicial = eventoCreacion?.fecha
        || solicitud.creado_en
        || (solicitud.fecha_recepcion ? `${solicitud.fecha_recepcion}T00:00:00` : null);

      const estadoInicial = normalizarEstado(
        eventoCreacion?.cambios?.estado
        || primerCambio?.cambios?.estado_anterior
        || solicitud.estado
      );

      const historial = [];
      if (estadoInicial) {
        historial.push({
          estado: estadoInicial,
          fecha: fechaInicial,
          usuario: eventoCreacion?.usuario || 'sistema',
          origen: 'CREACION_SOLICITUD'
        });
      }

      eventos
        .filter((evento) => evento.accion === 'CAMBIO_ESTADO')
        .forEach((evento) => {
          const estadoNuevo = normalizarEstado(evento.cambios?.estado_nuevo);
          if (!estadoNuevo) return;

          const ultimoEstado = historial.length > 0 ? historial[historial.length - 1].estado : null;
          if (ultimoEstado === estadoNuevo) return;

          historial.push({
            estado: estadoNuevo,
            fecha: evento.fecha,
            usuario: evento.usuario || 'sistema',
            origen: 'CAMBIO_ESTADO'
          });
        });

      const estadoActual = normalizarEstado(solicitud.estado);
      const ultimoEstado = historial.length > 0 ? historial[historial.length - 1].estado : null;
      if (!ultimoEstado || ultimoEstado !== estadoActual) {
        historial.push({
          estado: estadoActual,
          fecha: solicitud.actualizado_en || solicitud.creado_en || null,
          usuario: 'sistema',
          origen: 'ESTADO_ACTUAL'
        });
      }

      res.json({
        solicitud: {
          id: solicitud.id,
          tipo: solicitud.tipo,
          alumno: solicitud.alumno,
          centro: solicitud.centro,
          empresa: solicitud.empresa,
          estado: estadoActual
        },
        historial
      });
    });
  });
});

app.post('/api/solicitudes', (req, res) => {
  const { tipo, empresa, alumno, centro, estado, observaciones, fecha_confirmacion, usuario_accion } = req.body;
  const fecha_recepcion = new Date().toISOString().split('T')[0];
  const estadoNormalizado = normalizarEstado(estado);
  
  const sql = `INSERT INTO solicitudes 
    (tipo, empresa, alumno, centro, estado, observaciones, fecha_recepcion, fecha_confirmacion) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [tipo, empresa, alumno, centro, estadoNormalizado, observaciones, fecha_recepcion, fecha_confirmacion], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      const solicitudId = this.lastID;
      const ahora = new Date();
      const tCreacion = new Date(ahora.getTime() - 4 * 60 * 1000);
      const tTramite = new Date(ahora.getTime() - 2 * 60 * 1000);

      registrarAuditoriaConFecha(solicitudId, 'CREACION_SOLICITUD', usuario_accion, { estado: 'Pendiente' }, tCreacion.toISOString());

      if (estadoNormalizado === 'En trámite' || estadoNormalizado === 'Validada') {
        registrarAuditoriaConFecha(
          solicitudId,
          'CAMBIO_ESTADO',
          usuario_accion,
          { estado_anterior: 'Pendiente', estado_nuevo: 'En trámite' },
          tTramite.toISOString()
        );
      }

      if (estadoNormalizado === 'Validada') {
        registrarAuditoriaConFecha(
          solicitudId,
          'CAMBIO_ESTADO',
          usuario_accion,
          { estado_anterior: 'En trámite', estado_nuevo: 'Validada' },
          ahora.toISOString()
        );
      }

      if (estadoNormalizado === 'Pendiente') {
        // Deja trazabilidad explícita cuando la solicitud aún no ha avanzado.
      }

      res.json({ id: this.lastID, message: 'Solicitud registrada correctamente' });
    });
});

app.put('/api/solicitudes/:id', (req, res) => {
  const { id } = req.params;
  const { tipo, empresa, alumno, centro, estado, observaciones, fecha_confirmacion, usuario_accion } = req.body;
  const estadoNormalizado = normalizarEstado(estado);

  db.get('SELECT id, estado FROM solicitudes WHERE id = ?', [id], (selectErr, existente) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    if (!existente) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const sql = `UPDATE solicitudes 
      SET tipo=?, empresa=?, alumno=?, centro=?, estado=?, observaciones=?, fecha_confirmacion=?, actualizado_en=CURRENT_TIMESTAMP 
      WHERE id=?`;

    db.run(sql, [tipo, empresa, alumno, centro, estadoNormalizado, observaciones, fecha_confirmacion, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const estadoAnterior = normalizarEstado(existente.estado);
        if (estadoAnterior !== estadoNormalizado) {
          const ahora = new Date();
          const tIntermedio = new Date(ahora.getTime() - 60 * 1000);

          // Si se intenta pasar de Pendiente a Validada en un solo paso,
          // registramos el intermedio En trámite para conservar el historial completo.
          if (estadoAnterior === 'Pendiente' && estadoNormalizado === 'Validada') {
            registrarAuditoriaConFecha(id, 'CAMBIO_ESTADO', usuario_accion, {
              estado_anterior: 'Pendiente',
              estado_nuevo: 'En trámite'
            }, tIntermedio.toISOString());

            registrarAuditoriaConFecha(id, 'CAMBIO_ESTADO', usuario_accion, {
              estado_anterior: 'En trámite',
              estado_nuevo: 'Validada'
            }, ahora.toISOString());
          } else {
            registrarAuditoriaConFecha(id, 'CAMBIO_ESTADO', usuario_accion, {
              estado_anterior: estadoAnterior,
              estado_nuevo: estadoNormalizado
            }, ahora.toISOString());
          }
        } else {
          registrarAuditoria(id, 'EDICION_SOLICITUD', usuario_accion);
        }

        res.json({ message: 'Solicitud actualizada correctamente' });
      });
  });
});

app.get('/api/notificaciones/estado', (req, res) => {
  const desde = req.query.desde || '1970-01-01T00:00:00.000Z';
  const sql = `
    SELECT id, solicitud_id, accion, usuario, cambios, fecha
    FROM auditoria
    WHERE accion = 'CAMBIO_ESTADO' AND datetime(fecha) >= datetime(?)
    ORDER BY datetime(fecha) DESC
    LIMIT 50
  `;

  db.all(sql, [desde], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const eventos = rows || [];
    res.json({
      totalNoLeidas: eventos.length,
      eventos
    });
  });
});

app.delete('/api/solicitudes/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM solicitudes WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Solicitud eliminada correctamente' });
  });
});

// Servir frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Iniciar servidor
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('✗ Error al inicializar:', err);
  process.exit(1);
});
