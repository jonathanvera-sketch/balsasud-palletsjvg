const STORAGE_KEY = 'control-pallets-registros';
const SESSION_KEY = 'control-pallets-sesion';
const GOOGLE_SHEETS_ENDPOINT = '/.netlify/functions/google-sheets';
const ACCOUNTS = {
  paneles: { user: 'paneles', password: 'paneles#2026', label: 'Área de Paneles' },
  terminado: { user: 'producto.terminado', password: 'producto#2026', label: 'Producto Terminado' },
  embarques: { user: 'embarques', password: 'embarques#2026', label: 'Control de Embarques' },
  admin: { user: 'admin', password: 'admin#2026', label: 'Administrador' }
};
const loginScreen = document.querySelector('#loginScreen');
const loginForm = document.querySelector('#loginForm');
const loginUser = document.querySelector('#loginUser');
const loginPassword = document.querySelector('#loginPassword');
const loginFeedback = document.querySelector('#loginFeedback');
const logoutButton = document.querySelector('#logoutButton');
const sessionLabel = document.querySelector('#sessionLabel');
const togglePassword = document.querySelector('#togglePassword');
const form = document.querySelector('#palletForm');
const codeInput = document.querySelector('#palletCode');
const fieldIds = ['material', 'specification', 'productionOrder', 'purchaseOrder', 'lotNumber', 'palletType', 'quantitySheets', 'quantityPanels', 'palletsThickness'];
const noteInput = document.querySelector('#note');
const feedback = document.querySelector('#formFeedback');
const historyBody = document.querySelector('#historyBody');
const emptyState = document.querySelector('#emptyState');
const totalCount = document.querySelector('#totalCount');
const receivedCount = document.querySelector('#receivedCount');
const transitCount = document.querySelector('#transitCount');
const todayCount = document.querySelector('#todayCount');
const progressBar = document.querySelector('#progressBar');
const completionFill = document.querySelector('#completionFill');
const completionText = document.querySelector('#completionText');
const todayLabel = document.querySelector('#todayLabel');
const scanButton = document.querySelector('#scanButton');
const scannerVideo = document.querySelector('#scannerVideo');
let scannerStream;

let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

todayLabel.textContent = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date());

const receivingList = document.querySelector('#receivingList');
const emptyReceiving = document.querySelector('#emptyReceiving');
const pendingCount = document.querySelector('#pendingCount');
const productionSection = document.querySelector('#productionSection');
const productionBody = document.querySelector('#productionBody');
const emptyProduction = document.querySelector('#emptyProduction');
const productionFilter = document.querySelector('#productionFilter');
const adminActivityBody = document.querySelector('#adminActivityBody');
const adminPoBody = document.querySelector('#adminPoBody');
const adminContainers = document.querySelector('#adminContainers');
const adminContainerSelect = document.querySelector('#adminContainerSelect');
const adminPanelesTotal = document.querySelector('#adminPanelesTotal');
const adminTerminadoTotal = document.querySelector('#adminTerminadoTotal');
const adminEmbarquesTotal = document.querySelector('#adminEmbarquesTotal');
const adminContainersTotal = document.querySelector('#adminContainersTotal');
const shippingQueue = document.querySelector('#shippingQueue');
const shippingForm = document.querySelector('#shippingForm');
const shippingCode = document.querySelector('#shippingCode');
const shippingPo = document.querySelector('#shippingPo');
const shippingPanels = document.querySelector('#shippingPanels');
const shippingMaterial = document.querySelector('#shippingMaterial');
const shippingSpecification = document.querySelector('#shippingSpecification');
const shippingPurchaseOrder = document.querySelector('#shippingPurchaseOrder');
const shippingLotNumber = document.querySelector('#shippingLotNumber');
const shippingPalletType = document.querySelector('#shippingPalletType');
const shippingQuantitySheets = document.querySelector('#shippingQuantitySheets');
const shippingOrderSelect = document.querySelector('#shippingOrderSelect');
const shippingEvidence = document.querySelector('#shippingEvidence');
const evidenceCount = document.querySelector('#evidenceCount');
const shippingFeedback = document.querySelector('#shippingFeedback');
const shippingCount = document.querySelector('#shippingCount');
const shippingIndicators = document.querySelector('#shippingIndicators');
const emptyShippingIndicators = document.querySelector('#emptyShippingIndicators');
const shippingScanButton = document.querySelector('#shippingScanButton');
const shippingScannerVideo = document.querySelector('#shippingScannerVideo');
let receivingFilter = 'pending';
records = records.map(record => ({ ...record, status: record.status || 'received' }));

