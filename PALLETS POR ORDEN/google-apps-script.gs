/* ============================================================
   BALSASUD · BACKEND DE TRAZABILIDAD DE EMBARQUES
   Google Apps Script + Google Sheets + Google Drive
   ============================================================ */

/* ---------------- CONFIGURACIÓN ---------------- */

const SHEETS_SCHEMA = {
  CONFIGURACION: ['key', 'value', 'updatedAt', 'updatedBy'],
  USUARIOS: ['userId', 'username', 'name', 'role', 'passwordHash', 'active', 'createdAt', 'updatedAt', 'lastLogin'],
  EMBARQUES: ['shipmentId', 'code', 'op', 'purchaseOrder', 'client', 'container', 'destination', 'dispatchDate', 'lot', 'seal', 'status', 'createdAt', 'createdBy', 'activatedAt', 'activatedBy', 'closedAt', 'closedBy', 'notes', 'driveFolderId'],
  DOCUMENTOS: ['docId', 'shipmentId', 'type', 'name', 'mimeType', 'driveFileId', 'driveUrl', 'uploadedAt', 'uploadedBy'],
  DETALLE_EMBARQUES: ['detailId', 'shipmentId', 'itemId', 'description', 'thickness', 'programmed', 'pallets', 'boxes', 'bf', 'm3', 'confirmed', 'createdAt'],
  ESPESORES: ['thicknessId', 'inches', 'mm', 'factor', 'label'],
  PALLETS: ['palletId', 'releaseId', 'shipmentId', 'itemId', 'thickness', 'packaging', 'palletType', 'packages', 'panels', 'netWeight', 'grossWeight', 'createdAt', 'createdBy'],
  CAJAS: ['boxId', 'releaseId', 'shipmentId', 'itemId', 'thickness', 'packages', 'panels', 'netWeight', 'grossWeight', 'createdAt', 'createdBy'],
  ORDENES_PRODUCCION: ['productionOrderId', 'op', 'client', 'status', 'createdAt'],
  LIBERACIONES: ['releaseId', 'shipmentId', 'productionOrderId', 'itemId', 'thickness', 'requestedPanels', 'releasedPanels', 'remainingPanels', 'status', 'createdAt', 'createdBy', 'releasedAt'],
  INSPECCIONES_CALIDAD: ['inspectionId', 'releaseId', 'shipmentId', 'itemId', 'thickness', 'inspectedPanels', 'approvedPanels', 'rejectedPanels', 'observations', 'status', 'controlSheet', 'productionResponsible', 'batchNumber', 'boxCount', 'woodType', 'hour', 'shift', 'inspectorName', 'signature', 'samples', 'createdAt', 'createdBy', 'finalizedAt', 'finalizedBy'],
  DOCUMENTOS_PDF: ['pdfId', 'inspectionId', 'shipmentId', 'releaseId', 'driveFileId', 'driveUrl', 'qrCode', 'createdAt', 'createdBy'],
  AUDITORIA: ['auditId', 'timestamp', 'userId', 'username', 'role', 'action', 'entity', 'entityId', 'details', 'ip'],
  AUTORIZACIONES_JEFE: ['autorizacionId', 'shipmentId', 'releaseId', 'itemId', 'thickness', 'paneles', 'estado', 'autorizadoPor', 'autorizadoAt', 'observaciones'],
  EMBARQUE_FISICO: ['fisicoId', 'shipmentId', 'fila', 'contenedor', 'releaseIds', 'estado', 'fotoFileId', 'fotoUrl', 'registradoPor', 'registradoAt', 'observaciones']
};

const ROLE_ACTIONS = {
  superadmin: ['auth.login','auth.logout','auth.me','users.list','users.create','users.update','users.delete','shipments.list','shipments.get','shipments.create','shipments.update','shipments.activate','shipments.close','shipments.finalizePT','shipments.finalizeQuality','documents.upload','releases.list','inspections.list','inspections.get','inspections.create','inspections.update','inspections.finalize','dashboard.kpi','audit.list','config.get','config.set','debug.info','debug.cleanupPresentation','jefe.list','jefe.autorizar','jefe.rechazar','jefe.embarcar','jefe.fila','jefe.actaFinal'],
  pt: ['auth.login','auth.logout','auth.me','shipments.list','shipments.get','shipments.finalizePT','releases.create','releases.list','pallets.create','boxes.create'],
  calidad: ['auth.login','auth.logout','auth.me','shipments.list','shipments.get','releases.list','inspections.create','inspections.update','inspections.finalize','inspections.get','inspections.list','shipments.finalizeQuality','documents_pdf.get'],
  jefe_embarque: ['auth.login','auth.logout','auth.me','shipments.list','shipments.get','releases.list','inspections.list','inspections.get','documents.upload','jefe.list','jefe.autorizar','jefe.rechazar','jefe.embarcar','jefe.fila','jefe.actaFinal','dashboard.kpi']
};

const SHIPMENT_STATUS = { borrador: 'borrador', activo: 'activo', cerrado: 'cerrado' };
const RELEASE_STATUS = { parcial: 'parcial', completa: 'completa', cancelada: 'cancelada' };
const INSPECTION_STATUS = { borrador: 'borrador', finalizada: 'finalizada' };

const ROOT_FOLDER_CONFIG_KEY = 'DRIVE_ROOT_FOLDER_ID';
const COMPANY_CONFIG_KEY = 'COMPANY_NAME';
const SESSION_TTL_MINUTES = 480;

/* ---------------- RESPUESTAS ---------------- */

function jsonResponse(payload, statusCode) {
  const code = statusCode || 200;
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok(data) { return jsonResponse({ ok: true, data: data || {} }); }
function fail(message, code) { return jsonResponse({ ok: false, error: message || 'Error del servidor' }, code || 400); }

/* ---------------- UTILIDADES ---------------- */

function nowIso() { return new Date().toISOString(); }

function uid(prefix) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + '_' + ts + rnd;
}

function hashPassword(username, password) {
  const raw = String(username).toLowerCase().trim() + '::' + password;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'fnv1:' + Math.abs(hash).toString(16);
}

function verifyPassword(username, password, hash) {
  return hashPassword(username, password) === hash;
}

function n(value) {
  const x = Number(value);
  return isNaN(x) ? 0 : x;
}

function cleanText(value) {
  return String(value || '').trim();
}

function require(obj, fields) {
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (obj[f] === undefined || obj[f] === null || cleanText(obj[f]) === '') {
      throw new Error('Campo requerido: ' + f);
    }
  }
}

function requireRole(sess, roles) {
  if (!sess) throw new Error('Sesión requerida.');
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (allowed.indexOf(sess.role) < 0) throw new Error('No tienes permiso para ejecutar esta acción.');
}

function getIp(event) {
  try {
    return (event && event.parameter && event.parameter['ip']) ? event.parameter['ip'] : '';
  } catch (e) { return ''; }
}

/* ---------------- SHEETS HELPERS ---------------- */

function getSpreadsheet() {
  const SPREADSHEET_ID = '1N5gt35myjugZS-4KADzqXoAnsFKS7J--70FJvJ5Riqs';
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (SHEETS_SCHEMA[name]) sheet.appendRow(SHEETS_SCHEMA[name]);
  } else if (sheet.getLastRow() === 0 && SHEETS_SCHEMA[name]) {
    sheet.appendRow(SHEETS_SCHEMA[name]);
  }
  return sheet;
}

function ensureSheets() {
  const names = Object.keys(SHEETS_SCHEMA);
  for (let i = 0; i < names.length; i++) getSheet(names[i]);
}

function headersOf(sheet) {
  if (sheet.getLastRow() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function colIndex(sheet, name) {
  const headers = headersOf(sheet);
  for (let i = 0; i < headers.length; i++) if (headers[i] === name) return i + 1;
  return -1;
}

function findRows(sheet, colName, value) {
  const idx = colIndex(sheet, colName);
  if (idx < 0) return [];
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  const values = sheet.getRange(2, idx, last - 1, 1).getValues();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) rows.push(i + 2);
  }
  return rows;
}

function findRow(sheet, colName, value) {
  const rows = findRows(sheet, colName, value);
  return rows.length ? rows[0] : -1;
}

function getRowData(sheet, row) {
  const headers = headersOf(sheet);
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const obj = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = values[i];
  return obj;
}

function getAllRows(sheet) {
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  const headers = headersOf(sheet);
  const values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = values[i][j];
    out.push(obj);
  }
  return out;
}

function appendRow(sheet, values) {
  sheet.appendRow(values);
  return sheet.getLastRow();
}

