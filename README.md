# Sistema de Gestión de Solicitudes de Transporte Escolar

##  Descripción

Aplicación web para **automatizar y centralizar la gestión de solicitudes de transporte escolar** en la Comunidad Autónoma de Canarias, cumpliendo con RGPD/LOPD y mejorando la eficiencia en la coordinación entre centros educativos, coordinadores y empresas de transporte.

## ✨ Características Principales

 **8 Tipos de Solicitudes** predefinidas con campos dinámicos  
 **Gestión Centralizada** de todas las solicitudes  
 **Trazabilidad Completa** de registros (auditoría RGPD/LOPD)  
 **Sistema de Roles** (Centro, Coordinador, Empresa)  
 **Filtros Avanzados** (alumno, centro, empresa, estado)  
 **Exportación a CSV** para análisis externo  
 **Dashboard Analítico** con estadísticas en tiempo real  
 **Interfaz Responsiva** y moderna  
 **API REST** para integraciones futuras  

---

## 🏗️ Arquitectura del Proyecto

```
bus-escolar/
├── backend/
│   ├── server.js              # Servidor Express
│   ├── init-database.js       # Inicialización de BD
│   └── middleware/            # Autenticación, CORS, etc (futuro)
├── frontend/
│   ├── index.html            # Interfaz principal
│   ├── styles.css           # Estilos CSS
│   ├── app.js               # Lógica JavaScript
│   └── assets/              # Imágenes, iconos (futuro)
├── database/
│   └── transporte_escolar.db # Base de datos SQLite
├── package.json              # Dependencias Node.js
└── README.md                 # Este archivo
```

---

##  Instalación y Ejecución

### Requisitos
- Node.js 14+
- npm o yarn
- SQLite3

### Pasos

1. **Clonar o descargar el proyecto**
   ```bash
   cd "bus escolar"
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Inicializar la base de datos**
   ```bash
   npm run init-db
   ```

4. **Iniciar el servidor**
   ```bash
   npm start
   ```

5. **Abrir en navegador**
   ```
   http://localhost:3000
   ```

---

##  Tipos de Solicitudes

1. **Nuevo alumno/a en transporte especial** - Alumno con necesidades especiales
2. **Nuevo alumno/a en residencia** - Alumno en régimen de internado
3. **Nuevo alumnado Erasmus** - Estudiante de programa Erasmus
4. **Solicitud excepcional hermanos** - Excepción por hermanos en mismo colegio
5. **Cambio de parada o ruta** - Modificación de parada/ruta
6. **Solicitud de doble parada** - Permiso para dos paradas
7. **Creación de paradas en ruta** - Nueva parada en ruta existente
8. **Supresión de paradas en ruta** - Eliminar parada de ruta
9. **Supresión de ruta** - Eliminación completa de ruta
10. **Alta nueva ruta** - Crear nueva ruta de transporte
11. **Otros trámites** - Solicitudes diversas

---

##  Cumplimiento Normativo

### RGPD/LOPD
-  Datos mínimos necesarios (nombre, D.O.B, domicilio, centro)
-  Anonimización en pruebas/desarrollo
-  Tablas de auditoría para trazabilidad
-  Sin datos especialmente protegidos
-  Consentimiento implícito por uso del servicio

### Estados de Solicitud
- **Pendiente**: Recién creada, en espera de revisión
- **En trámite**: En proceso de validación
- **Finalizada**: Completada y confirmada

---

##  Dashboard

El panel principal muestra:
- Total de solicitudes registradas
- Cantidad de solicitudes por estado
- Estadísticas en tiempo real
- Gráficos de distribución (centro, empresa, tipo)

---

##  API REST

### Endpoints Disponibles

**GET /api/solicitudes**
```bash
curl http://localhost:3000/api/solicitudes
```

**POST /api/solicitudes**
```bash
curl -X POST http://localhost:3000/api/solicitudes \
  -H "Content-Type: application/json" \
  -d '{"tipo": "1", "empresa": "...", ...}'
```

**PUT /api/solicitudes/:id**
```bash
curl -X PUT http://localhost:3000/api/solicitudes/1 \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**DELETE /api/solicitudes/:id**
```bash
curl -X DELETE http://localhost:3000/api/solicitudes/1
```

---

##  Desarrollo

### Estructura de Base de Datos

**Tabla: solicitudes**
```sql
- id (INTEGER PRIMARY KEY)
- tipo (TEXT)
- fecha_recepcion (DATE)
- empresa (TEXT)
- alumno (TEXT)
- centro (TEXT)
- estado (TEXT)
- observaciones (TEXT)
- fecha_confirmacion (DATE)
- creado_en (DATETIME)
- actualizado_en (DATETIME)
```

**Tabla: auditoria** (Trazabilidad RGPD)
```sql
- id (INTEGER PRIMARY KEY)
- solicitud_id (INTEGER)
- accion (TEXT)
- usuario (TEXT)
- cambios (TEXT)
- fecha (DATETIME)
```

---

##  Ejemplos de Uso

### Crear nueva solicitud
1. Seleccionar tipo de solicitud
2. Completar campos dinámicos según tipo
3. Ingresar empresa y centro
4. Agregar observaciones (opcional)
5. Presionar "Registrar Solicitud"

### Filtrar solicitudes
- Buscar por nombre de alumno
- Filtrar por centro educativo
- Buscar por empresa transportista
- Filtrar por estado (Pendiente/En trámite/Finalizada)

### Exportar datos
- Presionar botón "Exportar CSV"
- Descarga archivo .csv con todas las solicitudes

---

##  Mejoras Futuras

- [ ] Autenticación con roles (admin, coordinador, empresa, centro)
- [ ] Notificaciones por email
- [ ] Sistema de comentarios en solicitudes
- [ ] Reportes avanzados con gráficos
- [ ] Integración con Google Calendar
- [ ] App mobile
- [ ] Chat en tiempo real
- [ ] Subida de archivos adjuntos

---

##  Soporte

Para reportar problemas o sugerencias, contactar con el equipo de desarrollo.

---

##  Licencia

MIT License - Libre para uso y modificación

---

##  Institución

Sistema desarrollado para la Comunidad Autónoma de Canarias
Consejería de Educación, Formación Profesional, Actividad Física y Deportes

---

**Versión:** 1.0.0  
**Última actualización:** Marzo 2026  
**Normativa:** RGPD/LOPD Compliant
