# Configuración del backend BALSASUD

Este módulo utiliza **Google Sheets** como base de datos, **Google Apps Script** como backend y **Google Drive** como almacenamiento documental.

## 1. Crear el Google Sheet maestro

1. Abre [Google Sheets](https://sheets.new) y crea una hoja en blanco.
2. Asigna un nombre claro, por ejemplo: `BALSASUD · Trazabilidad de Embarques`.
3. Abre `Extensiones > Apps Script`.
4. Borra el contenido inicial del editor.
5. Copia y pega TODO el contenido de `google-apps-script.gs`.
6. Guarda el proyecto (`Ctrl + S`).

## 2. Crear las hojas automáticamente

La primera llamada al backend creará las 13 hojas con sus encabezados. También puedes ejecutar manualmente la función `ensureSheets()` desde el editor de Apps Script.

### Estructura de hojas

| Hoja | Descripción |
|---|---|
| `CONFIGURACION` | Parámetros globales (carpeta Drive, nombre empresa). |
| `USUARIOS` | Usuarios, roles, hashes de contraseña y estado. |
| `EMBARQUES` | Cabecera de cada embarque. |
| `DOCUMENTOS` | Tally y detalles adjuntos en Drive. |
| `DETALLE_EMBARQUES` | Líneas del TALLY por embarque. |
| `ESPESORES` | Catálogo de espesores. |
| `PALLETS` | Palets reportados por Producto Terminado. |
| `CAJAS` | Cajas reportadas por Producto Terminado. |
| `ORDENES_PRODUCCION` | Órdenes de producción vigentes. |
| `LIBERACIONES` | Liberaciones parciales de PT. |
| `INSPECCIONES_CALIDAD` | Inspecciones con formato FOR-QC-08. |
| `DOCUMENTOS_PDF` | PDFs generados y sus URLs de Drive. |
| `AUDITORIA` | Registro de todas las operaciones. |

## 3. Crear usuarios iniciales

En el editor de Apps Script, ejecuta la función `seedUsuarios()`. Esto creará tres usuarios demo:

| Usuario | Rol | Contraseña temporal |
|---|---|---|
| `superadmin` | Superadministrador | `Balsasud2026!` |
| `terminado` | Producto Terminado | `Pt2026!` |
| `calidad` | Calidad | `Calidad2026!` |

> Cambia estas contraseñas en producción inmediatamente después del primer acceso.

## 4. Publicar el backend como aplicación web

1. En Apps Script, selecciona `Implementar > Nueva implementación`.
2. Tipo: **Aplicación web**.
3. Descripción: `BALSASUD Trazabilidad v1`.
4. Ejecutar como: **Yo**.
5. Acceso: **Cualquiera**.
6. Copia la URL de la aplicación web.

## 5. Configurar Google Drive

La primera vez que se crea un embarque, el backend crea automáticamente la carpeta raíz `TRAZABILIDAD BALSASUD` en la cuenta que publicó la app. Luego genera la jerarquía:

```
TRAZABILIDAD BALSASUD
  └── 2026
      └── NOVIEMBRE
          └── EMBARQUE_26SZ134
              ├── TALLY
              ├── DETALLE_EMBARQUE
              └── CONTROL_CALIDAD
```

Si deseas usar una carpeta existente:

1. Abre la carpeta en Google Drive.
2. Copia el ID de la carpeta de la URL (`.../folders/ID_AQUI`).
3. Ejecuta `setConfig('DRIVE_ROOT_FOLDER_ID', 'ID_AQUI', null)` en Apps Script.

## 6. Conectar con Netlify

1. Ve a tu sitio en Netlify.
2. Abre `Site configuration > Environment variables`.
3. Crea la variable:

```text
GOOGLE_SHEETS_ENDPOINT = URL_DE_TU_APLICACION_WEB_DE_APPS_SCRIPT
```

4. Realiza un nuevo deploy.

## 7. Conectar el frontend

El frontend usará `api.js` para comunicarse con `/.netlify/functions/google-sheets`, que reenvía las peticiones a Apps Script. No es necesario exponer la URL de Apps Script en el navegador.

## 8. Permisos necesarios

La primera ejecución del backend solicitará autorización para:

- Acceder a Google Sheets.
- Acceder a Google Drive.
- Enviar datos externos (para generar códigos QR).

Acepta todos los permisos para que el sistema funcione correctamente.

## 9. Verificación rápida

Después de publicar, abre en el navegador:

```
URL_DE_APPS_SCRIPT?action=ping
```

Deberías recibir:

```json
{ "ok": true, "data": { "message": "Backend BALSASUD activo.", "version": "1.0.0" } }
```

## 10. Notas de seguridad

- No compartas la URL de Apps Script públicamente.
- Usa siempre el proxy de Netlify (`/.netlify/functions/google-sheets`).
- Cambia las contraseñas seed inmediatamente.
- Revisa periódicamente la hoja `AUDITORIA`.