function updateRow(sheet, row, values) {
  if (values.length) sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

/* ---------------- AUTENTICACIÓN ---------------- */

function createSession(user) {
  const token = uid('sess');
  const expires = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('sess_' + token, JSON.stringify({ userId: user.userId, username: user.username, role: user.role, name: user.name, expires: expires.toISOString() }));
  return token;
}

function getSession(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sess_' + token);
  if (!raw) return null;
  const sess = JSON.parse(raw);
  if (new Date(sess.expires) < new Date()) {
    props.deleteProperty('sess_' + token);
    return null;
  }
  return sess;
}

function deleteSession(token) {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
}

function authenticate(event) {
  try {
    const data = JSON.parse(event.postData.contents);
    return { data: data, token: data.sessionToken || '' };
  } catch (e) {
    return { data: {}, token: '' };
  }
}

function requireAuth(token, action) {
  const sess = getSession(token);
  if (!sess) throw new Error('Sesión inválida o expirada. Inicia sesión nuevamente.');
  const allowed = ROLE_ACTIONS[sess.role] || [];
  if (allowed.indexOf(action) === -1) throw new Error('No tienes permiso para ejecutar ' + action);
  return sess;
}

function getUserByUsername(username) {
  const sheet = getSheet('USUARIOS');
  const row = findRow(sheet, 'username', String(username).toLowerCase().trim());
  if (row < 0) return null;
  return getRowData(sheet, row);
}

function getUserById(userId) {
  const sheet = getSheet('USUARIOS');
  const row = findRow(sheet, 'userId', userId);
  if (row < 0) return null;
  return getRowData(sheet, row);
}

/* ---------------- AUDITORÍA ---------------- */

function audit(sess, action, entity, entityId, details, event) {
  try {
    const sheet = getSheet('AUDITORIA');
    const row = [
      uid('audit'),
      nowIso(),
      sess ? sess.userId : '',
      sess ? sess.username : '',
      sess ? sess.role : '',
      action,
      entity,
      entityId || '',
      JSON.stringify(details || {}),
      getIp(event)
    ];
    appendRow(sheet, row);
  } catch (e) {
    console.error('Error de auditoría', e);
  }
}

/* ---------------- CONFIGURACIÓN ---------------- */

function getConfig(key) {
  const sheet = getSheet('CONFIGURACION');
  const row = findRow(sheet, 'key', key);
  if (row < 0) return '';
  return String(getRowData(sheet, row).value || '');
}

function setConfig(key, value, sess) {
  const sheet = getSheet('CONFIGURACION');
  const row = findRow(sheet, 'key', key);
  const values = [key, value, nowIso(), sess ? sess.username : ''];
  if (row < 0) appendRow(sheet, values);
  else updateRow(sheet, row, values);
}

function ensureRootFolder() {
  let id = getConfig(ROOT_FOLDER_CONFIG_KEY);
  if (id) {
    try {
      DriveApp.getFolderById(id);
      return id;
    } catch (e) { id = ''; }
  }
  const folder = DriveApp.createFolder('TRAZABILIDAD BALSASUD');
  setConfig(ROOT_FOLDER_CONFIG_KEY, folder.getId(), null);
  return folder.getId();
}

/* ---------------- DRIVE HELPERS ---------------- */

function getOrCreateSubFolder(parentId, name) {
  const pid = (typeof parentId === 'string') ? parentId : (parentId.getId ? parentId.getId() : String(parentId));
  const parent = DriveApp.getFolderById(pid);
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getShipmentFolder(shipmentCode, year, month) {
  const root = ensureRootFolder();
  const y = getOrCreateSubFolder(root, String(year));
  const m = getOrCreateSubFolder(y.getId(), String(month).toUpperCase());
  return getOrCreateSubFolder(m.getId(), 'EMBARQUE_' + shipmentCode);
}

function saveBase64ToDrive(folderId, name, base64, mimeType) {
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, name);
  const file = folder.createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

/* ---------------- PDF / QR ---------------- */

function generateQrUrl(text) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text);
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return day + '/' + month + '/' + year + ' – ' + hours + ':' + minutes;
}

function styledParagraph(cell, text, options) {
  options = options || {};
  const p = cell.appendParagraph(String(text));
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const t = p.getChild(0).asText();
  if (options.bold) t.setBold(true);
  if (options.size) t.setFontSize(options.size);
  if (options.color) t.setForegroundColor(options.color);
  return p;
}

function addSignatureCell(cell, role, name, dateIso, validated) {
  cell.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(10).setPaddingRight(10);
  if (validated && name) {
    cell.setBackgroundColor('#16a34a');
    styledParagraph(cell, role.toUpperCase(), { bold: true, size: 8, color: '#ffffff' });
    styledParagraph(cell, name, { bold: true, size: 12, color: '#ffffff' });
    const stamp = cell.appendParagraph('✓ FIRMA DIGITAL VALIDADA');
    stamp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const st = stamp.getChild(0).asText();
    st.setBold(true).setFontSize(10).setForegroundColor('#ffffff');
    styledParagraph(cell, formatDateTime(dateIso), { size: 8, color: '#ffffff' });
  } else {
    cell.setBackgroundColor('#f9fafb');
    styledParagraph(cell, role.toUpperCase(), { bold: true, size: 8, color: '#6b7280' });
    styledParagraph(cell, name || '___________________________', { size: 11, color: '#111827' });
    const pending = cell.appendParagraph('Pendiente de firma');
    pending.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const pt = pending.getChild(0).asText();
    pt.setFontSize(8).setForegroundColor('#9ca3af').setItalic(true);
  }
}

function addQrBlock(body, qrUrl, label) {
  body.appendParagraph(' ');
  const wrap = body.appendTable();
  const row = wrap.appendTableRow();
  const cell = row.appendTableCell('');
  cell.setPaddingTop(12).setPaddingBottom(12);
  cell.setBackgroundColor('#ffffff');
  try {
    const resp = UrlFetchApp.fetch(qrUrl);
    const blob = resp.getBlob().setName('qr.png');
    const p = cell.appendParagraph('');
    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const img = p.appendInlineImage(blob);
    img.setHeight(120).setWidth(120);
  } catch (e) {
    styledParagraph(cell, '[QR no disponible]', { size: 9, color: '#9ca3af' });
  }
  if (label) {
    const lp = cell.appendParagraph(String(label));
    lp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const lt = lp.getChild(0).asText();
    lt.setFontSize(8).setForegroundColor('#6b7280').setItalic(true);
  }
  wrap.setBorderWidth(0);
  body.appendParagraph(' ');
}

function getSignerInfoFromDocs(shipmentId, actionSubstr) {
  // Busca en DOCUMENTOS_PDF el PDF final del área por su QR
  const pdfs = getAllRows(getSheet('DOCUMENTOS_PDF')).filter(function(r) {
    return r.shipmentId === shipmentId && String(r.qrCode || '').indexOf(actionSubstr.replace(/\//g, '')) >= 0;
  });
  if (pdfs.length) {
    const last = pdfs[pdfs.length - 1];
    const user = getUserByUsername(last.createdBy);
    return { name: user ? user.name : last.createdBy, date: last.createdAt };
  }
  return { name: '', date: '' };
}

function generateInspectionPdf(sess, shipment, releaseRow, inspection) {
  const folderId = shipment.driveFolderId;
  const doc = DocumentApp.create('FOR-QC-08_Liberacion_Paneles_' + shipment.code + '_' + nowIso().slice(0, 10));
  const body = doc.getBody();
  const company = getConfig(COMPANY_CONFIG_KEY) || 'BALSASUD S.A.';
  const sheet = JSON.parse(inspection.controlSheet || '{}');
  const samples = JSON.parse(inspection.samples || '[]');

  body.appendParagraph(company).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('LIBERACIÓN DE PANELES').setHeading(DocumentApp.ParagraphHeading.HEADING2).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Código: FOR-QC-08 | Versión: 02 | Fecha: 04/02/2020').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(' ');

  const info = body.appendTable();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('ORDEN DE PRODUCCIÓN'); r.appendTableCell(shipment.op); r.appendTableCell('NÚMERO BATCH'); r.appendTableCell(sheet.batchNumber || ''); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('NÚMERO DE LOTE'); r.appendTableCell(shipment.lot); r.appendTableCell('CANTIDAD DE CAJAS'); r.appendTableCell(sheet.boxCount || ''); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('RESPONSABLE PRODUCCIÓN'); r.appendTableCell(sheet.productionResponsible || (releaseRow ? releaseRow.createdBy : '')); r.appendTableCell('TIPO DE MADERA'); r.appendTableCell(sheet.woodType || 'FSC 100%'); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('FECHA'); r.appendTableCell(nowIso().slice(0, 10)); r.appendTableCell('HORA'); r.appendTableCell(sheet.hour || ''); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('TURNO'); r.appendTableCell(sheet.shift || ''); r.appendTableCell('CLIENTE'); r.appendTableCell(shipment.client); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('ORDEN COMPRA'); r.appendTableCell(shipment.purchaseOrder); r.appendTableCell('DESTINO'); r.appendTableCell(shipment.destination); })();

  body.appendParagraph(' ');
  body.appendParagraph('MUESTREOS DE VERIFICACIÓN DE CALIDAD').setHeading(DocumentApp.ParagraphHeading.HEADING3);

  const table = body.appendTable();
  const headerRow = table.appendTableRow();
  ['N° Muestra', 'Etiqueta', 'Item ID', 'Tipo Material', 'Emb. plástico', 'Disecantes', 'Cajas', 'Pallet', 'Pallets Cert.', 'Altura pallets', 'Muestreo QC', 'Observaciones', 'Responsable'].forEach(function(h) {
    headerRow.appendTableCell(h);
  });

  samples.forEach(function(s) {
    const r = table.appendTableRow();
    r.appendTableCell(String(s.sampleNo || ''));
    r.appendTableCell(String(s.label || ''));
    r.appendTableCell(String(s.itemId || ''));
    r.appendTableCell(String(s.materialType || ''));
    r.appendTableCell(String(s.plasticWrapped || ''));
    r.appendTableCell(String(s.desiccants || ''));
    r.appendTableCell(String(s.boxes || ''));
    r.appendTableCell(String(s.pallet || ''));
    r.appendTableCell(String(s.certifiedPallets || ''));
    r.appendTableCell(String(s.palletHeight || ''));
    r.appendTableCell(String(s.qualitySamplingCheck || ''));
    r.appendTableCell(String(s.observations || ''));
    r.appendTableCell(String(s.responsible || ''));
  });

  body.appendParagraph(' ');
  const summary = body.appendTable();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('ITEM ID'); r.appendTableCell(inspection.itemId); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Espesor (mm)'); r.appendTableCell(String(inspection.thickness)); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Cantidad autorizada'); r.appendTableCell(String(releaseRow ? releaseRow.requestedPanels : '')); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Cantidad liberada'); r.appendTableCell(String(releaseRow ? releaseRow.releasedPanels : '')); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Cantidad inspeccionada'); r.appendTableCell(String(inspection.inspectedPanels)); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Cantidad aprobada'); r.appendTableCell(String(inspection.approvedPanels)); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Cantidad rechazada'); r.appendTableCell(String(inspection.rejectedPanels)); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Observaciones generales'); r.appendTableCell(inspection.observations || ''); })();
  (function(){ var r=summary.appendTableRow(); r.appendTableCell('Inspector de Calidad'); r.appendTableCell(sheet.inspectorName || sess.name); })();

  body.appendParagraph(' ');
  body.appendParagraph('FIRMAS DIGITALES').setHeading(DocumentApp.ParagraphHeading.HEADING3).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const inspSigTable = body.appendTable();
  const inspSigRow = inspSigTable.appendTableRow();
  const productionName = sheet.productionResponsible || (releaseRow ? releaseRow.createdBy : '');
  addSignatureCell(inspSigRow.appendTableCell(''), 'Responsable de Producción', productionName, inspection.finalizedAt || inspection.createdAt, true);
  addSignatureCell(inspSigRow.appendTableCell(''), 'Inspector de Calidad', sheet.inspectorName || sess.name, inspection.finalizedAt || inspection.createdAt, true);
  inspSigTable.setBorderWidth(0);
  const qrUrl = generateQrUrl('https://balsasud.app/inspection/' + inspection.inspectionId);
  addQrBlock(body, qrUrl, 'Escanea para verificar autenticidad');

  doc.saveAndClose();
  const pdf = doc.getAs('application/pdf');
  pdf.setName('FOR-QC-08_Liberacion_Paneles_' + shipment.code + '_' + inspection.itemId + '_' + nowIso().slice(0, 10) + '.pdf');

  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(pdf);
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    return { fileId: file.getId(), url: file.getUrl(), qrUrl: qrUrl };
  }
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return { fileId: doc.getId(), url: doc.getUrl(), qrUrl: qrUrl };
}