function visibleRecords() {
  const filter = productionFilter.value.trim().toLowerCase();
  return filter ? records.filter(record => (record.productionOrder || '').toLowerCase().includes(filter)) : records;
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function sendToGoogleSheets(action, record) {
  if (!GOOGLE_SHEETS_ENDPOINT) return;
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  fetch(GOOGLE_SHEETS_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...record, action, user: session.user || '', role: session.role || '' })
  }).catch(() => {});
}

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  records = JSON.parse(event.newValue || '[]').map(record => ({ ...record, status: record.status || 'received' }));
  render();
});

function isToday(date) {
  return new Date(date).toDateString() === new Date().toDateString();
}

function render() {
  const currentRecords = visibleRecords();
  const todayRecords = currentRecords.filter(record => isToday(record.timestamp));
  const total = currentRecords.length;
  const received = currentRecords.filter(record => record.status === 'received' || record.status === 'shipped');
  const pending = currentRecords.filter(record => record.status === 'pending');
  totalCount.textContent = total;
  receivedCount.textContent = received.length;
  transitCount.textContent = pending.length;
  pendingCount.textContent = pending.length;
  todayCount.textContent = `${todayRecords.length} hoy`;
  progressBar.style.width = `${total ? Math.round((received.length / total) * 100) : 0}%`;
  completionFill.style.width = `${total ? (received.length / total) * 100 : 0}%`;
  completionText.textContent = total ? `${received.length} de ${total} pallet${total === 1 ? '' : 's'} recibido${received.length === 1 ? '' : 's'}` : 'Sin movimientos registrados';
  emptyState.hidden = currentRecords.length > 0;
  historyBody.innerHTML = currentRecords.map(record => `<tr><td>${escapeHtml(record.code)}</td><td>${escapeHtml(record.productionOrder || 'Sin PO')}</td><td>${escapeHtml(record.quantityPanels || '0')}</td><td>${formatTime(record.timestamp)}</td><td>Producto terminado</td><td><span class="status-pill ${record.status === 'shipped' ? '' : record.status === 'received' ? '' : 'pending-pill'}">${record.status === 'shipped' ? 'Embarcado' : record.status === 'received' ? 'Recibido' : 'Pendiente'}</span></td><td><button class="edit-button" data-edit-record="${escapeHtml(record.id)}" type="button">Editar</button></td></tr>`).join('');
  renderProductionSummary();
  renderReceiving();
  renderAdmin();
  renderShipping();
}

