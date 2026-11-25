const SHEET_NAME = 'Movimientos';
const SHIPPING_SHEET_NAME = 'Control de Embarques';

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'Conexion con Control de Pallets activa.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(event.postData.contents);
  const isShipping = data.action === 'EMBARQUE' || data.action === 'CORROBORACION';
  const sheet = spreadsheet.getSheetByName(isShipping ? SHIPPING_SHEET_NAME : SHEET_NAME) || spreadsheet.insertSheet(isShipping ? SHIPPING_SHEET_NAME : SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = isShipping ? [
      'Fecha y hora', 'Usuario', 'Rol', 'Accion', 'Estado', 'Item ID', 'Produccion / PO',
      'Paneles corroborados', 'Evidencias', 'Fecha de embarque'
    ] : [
      'Fecha y hora', 'Usuario', 'Rol', 'Accion', 'Estado', 'Item ID',
      'Produccion / PO', 'Tipo de pallet', 'Material', 'Especificacion',
      'Orden de compra', 'Lote', 'Cantidad por caja', 'Paneles por pallet', 'Pallets de', 'Observacion'
    ];
    sheet.appendRow(headers);
  }

  const row = isShipping ? [
    data.timestamp || new Date().toISOString(), data.user || '', data.role || '', data.action || '',
    data.status || '', data.code || '', data.productionOrder || '', data.quantityPanels || '',
    (data.evidence || []).map(file => file.name).join(', '), data.shippedAt || data.timestamp || ''
  ] : [
    data.timestamp || new Date().toISOString(),
    data.user || '',
    data.role || '',
    data.action || '',
    data.status || '',
    data.code || '',
    data.productionOrder || '',
    data.palletType || '',
    data.material || '',
    data.specification || '',
    data.purchaseOrder || '',
    data.lotNumber || '',
    data.quantitySheets || '',
    data.quantityPanels || '',
    data.palletsThickness || '',
    data.note || ''
  ];
  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