/* ---------------- HANDLERS ---------------- */

function handleLogin(payload, sess, event) {
  require(payload, ['username', 'password']);
  const user = getUserByUsername(payload.username);
  if (!user) throw new Error('Usuario o contraseña incorrectos.');
  if (String(user.active) !== 'true') throw new Error('Usuario inactivo.');
  if (!verifyPassword(payload.username, payload.password, user.passwordHash)) throw new Error('Usuario o contraseña incorrectos.');
  const token = createSession(user);
  const sheet = getSheet('USUARIOS');
  const row = findRow(sheet, 'userId', user.userId);
  if (row > 0) {
    const headers = headersOf(sheet);
    const values = headers.map(h => h === 'lastLogin' ? nowIso() : user[h]);
    updateRow(sheet, row, values);
  }
  audit(null, 'auth.login', 'USUARIOS', user.userId, { username: user.username }, event);
  return { token: token, user: { userId: user.userId, username: user.username, name: user.name, role: user.role } };
}

function handleLogout(payload, sess, event) {
  if (payload.token) deleteSession(payload.token);
  if (sess) audit(sess, 'auth.logout', 'USUARIOS', sess.userId, {}, event);
  return { ok: true };
}

function handleMe(payload, sess) {
  return { userId: sess.userId, username: sess.username, name: sess.name, role: sess.role };
}

function handleUsersList(payload, sess) {
  const rows = getAllRows(getSheet('USUARIOS'));
  return rows.map(u => ({ userId: u.userId, username: u.username, name: u.name, role: u.role, active: u.active, lastLogin: u.lastLogin }));
}

function handleUserCreate(payload, sess, event) {
  require(payload, ['username', 'name', 'role', 'password']);
  if (!ROLE_ACTIONS[payload.role]) throw new Error('Rol inválido.');
  const existing = getUserByUsername(payload.username);
  if (existing) throw new Error('El usuario ya existe.');
  const user = {
    userId: uid('usr'),
    username: String(payload.username).toLowerCase().trim(),
    name: payload.name,
    role: payload.role,
    passwordHash: hashPassword(payload.username, payload.password),
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastLogin: ''
  };
  const sheet = getSheet('USUARIOS');
  appendRow(sheet, SHEETS_SCHEMA.USUARIOS.map(k => user[k]));
  audit(sess, 'users.create', 'USUARIOS', user.userId, { username: user.username, role: user.role }, event);
  return { userId: user.userId, username: user.username, name: user.name, role: user.role };
}

function handleUserUpdate(payload, sess, event) {
  require(payload, ['userId']);
  const sheet = getSheet('USUARIOS');
  const row = findRow(sheet, 'userId', payload.userId);
  if (row < 0) throw new Error('Usuario no encontrado.');
  const current = getRowData(sheet, row);
  const updated = Object.assign({}, current);
  if (payload.name) updated.name = payload.name;
  if (payload.role && ROLE_ACTIONS[payload.role]) updated.role = payload.role;
  if (payload.active !== undefined) updated.active = payload.active ? 'true' : 'false';
  if (payload.password) updated.passwordHash = hashPassword(current.username, payload.password);
  updated.updatedAt = nowIso();
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => updated[h]));
  audit(sess, 'users.update', 'USUARIOS', updated.userId, { username: updated.username }, event);
  return { userId: updated.userId };
}

function handleUserDelete(payload, sess, event) {
  require(payload, ['userId']);
  const sheet = getSheet('USUARIOS');
  const row = findRow(sheet, 'userId', payload.userId);
  if (row < 0) throw new Error('Usuario no encontrado.');
  const user = getRowData(sheet, row);
  sheet.deleteRow(row);
  audit(sess, 'users.delete', 'USUARIOS', user.userId, { username: user.username }, event);
  return { ok: true };
}

function handleShipmentsList(payload, sess) {
  const rows = getAllRows(getSheet('EMBARQUES'));
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function handleShipmentsGet(payload, sess) {
  require(payload, ['shipmentId']);
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', payload.shipmentId);
  if (row < 0) throw new Error('Embarque no encontrado.');
  const shipment = getRowData(sheet, row);
  shipment.details = getAllRows(getSheet('DETALLE_EMBARQUES')).filter(d => d.shipmentId === shipment.shipmentId);
  shipment.documents = getAllRows(getSheet('DOCUMENTOS')).filter(d => d.shipmentId === shipment.shipmentId);
  return shipment;
}

function handleShipmentsCreate(payload, sess, event) {
  require(payload, ['op', 'client', 'dispatchDate']);
  const code = payload.code || payload.op;
  const sheet = getSheet('EMBARQUES');
  if (findRow(sheet, 'op', payload.op) > 0) throw new Error('Ya existe un embarque para la OP ' + payload.op);

  const d = new Date(payload.dispatchDate);
  const year = d.getFullYear();
  const monthNames = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const folder = getShipmentFolder(code, year, monthNames[d.getMonth()]);

  const shipment = {
    shipmentId: uid('emb'),
    code: code,
    op: payload.op,
    purchaseOrder: payload.purchaseOrder || '',
    client: payload.client,
    container: payload.container || '',
    destination: payload.destination || '',
    dispatchDate: payload.dispatchDate,
    lot: payload.lot || '',
    seal: payload.seal || '',
    status: SHIPMENT_STATUS.borrador,
    createdAt: nowIso(),
    createdBy: sess.username,
    activatedAt: '',
    activatedBy: '',
    closedAt: '',
    closedBy: '',
    notes: payload.notes || '',
    driveFolderId: folder.getId()
  };
  appendRow(sheet, SHEETS_SCHEMA.EMBARQUES.map(k => shipment[k]));

  if (payload.details && payload.details.length) {
    const detSheet = getSheet('DETALLE_EMBARQUES');
    payload.details.forEach(function(d) {
      const detail = {
        detailId: uid('det'),
        shipmentId: shipment.shipmentId,
        itemId: d.itemId || '',
        description: d.description || '',
        thickness: n(d.thickness),
        programmed: n(d.programmed),
        pallets: n(d.pallets),
        boxes: n(d.boxes),
        bf: n(d.bf),
        m3: n(d.m3),
        confirmed: 'false',
        createdAt: nowIso()
      };
      appendRow(detSheet, SHEETS_SCHEMA.DETALLE_EMBARQUES.map(k => detail[k]));
    });
  }

  audit(sess, 'shipments.create', 'EMBARQUES', shipment.shipmentId, { op: shipment.op }, event);
  return shipment;
}

function handleShipmentsUpdate(payload, sess, event) {
  require(payload, ['shipmentId']);
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', payload.shipmentId);
  if (row < 0) throw new Error('Embarque no encontrado.');
  const current = getRowData(sheet, row);
  if (current.status === SHIPMENT_STATUS.cerrado) throw new Error('No se puede editar un embarque cerrado.');

  const updatable = ['purchaseOrder','client','container','destination','dispatchDate','lot','seal','notes'];
  updatable.forEach(function(f) {
    if (payload[f] !== undefined) current[f] = payload[f];
  });
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => current[h]));

  if (payload.details && payload.details.length) {
    const detSheet = getSheet('DETALLE_EMBARQUES');
    const existingRows = findRows(detSheet, 'shipmentId', payload.shipmentId);
    for (let i = existingRows.length - 1; i >= 0; i--) detSheet.deleteRow(existingRows[i]);
    payload.details.forEach(function(d) {
      const detail = {
        detailId: uid('det'),
        shipmentId: current.shipmentId,
        itemId: d.itemId || '',
        description: d.description || '',
        thickness: n(d.thickness),
        programmed: n(d.programmed),
        pallets: n(d.pallets),
        boxes: n(d.boxes),
        bf: n(d.bf),
        m3: n(d.m3),
        confirmed: 'false',
        createdAt: nowIso()
      };
      appendRow(detSheet, SHEETS_SCHEMA.DETALLE_EMBARQUES.map(k => detail[k]));
    });
  }

  audit(sess, 'shipments.update', 'EMBARQUES', current.shipmentId, { op: current.op }, event);
  return handleShipmentsGet({ shipmentId: current.shipmentId }, sess);
}

function handleShipmentsActivate(payload, sess, event) {
  require(payload, ['shipmentId']);
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', payload.shipmentId);
  if (row < 0) throw new Error('Embarque no encontrado.');
  const current = getRowData(sheet, row);
  if (current.status !== SHIPMENT_STATUS.borrador) throw new Error('Solo se puede activar un embarque en borrador.');

  const detSheet = getSheet('DETALLE_EMBARQUES');
  const details = getAllRows(detSheet).filter(d => d.shipmentId === current.shipmentId);
  if (!details.length) throw new Error('El embarque no tiene detalle de productos.');

  current.status = SHIPMENT_STATUS.activo;
  current.activatedAt = nowIso();
  current.activatedBy = sess.username;
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => current[h]));

  details.forEach(function(d) {
    const r = findRow(detSheet, 'detailId', d.detailId);
    if (r > 0) {
      d.confirmed = 'true';
      const h = headersOf(detSheet);
      updateRow(detSheet, r, h.map(key => d[key]));
    }
  });

  audit(sess, 'shipments.activate', 'EMBARQUES', current.shipmentId, { op: current.op }, event);
  return current;
}