function renderAdmin() {
  const currentRecords = visibleRecords();
  const pending = currentRecords.filter(record => record.status === 'pending');
  const received = currentRecords.filter(record => record.status === 'received');
  const shipped = currentRecords.filter(record => record.status === 'shipped');
  const uniquePos = new Set(currentRecords.filter(record => record.productionOrder).map(record => record.productionOrder.trim()).filter(Boolean));

  document.querySelector('#adminTotal').textContent = currentRecords.length;
  document.querySelector('#adminPending').textContent = pending.length;
  document.querySelector('#adminReceived').textContent = received.length + shipped.length;
  document.querySelector('#adminPanels').textContent = currentRecords.reduce((total, record) => total + (Number(record.quantityPanels) || 0), 0);
  document.querySelector('#adminFilterLabel').textContent = productionFilter.value.trim() || 'Todas';

  adminPanelesTotal.textContent = currentRecords.length;
  adminTerminadoTotal.textContent = received.length + shipped.length;
  adminEmbarquesTotal.textContent = shipped.length;
  adminContainersTotal.textContent = uniquePos.size;

  const poSummary = currentRecords.reduce((summary, record) => {
    const po = record.productionOrder?.trim() || 'Sin PO';
    if (!summary[po]) summary[po] = { total: 0, received: 0, shipped: 0, panels: 0, pending: 0 };
    const group = summary[po];
    group.total += 1;
    group.panels += Number(record.quantityPanels) || 0;
    if (record.status === 'pending') group.pending += 1;
    if (record.status === 'received') group.received += 1;
    if (record.status === 'shipped') group.shipped += 1;
    return summary;
  }, {});

  const orderedPoEntries = Object.entries(poSummary).sort(([first], [second]) => first.localeCompare(second, 'es'));

  adminContainerSelect.innerHTML = '<option value="">Todas</option>' + orderedPoEntries.map(([po]) => `<option value="${escapeHtml(po)}">${escapeHtml(po)}</option>`).join('');
  const currentContainerSelection = adminContainerSelect.value;
  const validSelection = currentContainerSelection && orderedPoEntries.some(([po]) => po === currentContainerSelection);
  if (!validSelection && orderedPoEntries.length) {
    adminContainerSelect.value = orderedPoEntries[0][0];
  } else if (!orderedPoEntries.length) {
    adminContainerSelect.value = '';
  }

  adminPoBody.innerHTML = orderedPoEntries.map(([po, group]) => {
    const status = group.shipped === group.total ? 'Embarcado' : group.received > 0 ? 'En proceso' : 'Pendiente';
    return `<tr><td>${escapeHtml(po)}</td><td>${group.total}</td><td>${group.received}</td><td>${group.shipped}</td><td>${group.panels}</td><td><span class="status-pill ${status === 'Pendiente' ? 'pending-pill' : ''}">${status}</span></td></tr>`;
  }).join('');

  const selectedContainer = adminContainerSelect.value || '';
  const visibleContainerEntries = selectedContainer ? orderedPoEntries.filter(([po]) => po === selectedContainer) : orderedPoEntries;

  adminContainers.innerHTML = visibleContainerEntries.map(([po, group]) => {
    const totalSlots = Math.max(group.total, 1);
    const slots = Array.from({ length: Math.min(totalSlots, 20) }, (_, index) => {
      const state = index < group.shipped ? 'shipped' : index < group.shipped + group.received ? 'ready' : 'pending';
      return `<span class="container-slot ${state}" title="${index < group.shipped ? 'Embarcado' : index < group.shipped + group.received ? 'Listo' : 'Pendiente'}"></span>`;
    }).join('');
    return `<article class="admin-container-card"><div class="shipping-indicator-head"><div><p class="card-kicker">PRODUCCIÓN / PO</p><h3>${escapeHtml(po)}</h3></div><strong>${group.shipped}/${group.total}</strong></div><div class="container-graphic"><div class="container-top">CONTENEDOR <span>▰</span></div><div class="container-slots">${slots}</div></div><div class="shipping-indicator-meta"><span>${group.total} pallets</span><span>${group.panels} paneles</span><span class="ready-text">${group.shipped} embarcados</span></div></article>`;
  }).join('') || '<div class="empty-production">No hay contenedores disponibles.</div>';

  const activity = currentRecords.flatMap(record => [
    { date: record.timestamp, action: 'Salida', eventStatus: 'Pendiente', record },
    ...(record.receivedAt ? [{ date: record.receivedAt, action: 'Recepción', eventStatus: 'Recibido', record }] : []),
    ...(record.shippedAt ? [{ date: record.shippedAt, action: 'Embarque', eventStatus: 'Embarcado', record }] : [])
  ]).sort((first, second) => new Date(second.date) - new Date(first.date));
  document.querySelector('#emptyAdmin').hidden = activity.length > 0;
  adminActivityBody.innerHTML = activity.map(item => `<tr><td>${formatDateTime(item.date)}</td><td>${item.action}</td><td>${escapeHtml(item.record.code)}</td><td>${escapeHtml(item.record.productionOrder || 'Sin PO')}</td><td>${escapeHtml(item.record.palletType || 'Sin tipo')}</td><td><span class="status-pill ${item.eventStatus === 'Pendiente' ? 'pending-pill' : ''}">${item.eventStatus}</span></td></tr>`).join('');
}

