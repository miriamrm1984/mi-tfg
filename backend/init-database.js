const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/transporte_escolar.db');

// Crear la carpeta si no existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar:', err);
    process.exit(1);
  }

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS solicitudes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      fecha_recepcion DATE NOT NULL,
      empresa TEXT NOT NULL,
      fecha_envio DATE,
      alumno TEXT,
      direccion TEXT,
      contacto TEXT,
      centro TEXT NOT NULL,
      ruta TEXT,
      parada TEXT,
      mod_precio TEXT,
      importe_sin_igic DECIMAL(10, 2),
      importe_con_igic DECIMAL(10, 2),
      observaciones TEXT,
      estado TEXT DEFAULT 'Pendiente',
      fecha_confirmacion DATE,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitud_id INTEGER,
      accion TEXT NOT NULL,
      usuario TEXT,
      cambios TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      contrasena TEXT NOT NULL,
      rol TEXT DEFAULT 'usuario',
      centro TEXT,
      empresa TEXT,
      activo BOOLEAN DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      puede_crear_solicitudes BOOLEAN DEFAULT 0,
      puede_ver_historial BOOLEAN DEFAULT 0,
      puede_modificar_solicitudes BOOLEAN DEFAULT 0,
      puede_cambiar_estado_tramitacion BOOLEAN DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`INSERT OR IGNORE INTO roles
      (nombre, puede_crear_solicitudes, puede_ver_historial, puede_modificar_solicitudes, puede_cambiar_estado_tramitacion)
      VALUES
      ('Coordinador de transporte escolar', 1, 1, 1, 1),
      ('Centro Escolar', 1, 1, 1, 0),
      ('Empresa de Transporte Escolar', 0, 1, 0, 1)
    `);

    db.run(`INSERT OR IGNORE INTO usuarios
      (usuario, contrasena, rol, centro, empresa, activo)
      VALUES
      ('coordinador_demo', 'Demo1234!', 'Coordinador de transporte escolar', 'Coordinación Insular', NULL, 1),
      ('centro_demo', 'Demo1234!', 'Centro Escolar', 'IES Canarias', NULL, 1),
      ('empresa_demo', 'Demo1234!', 'Empresa de Transporte Escolar', NULL, 'Empresa A', 1)
    `);

    const tiposVigentes = [
      'Anexo II-A: Solicitud transporte alumnado NEE',
      'Anexo III-A: Bonos de transporte regular de viajeros',
      'Anexo III-B: Solicitud alumnado de residencias escolares',
      'Anexo IV: Autorización excepcional',
      'Anexo IX: Uso de transporte escolar para alumnado',
      'Anexo X: Modificaciones en ruta de transporte escolar',
      'Anexo XI: Cambio de paradas y/o rutas',
      'Anexo XII: Doble parada y/o ruta'
    ];

    const empresas = ['Empresa A', 'Empresa B', 'TransCanarias', 'Ruta Azul', 'MoviEscolar'];
    const centros = ['IES Canarias', 'Colegio Santa María', 'CEIP Atlántico', 'IES Arucas', 'IES Tegueste', 'CEIP Timanfaya'];
    const alumnos = [
      'Lucia Perez Martin', 'Hugo Gonzalez Diaz', 'Elena Ramos Suarez', 'Daniel Ortega Vega', 'Carla Medina Leon',
      'Sergio Navarro Paz', 'Nora Santana Gil', 'Adrian Mesa Acosta', 'Paula Gil Hernandez', 'Javier Leon Cabrera',
      'Irene Padron Lopez', 'Mateo Herrera Ruiz', 'Aitana Benitez Cruz', 'Samuel Torres Garcia', 'Valeria Munoz Soto'
    ];
    const rutas = ['R-01 Norte', 'R-02 Sur', 'R-03 Este', 'R-04 Oeste', 'R-05 Centro'];
    const paradas = ['Parada Centro', 'Parada Norte', 'Parada Sur', 'Parada Instituto', 'Parada Hospital'];

    const distribucionEstados = {
      Pendiente: 30,
      'En trámite': 15,
      Validada: 25
    };

    const secuenciaEstados = [
      ...Array(distribucionEstados.Pendiente).fill('Pendiente'),
      ...Array(distribucionEstados['En trámite']).fill('En trámite'),
      ...Array(distribucionEstados.Validada).fill('Validada')
    ];

    const insertSolicitudSql = `
      INSERT INTO solicitudes
      (tipo, fecha_recepcion, empresa, alumno, direccion, contacto, centro, ruta, parada, observaciones, estado, fecha_confirmacion, creado_en, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertAuditoriaSql = `
      INSERT INTO auditoria (solicitud_id, accion, usuario, cambios, fecha)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM auditoria', (deleteAuditErr) => {
      if (deleteAuditErr) {
        console.error('Error al limpiar auditoria:', deleteAuditErr);
        db.run('ROLLBACK', cerrarBD);
        return;
      }

      db.run('DELETE FROM solicitudes', (deleteSolicitudesErr) => {
        if (deleteSolicitudesErr) {
          console.error('Error al limpiar solicitudes:', deleteSolicitudesErr);
          db.run('ROLLBACK', cerrarBD);
          return;
        }

        const solicitudStmt = db.prepare(insertSolicitudSql);
        const auditoriaStmt = db.prepare(insertAuditoriaSql);

        secuenciaEstados.forEach((estadoFinal, i) => {
          const tipo = tiposVigentes[i % tiposVigentes.length];
          const alumno = alumnos[i % alumnos.length];
          const centro = centros[i % centros.length];
          const empresa = empresas[i % empresas.length];
          const ruta = rutas[i % rutas.length];
          const parada = paradas[i % paradas.length];

          const diasAtras = 120 - i;
          const fechaPendiente = restarDias(new Date(), diasAtras);
          fechaPendiente.setHours(8 + (i % 8), 10 + (i % 45), 0, 0);

          const fechaEnTramite = new Date(fechaPendiente);
          fechaEnTramite.setDate(fechaEnTramite.getDate() + 1 + (i % 4));
          fechaEnTramite.setHours(10 + (i % 6), 5 + (i % 40), 0, 0);

          const fechaValidada = new Date(fechaEnTramite);
          fechaValidada.setDate(fechaValidada.getDate() + 1 + (i % 3));
          fechaValidada.setHours(12 + (i % 5), 15 + (i % 30), 0, 0);

          const fechaRecepcion = formatDate(fechaPendiente);
          const fechaConfirmacion = estadoFinal === 'Validada' ? formatDate(fechaValidada) : null;
          const creadoEn = formatDateTime(fechaPendiente);
          const actualizadoEn = estadoFinal === 'Pendiente'
            ? formatDateTime(fechaPendiente)
            : estadoFinal === 'En trámite'
              ? formatDateTime(fechaEnTramite)
              : formatDateTime(fechaValidada);

          solicitudStmt.run(
            tipo,
            fechaRecepcion,
            empresa,
            alumno,
            `Calle ${10 + (i % 70)}, ${centro}`,
            `60012${String(i + 1).padStart(4, '0')}`,
            centro,
            ruta,
            parada,
            `Registro de prueba #${i + 1}`,
            estadoFinal,
            fechaConfirmacion,
            creadoEn,
            actualizadoEn,
            function (insertErr) {
              if (insertErr) {
                console.error('Error insertando solicitud:', insertErr);
                return;
              }

              const solicitudId = this.lastID;

              auditoriaStmt.run(
                solicitudId,
                'CREACION_SOLICITUD',
                'seed_system',
                JSON.stringify({ estado: 'Pendiente' }),
                formatDateTime(fechaPendiente)
              );

              if (estadoFinal === 'En trámite' || estadoFinal === 'Validada') {
                auditoriaStmt.run(
                  solicitudId,
                  'CAMBIO_ESTADO',
                  'empresa_demo',
                  JSON.stringify({ estado_anterior: 'Pendiente', estado_nuevo: 'En trámite' }),
                  formatDateTime(fechaEnTramite)
                );
              }

              if (estadoFinal === 'Validada') {
                auditoriaStmt.run(
                  solicitudId,
                  'CAMBIO_ESTADO',
                  'coordinador_demo',
                  JSON.stringify({ estado_anterior: 'En trámite', estado_nuevo: 'Validada' }),
                  formatDateTime(fechaValidada)
                );
              }
            }
          );
        });

        solicitudStmt.finalize((solicitudFinalizeErr) => {
          if (solicitudFinalizeErr) {
            console.error('Error al finalizar inserciones de solicitudes:', solicitudFinalizeErr);
            db.run('ROLLBACK', cerrarBD);
            return;
          }

          auditoriaStmt.finalize((auditoriaFinalizeErr) => {
            if (auditoriaFinalizeErr) {
              console.error('Error al finalizar inserciones de auditoria:', auditoriaFinalizeErr);
              db.run('ROLLBACK', cerrarBD);
              return;
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Error al confirmar precarga limpia:', commitErr);
                db.run('ROLLBACK', cerrarBD);
                return;
              }

              console.log('✓ Limpieza y recarga completadas');
              console.log('  - Total solicitudes: 70');
              console.log('  - Pendiente: 30');
              console.log('  - En trámite: 15');
              console.log('  - Validada: 25');
              console.log('  - Tipos: solo anexos vigentes');
              cerrarBD();
            });
          });
        });
      });
    });
  });

  function cerrarBD() {
    db.close((closeErr) => {
      if (closeErr) console.error('Error al cerrar BD:', closeErr);
      else console.log('✓ Base de datos inicializada correctamente\n');
    });
  }
});

function restarDias(fecha, dias) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() - dias);
  return resultado;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