function handleShipmentsClose(payload, sess, event) {
  require(payload, ['shipmentId']);
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', payload.shipmentId);
  if (row < 0) throw new Error('Embarque no encontrado.');
  const current = getRowData(sheet, row);
  current.status = SHIPMENT_STATUS.cerrado;
  current.closedAt = nowIso();
  current.closedBy = sess.username;
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => current[h]));
  audit(sess, 'shipments.close', 'EMBARQUES', current.shipmentId, { op: current.op }, event);
  return current;
}

function generatePTFinalPdf(sess, shipment, releases) {
  const folderId = shipment.driveFolderId;
  const doc = DocumentApp.create('ACTA_PT_' + shipment.code + '_' + nowIso().slice(0,10));
  const body = doc.getBody();
  const company = getConfig(COMPANY_CONFIG_KEY) || 'BALSASUD S.A.';
  body.appendParagraph(company).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('ACTA DE ENTREGA - PRODUCTO TERMINADO').setHeading(DocumentApp.ParagraphHeading.HEADING2).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Código: FOR-PT-01 | Fecha: ' + nowIso().slice(0,10)).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(' ');
  const info = body.appendTable();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('ORDEN PRODUCCIÓN'); r.appendTableCell(String(shipment.op)); r.appendTableCell('CLIENTE'); r.appendTableCell(String(shipment.client)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('LOTE'); r.appendTableCell(String(shipment.lot)); r.appendTableCell('DESTINO'); r.appendTableCell(String(shipment.destination)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('FECHA DESPACHO'); r.appendTableCell(String(shipment.dispatchDate)); r.appendTableCell('RESPONSABLE PT'); r.appendTableCell(String(sess.name)); })();
  body.appendParagraph(' ');
  body.appendParagraph('DETALLE DE PALLETS LIBERADOS').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const table = body.appendTable();
  const header = table.appendTableRow();
  ['#','ITEM ID','Espesor (mm)','Paneles','Tipo','Estado'].forEach(function(h){ header.appendTableCell(h); });
  releases.forEach(function(rel, idx){
    var r=table.appendTableRow();
    r.appendTableCell(String(idx+1));
    r.appendTableCell(String(rel.itemId));
    r.appendTableCell(String(rel.thickness));
    r.appendTableCell(String(rel.releasedPanels));
    r.appendTableCell(String(rel.status));
    r.appendTableCell('Liberado');
  });
  body.appendParagraph(' ');
  body.appendParagraph('Total liberado: ' + releases.reduce(function(s,r){return s+n(r.releasedPanels);},0) + ' paneles en ' + releases.length + ' pallets/cajas').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(' ');
  body.appendParagraph('FIRMA DIGITAL').setHeading(DocumentApp.ParagraphHeading.HEADING3).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const sigWrap = body.appendTable();
  const sigRow = sigWrap.appendTableRow();
  const sigCell = sigRow.appendTableCell('');
  addSignatureCell(sigCell, 'Producto Terminado', sess.name, nowIso(), true);
  sigWrap.setBorderWidth(0);
  const qrUrl = generateQrUrl('https://balsasud.app/shipment/' + shipment.shipmentId + '/pt-final');
  addQrBlock(body, qrUrl, 'Escanea para verificar autenticidad');
  doc.saveAndClose();
  const pdf = doc.getAs('application/pdf');
  pdf.setName('ACTA_PT_' + shipment.code + '_' + nowIso().slice(0,10) + '.pdf');
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const sub = getOrCreateSubFolder(folder.getId(), 'ENTREGA_PT');
    const file = sub.createFile(pdf);
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    return { fileId: file.getId(), url: file.getUrl(), qrUrl: qrUrl };
  }
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return { fileId: doc.getId(), url: doc.getUrl(), qrUrl: qrUrl };
}

function generateQualityFinalPdf(sess, shipment, releases, inspections) {
  const folderId = shipment.driveFolderId;
  const doc = DocumentApp.create('LIBERACION_FINAL_QC_' + shipment.code + '_' + nowIso().slice(0,10));
  const body = doc.getBody();
  const company = getConfig(COMPANY_CONFIG_KEY) || 'BALSASUD S.A.';
  body.appendParagraph(company).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('LIBERACIÓN FINAL - CONTROL DE CALIDAD').setHeading(DocumentApp.ParagraphHeading.HEADING2).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Código: FOR-QC-FINAL | Fecha: ' + nowIso().slice(0,10) + ' | FOR-QC-08 consolidado').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(' ');
  const info = body.appendTable();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('ORDEN PRODUCCIÓN'); r.appendTableCell(String(shipment.op)); r.appendTableCell('CLIENTE'); r.appendTableCell(String(shipment.client)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('LOTE'); r.appendTableCell(String(shipment.lot)); r.appendTableCell('DESTINO'); r.appendTableCell(String(shipment.destination)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('TOTAL LIBERADO'); r.appendTableCell(String(releases.reduce(function(s,r){return s+n(r.releasedPanels);},0))); r.appendTableCell('TOTAL APROBADO'); r.appendTableCell(String(inspections.reduce(function(s,i){return s+n(i.approvedPanels);},0))); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('RECHAZADO'); r.appendTableCell(String(inspections.reduce(function(s,i){return s+n(i.rejectedPanels);},0))); r.appendTableCell('INSPECTOR'); r.appendTableCell(sess.name); })();
  body.appendParagraph(' ');
  body.appendParagraph('DETALLE CONSOLIDADO POR PALLET').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const table = body.appendTable();
  const header = table.appendTableRow();
  ['#','ITEM ID','Espesor','Liberado','Inspeccionado','Aprobado','Rechazado','Estado'].forEach(function(h){ header.appendTableCell(h); });
  releases.forEach(function(rel, idx){
    var insp = inspections.find(function(i){ return i.releaseId===rel.releaseId; }) || {};
    var r=table.appendTableRow();
    r.appendTableCell(String(idx+1));
    r.appendTableCell(String(rel.itemId));
    r.appendTableCell(String(rel.thickness));
    r.appendTableCell(String(rel.releasedPanels));
    r.appendTableCell(String(insp.inspectedPanels||''));
    r.appendTableCell(String(insp.approvedPanels||''));
    r.appendTableCell(String(insp.rejectedPanels||''));
    r.appendTableCell(String(insp.status||''));
  });
  body.appendParagraph(' ');
  body.appendParagraph('FIRMAS DIGITALES').setHeading(DocumentApp.ParagraphHeading.HEADING3).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const ptInfo = getSignerInfoFromDocs(shipment.shipmentId, 'pt-final');
  const sigTable = body.appendTable();
  const sigRow = sigTable.appendTableRow();
  addSignatureCell(sigRow.appendTableCell(''), 'Producto Terminado', ptInfo.name || 'Producto Terminado', ptInfo.date, true);
  addSignatureCell(sigRow.appendTableCell(''), 'Control de Calidad', sess.name, nowIso(), true);
  addSignatureCell(sigRow.appendTableCell(''), 'Gerencia de Operaciones', '', '', false);
  sigTable.setBorderWidth(0);
  const qrUrl = generateQrUrl('https://balsasud.app/shipment/' + shipment.shipmentId + '/qc-final');
  addQrBlock(body, qrUrl, 'Escanea para verificar autenticidad');
  doc.saveAndClose();
  const pdf = doc.getAs('application/pdf');
  pdf.setName('LIBERACION_FINAL_QC_' + shipment.code + '_' + nowIso().slice(0,10) + '.pdf');
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const sub = getOrCreateSubFolder(folder.getId(), 'CONTROL_CALIDAD');
    const file = sub.createFile(pdf);
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    return { fileId: file.getId(), url: file.getUrl(), qrUrl: qrUrl };
  }
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return { fileId: doc.getId(), url: doc.getUrl(), qrUrl: qrUrl };
}