function renderShipping() {
  const visible = records;
  const ready = visible.filter(record => record.status === 'received');
  shippingCount.textContent = ready.length;
  shippingQueue.innerHTML = ready.map(record => `<button class="shipping-queue-item" data-select-shipping="${escapeHtml(record.id)}" type="button"><strong>${escapeHtml(record.code)}</strong><span>${escapeHtml(record.productionOrder || 'Sin PO')} · ${escapeHtml(record.quantityPanels || '0')} paneles</span></button>`).join('');
  const groups = visible.reduce((summary, record) => {
    const po = record.productionOrder?.trim() || 'Sin PO';
    if (!summary[po]) summary[po] = { total: 0, ready: 0, shipped: 0, panels: 0 };
    summary[po].total += 1;
    summary[po].panels += Number(record.quantityPanels) || 0;
    if (record.status === 'received') summary[po].ready += 1;
    if (record.status === 'shipped') summary[po].shipped += 1;
    return summary;
  }, {});
  const sortedGroups = Object.entries(groups).sort(([first], [second]) => first.localeCompare(second, 'es'));
  const currentSelection = shippingOrderSelect.value;
  shippingOrderSelect.innerHTML = '<option value="">Selecciona una orden</option>' + sortedGroups.map(([po]) => `<option value="${escapeHtml(po)}">${escapeHtml(po)}</option>`).join('');
  if (sortedGroups.some(([po]) => po === currentSelection)) shippingOrderSelect.value = currentSelection;
  const selectedPo = shippingOrderSelect.value || sortedGroups[0]?.[0];
  if (selectedPo) shippingOrderSelect.value = selectedPo;
  const selectedGroup = selectedPo ? groups[selectedPo] : null;
  const cards = selectedGroup ? [[selectedPo, selectedGroup]].map(([po, group]) => {
    const slots = Array.from({ length: Math.min(Math.max(group.total, 1), 20) }, (_, index) => `<span class="container-slot ${index < group.shipped ? 'shipped' : index < group.shipped + group.ready ? 'ready' : 'pending'}" title="${index < group.shipped ? 'Embarcado' : index < group.shipped + group.ready ? 'Listo para embarque' : 'Pendiente'}"></span>`).join('');
    return `<article class="shipping-indicator"><div class="shipping-indicator-head"><div><p class="card-kicker">PRODUCCIÓN / PO</p><h3>${escapeHtml(po)}</h3></div><strong>${group.shipped}/${group.total}</strong></div><div class="container-graphic"><div class="container-top">CONTENEDOR <span>▰</span></div><div class="container-slots">${slots}</div></div><div class="shipping-indicator-meta"><span>${group.total} pallets</span><span>${group.panels} paneles</span><span class="ready-text">${group.ready} listos</span></div></article>`;
  }).join('') : '';
  shippingIndicators.innerHTML = cards;
  emptyShippingIndicators.hidden = Object.keys(groups).length > 0;
}

  function renderProductionSummary() {
    const groups = visibleRecords().reduce((summary, record) => {
      const po = record.productionOrder?.trim() || 'Sin PO';
      if (!summary[po]) summary[po] = { 'simple-b': 0, 'simple-t': 0, simple: 0, doble: 0, boxes: 0, total: 0, received: 0, panels: 0, pending: 0 };
      const group = summary[po];
      if (Object.prototype.hasOwnProperty.call(group, record.palletType)) group[record.palletType] += 1;
      group.total += 1;
      if (record.status === 'received' || record.status === 'shipped') group.received += 1;
      group.panels += Number(record.quantityPanels) || 0;
      if (record.status === 'pending') group.pending += 1;
      return summary;
    }, {});
    const rows = Object.entries(groups).sort(([first], [second]) => first.localeCompare(second, 'es')).map(([po, group]) => `<tr><td>${escapeHtml(po)}</td><td>${group['simple-b']}</td><td>${group['simple-t']}</td><td>${group.simple}</td><td>${group.doble}</td><td>${group.boxes}</td><td><strong>${group.total}</strong></td><td><strong class="received-number">${group.received}</strong></td><td><strong>${group.panels}</strong></td><td><span class="status-pill ${group.pending ? 'pending-pill' : ''}">${group.pending}</span></td><td><button class="edit-button" data-edit-po="${escapeHtml(po)}" type="button">Editar</button></td></tr>`).join('');
    productionBody.innerHTML = rows;
    emptyProduction.hidden = visibleRecords().length > 0;
  }

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

