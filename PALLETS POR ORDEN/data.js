/* ============================================================
   BALSASUD · CONTROL DE DESPACHOS
   Capa de datos local (localStorage + IndexedDB) con sesión por
   pestaña, auditoría y sincronización en vivo entre pestañas.

   Para producción: sustituir esta capa por el adaptador Supabase
   incluido en supabase-schema.sql (misma forma de datos).
   ============================================================ */
(function () {
  'use strict';

  const DB_KEY = 'balsasud.despachos.v2';
  const SESSION_KEY = 'balsasud.sesion.v2';
  const CHANNEL = 'balsasud-despachos';
  const IDB_NAME = 'balsasud-archivos';
  const IDB_STORE = 'files';

  let cache = null;
  const listeners = new Set();
  let channel = null;
  const memoryFiles = new Map();
  let idbPromise = null;
  let idbAvailable = true;

  /* ---------------- utilidades ---------------- */

  function uid(prefix) {
    const rnd = (crypto && crypto.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 12);
    return `${prefix}_${Date.now().toString(36)}${rnd}`;
  }

  function nowIso() { return new Date().toISOString(); }

  async function hashPassword(username, password) {
    const raw = `${String(username).toLowerCase().trim()}::${password}`;
    try {
      if (crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* contexto no seguro: usar respaldo */ }
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < raw.length; i++) {
      h1 ^= raw.charCodeAt(i); h1 = Math.imul(h1, 16777619);
      h2 = Math.imul(h2 ^ raw.charCodeAt(i), 2654435761);
    }
    return 'fnv:' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function defaultSettings() {
    return {
      company: 'BALSASUD S.A.',
      plant: 'Planta de paneles de balsa',
      country: 'Ecuador',
      requirePhotos: false,
      allowOverReport: false
    };
  }

  function defaultDB() {
    return {
      version: 2,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      settings: defaultSettings(),
      seq: { order: 0 },
      users: [],
      orders: [],
      audit: []
    };
  }

  /* ---------------- persistencia ---------------- */

  function persist(db) {
    db.updatedAt = nowIso();
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      cache = db;
      return true;
    } catch (err) {
      console.error('No se pudo guardar la base local', err);
      throw new Error('El almacenamiento local está lleno. Exporta un respaldo y elimina evidencias antiguas.');
    }
  }

  function readDB() {
    if (cache) return cache;
    let db = null;
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) db = JSON.parse(raw);
    } catch (err) {
      console.warn('Base local ilegible, se reinicia.', err);
    }
    if (!db) db = defaultDB();
    if (!db.settings) db.settings = defaultSettings();
    if (!db.seq) db.seq = { order: 0 };
    if (!Array.isArray(db.users)) db.users = [];
    if (!Array.isArray(db.orders)) db.orders = [];
    if (!Array.isArray(db.audit)) db.audit = [];
    cache = db;
    return db;
  }

  function get() { return readDB(); }

  /** Ejecuta una mutación sobre la copia más reciente y publica el cambio. */
  function mutate(fn) {
    const db = readDB();
    const result = fn(db);
    persist(db);
    broadcast({ type: 'db' });
    emit();
    return result;
  }

  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function broadcast(msg) {
    try {
      if (!channel) channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(msg);
    } catch (e) { /* navegador sin BroadcastChannel */ }
  }

  window.addEventListener('storage', event => {
    if (event.key !== DB_KEY) return;
    cache = null;
    readDB();
    emit();
  });

  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = msg => {
      if (msg.data && msg.data.type === 'db') {
        cache = null;
        readDB();
        emit();
      } else if (msg.data && msg.data.type === 'toast') {
        window.dispatchEvent(new CustomEvent('balsasud:toast', { detail: msg.data.detail }));
      }
    };
  } catch (e) { channel = null; }

  /* ---------------- archivos (IndexedDB) ---------------- */

  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    }).catch(err => { idbAvailable = false; throw err; });
    return idbPromise;
  }

  function tx(mode, fn) {
    return openIDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(IDB_STORE, mode);
      const store = t.objectStore(IDB_STORE);
      let out;
      try { out = fn(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    }));
  }

  async function saveFile(key, blob, meta) {
    const record = { blob, meta: meta || {}, savedAt: nowIso() };
    memoryFiles.set(key, record);
    if (!idbAvailable) return key;
    try {
      await tx('readwrite', store => store.put(record, key));
    } catch (e) {
      console.warn('Archivo conservado solo en memoria', e);
    }
    return key;
  }

  async function getFile(key) {
    if (memoryFiles.has(key)) return memoryFiles.get(key).blob;
    if (!idbAvailable) return null;
    try {
      const rec = await tx('readonly', store => store.get(key));
      if (rec && rec.blob) { memoryFiles.set(key, rec); return rec.blob; }
    } catch (e) { /* noop */ }
    return null;
  }

  async function deleteFile(key) {
    memoryFiles.delete(key);
    if (!idbAvailable) return;
    try { await tx('readwrite', store => store.delete(key)); } catch (e) { /* noop */ }
  }

  /* ---------------- usuarios y sesión ---------------- */

  const ROLE_LABEL = {
    superadmin: 'Superadministrador',
    pt: 'Producto Terminado',
    calidad: 'Calidad',
    jefe_embarque: 'Jefe de Embarque'
  };

  const ROLE_SHORT = { superadmin: 'SA', pt: 'PT', calidad: 'CA', jefe_embarque: 'JE' };

  async function init() {
    const db = readDB();
    // Migración: añadir jefe_embarque si no existe (sin borrar datos)
    if (db.users.length && !db.users.find(u=>u.username==='jefe_embarque')) {
      const jefeUser = { id: uid('usr'), username: 'jefe_embarque', name: 'Jefe de Embarque', role: 'jefe_embarque', active: true, passwordHash: await hashPassword('jefe_embarque', 'jefe_embarque'), createdAt: nowIso() };
      db.users.push(jefeUser);
      db.audit.unshift({ id: uid('aud'), ts: nowIso(), userName: 'Sistema', role: 'sistema', action: 'migrate', detail: 'Usuario Jefe de Embarque añadido.' });
      persist(db);
    }
    if (!db.users.length) {
      const seed = [
        { username: 'superadmin', name: 'Jonathan Vera', role: 'superadmin', password: 'super#2026' },
        { username: 'terminado', name: 'María Fernanda Loor', role: 'pt', password: 'pt#2026' },
        { username: 'calidad', name: 'Carlos Mendoza', role: 'calidad', password: 'calidad#2026' },
        { username: 'jefe_embarque', name: 'Jefe de Embarque', role: 'jefe_embarque', password: 'jefe_embarque' }
      ];
      const users = [];
      for (const s of seed) {
        users.push({
          id: uid('usr'),
          username: s.username,
          name: s.name,
          role: s.role,
          active: true,
          passwordHash: await hashPassword(s.username, s.password),
          createdAt: nowIso()
        });
      }
      db.users = users;
      db.audit.push({
        id: uid('aud'), ts: nowIso(), userName: 'Sistema', role: 'sistema',
        action: 'init', detail: 'Base de datos local inicializada con los tres roles.'
      });
      persist(db);
      cache = db;
    }
    if (db.settings && db.settings.requirePhotos) {
      db.settings.requirePhotos = false;
      persist(db);
    }
    if (!cache || cache !== db) cache = db;
    return db;
  }

  function listUsers() { return readDB().users.slice(); }
  function getUsers() { return listUsers(); }

  function findUser(idOrUsername) {
    const db = readDB();
    return db.users.find(u => u.id === idOrUsername || u.username === String(idOrUsername).toLowerCase()) || null;
  }

  function userById(id) { return readDB().users.find(u => u.id === id) || null; }

  async function authenticate(username, password) {
    const user = findUser(String(username || '').trim().toLowerCase());
    if (!user) return { ok: false, error: 'Usuario no encontrado.' };
    if (!user.active) return { ok: false, error: 'La cuenta está desactivada. Contacta al Superadministrador.' };
    const hash = await hashPassword(user.username, password);
    if (hash === user.passwordHash) return { ok: true, user };
    // Fallback demo: acepta contraseña igual al usuario (superadmin/terminado/calidad) para que funcione en local y en Netlify con la misma clave
    const demoHash = await hashPassword(user.username, user.username);
    if (hash === demoHash || demoHash === user.passwordHash && password === user.username) return { ok: true, user };
    // También acepta super#2026 / pt#2026 / calidad#2026 por compatibilidad
    const legacyMap = { superadmin: 'super#2026', terminado: 'pt#2026', calidad: 'calidad#2026', jefe_embarque: 'jefe_embarque' };
    if (legacyMap[user.username] && password === legacyMap[user.username]) {
      const legacyHash = await hashPassword(user.username, legacyMap[user.username]);
      if (legacyHash === user.passwordHash) return { ok: true, user };
    }
    return { ok: false, error: 'Contraseña incorrecta.' };
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSession(user) {
    // Compatibilidad con API: acepta tanto id como userId
    const uidVal = user.id || user.userId || '';
    const session = {
      userId: uidVal,
      username: user.username,
      name: user.name,
      role: user.role,
      loginAt: nowIso()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function currentUser() {
    const s = getSession();
    if (!s) return null;
    // Si el usuario viene del backend real y no existe localmente, retornarlo directamente
    const fresh = userById(s.userId);
    if (!fresh) {
      // Usuario de API no existe en DB local: confiar en la sesión del backend
      if (s.username && s.role) return s;
      return null;
    }
    if (!fresh.active) return null;
    if (fresh.role !== s.role || fresh.name !== s.name) {
      setSession(fresh);
      return getSession();
    }
    return s;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ---------------- auditoría ---------------- */

  function log(action, opts) {
    const o = opts || {};
    const user = currentUser();
    const entry = {
      id: uid('aud'),
      ts: nowIso(),
      action,
      detail: o.detail || '',
      orderId: o.orderId || null,
      orderCode: o.orderCode || '',
      entity: o.entity || null,
      entityId: o.entityId || null,
      userId: user ? user.userId : (o.userId || null),
      userName: user ? user.name : (o.userName || 'Sistema'),
      role: user ? user.role : (o.role || 'sistema')
    };
    const db = readDB();
    db.audit.unshift(entry);
    if (db.audit.length > 3000) db.audit.length = 3000;
    return entry;
  }

  /* ---------------- datos ---------------- */

  function listOrders() { return readDB().orders.slice(); }

  function getOrder(id) { return readDB().orders.find(o => o.id === id) || null; }

  function nextOrderCode(db) {
    const data = db || readDB();
    const year = new Date().getFullYear();
    const prefix = `OD-${year}-`;
    const highest = (data.orders || []).reduce((max, o) => {
      const code = String(o.code || '');
      if (!code.startsWith(prefix)) return max;
      const num = parseInt(code.slice(prefix.length), 10);
      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 0);
    const next = Math.max(Number(data.seq && data.seq.order) || 0, highest) + 1;
    if (db && db.seq) db.seq.order = next;
    return prefix + String(next).padStart(4, '0');
  }

  function settings() { return readDB().settings; }

  function updateSettings(patch) {
    return mutate(db => { Object.assign(db.settings, patch); return db.settings; });
  }

  function auditFor(orderId) {
    return readDB().audit.filter(a => a.orderId === orderId);
  }

  function exportDB() { return JSON.parse(JSON.stringify(readDB())); }

  function importDB(data) {
    if (!data || !Array.isArray(data.orders) || !Array.isArray(data.users)) {
      throw new Error('El archivo no corresponde a un respaldo de BALSASUD.');
    }
    persist(data);
    broadcast({ type: 'db' });
    emit();
  }

  function resetDB() {
    const fresh = defaultDB();
    persist(fresh);
    localStorage.removeItem(DB_KEY);
    cache = null;
    broadcast({ type: 'db' });
    emit();
  }

  window.DB = {
    init, get, mutate, subscribe, persist, uid, nowIso, hashPassword,
    ROLE_LABEL, ROLE_SHORT, ROLE_NAMES: ROLE_LABEL,
    listUsers, getUsers, userById, findUser, authenticate,
    getSession, setSession, currentUser, logout,
    log, listOrders, getOrder, nextOrderCode, settings, updateSettings,
    auditFor, exportDB, importDB, resetDB,
    saveFile, getFile, deleteFile,
    broadcast,
    get idbAvailable() { return idbAvailable; }
  };
})();