function handleShipmentsFinalizePT(payload, sess, event) {
  require(payload, ['shipmentId']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const releases = getAllRows(getSheet('LIBERACIONES')).filter(function(r){ return r.shipmentId===shipment.shipmentId && r.status!=='cancelada'; });
  if (!releases.length) throw new Error('No hay pallets liberados para finalizar.');
  const details = getAllRows(getSheet('DETALLE_EMBARQUES')).filter(function(d){ return d.shipmentId===shipment.shipmentId; });
  // valida que todo lo programado esté liberado (permite liberar todo)
  for (let i=0; i<details.length; i++) {
    const d = details[i];
    const sum = releases.filter(function(r){ return String(r.itemId).toUpperCase()===String(d.itemId).toUpperCase() && n(r.thickness)===n(d.thickness); }).reduce(function(s,r){return s+n(r.releasedPanels);},0);
    if (sum !== n(d.programmed)) throw new Error('Aún no se ha liberado todo lo programado para ITEM ' + d.itemId + ' espesor ' + d.thickness + ' (' + sum + '/' + d.programmed + ').');
  }
  const pdf = generatePTFinalPdf(sess, shipment, releases);
  const rec = { pdfId: uid('pdf'), inspectionId: '', shipmentId: shipment.shipmentId, releaseId: '', driveFileId: pdf.fileId, driveUrl: pdf.url, qrCode: pdf.qrUrl, createdAt: nowIso(), createdBy: sess.username };
  appendRow(getSheet('DOCUMENTOS_PDF'), SHEETS_SCHEMA.DOCUMENTOS_PDF.map(function(k){ return rec[k]; }));
  audit(sess, 'shipments.finalizePT', 'EMBARQUES', shipment.shipmentId, { pdfId: rec.pdfId, driveUrl: pdf.url }, event);
  return { shipment: shipment, pdf: rec };
}

function handleShipmentsFinalizeQuality(payload, sess, event) {
  require(payload, ['shipmentId']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const releases = getAllRows(getSheet('LIBERACIONES')).filter(function(r){ return r.shipmentId===shipment.shipmentId && r.status!=='cancelada'; });
  const inspections = getAllRows(getSheet('INSPECCIONES_CALIDAD')).filter(function(i){ return i.shipmentId===shipment.shipmentId; });
  if (!releases.length) throw new Error('No hay liberaciones para finalizar.');
  if (inspections.length !== releases.length) throw new Error('Faltan inspecciones: ' + inspections.length + '/' + releases.length + ' pallets inspeccionados.');
  for (let i=0; i<inspections.length; i++) if (inspections[i].status !== 'finalizada') throw new Error('Hay inspecciones no finalizadas.');
  const totalAprob = inspections.reduce(function(s,i){return s+n(i.approvedPanels);},0);
  const totalReleases = releases.reduce(function(s,r){return s+n(r.releasedPanels);},0);
  if (totalAprob !== totalReleases) throw new Error('No todo lo liberado está aprobado (' + totalAprob + '/' + totalReleases + ').');
  const pdf = generateQualityFinalPdf(sess, shipment, releases, inspections);
  const rec = { pdfId: uid('pdf'), inspectionId: '', shipmentId: shipment.shipmentId, releaseId: '', driveFileId: pdf.fileId, driveUrl: pdf.url, qrCode: pdf.qrUrl, createdAt: nowIso(), createdBy: sess.username };
  appendRow(getSheet('DOCUMENTOS_PDF'), SHEETS_SCHEMA.DOCUMENTOS_PDF.map(function(k){ return rec[k]; }));
  // cierra embarque
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', shipment.shipmentId);
  const current = getRowData(sheet, row);
  current.status = SHIPMENT_STATUS.cerrado;
  current.closedAt = nowIso();
  current.closedBy = sess.username;
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(function(h){ return current[h]; }));
  audit(sess, 'shipments.finalizeQuality', 'EMBARQUES', shipment.shipmentId, { pdfId: rec.pdfId, driveUrl: pdf.url }, event);
  return { shipment: current, pdf: rec };
}

function handleDocumentsUpload(payload, sess, event) {
  require(payload, ['shipmentId', 'type', 'name', 'base64', 'mimeType']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const folderId = shipment.driveFolderId;
  const saved = saveBase64ToDrive(folderId, payload.name, payload.base64, payload.mimeType);
  const doc = {
    docId: uid('doc'),
    shipmentId: payload.shipmentId,
    type: payload.type,
    name: payload.name,
    mimeType: payload.mimeType,
    driveFileId: saved.id,
    driveUrl: saved.url,
    uploadedAt: nowIso(),
    uploadedBy: sess.username
  };
  appendRow(getSheet('DOCUMENTOS'), SHEETS_SCHEMA.DOCUMENTOS.map(k => doc[k]));
  audit(sess, 'documents.upload', 'DOCUMENTOS', doc.docId, { type: doc.type, shipmentId: shipment.shipmentId }, event);
  return doc;
}

function handleReleasesList(payload, sess) {
  const shipmentId = payload.shipmentId || '';
  const rows = getAllRows(getSheet('LIBERACIONES'));
  const pallets = getAllRows(getSheet('PALLETS'));
  const boxes = getAllRows(getSheet('CAJAS'));
  const out = rows.map(function(r) {
    const hasPallets = pallets.some(function(p) { return p.releaseId === r.releaseId; });
    const hasBoxes = boxes.some(function(b) { return b.releaseId === r.releaseId; });
    let packaging = 'pallet';
    if (hasBoxes && !hasPallets) packaging = 'caja';
    else if (hasBoxes && hasPallets) packaging = 'mixto';
    return Object.assign({}, r, { packaging: packaging });
  });
  return shipmentId ? out.filter(r => r.shipmentId === shipmentId) : out;
}

function handleReleasesCreate(payload, sess, event) {
  require(payload, ['shipmentId', 'itemId', 'thickness', 'releasedPanels']);
  const qty = n(payload.releasedPanels);
  if (qty <= 0) throw new Error('La cantidad liberada debe ser mayor a cero.');

  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  if (shipment.status !== SHIPMENT_STATUS.activo) throw new Error('El embarque no está activo.');

  const details = getAllRows(getSheet('DETALLE_EMBARQUES')).filter(d => d.shipmentId === shipment.shipmentId);
  const match = details.find(d => String(d.itemId).toUpperCase().trim() === String(payload.itemId).toUpperCase().trim() && n(d.thickness) === n(payload.thickness));
  if (!match) throw new Error('ITEM ID y espesor no coinciden con el TALLY autorizado.');

  const allReleases = getAllRows(getSheet('LIBERACIONES')).filter(r => r.shipmentId === shipment.shipmentId && String(r.itemId).toUpperCase().trim() === String(payload.itemId).toUpperCase().trim() && n(r.thickness) === n(payload.thickness) && r.status !== RELEASE_STATUS.cancelada);
  const totalReleased = allReleases.reduce(function(sum, r) { return sum + n(r.releasedPanels); }, 0);
  if (totalReleased + qty > n(match.programmed)) throw new Error('La liberación excede la cantidad autorizada (' + match.programmed + '). Saldo disponible: ' + (n(match.programmed) - totalReleased));

  const release = {
    releaseId: uid('lib'),
    shipmentId: shipment.shipmentId,
    productionOrderId: payload.productionOrderId || shipment.op,
    itemId: payload.itemId,
    thickness: n(payload.thickness),
    requestedPanels: n(match.programmed),
    releasedPanels: qty,
    remainingPanels: n(match.programmed) - totalReleased - qty,
    status: (totalReleased + qty >= n(match.programmed)) ? RELEASE_STATUS.completa : RELEASE_STATUS.parcial,
    createdAt: nowIso(),
    createdBy: sess.username,
    releasedAt: nowIso()
  };
  appendRow(getSheet('LIBERACIONES'), SHEETS_SCHEMA.LIBERACIONES.map(k => release[k]));

  if (payload.pallets && payload.pallets.length) {
    const pSheet = getSheet('PALLETS');
    payload.pallets.forEach(function(p) {
      const pallet = {
        palletId: uid('pal'),
        releaseId: release.releaseId,
        shipmentId: shipment.shipmentId,
        itemId: payload.itemId,
        thickness: n(payload.thickness),
        packaging: 'palet',
        palletType: p.palletType || 'simple',
        packages: n(p.packages),
        panels: n(p.panels),
        netWeight: n(p.netWeight),
        grossWeight: n(p.grossWeight),
        createdAt: nowIso(),
        createdBy: sess.username
      };
      appendRow(pSheet, SHEETS_SCHEMA.PALLETS.map(k => pallet[k]));
    });
  }

  if (payload.boxes && payload.boxes.length) {
    const bSheet = getSheet('CAJAS');
    payload.boxes.forEach(function(b) {
      const box = {
        boxId: uid('box'),
        releaseId: release.releaseId,
        shipmentId: shipment.shipmentId,
        itemId: payload.itemId,
        thickness: n(payload.thickness),
        packages: n(b.packages),
        panels: n(b.panels),
        netWeight: n(b.netWeight),
        grossWeight: n(b.grossWeight),
        createdAt: nowIso(),
        createdBy: sess.username
      };
      appendRow(bSheet, SHEETS_SCHEMA.CAJAS.map(k => box[k]));
    });
  }

  audit(sess, 'releases.create', 'LIBERACIONES', release.releaseId, { op: shipment.op, itemId: release.itemId, qty: qty }, event);
  return release;
}

function handleInspectionsGet(payload, sess) {
  require(payload, ['inspectionId']);
  const sheet = getSheet('INSPECCIONES_CALIDAD');
  const row = findRow(sheet, 'inspectionId', payload.inspectionId);
  if (row < 0) throw new Error('Inspección no encontrada.');
  return getRowData(sheet, row);
}

function handleInspectionsList(payload, sess) {
  const shipmentId = payload.shipmentId || '';
  const releaseId = payload.releaseId || '';
  const rows = getAllRows(getSheet('INSPECCIONES_CALIDAD'));
  return rows.filter(function(i) {
    if (shipmentId && i.shipmentId !== shipmentId) return false;
    if (releaseId && i.releaseId !== releaseId) return false;
    return true;
  }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
}

function handleInspectionsCreate(payload, sess, event) {
  require(payload, ['releaseId', 'itemId', 'thickness']);
  const relSheet = getSheet('LIBERACIONES');
  const relRow = findRow(relSheet, 'releaseId', payload.releaseId);
  if (relRow < 0) throw new Error('Liberación no encontrada.');
  const release = getRowData(relSheet, relRow);

  const existing = getAllRows(getSheet('INSPECCIONES_CALIDAD')).filter(i => i.releaseId === payload.releaseId && String(i.itemId).toUpperCase().trim() === String(payload.itemId).toUpperCase().trim() && n(i.thickness) === n(payload.thickness) && i.status !== 'cancelada');
  if (existing.length) throw new Error('Ya existe una inspección para esta liberación. Usa actualizar.');

  const sheetData = payload.controlSheet || {};
  const inspection = {
    inspectionId: uid('ins'),
    releaseId: release.releaseId,
    shipmentId: release.shipmentId,
    itemId: payload.itemId,
    thickness: n(payload.thickness),
    inspectedPanels: n(payload.inspectedPanels),
    approvedPanels: n(payload.approvedPanels),
    rejectedPanels: n(payload.rejectedPanels),
    observations: payload.observations || '',
    status: INSPECTION_STATUS.borrador,
    controlSheet: JSON.stringify(sheetData),
    productionResponsible: sheetData.productionResponsible || '',
    batchNumber: sheetData.batchNumber || '',
    boxCount: sheetData.boxCount || '',
    woodType: sheetData.woodType || 'FSC 100%',
    hour: sheetData.hour || '',
    shift: sheetData.shift || '',
    inspectorName: sheetData.inspectorName || sess.name,
    signature: payload.signature || '',
    samples: JSON.stringify(payload.samples || []),
    createdAt: nowIso(),
    createdBy: sess.username,
    finalizedAt: '',
    finalizedBy: ''
  };
  appendRow(getSheet('INSPECCIONES_CALIDAD'), SHEETS_SCHEMA.INSPECCIONES_CALIDAD.map(k => inspection[k]));
  audit(sess, 'inspections.create', 'INSPECCIONES_CALIDAD', inspection.inspectionId, { releaseId: release.releaseId }, event);
  return inspection;
}

function handleInspectionsUpdate(payload, sess, event) {
  require(payload, ['inspectionId']);
  const sheet = getSheet('INSPECCIONES_CALIDAD');
  const row = findRow(sheet, 'inspectionId', payload.inspectionId);
  if (row < 0) throw new Error('Inspección no encontrada.');
  const current = getRowData(sheet, row);
  if (current.status === INSPECTION_STATUS.finalizada) throw new Error('La inspección ya está finalizada.');

  ['inspectedPanels','approvedPanels','rejectedPanels','observations'].forEach(function(f) {
    if (payload[f] !== undefined) current[f] = payload[f];
  });
  if (payload.signature !== undefined) current.signature = payload.signature;
  if (payload.samples !== undefined) current.samples = JSON.stringify(payload.samples);
  if (payload.controlSheet !== undefined) {
    current.controlSheet = JSON.stringify(payload.controlSheet);
    const s = payload.controlSheet;
    if (s.productionResponsible !== undefined) current.productionResponsible = s.productionResponsible;
    if (s.batchNumber !== undefined) current.batchNumber = s.batchNumber;
    if (s.boxCount !== undefined) current.boxCount = s.boxCount;
    if (s.woodType !== undefined) current.woodType = s.woodType;
    if (s.hour !== undefined) current.hour = s.hour;
    if (s.shift !== undefined) current.shift = s.shift;
    if (s.inspectorName !== undefined) current.inspectorName = s.inspectorName;
  }
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => current[h]));
  audit(sess, 'inspections.update', 'INSPECCIONES_CALIDAD', current.inspectionId, { releaseId: current.releaseId }, event);
  return current;
}

function handleInspectionsFinalize(payload, sess, event) {
  require(payload, ['inspectionId']);
  const sheet = getSheet('INSPECCIONES_CALIDAD');
  const row = findRow(sheet, 'inspectionId', payload.inspectionId);
  if (row < 0) throw new Error('Inspección no encontrada.');
  const inspection = getRowData(sheet, row);
  if (inspection.status === INSPECTION_STATUS.finalizada) throw new Error('La inspección ya está finalizada.');

  const inspected = n(inspection.inspectedPanels);
  const approved = n(inspection.approvedPanels);
  const rejected = n(inspection.rejectedPanels);
  if (inspected <= 0) throw new Error('La cantidad inspeccionada debe ser mayor a cero.');
  if (approved + rejected !== inspected) throw new Error('Aprobados + rechazados deben coincidir con inspeccionados.');

  // Solo registra en hoja, NO genera PDF individual. El PDF único final se genera con shipments.finalizeQuality
  inspection.status = INSPECTION_STATUS.finalizada;
  inspection.finalizedAt = nowIso();
  inspection.finalizedBy = sess.username;
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(h => inspection[h]));

  audit(sess, 'inspections.finalize', 'INSPECCIONES_CALIDAD', inspection.inspectionId, {}, event);
  return { inspection: inspection };
}

