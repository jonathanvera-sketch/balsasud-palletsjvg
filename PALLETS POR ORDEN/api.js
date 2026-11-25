/* ============================================================
   BALSASUD · CAPA DE ACCESO A DATOS (API)
   Abstrae el backend actual (Netlify + Google Apps Script) para
   facilitar la futura migración a Supabase.
   ============================================================ */
(function () {
  'use strict';

  const API_ENDPOINT = '/.netlify/functions/google-sheets';
  const TOKEN_KEY = 'balsasud.token.v1';
  const OFFLINE_QUEUE_KEY = 'balsasud.offline.queue.v1';

  /* ---------------- utilidades ---------------- */

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function fetchJson(action, payload, options) {
    const opts = options || {};
    const token = opts.noAuth ? null : getToken();
    const body = JSON.stringify({
      action: action,
      payload: payload || {},
      sessionToken: token
    });

    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    };

    let resp;
    try {
      resp = await fetch(API_ENDPOINT, fetchOptions);
    } catch (e) {
      if (!opts.noQueue && canQueue(action)) {
        queueAction(action, payload);
        return { ok: true, queued: true, offline: true };
      }
      throw new Error('Sin conexión con el servidor. ' + e.message);
    }

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { ok: false, error: text }; }

    if (!resp.ok || !data.ok) {
      const err = new Error(data.error || 'Error del servidor');
      err.status = resp.status;
      err.data = data;
      if (resp.status === 401) clearToken();
      throw err;
    }

    return data;
  }

  /* ---------------- cola offline ---------------- */

  function canQueue(action) {
    return ['releases.create', 'inspections.create', 'inspections.update'].indexOf(action) >= 0;
  }

  function readQueue() {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeQueue(queue) {
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  }

  function queueAction(action, payload) {
    const queue = readQueue();
    queue.push({ id: uid(), action: action, payload: payload, createdAt: new Date().toISOString() });
    writeQueue(queue);
  }

  async function syncQueue() {
    const queue = readQueue();
    if (!queue.length) return { synced: 0 };
    const remaining = [];
    let synced = 0;
    for (let i = 0; i < queue.length; i++) {
      try {
        await fetchJson(queue[i].action, queue[i].payload, { noQueue: true });
        synced++;
      } catch (e) {
        remaining.push(queue[i]);
      }
    }
    writeQueue(remaining);
    return { synced: synced, pending: remaining.length };
  }

  function getQueue() { return readQueue(); }

  /* ---------------- autenticación ---------------- */

  async function login(username, password) {
    const result = await fetchJson('auth.login', { username: username, password: password }, { noAuth: true });
    if (result.ok && result.data && result.data.token) {
      setToken(result.data.token);
      return result.data.user;
    }
    throw new Error(result.error || 'No se pudo iniciar sesión');
  }

  async function logout() {
    try { await fetchJson('auth.logout', {}); } catch (e) {}
    clearToken();
  }

  async function me() {
    return (await fetchJson('auth.me', {})).data;
  }

  function isLoggedIn() { return !!getToken(); }

  /* ---------------- usuarios ---------------- */

  async function listUsers() { return (await fetchJson('users.list', {})).data; }
  async function createUser(user) { return (await fetchJson('users.create', user)).data; }
  async function updateUser(user) { return (await fetchJson('users.update', user)).data; }
  async function deleteUser(userId) { return (await fetchJson('users.delete', { userId: userId })).data; }

  /* ---------------- embarques ---------------- */

  async function listShipments() { return (await fetchJson('shipments.list', {})).data; }
  async function getShipment(shipmentId) { return (await fetchJson('shipments.get', { shipmentId: shipmentId })).data; }
  async function createShipment(payload) { return (await fetchJson('shipments.create', payload)).data; }
  async function updateShipment(payload) { return (await fetchJson('shipments.update', payload)).data; }
  async function activateShipment(shipmentId) { return (await fetchJson('shipments.activate', { shipmentId: shipmentId })).data; }
  async function closeShipment(shipmentId) { return (await fetchJson('shipments.close', { shipmentId: shipmentId })).data; }

  /* ---------------- documentos ---------------- */

  async function uploadDocument(payload) { return (await fetchJson('documents.upload', payload)).data; }

  /* ---------------- liberaciones ---------------- */

  async function listReleases(shipmentId) {
    return (await fetchJson('releases.list', { shipmentId: shipmentId || '' })).data;
  }
  async function createRelease(payload) { return (await fetchJson('releases.create', payload)).data; }

  /* ---------------- inspecciones ---------------- */

  async function listInspections(opts) { return (await fetchJson('inspections.list', opts || {})).data; }
  async function getInspection(inspectionId) { return (await fetchJson('inspections.get', { inspectionId: inspectionId })).data; }
  async function createInspection(payload) { return (await fetchJson('inspections.create', payload)).data; }
  async function updateInspection(payload) { return (await fetchJson('inspections.update', payload)).data; }
  async function finalizeInspection(inspectionId) { return (await fetchJson('inspections.finalize', { inspectionId: inspectionId })).data; }
  async function finalizePT(shipmentId) { return (await fetchJson('shipments.finalizePT', { shipmentId: shipmentId })).data; }
  async function finalizeQuality(shipmentId) { return (await fetchJson('shipments.finalizeQuality', { shipmentId: shipmentId })).data; }

  /* ---------------- jefe de embarque ---------------- */

  async function jefeList() { return (await fetchJson('jefe.list', {})).data; }
  async function jefeAutorizar(payload) { return (await fetchJson('jefe.autorizar', payload)).data; }
  async function jefeRechazar(payload) { return (await fetchJson('jefe.rechazar', payload)).data; }
  async function jefeEmbarcar(payload) { return (await fetchJson('jefe.embarcar', payload)).data; }
  async function jefeFila(payload) {
    if (payload.file) {
      const base64 = await fileToBase64(payload.file);
      return (await fetchJson('jefe.fila', { shipmentId: payload.shipmentId, fila: payload.fila, releaseIds: payload.releaseIds, contenedor: payload.contenedor, observaciones: payload.observaciones, base64: base64, mimeType: payload.file.type || 'image/jpeg' })).data;
    }
    return (await fetchJson('jefe.fila', { shipmentId: payload.shipmentId, fila: payload.fila, releaseIds: payload.releaseIds, contenedor: payload.contenedor, observaciones: payload.observaciones })).data;
  }
  async function jefeActaFinal(shipmentId) { return (await fetchJson('jefe.actaFinal', { shipmentId: shipmentId })).data; }

  /* ---------------- dashboard / auditoría ---------------- */

  async function dashboardKpi() { return (await fetchJson('dashboard.kpi', {})).data; }
  async function listAudit(limit) { return (await fetchJson('audit.list', { limit: limit || 500 })).data; }
  async function getConfig() { return (await fetchJson('config.get', {})).data; }
  async function setConfig(payload) { return (await fetchJson('config.set', payload)).data; }

  /* ---------------- helpers de archivos ---------------- */

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadTally(shipmentId, file) {
    const base64 = await fileToBase64(file);
    return uploadDocument({
      shipmentId: shipmentId,
      type: 'tally',
      name: file.name,
      base64: base64,
      mimeType: file.type || 'application/pdf'
    });
  }

  async function uploadDetail(shipmentId, file) {
    const base64 = await fileToBase64(file);
    return uploadDocument({
      shipmentId: shipmentId,
      type: 'detalle_embarque',
      name: file.name,
      base64: base64,
      mimeType: file.type || 'application/pdf'
    });
  }

  /* ---------------- exposición ---------------- */

  window.BalsasudAPI = {
    // config
    endpoint: API_ENDPOINT,
    // auth
    login: login,
    logout: logout,
    me: me,
    isLoggedIn: isLoggedIn,
    // users
    listUsers: listUsers,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    // shipments
    listShipments: listShipments,
    getShipment: getShipment,
    createShipment: createShipment,
    updateShipment: updateShipment,
    activateShipment: activateShipment,
    closeShipment: closeShipment,
    // documents
    uploadDocument: uploadDocument,
    uploadTally: uploadTally,
    uploadDetail: uploadDetail,
    // releases
    listReleases: listReleases,
    createRelease: createRelease,
    // inspections
    listInspections: listInspections,
    getInspection: getInspection,
    createInspection: createInspection,
    updateInspection: updateInspection,
    finalizeInspection: finalizeInspection,
    finalizePT: finalizePT,
    finalizeQuality: finalizeQuality,
    // jefe de embarque
    jefeList: jefeList,
    jefeAutorizar: jefeAutorizar,
    jefeRechazar: jefeRechazar,
    jefeEmbarcar: jefeEmbarcar,
    jefeFila: jefeFila,
    jefeActaFinal: jefeActaFinal,
    // dashboard / audit
    dashboardKpi: dashboardKpi,
    listAudit: listAudit,
    getConfig: getConfig,
    setConfig: setConfig,
    // offline
    syncQueue: syncQueue,
    getQueue: getQueue,
    // utils
    fileToBase64: fileToBase64
  };
})();