function renderReceiving() {
  const filtered = visibleRecords().filter(record => receivingFilter === 'all' || (receivingFilter === 'received' ? record.status === 'received' || record.status === 'shipped' : record.status === 'pending'));
  emptyReceiving.hidden = filtered.length > 0;
  receivingList.innerHTML = filtered.map(record => {
    const palletLabels = { 'simple-b': 'Simple B', 'simple-t': 'Simple T', simple: 'Simple', doble: 'Doble', boxes: 'Boxes' };
    const details = [record.productionOrder && `Producción / PO ${record.productionOrder}`, record.palletType && `Pallet ${palletLabels[record.palletType] || record.palletType}`, record.palletsThickness && `Pallets de ${record.palletsThickness}`, record.quantityPanels && `${record.quantityPanels} paneles`, record.material, record.specification, record.lotNumber && `Lote ${record.lotNumber}`].filter(Boolean).join(' · ');
    const action = record.status === 'shipped' ? `<span class="status-pill">Embarcado ${record.shippedAt ? formatTime(record.shippedAt) : ''}</span>` : record.status === 'received' ? `<span class="status-pill">Recibido ${record.receivedAt ? formatTime(record.receivedAt) : ''}</span>` : `<button class="receive-button" data-receive="${escapeHtml(record.id)}">Confirmar recepción <span>→</span></button>`;
    return `<article class="receiving-card"><div class="receiving-card-main"><div class="pallet-symbol">P</div><div><p class="card-kicker">SALIDA DESDE PANELES · ${formatTime(record.timestamp)}</p><h3>${escapeHtml(record.code)}</h3><p class="card-details">${escapeHtml(details || 'Sin información adicional')}</p></div></div><div class="receiving-card-action">${action}</div></article>`;
  }).join('');
}

function readQrFields(payload) {
  const aliases = {
    itemid: 'palletCode', item: 'palletCode', material: 'material', specification: 'specification',
    po: 'productionOrder', productionordernumber: 'productionOrder', purchaseorder: 'purchaseOrder', purchaseordernumber: 'purchaseOrder',
    quantitybox: 'quantitySheets', stdquantityperbox: 'quantitySheets', quantity: 'quantitySheets',
    lotnumber: 'lotNumber', lot: 'lotNumber',
    pallettype: 'palletType'
  };
  payload.split('|').forEach(part => {
    const separator = part.indexOf(':');
    if (separator < 0) return;
    const key = part.slice(0, separator).trim().toLowerCase().replace(/[^a-z]/g, '');
    const target = aliases[key];
    if (target) {
      const value = part.slice(separator + 1).trim();
      if (target === 'quantitySheets' && value.includes('|')) {
        const [sheets] = value.split('|').map(item => item.trim());
        document.querySelector('#quantitySheets').value = sheets;
      } else {
        document.querySelector(`#${target}`).value = value;
      }
    }
  });
}

function populateFromScannedValue(value) {
  if (value.includes('|') || value.includes(':')) readQrFields(value);
  else codeInput.value = value.trim();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  if (records.some(record => record.code === code)) {
    feedback.textContent = 'Este código ya está registrado.';
    feedback.style.color = '#cf4d2e';
    codeInput.focus();
    return;
  }
  const details = Object.fromEntries(fieldIds.map(id => [id, document.querySelector(`#${id}`).value.trim()]));
  records.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, code, note: noteInput.value.trim(), status: 'pending', ...details, timestamp: new Date().toISOString() });
  saveRecords();
  sendToGoogleSheets('SALIDA', records[0]);
  render();
  form.reset();
  feedback.textContent = `${code} enviado a Producto Terminado.`;
  feedback.style.color = '#138a72';
});

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  codeInput.placeholder = tab.dataset.mode === 'qr' ? 'Escanea o pega el código QR' : 'Ej. PAL-0248';
  document.querySelector('#qrHint').firstElementChild.textContent = tab.dataset.mode === 'qr' ? '▣' : '⌁';
  codeInput.focus();
}));