function handleDashboardKpi(payload, sess) {
  const shipments = getAllRows(getSheet('EMBARQUES'));
  const releases = getAllRows(getSheet('LIBERACIONES')).filter(r => r.status !== RELEASE_STATUS.cancelada);
  const inspections = getAllRows(getSheet('INSPECCIONES_CALIDAD'));
  const pdfs = getAllRows(getSheet('DOCUMENTOS_PDF'));

  const totalEmbarques = shipments.length;
  const activos = shipments.filter(s => s.status === SHIPMENT_STATUS.activo).length;
  const cerrados = shipments.filter(s => s.status === SHIPMENT_STATUS.cerrado).length;
  const liberadoTotal = releases.reduce(function(s, r) { return s + n(r.releasedPanels); }, 0);
  const aprobadoTotal = inspections.reduce(function(s, i) { return s + n(i.approvedPanels); }, 0);
  const rechazadoTotal = inspections.reduce(function(s, i) { return s + n(i.rejectedPanels); }, 0);
  const pendienteInspeccion = liberadoTotal - inspections.filter(i => i.status === INSPECTION_STATUS.finalizada).reduce(function(s, i) { return s + n(i.inspectedPanels); }, 0);

  return {
    totalEmbarques: totalEmbarques,
    activos: activos,
    cerrados: cerrados,
    liberacionesCompletas: releases.filter(r => r.status === RELEASE_STATUS.completa).length,
    liberacionesParciales: releases.filter(r => r.status === RELEASE_STATUS.parcial).length,
    liberadoTotal: liberadoTotal,
    aprobadoTotal: aprobadoTotal,
    rechazadoTotal: rechazadoTotal,
    pendienteInspeccion: pendienteInspeccion,
    documentosPdf: pdfs.length
  };
}

function handleAuditList(payload, sess) {
  const rows = getAllRows(getSheet('AUDITORIA'));
  return rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, payload.limit || 500);
}

function handleConfigGet(payload, sess) {
  return {
    driveRootFolderId: getConfig(ROOT_FOLDER_CONFIG_KEY),
    companyName: getConfig(COMPANY_CONFIG_KEY) || 'BALSASUD S.A.'
  };
}

function handleConfigSet(payload, sess, event) {
  if (payload.driveRootFolderId !== undefined) setConfig(ROOT_FOLDER_CONFIG_KEY, payload.driveRootFolderId, sess);
  if (payload.companyName !== undefined) setConfig(COMPANY_CONFIG_KEY, payload.companyName, sess);
  audit(sess, 'config.set', 'CONFIGURACION', '', payload, event);
  return handleConfigGet(payload, sess);
}

function handleDebugInfo(payload, sess) {
  const ss = getSpreadsheet();
  const sheet = getSheet('EMBARQUES');
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    embarquesLastRow: sheet.getLastRow(),
    embarquesHeaders: headersOf(sheet),
    configDriveId: getConfig(ROOT_FOLDER_CONFIG_KEY),
    user: sess ? sess.username : 'noauth'
  };
}

function handleDebugCleanupPresentation(payload, sess) {
  requireRole(sess, ['superadmin']);
  const shipments = getAllRows(getSheet('EMBARQUES'));
  const pdfSheet = getSheet('DOCUMENTOS_PDF');
  const pdfs = getAllRows(pdfSheet);
  const deleted = [];
  const kept = [];
  const deletedPdfIds = [];

  function trashFile(fileId, reason) {
    try {
      const file = DriveApp.getFileById(fileId);
      const name = file.getName();
      file.setTrashed(true);
      deleted.push({ name: name, reason: reason });
      return true;
    } catch (e) { return false; }
  }

  shipments.forEach(function(s) {
    const shipPdfs = pdfs.filter(function(p) { return p.shipmentId === s.shipmentId; });
    const ptPdfs = shipPdfs.filter(function(p) { return String(p.qrCode || '').indexOf('pt-final') >= 0; });
    const qcPdfs = shipPdfs.filter(function(p) { return String(p.qrCode || '').indexOf('qc-final') >= 0; });
    const inspectionPdfs = shipPdfs.filter(function(p) { return String(p.qrCode || '').indexOf('inspection') >= 0; });

    // Borra PDFs individuales de inspección por pallet
    inspectionPdfs.forEach(function(p) {
      if (trashFile(p.driveFileId, 'PDF individual de inspección')) {
        deletedPdfIds.push(p.pdfId);
      }
    });

    // Deja solo el PDF final más reciente de PT y QC
    function keepNewest(list, type) {
      list.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      list.forEach(function(p, idx) {
        if (idx === 0) {
          kept.push({ type: type, pdfId: p.pdfId, createdAt: p.createdAt });
        } else {
          if (trashFile(p.driveFileId, type + ' duplicado antiguo')) {
            deletedPdfIds.push(p.pdfId);
          }
        }
      });
    }
    keepNewest(ptPdfs, 'ACTA_PT');
    keepNewest(qcPdfs, 'LIBERACION_FINAL_QC');
  });

  // Limpia también archivos huérfanos en Drive que no estén en DOCUMENTOS_PDF
  shipments.forEach(function(s) {
    try {
      const folder = DriveApp.getFolderById(s.driveFolderId);
      function scan(f) {
        const files = f.getFiles();
        while (files.hasNext()) {
          const file = files.next();
          const name = file.getName();
          if (name.indexOf('FOR-QC-08_Liberacion_Paneles_') === 0) {
            file.setTrashed(true);
            deleted.push({ name: name, reason: 'PDF individual huérfano en Drive' });
          }
        }
        const subs = f.getFolders();
        while (subs.hasNext()) scan(subs.next());
      }
      scan(folder);
    } catch (e) { /* ignora carpetas inaccesibles */ }
  });

  // Elimina filas de DOCUMENTOS_PDF correspondientes a archivos borrados
  deletedPdfIds.forEach(function(pdfId) {
    const row = findRow(pdfSheet, 'pdfId', pdfId);
    if (row > 0) pdfSheet.deleteRow(row);
  });

  audit(sess, 'debug.cleanupPresentation', 'DRIVE', 'ALL', { deleted: deleted.length, kept: kept.length }, {});
  return { deleted: deleted, kept: kept, deletedCount: deleted.length, keptCount: kept.length };
}

/* ---------------- JEFE DE EMBARQUE ---------------- */

