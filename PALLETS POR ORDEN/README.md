# BALSASUD · Trazabilidad de Embarques

Sistema web para **controlar, conciliar y liberar** los despachos de paneles de madera de balsa.

## Arquitectura actual

```
Frontend (Netlify PWA)
    │
    ▼
Netlify Functions (proxy seguro)
    │
    ▼
Google Apps Script (backend, lógica, validaciones)
    │
    ├── Google Sheets (13 hojas estructuradas)
    └── Google Drive (Tally, detalles y PDFs de Calidad)
```

## Roles

- **Superadministrador**: crea embarques, adjunta Tally/Detalle, activa embarques, confirma cantidades, gestiona usuarios.
- **Producto Terminado**: libera paneles parcialmente, escanea QR o ingresa manualmente, no puede exceder cantidades autorizadas.
- **Calidad**: inspecciona liberaciones, completa la hoja de control digital FOR-QC-08, aprueba/rechaza, genera PDF.
- **Jefe de Embarque**: autoriza pallet por pallet, confirma la estiba física (9 filas × 4 pallets + Fila 10 con cajas) y firma el Acta Final de Embarque.

## Documentos que entiende el lector

| Documento | Formato | Qué extrae |
|---|---|---|
| **TALLY SHEET** | PDF, CSV, TXT o texto pegado | ITEM ID, espesor, paneles, pallets y el detalle de empaques con pesos. |
| **Detalle de embarque (FOR-OP-31)** | PDF | OP, espesor en pulgadas, tipo (Simple/Doble/Boxes), paneles y número de pallets/cajas. No imprime ITEM ID, así que el sistema lo propone por espesor y el Superadministrador lo confirma. |

El Detalle de embarque se expande a empaques individuales: por ejemplo 36 pallets + 12 cajas = 48 renglones, que es exactamente lo que después se autoriza en la Fila 10 del contenedor.

## Regla central

> **TALLY SHEET = PRODUCTO TERMINADO = CALIDAD**
>
> La igualdad se exige por **ITEM ID + espesor**. No se permite compensar diferencias entre espesores.

## Archivos principales

| Archivo | Propósito |
|---|---|
| `index.html` | Shell de la PWA. |
| `styles.css` | Estilos corporativos. |
| `api.js` | Capa de acceso a datos (Netlify → Apps Script). Preparada para futura migración a Supabase. |
| `data.js` | Capa de datos local (respaldo offline). |
| `engine.js` | Motor de conciliación TALLY vs PT vs Calidad. |
| `tally.js` | Lector del TALLY SHEET (PDF y texto). |
| `ui.js` | Componentes de interfaz. |
| `app.js` | Lógica de navegación y pantallas. |
| `google-apps-script.gs` | Backend completo en Apps Script. |
| `netlify/functions/google-sheets.js` | Proxy de Netlify hacia Apps Script. |
| `GOOGLE-SHEETS-SETUP.md` | Instrucciones paso a paso para configurar Sheets, Apps Script y Drive. |

## Cómo ejecutar localmente

```powershell
python serve.py
```

Abrir <http://127.0.0.1:5178/index.html>.

## Configuración del backend

Ver `GOOGLE-SHEETS-SETUP.md` para:

1. Crear el Google Sheet.
2. Pegar `google-apps-script.gs` en Apps Script.
3. Ejecutar `seedUsuarios()`.
4. Publicar como aplicación web.
5. Configurar `GOOGLE_SHEETS_ENDPOINT` en Netlify.
6. Crear/verificar la carpeta raíz de Drive.

## Hojas de Google Sheets

1. `CONFIGURACION`
2. `USUARIOS`
3. `EMBARQUES`
4. `DOCUMENTOS`
5. `DETALLE_EMBARQUES`
6. `ESPESORES`
7. `PALLETS`
8. `CAJAS`
9. `ORDENES_PRODUCCION`
10. `LIBERACIONES`
11. `INSPECCIONES_CALIDAD`
12. `DOCUMENTOS_PDF`
13. `AUDITORIA`
14. `AUTORIZACIONES_JEFE`
15. `EMBARQUE_FISICO`

## Publicación en Netlify

1. `Add new site > Deploy manually` en Netlify.
2. Arrastra la carpeta del proyecto.
3. Configura la variable `GOOGLE_SHEETS_ENDPOINT`.
4. Redeploy.

## Preparación para Supabase

- `api.js` actúa como capa de abstracción: cambiar las funciones internas no afecta a `app.js`.
- Todos los objetos usan IDs estables generados por el backend (`emb_`, `lib_`, `ins_`, `pdf_`).
- La lógica de negocio vive en `google-apps-script.gs`, documentada para trasladarla a edge functions.

## Notas de seguridad

- Nunca expongas la URL de Apps Script directamente en el frontend.
- Usa siempre `/.netlify/functions/google-sheets`.
- Cambia las contraseñas seed inmediatamente.
- Revisa la hoja `AUDITORIA` periódicamente.