codeInput.addEventListener('input', () => {
  if (codeInput.value.includes('|') || codeInput.value.includes(':')) readQrFields(codeInput.value);
});

document.querySelectorAll('.role-tab').forEach(tab => tab.addEventListener('click', () => {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (session && tab.dataset.view !== session.role) return;
  const view = tab.dataset.view;
  document.querySelectorAll('.role-tab').forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-selected', item === tab ? 'true' : 'false'); });
  document.querySelector('#panelesView').hidden = view !== 'paneles';
  document.querySelector('#terminadoView').hidden = view !== 'terminado';
  document.querySelector('#embarquesView').hidden = view !== 'embarques';
  document.querySelector('#adminView').hidden = view !== 'admin';
}));

function applySession(session) {
  const account = session && ACCOUNTS[session.role];
  loginScreen.hidden = Boolean(account);
  document.querySelector('.app-shell').hidden = !account;
  if (!account) return;
  sessionLabel.textContent = account.label;
  document.querySelectorAll('.role-tab').forEach(tab => {
    const allowed = tab.dataset.view === session.role;
    tab.hidden = !allowed;
    tab.classList.toggle('active', allowed);
    tab.setAttribute('aria-selected', allowed ? 'true' : 'false');
  });
  const paneles = session.role === 'paneles';
  document.querySelector('#panelesView').hidden = !paneles;
  document.querySelector('#terminadoView').hidden = session.role !== 'terminado';
  document.querySelector('#embarquesView').hidden = session.role !== 'embarques';
  document.querySelector('#adminView').hidden = session.role !== 'admin';
    productionSection.hidden = false;
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  const accountEntry = Object.entries(ACCOUNTS).find(([, account]) => account.user === loginUser.value.trim() && account.password === loginPassword.value);
  if (!accountEntry) {
    loginFeedback.textContent = 'Usuario o contraseña incorrectos.';
    return;
  }
  const session = { role: accountEntry[0], user: accountEntry[1].user };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  loginFeedback.textContent = '';
  loginForm.reset();
  applySession(session);
});

togglePassword.addEventListener('click', () => {
  const visible = loginPassword.type === 'text';
  loginPassword.type = visible ? 'password' : 'text';
  togglePassword.textContent = visible ? 'Ver' : 'Ocultar';
  togglePassword.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  togglePassword.setAttribute('aria-pressed', String(!visible));
});