function handleJefeList(payload, sess) {
  const shipments = getAllRows(getSheet('EMBARQUES'));
  const releases = getAllRows(getSheet('LIBERACIONES'));
  const inspections = getAllRows(getSheet('INSPECCIONES_CALIDAD'));
  const auths = getAllRows(getSheet('AUTORIZACIONES_JEFE'));
  const fisicos = getAllRows(getSheet('EMBARQUE_FISICO'));
  return shipments.map(function(s) {
    const rels = releases.filter(function(r){ return r.shipmentId===s.shipmentId; });
    const insps = inspections.filter(function(i){ return i.shipmentId===s.shipmentId; });
    const auts = auths.filter(function(a){ return a.shipmentId===s.shipmentId; });
    const fis = fisicos.filter(function(f){ return f.shipmentId===s.shipmentId; });
    const total = rels.length;
    const autorizados = auts.filter(function(a){ return a.estado==='autorizado'; }).length;
    const embarcados = fis.filter(function(f){ return f.estado==='embarcado'; }).reduce(function(sum,f){ try{ return sum + JSON.parse(f.releaseIds||'[]').length; } catch(e){ return sum; } }, 0);
    const pendientes = total - autorizados;
    const avance = total ? Math.round((autorizados/total)*100) : 0;
    return {
      shipment: s,
      total: total,
      autorizados: autorizados,
      pendientes: pendientes,
      embarcados: embarcados,
      avance: avance,
      filas: fis.length,
      autorizaciones: auts,
      fisicos: fis
    };
  }).sort(function(a,b){ return new Date(b.shipment.createdAt) - new Date(a.shipment.createdAt); });
}

function handleJefeAutorizar(payload, sess, event) {
  require(payload, ['shipmentId','releaseId']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const releases = getAllRows(getSheet('LIBERACIONES')).filter(function(r){ return r.shipmentId===shipment.shipmentId; });
  const release = releases.find(function(r){ return r.releaseId===payload.releaseId; });
  if (!release) throw new Error('Pallet no encontrado en el embarque.');
  const inspections = getAllRows(getSheet('INSPECCIONES_CALIDAD')).filter(function(i){ return i.releaseId===release.releaseId; });
  const insp = inspections[0];
  if (!insp || insp.status!=='finalizada') throw new Error('El pallet aún no está liberado por Calidad.');
  if (Number(insp.approvedPanels)!==Number(release.releasedPanels)) throw new Error('La cantidad aprobada por Calidad no coincide con lo liberado por PT.');
  const details = getAllRows(getSheet('DETALLE_EMBARQUES')).filter(function(d){ return d.shipmentId===shipment.shipmentId; });
  const row = details.find(function(d){ return String(d.itemId).toUpperCase().trim()===String(release.itemId).toUpperCase().trim() && n(d.thickness)===n(release.thickness); });
  if (!row) throw new Error('ITEM no encontrado en TALLY.');
  if (Number(row.programmed)!==Number(release.requestedPanels)) { /* warning only */ }
  const authSheet = getSheet('AUTORIZACIONES_JEFE');
  const existing = getAllRows(authSheet).find(function(a){ return a.releaseId===payload.releaseId && a.estado!=='rechazado'; });
  if (existing) throw new Error('Este pallet ya tiene autorización: ' + existing.estado);
  const aut = {
    autorizacionId: uid('aut'),
    shipmentId: shipment.shipmentId,
    releaseId: release.releaseId,
    itemId: release.itemId,
    thickness: n(release.thickness),
    paneles: n(release.releasedPanels),
    estado: 'autorizado',
    autorizadoPor: sess.username,
    autorizadoAt: nowIso(),
    observaciones: payload.observaciones||''
  };
  appendRow(authSheet, SHEETS_SCHEMA.AUTORIZACIONES_JEFE.map(function(k){ return aut[k]; }));
  audit(sess, 'jefe.autorizar', 'AUTORIZACIONES_JEFE', aut.autorizacionId, { shipmentId: shipment.shipmentId, releaseId: release.releaseId }, event);
  return aut;
}

function handleJefeRechazar(payload, sess, event) {
  require(payload, ['shipmentId','releaseId','observaciones']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const authSheet = getSheet('AUTORIZACIONES_JEFE');
  const existing = getAllRows(authSheet).find(function(a){ return a.releaseId===payload.releaseId && a.estado==='autorizado'; });
  if (existing) throw new Error('Ya está autorizado, no se puede rechazar.');
  const aut = {
    autorizacionId: uid('aut'),
    shipmentId: shipment.shipmentId,
    releaseId: payload.releaseId,
    itemId: payload.itemId||'',
    thickness: n(payload.thickness)||0,
    paneles: n(payload.paneles)||0,
    estado: 'observado',
    autorizadoPor: sess.username,
    autorizadoAt: nowIso(),
    observaciones: payload.observaciones
  };
  appendRow(authSheet, SHEETS_SCHEMA.AUTORIZACIONES_JEFE.map(function(k){ return aut[k]; }));
  audit(sess, 'jefe.observar', 'AUTORIZACIONES_JEFE', aut.autorizacionId, { shipmentId: shipment.shipmentId }, event);
  return aut;
}

function handleJefeEmbarcar(payload, sess, event) {
  require(payload, ['shipmentId','releaseId']);
  const auths = getAllRows(getSheet('AUTORIZACIONES_JEFE')).filter(function(a){ return a.releaseId===payload.releaseId && a.estado==='autorizado'; });
  if (!auths.length) throw new Error('El pallet no tiene visto bueno del Jefe de Embarque.');
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const fisicoSheet = getSheet('EMBARQUE_FISICO');
  const existing = getAllRows(fisicoSheet).find(function(f){ try{ return JSON.parse(f.releaseIds||'[]').indexOf(payload.releaseId)>=0; } catch(e){ return false; } });
  if (existing) throw new Error('Este pallet ya está embarcado en fila ' + existing.fila);
  // embarque individual como fila virtual si no se especifica fila
  const fisico = {
    fisicoId: uid('fis'),
    shipmentId: shipment.shipmentId,
    fila: payload.fila || 'individual',
    contenedor: payload.contenedor || shipment.container || '',
    releaseIds: JSON.stringify([payload.releaseId]),
    estado: 'embarcado',
    fotoFileId: '',
    fotoUrl: '',
    registradoPor: sess.username,
    registradoAt: nowIso(),
    observaciones: payload.observaciones||''
  };
  appendRow(fisicoSheet, SHEETS_SCHEMA.EMBARQUE_FISICO.map(function(k){ return fisico[k]; }));
  audit(sess, 'jefe.embarcar', 'EMBARQUE_FISICO', fisico.fisicoId, { shipmentId: shipment.shipmentId, releaseId: payload.releaseId }, event);
  return fisico;
}

function handleJefeFila(payload, sess, event) {
  require(payload, ['shipmentId','fila']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const fisicoSheet = getSheet('EMBARQUE_FISICO');
  const releaseIds = payload.releaseIds || [];
  if (!releaseIds.length) throw new Error('Selecciona al menos un pallet para la fila.');
  // verificar que todos estén autorizados
  const auths = getAllRows(getSheet('AUTORIZACIONES_JEFE'));
  for (let i=0;i<releaseIds.length;i++) {
    const has = auths.find(function(a){ return a.releaseId===releaseIds[i] && a.estado==='autorizado'; });
    if (!has) throw new Error('Pallet ' + releaseIds[i] + ' no tiene visto bueno.');
  }
  let fotoFileId=''; let fotoUrl='';
  if (payload.base64) {
    const folder = DriveApp.getFolderById(shipment.driveFolderId);
    const estiba = getOrCreateSubFolder(folder.getId(), 'ESTIBA_CONTENEDOR');
    const blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), payload.mimeType||'image/jpeg', 'Fila_'+payload.fila+'_'+shipment.code+'.jpg');
    const file = estiba.createFile(blob);
    fotoFileId = file.getId(); fotoUrl = file.getUrl();
  }
  const fisico = {
    fisicoId: uid('fis'),
    shipmentId: shipment.shipmentId,
    fila: String(payload.fila),
    contenedor: payload.contenedor || shipment.container || '',
    releaseIds: JSON.stringify(releaseIds),
    estado: 'embarcado',
    fotoFileId: fotoFileId,
    fotoUrl: fotoUrl,
    registradoPor: sess.username,
    registradoAt: nowIso(),
    observaciones: payload.observaciones||''
  };
  appendRow(fisicoSheet, SHEETS_SCHEMA.EMBARQUE_FISICO.map(function(k){ return fisico[k]; }));
  audit(sess, 'jefe.fila', 'EMBARQUE_FISICO', fisico.fisicoId, { shipmentId: shipment.shipmentId, fila: payload.fila }, event);
  return fisico;
}

function generateActaFinalEmbarque(sess, shipment, releases, inspections, autorizaciones, fisicos) {
  const folderId = shipment.driveFolderId;
  const doc = DocumentApp.create('ACTA_FINAL_EMBARQUE_' + shipment.code + '_' + nowIso().slice(0,10));
  const body = doc.getBody();
  const company = getConfig(COMPANY_CONFIG_KEY) || 'BALSASUD S.A.';
  body.appendParagraph(company).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('ACTA DE CONSOLIDACIÓN Y AUTORIZACIÓN DE EMBARQUE').setHeading(DocumentApp.ParagraphHeading.HEADING2).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Código: FOR-EMB-FINAL | Fecha: ' + nowIso().slice(0,10)).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(' ');
  const info = body.appendTable();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('ORDEN PRODUCCIÓN'); r.appendTableCell(String(shipment.op)); r.appendTableCell('CLIENTE'); r.appendTableCell(String(shipment.client)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('Nº EMBARQUE'); r.appendTableCell(String(shipment.code)); r.appendTableCell('CONTENEDOR'); r.appendTableCell(String(shipment.container||shipment.lot)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('LOTE'); r.appendTableCell(String(shipment.lot)); r.appendTableCell('DESTINO'); r.appendTableCell(String(shipment.destination)); })();
  (function(){ var r=info.appendTableRow(); r.appendTableCell('FECHA EMBARQUE'); r.appendTableCell(String(shipment.dispatchDate)); r.appendTableCell('RESP. EMBARQUE'); r.appendTableCell(String(sess.name)); })();
  body.appendParagraph(' ');
  body.appendParagraph('CONSOLIDADO DE CARGA').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const table = body.appendTable();
  const header = table.appendTableRow();
  ['#','ITEM ID','Espesor','Paneles','PT','Calidad','Jefe','Fila','Estado'].forEach(function(h){ header.appendTableCell(h); });
  releases.forEach(function(rel, idx){
    var insp = inspections.find(function(i){ return i.releaseId===rel.releaseId; }) || {};
    var aut = autorizaciones.find(function(a){ return a.releaseId===rel.releaseId; }) || {};
    var fis = fisicos.find(function(f){ try{ return JSON.parse(f.releaseIds||'[]').indexOf(rel.releaseId)>=0; } catch(e){ return false; } }) || {};
    var r=table.appendTableRow();
    r.appendTableCell(String(idx+1));
    r.appendTableCell(String(rel.itemId));
    r.appendTableCell(String(rel.thickness));
    r.appendTableCell(String(rel.releasedPanels));
    r.appendTableCell(String(rel.status));
    r.appendTableCell(String(insp.status||''));
    r.appendTableCell(String(aut.estado||'pendiente'));
    r.appendTableCell(String(fis.fila||''));
    r.appendTableCell(String(fis.estado||'pendiente'));
  });
  body.appendParagraph(' ');
  body.appendParagraph('Total programado: ' + releases.reduce(function(s,r){return s+n(r.releasedPanels);},0) + ' paneles en ' + releases.length + ' pallets').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(' ');
  body.appendParagraph('DECLARACIÓN DE CONFORMIDAD Y FIRMAS').setHeading(DocumentApp.ParagraphHeading.HEADING3).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const ptInfo = getSignerInfoFromDocs(shipment.shipmentId, 'pt-final');
  const qcInfo = getSignerInfoFromDocs(shipment.shipmentId, 'qc-final');
  const sigTable = body.appendTable();
  const sigRow = sigTable.appendTableRow();
  addSignatureCell(sigRow.appendTableCell(''), 'Producto Terminado', ptInfo.name || 'Producto Terminado', ptInfo.date, true);
  addSignatureCell(sigRow.appendTableCell(''), 'Control de Calidad', qcInfo.name || 'Calidad', qcInfo.date, true);
  addSignatureCell(sigRow.appendTableCell(''), 'Jefe de Embarque', sess.name, nowIso(), true);
  sigTable.setBorderWidth(0);
  const qrUrl = generateQrUrl('https://balsasud.app/shipment/' + shipment.shipmentId + '/embarque-final');
  addQrBlock(body, qrUrl, 'Escanea para verificar autenticidad');
  doc.saveAndClose();
  const pdf = doc.getAs('application/pdf');
  pdf.setName('ACTA_FINAL_EMBARQUE_' + shipment.code + '_' + nowIso().slice(0,10) + '.pdf');
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const sub = getOrCreateSubFolder(folder.getId(), 'ACTAS_EMBARQUE');
    const file = sub.createFile(pdf);
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    return { fileId: file.getId(), url: file.getUrl(), qrUrl: qrUrl };
  }
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return { fileId: doc.getId(), url: doc.getUrl(), qrUrl: qrUrl };
}

