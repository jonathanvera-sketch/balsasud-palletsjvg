# Conexion con Google Sheets

## 1. Crear la hoja

1. Crea una hoja nueva en Google Drive.
2. Abre `Extensiones > Apps Script`.
3. Borra el contenido inicial y pega el contenido de `google-apps-script.gs`.
4. Guarda el proyecto.

## 2. Publicar el receptor

1. Selecciona `Implementar > Nueva implementacion`.
2. Tipo: `Aplicacion web`.
3. Ejecutar como: `Yo`.
4. Acceso: `Cualquier persona`.
5. Publica y copia la URL de la aplicacion web.

## 3. Conectar la app en Netlify

En Netlify abre `Site configuration > Environment variables` y, si quieres mantener la configuracion editable desde Netlify, crea:

```text
GOOGLE_SHEETS_ENDPOINT = URL_DE_TU_APLICACION_WEB_DE_APPS_SCRIPT
```

La app ya utiliza la funcion de Netlify `/.netlify/functions/google-sheets`. El proyecto ya incluye la URL actual como respaldo en la funcion, por lo que no es obligatorio crear esta variable.

Despues de crear la variable, ejecuta un nuevo deploy en Netlify.

## 4. Publicar en Netlify

1. Entra a Netlify y selecciona `Add new site > Deploy manually`.
2. Arrastra la carpeta completa del proyecto, incluyendo `index.html`, `styles.css`, `app.js`, `netlify.toml` y la carpeta `netlify`.
3. Configura la variable `GOOGLE_SHEETS_ENDPOINT` como se indica arriba.
4. Ejecuta un nuevo deploy.

Tambien puedes conectar el repositorio de GitHub. Netlify detectara `netlify.toml` y publicara la carpeta raiz.

## Datos registrados

Cada movimiento crea una fila en la pestaña `Movimientos` con fecha, usuario, rol, accion, estado, Item ID, Produccion/PO, tipo de pallet, material, especificacion, orden de compra, lote, batch, cantidades y observacion.

Las acciones son `SALIDA` para Paneles, `RECEPCION` para Producto Terminado y `EMBARQUE` para Control de Embarques. Los embarques se guardan en la pestaña `Control de Embarques`.