logoutButton.addEventListener('click', () => {
  localStorage.removeItem(SESSION_KEY);
  applySession(null);
  loginUser.focus();
});
document.querySelectorAll('.filter-tab').forEach(tab => tab.addEventListener('click', () => {
  receivingFilter = tab.dataset.filter;
  document.querySelectorAll('.filter-tab').forEach(item => item.classList.toggle('active', item === tab));
  renderReceiving();
}));
shippingOrderSelect.addEventListener('change', renderShipping);
adminContainerSelect.addEventListener('change', renderAdmin);
shippingEvidence.addEventListener('change', () => {
  if (shippingEvidence.files.length > 20) {
    shippingFeedback.textContent = 'Solo puedes seleccionar hasta 20 fotos o videos.';
    shippingFeedback.style.color = '#cf4d2e';
    shippingEvidence.value = '';
    evidenceCount.textContent = '0 de 20 archivos seleccionados';
    return;
  }
  evidenceCount.textContent = `${shippingEvidence.files.length} de 20 archivos seleccionados`;
  shippingFeedback.textContent = '';
});
shippingQueue.addEventListener('click', event => {
  const item = event.target.closest('[data-select-shipping]');
  if (!item) return;
  const record = records.find(entry => entry.id === item.dataset.selectShipping);
  if (!record) return;
  shippingCode.value = record.code;
  shippingPo.value = record.productionOrder || '';
  shippingPanels.value = record.quantityPanels || '';
  shippingMaterial.value = record.material || '';
  shippingSpecification.value = record.specification || '';
  shippingPurchaseOrder.value = record.purchaseOrder || '';
  shippingLotNumber.value = record.lotNumber || '';
  shippingPalletType.value = record.palletType || '';
  shippingQuantitySheets.value = record.quantitySheets || '';
});
shippingForm.addEventListener('submit', event => {
  event.preventDefault();
  const code = shippingCode.value.trim().toUpperCase();
  const po = shippingPo.value.trim();
  const panels = Number(shippingPanels.value);
  const record = records.find(entry => entry.code === code && entry.status === 'received');
  if (!record) { shippingFeedback.textContent = 'No existe un pallet recibido con ese Item ID.'; shippingFeedback.style.color = '#cf4d2e'; return; }
  const checks = [
    ['Producción / PO', record.productionOrder, po],
    ['cantidad de paneles', record.quantityPanels, panels],
    ['material', record.material, shippingMaterial.value.trim()],
    ['especificación', record.specification, shippingSpecification.value.trim()],
    ['orden de compra', record.purchaseOrder, shippingPurchaseOrder.value.trim()],
    ['lote', record.lotNumber, shippingLotNumber.value.trim()],
    ['tipo de pallet', record.palletType, shippingPalletType.value.trim().toLowerCase()],
    ['cantidad por caja', record.quantitySheets, shippingQuantitySheets.value.trim()]
  ];
  const mismatch = checks.find(([label, expected, actual]) => String(expected || '').trim().toLowerCase() !== String(actual || '').trim().toLowerCase());
  if (mismatch) {
    shippingFeedback.textContent = `La ${mismatch[0]} no coincide con la información registrada en Paneles.`;
    shippingFeedback.style.color = '#cf4d2e';
    return;
  }
  record.status = 'shipped';
  record.shippedAt = new Date().toISOString();
  record.evidence = Array.from(shippingEvidence.files).map(file => ({ name: file.name, type: file.type, size: file.size }));
  saveRecords();
  sendToGoogleSheets('EMBARQUE', record);
  shippingForm.reset();
  evidenceCount.textContent = '0 de 20 archivos seleccionados';
  shippingFeedback.textContent = `${code} corroborado y marcado como embarcado.`;
  shippingFeedback.style.color = '#138a72';
  render();
});
function populateShippingQr(value) {
  if (!value.includes('|') && !value.includes(':')) {
    shippingCode.value = value.trim();
    return;
  }
  const aliases = { itemid: shippingCode, item: shippingCode, po: shippingPo, productionordernumber: shippingPo, productionpo: shippingPo, quantitypanels: shippingPanels, panels: shippingPanels, panelesperpallet: shippingPanels, material: shippingMaterial, specification: shippingSpecification, purchaseorder: shippingPurchaseOrder, purchaseordernumber: shippingPurchaseOrder, lot: shippingLotNumber, lotnumber: shippingLotNumber, pallettype: shippingPalletType, quantitybox: shippingQuantitySheets, stdquantityperbox: shippingQuantitySheets, quantity: shippingQuantitySheets };
  value.split('|').forEach(part => {
    const separator = part.indexOf(':');
    if (separator < 0) return;
    const target = aliases[part.slice(0, separator).trim().toLowerCase().replace(/[^a-z]/g, '')];
    if (target) target.value = part.slice(separator + 1).trim();
  });
}

shippingScanButton.addEventListener('click', async () => {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    shippingFeedback.textContent = 'Este navegador no admite cámara directa. Pega el contenido del QR en Item ID.';
    shippingFeedback.style.color = '#cf4d2e';
    shippingCode.focus();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    shippingScannerVideo.srcObject = stream;
    shippingScannerVideo.hidden = false;
    shippingScanButton.textContent = 'Apunta al QR';
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const scan = async () => {
      if (shippingScannerVideo.hidden) return;
      const codes = await detector.detect(shippingScannerVideo).catch(() => []);
      if (codes.length) {
        populateShippingQr(codes[0].rawValue);
        stream.getTracks().forEach(track => track.stop());
        shippingScannerVideo.hidden = true;
        shippingScanButton.textContent = '▣ Escanear QR';
        shippingFeedback.textContent = 'QR leído. Verifica los datos y confirma el embarque.';
        shippingFeedback.style.color = '#138a72';
        return;
      }
      requestAnimationFrame(scan);
    };
    scan();
  } catch (error) {
    shippingFeedback.textContent = 'No fue posible abrir la cámara.';
    shippingFeedback.style.color = '#cf4d2e';
  }
});