function handleJefeActaFinal(payload, sess, event) {
  require(payload, ['shipmentId']);
  const shipment = handleShipmentsGet({ shipmentId: payload.shipmentId }, sess);
  const releases = getAllRows(getSheet('LIBERACIONES')).filter(function(r){ return r.shipmentId===shipment.shipmentId && r.status!=='cancelada'; });
  if (!releases.length) throw new Error('No hay pallets para el acta.');
  const inspections = getAllRows(getSheet('INSPECCIONES_CALIDAD')).filter(function(i){ return i.shipmentId===shipment.shipmentId; });
  if (inspections.length!==releases.length) throw new Error('Faltan inspecciones.');
  for (let i=0;i<inspections.length;i++) if (inspections[i].status!=='finalizada') throw new Error('Hay inspecciones no finalizadas.');
  const autorizaciones = getAllRows(getSheet('AUTORIZACIONES_JEFE')).filter(function(a){ return a.shipmentId===shipment.shipmentId; });
  const pendientes = releases.filter(function(r){ return !autorizaciones.find(function(a){ return a.releaseId===r.releaseId && a.estado==='autorizado'; }); });
  if (pendientes.length) throw new Error('Faltan ' + pendientes.length + ' pallets por autorizar por el Jefe de Embarque.');
  const fisicos = getAllRows(getSheet('EMBARQUE_FISICO')).filter(function(f){ return f.shipmentId===shipment.shipmentId; });
  const pdf = generateActaFinalEmbarque(sess, shipment, releases, inspections, autorizaciones, fisicos);
  const rec = { pdfId: uid('pdf'), inspectionId: '', shipmentId: shipment.shipmentId, releaseId: '', driveFileId: pdf.fileId, driveUrl: pdf.url, qrCode: pdf.qrUrl, createdAt: nowIso(), createdBy: sess.username };
  appendRow(getSheet('DOCUMENTOS_PDF'), SHEETS_SCHEMA.DOCUMENTOS_PDF.map(function(k){ return rec[k]; }));
  const sheet = getSheet('EMBARQUES');
  const row = findRow(sheet, 'shipmentId', shipment.shipmentId);
  const current = getRowData(sheet, row);
  current.status = SHIPMENT_STATUS.cerrado;
  current.closedAt = nowIso();
  current.closedBy = sess.username;
  const headers = headersOf(sheet);
  updateRow(sheet, row, headers.map(function(h){ return current[h]; }));
  audit(sess, 'jefe.actaFinal', 'EMBARQUES', shipment.shipmentId, { pdfId: rec.pdfId, driveUrl: pdf.url }, event);
  return { shipment: current, pdf: rec };
}

/* ---------------- ROUTER ---------------- */

const ROUTES = {
  'auth.login': handleLogin,
  'auth.logout': handleLogout,
  'auth.me': handleMe,
  'users.list': handleUsersList,
  'users.create': handleUserCreate,
  'users.update': handleUserUpdate,
  'users.delete': handleUserDelete,
  'shipments.list': handleShipmentsList,
  'shipments.get': handleShipmentsGet,
  'shipments.create': handleShipmentsCreate,
  'shipments.update': handleShipmentsUpdate,
  'shipments.activate': handleShipmentsActivate,
  'shipments.close': handleShipmentsClose,
  'documents.upload': handleDocumentsUpload,
  'releases.list': handleReleasesList,
  'releases.create': handleReleasesCreate,
  'inspections.get': handleInspectionsGet,
  'inspections.list': handleInspectionsList,
  'inspections.create': handleInspectionsCreate,
  'inspections.update': handleInspectionsUpdate,
  'inspections.finalize': handleInspectionsFinalize,
  'dashboard.kpi': handleDashboardKpi,
  'audit.list': handleAuditList,
  'config.get': handleConfigGet,
  'config.set': handleConfigSet,
  'debug.info': handleDebugInfo,
  'debug.cleanupPresentation': handleDebugCleanupPresentation,
  'shipments.finalizePT': handleShipmentsFinalizePT,
  'shipments.finalizeQuality': handleShipmentsFinalizeQuality,
  'jefe.list': handleJefeList,
  'jefe.autorizar': handleJefeAutorizar,
  'jefe.rechazar': handleJefeRechazar,
  'jefe.embarcar': handleJefeEmbarcar,
  'jefe.fila': handleJefeFila,
  'jefe.actaFinal': handleJefeActaFinal
};

function doGet() {
  return ok({ message: 'Backend BALSASUD activo.', version: '1.0.0' });
}

function doPost(event) {
  ensureSheets();
  let request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (e) {
    return fail('JSON inválido', 400);
  }

  const action = request.action;
  const payload = request.payload || {};
  if (!action) return fail('Falta action', 400);

  const handler = ROUTES[action];
  if (!handler) return fail('Acción no soportada: ' + action, 400);

  let sess = null;
  try {
    if (action !== 'auth.login') {
      sess = requireAuth(request.sessionToken, action);
    }
  } catch (e) {
    return fail(e.message, 401);
  }

  const lock = LockService.getScriptLock();
  const needLock = ['shipments.create','shipments.update','shipments.activate','shipments.close','shipments.finalizePT','shipments.finalizeQuality','releases.create','inspections.create','inspections.update','inspections.finalize','users.create','users.update','users.delete','documents.upload','config.set','jefe.autorizar','jefe.rechazar','jefe.embarcar','jefe.fila','jefe.actaFinal'];
  const useLock = needLock.indexOf(action) >= 0;

  try {
    if (useLock) lock.waitLock(15000);
    const result = handler(payload, sess, event);
    if (useLock) lock.releaseLock();
    return ok(result);
  } catch (e) {
    if (useLock) lock.releaseLock();
    console.error(action + ' error: ' + e.message);
    return fail(e.message, 400);
  }
}

/* ---------------- UTILIDAD DE SEED (ejecutar una vez) ---------------- */

function seedUsuarios() {
  ensureSheets();
  const sheet = getSheet('USUARIOS');
  if (sheet.getLastRow() > 1) return 'Ya existen usuarios.';
  const users = [
    { username: 'superadmin', name: 'Superadministrador', role: 'superadmin', password: 'Balsasud2026!' },
    { username: 'terminado', name: 'Producto Terminado', role: 'pt', password: 'Pt2026!' },
    { username: 'calidad', name: 'Calidad', role: 'calidad', password: 'Calidad2026!' }
  ];
  users.forEach(function(u) {
    const user = {
      userId: uid('usr'),
      username: u.username,
      name: u.name,
      role: u.role,
      passwordHash: hashPassword(u.username, u.password),
      active: 'true',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLogin: ''
    };
    appendRow(sheet, SHEETS_SCHEMA.USUARIOS.map(k => user[k]));
  });
  setConfig(COMPANY_CONFIG_KEY, 'BALSASUD S.A.', null);
  return 'Usuarios seed creados.';
}