shippingCode.addEventListener('input', () => {
  if (shippingCode.value.includes('|') || shippingCode.value.includes(':')) populateShippingQr(shippingCode.value);
});
document.addEventListener('click', event => {
  const editPoButton = event.target.closest('[data-edit-po]');
  if (editPoButton) {
    productionFilter.value = editPoButton.dataset.editPo === 'Sin PO' ? '' : editPoButton.dataset.editPo;
    render();
    document.querySelector('#historySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const editButton = event.target.closest('[data-edit-record]');
  if (editButton) {
    const record = records.find(item => item.id === editButton.dataset.editRecord);
    if (!record) return;
    const productionOrder = window.prompt('Producción / PO:', record.productionOrder || '');
    if (productionOrder === null) return;
    const quantityPanels = window.prompt('Paneles por pallet:', record.quantityPanels || '');
    if (quantityPanels === null) return;
    const palletType = window.prompt('Tipo: simple-b, simple, doble o boxes:', record.palletType || 'simple');
    if (palletType === null || !['simple-b', 'simple-t', 'simple', 'doble', 'boxes'].includes(palletType.trim().toLowerCase())) return;
    record.productionOrder = productionOrder.trim();
    record.quantityPanels = quantityPanels.trim();
    record.palletType = palletType.trim().toLowerCase();
    const palletsThickness = window.prompt('Pallets de 2.5" o 5":', record.palletsThickness || '');
    if (palletsThickness === null || !['2.5"', '5"'].includes(palletsThickness.trim())) return;
    record.palletsThickness = palletsThickness.trim();
    saveRecords();
    sendToGoogleSheets('EDICION', record);
    render();
    return;
  }
  const button = event.target.closest('[data-receive]');
  if (!button) return;
  const record = records.find(item => item.id === button.dataset.receive);
  if (!record) return;
  record.status = 'received';
  record.receivedAt = new Date().toISOString();
  saveRecords();
  sendToGoogleSheets('RECEPCION', record);
  render();
});

scanButton.addEventListener('click', async () => {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    feedback.textContent = 'Este navegador no admite escaneo directo. Pega el contenido del QR en el campo.';
    feedback.style.color = '#cf4d2e';
    codeInput.focus();
    return;
  }
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scannerVideo.srcObject = scannerStream;
    scannerVideo.hidden = false;
    scanButton.textContent = 'Apunta la cámara al código QR';
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const scan = async () => {
      if (scannerVideo.hidden) return;
      try {
        const codes = await detector.detect(scannerVideo);
        if (codes.length) {
          populateFromScannedValue(codes[0].rawValue);
          scannerStream.getTracks().forEach(track => track.stop());
          scannerVideo.hidden = true;
          scanButton.textContent = '▣ Escanear con cámara';
          feedback.textContent = 'Código QR leído. Revisa los datos y registra la salida.';
          feedback.style.color = '#138a72';
          return;
        }
      } catch (error) { /* La cámara puede perder foco mientras se escanea. */ }
      requestAnimationFrame(scan);
    };
    scan();
  } catch (error) {
    feedback.textContent = 'No fue posible abrir la cámara. Puedes ingresar el código manualmente.';
    feedback.style.color = '#cf4d2e';
  }
});

document.querySelector('#clearButton').addEventListener('click', () => {
  if (!records.length || !window.confirm('¿Deseas eliminar todos los registros de este dispositivo?')) return;
  records = [];
  localStorage.removeItem(STORAGE_KEY);
  feedback.textContent = 'Historial limpiado.';
  feedback.style.color = '#486581';
  render();
});
document.querySelector('#clearButtonReceiving').addEventListener('click', () => {
  if (!records.length || !window.confirm('¿Deseas eliminar todos los registros de este dispositivo?')) return;
  records = [];
  localStorage.removeItem(STORAGE_KEY);
  render();
});

render();
applySession(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'));
