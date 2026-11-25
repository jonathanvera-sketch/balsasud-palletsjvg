/* ============================================================
   BALSASUD · CONTROL, CONCILIACIÓN Y LIBERACIÓN DE DESPACHOS
   Aplicación PWA local-first. Tres roles, un solo flujo.
   ============================================================ */
(function () {
  'use strict';

  const { DB, Engine, Tally, UI } = window;
  const view = document.getElementById('view');

  const state = {
    route: { name: 'panel', id: null },
    orderTab: 'resumen',
    qualityFilter: 'todos',
    order: null,
    palletForm: null,
    draft: null,
    pendingTallyFile: null,
    extractedText: '',
    extractedWarnings: [],
    pendingPhotos: [],
    photoPreviewUrls: [],
    filters: {
      orderQ: '', orderStatus: '', orderClient: '',
      palletQ: '', palletOrder: '', palletQuality: '', palletThickness: '',
      concQ: ''
    },
    reportOrderId: '',
    nextOrderTab: null,
    editingUserId: null,
    lastRouteKey: '',
    refreshing: false
  };

  const CALLBACKS = {};
  let clockTimer = null;
  let realtimeTimer = null;
  let realtimeUnsub = null;
  let lastSeenPalletIds = new Set();

  /* ---------------- navidad (01-31 dic + carta 23/24 dic) ---------------- */

  const XMAS_MESSAGES = {
    2026: {
      23: { title: 'Víspera de Navidad — Gracias por tu compromiso', body: 'Hoy 23 de diciembre celebramos a quienes hacen posible cada despacho. Gracias, {nombre}, por tu rigor en cada pallet, por tu cuidado en cada detalle y por representar a BALSASUD con profesionalismo. Que esta Navidad te encuentre rodeado de quienes más quieres. ¡Felices fiestas!' },
      24: { title: '¡Feliz Nochebuena, {nombre}!', body: 'En esta Nochebuena queremos agradecerte por ser parte de la familia BALSASUD. Que tu hogar se llene de paz, tu mesa de alegría y tu corazón de esperanza. ¡Feliz Navidad y próspero 2027! — Gerencia BALSASUD S.A.' },
      25: { title: '¡Feliz Navidad, {nombre}!', body: 'Hoy 25 de diciembre celebramos la Navidad y queremos desearte un día lleno de paz, amor y unión familiar. Gracias por ser parte de BALSASUD. ¡Feliz Navidad y un próspero 2027!' }
    },
    2027: {
      23: { title: '23 de diciembre — Un año más juntos', body: 'Querido {nombre}, cerramos otro año de trabajo en equipo, trazabilidad y confianza. Tu aporte diario hace que BALSASUD siga creciendo. Que disfrutes estas fiestas con orgullo por lo logrado. ¡Feliz Navidad!' },
      24: { title: 'Nochebuena 2027 — Felicidades, {nombre}', body: 'Que la Nochebuena ilumine tu hogar y el 2028 llegue con salud y nuevos logros. Gracias por ser parte de BALSASUD. ¡Feliz Navidad!' },
      25: { title: '25 de diciembre 2027 — ¡Feliz Navidad, {nombre}!', body: 'En este día de Navidad, {nombre}, queremos desearte alegría, paz y unión en familia. Gracias por tu dedicación a BALSASUD. ¡Feliz Navidad y próspero 2028!' }
    },
    2028: {
      23: { title: '23 dic 2028 — Gracias, {nombre}', body: 'A pocos días de Navidad, queremos reconocer tu dedicación durante todo el año. Cada despacho trazable lleva tu sello. ¡Que pases unas fiestas llenas de alegría!' },
      24: { title: '24 dic 2028 — Feliz Nochebuena', body: '¡Feliz Nochebuena, {nombre}! Que esta noche sea de unión y gratitud. De parte de BALSASUD, nuestros mejores deseos para ti y tu familia. ¡Feliz Navidad!' },
      25: { title: '25 de diciembre 2028 — Feliz Navidad', body: 'Hoy celebramos la Navidad, {nombre}. Que tu día esté lleno de bendiciones, amor y momentos inolvidables. Gracias por ser parte de BALSASUD. ¡Feliz Navidad y un próspero 2029!' }
    }
  };
  // Período navideño configurable (meses base 0). Cambiar cada año si se desea.
  const XMAS_PERIOD = { startMonth: 10, startDay: 15, endMonth: 11, endDay: 31 };
  function xmasDefaultForYear(y) {
    return {
      23: { title: `23 de diciembre ${y} — Felices fiestas, {nombre}`, body: `¡Felices fiestas, {nombre}! Gracias por tu trabajo diario en BALSASUD. Que esta Navidad te regale descanso, alegría y buenos momentos en familia.` },
      24: { title: `¡Feliz Nochebuena ${y}, {nombre}!`, body: `En esta Nochebuena, {nombre}, toda la familia BALSASUD te desea paz y felicidad. ¡Feliz Navidad y próspero ${y+1}!` },
      25: { title: `¡Feliz Navidad ${y}, {nombre}!`, body: `Hoy 25 de diciembre celebramos la Navidad, {nombre}. Gracias por ser parte de BALSASUD. Te deseamos un día de paz, amor y unión familiar. ¡Feliz Navidad y próspero ${y+1}!` }
    };
  }
  function isXmasSeason(d) {
    const dd = d || new Date();
    const y = dd.getFullYear();
    const start = new Date(y, XMAS_PERIOD.startMonth, XMAS_PERIOD.startDay, 0, 0, 0);
    const end = new Date(y, XMAS_PERIOD.endMonth, XMAS_PERIOD.endDay, 23, 59, 59);
    return dd >= start && dd <= end;
  }
  function applyXmasTheme() {
    const on = isXmasSeason(new Date());
    document.body.classList.toggle('christmas', on);
    if (!on) { const el = document.getElementById('xmasSnow'); if (el) el.remove(); return; }
    if (document.getElementById('xmasSnow')) return;
    const snow = document.createElement('div'); snow.id = 'xmasSnow'; snow.className = 'xmas-snow'; snow.setAttribute('aria-hidden','true');
    const glyphs = ['❄','❅','❆','•'];
    for (let i=0;i<22;i++) {
      const s = document.createElement('i'); s.textContent = glyphs[Math.floor(Math.random()*glyphs.length)];
      s.style.left = (Math.random()*100)+'%'; s.style.fontSize = (10+Math.random()*12)+'px';
      s.style.animationDuration = (7+Math.random()*9)+'s'; s.style.animationDelay = (Math.random()*6)+'s'; s.style.opacity = String(0.5+Math.random()*0.5);
      snow.appendChild(s);
    }
    document.body.appendChild(snow);
  }
  function xmasCardKey(user, d) { const dd = d || new Date(); return `balsasud.xmas.${dd.getFullYear()}_${String(dd.getMonth()+1).padStart(2,'0')}_${String(dd.getDate()).padStart(2,'0')}_${user.username}`; }
  function shouldShowXmasCard(user, d) {
    const dd = d || new Date(); if (dd.getMonth()!==11 || ![23,24,25].includes(dd.getDate())) return false;
    if (!user) return false;
    try { if (localStorage.getItem(xmasCardKey(user, dd))) return false; } catch(e) {}
    return true;
  }
  function showXmasCard(user) {
    const now = new Date(); const day = now.getDate(); const year = now.getFullYear();
    const pool = XMAS_MESSAGES[year] || xmasDefaultForYear(year);
    const msg = pool[day] || pool[24];
    const title = msg.title.replace('{nombre}', user.name.split(' ')[0]);
    const body = msg.body.replace('{nombre}', user.name);
    const card = `<div class="xmas-card"><div class="xmas-card-head"><b>🎄 ${UI.esc(title)}</b><span>BALSASUD S.A. · Navidad ${year}</span></div><div class="xmas-card-body"><p>${UI.esc(body)}</p><p style="margin-top:10px; font-size:11px; color:#7a5a2a">Esta carta aparece una sola vez al día, los días 23, 24 y 25 de diciembre, y cambiará cada año.</p></div><div class="xmas-card-foot"><small>Para ti, ${UI.esc(user.name)} · ${UI.roleLabel(user.role)}</small><span style="font-size:16px">🎅🎁</span></div></div>`;
    UI.openModal({ eyebrow:'🎄 CARTA DE NAVIDAD', title: title, body: card, footer:'<button class="btn btn-primary" data-modal-close>¡Gracias! 🎄</button>' });
    try { localStorage.setItem(xmasCardKey(user, now), '1'); } catch(e) {}
  }

  /* ---------------- atajos de datos ---------------- */

  function preparedOrders() { return Engine.prepareAll(DB.listOrders()); }
  function preparedOrder(id) {
    const order = DB.getOrder(id);
    return order ? Engine.prepare(order) : null;
  }
  function actor() {
    const s = DB.currentUser();
    return s ? { id: s.userId, name: s.name, role: s.role, username: s.username } : { id: null, name: 'Sistema', role: 'sistema' };
  }
  function can(perm) {
    const s = DB.currentUser();
    if (!s) return false;
    const perms = {
      superadmin: ['order.create', 'order.edit', 'order.publish', 'order.release', 'order.ship', 'order.close', 'order.reopen', 'pallets.create', 'pallets.edit', 'quality.inspect', 'users.manage', 'data.manage', 'order.list', 'pallets.view', 'jefe.view'],
      pt: ['pallets.create', 'pallets.edit', 'order.submit', 'order.list', 'pallets.view'],
      calidad: ['quality.inspect', 'order.release', 'order.list', 'pallets.view'],
      jefe_embarque: ['jefe.view', 'order.list', 'pallets.view']
    };
    return (perms[s.role] || []).includes(perm);
  }

  /* ---------------- arranque ---------------- */

  async function boot() {
    try {
      await DB.init();
    } catch (err) {
      console.error(err);
      document.body.innerHTML = `<div class="boot-error"><h1>No se pudo iniciar BALSASUD</h1><p>${UI.esc(err.message)}</p><p>Habilita el almacenamiento local o sirve la aplicación desde un servidor HTTP.</p></div>`;
      return;
    }
    wireGlobalEvents();
    applyXmasTheme();
    if (DB.currentUser()) {
      showApp();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('appShell').hidden = true;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    const userInput = document.getElementById('loginUser');
    if (userInput) setTimeout(() => userInput.focus(), 80);
    applyXmasTheme();
  }

  function showApp() {
    const user = DB.currentUser();
    if (!user) { showLogin(); return; }
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('appShell').hidden = false;
    paintShellUser(user);
    applyPermissions();
    if (!location.hash || location.hash === '#') location.hash = '#/panel';
    renderRoute();
    startClock();
    updateNotifications();
    updateSyncState(window.BalsasudAPI && BalsasudAPI.isLoggedIn() ? 'Sincronizando con Sheets…' : 'Datos locales activos');
    startQualityRealtime();
    applyXmasTheme();
    if (shouldShowXmasCard(user)) setTimeout(()=> showXmasCard(user), 700);
    if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) hydrateFromBackend();
  }

  let hydrating = false;
  async function hydrateFromBackend() {
    if (hydrating) return;
    hydrating = true;
    try {
      updateSyncState('Sincronizando con Sheets…');
      const shipments = await BalsasudAPI.listShipments();
      if (!shipments || !shipments.length) { updateSyncState('Sin órdenes en Sheets'); return; }
      // Cargar releases e inspecciones por embarque en paralelo
      const full = await Promise.all(shipments.map(async s => {
        let details = [];
        try { const fullShip = await BalsasudAPI.getShipment(s.shipmentId); details = fullShip.details || []; } catch(e) { details = []; }
        let releases = [];
        try { releases = await BalsasudAPI.listReleases(s.shipmentId) || []; } catch(e) { releases = []; }
        let inspections = [];
        try { inspections = await BalsasudAPI.listInspections({ shipmentId: s.shipmentId }) || []; } catch(e) { inspections = []; }
        return { shipment: s, details, releases, inspections };
      }));
      DB.mutate(db => {
        full.forEach(({ shipment: s, details, releases, inspections }) => {
          const orderId = 'ord_' + s.shipmentId.replace('emb_','');
          let order = db.orders.find(o => o.id === orderId || o.code === s.code || o.op === s.op);
          const isNew = !order;
          if (isNew) {
            order = {
              id: orderId,
              code: s.code,
              op: s.op,
              purchaseOrder: String(s.purchaseOrder || ''),
              client: s.client || '',
              container: s.container || '',
              destination: s.destination || '',
              dispatchDate: s.dispatchDate ? String(s.dispatchDate).slice(0,10) : '',
              lot: String(s.lot || ''),
              seal: s.seal || '',
              notes: s.notes || '',
              items: [],
              tally: { source: 'sheets', fileName: '', extractedAt: s.createdAt },
              pallets: [],
              createdAt: s.createdAt,
              createdBy: { name: s.createdBy || 'Sheets' },
              publishedAt: s.activatedAt || s.createdAt,
              publishedBy: { name: s.activatedBy || s.createdBy || 'Sheets' },
              closedAt: s.status === 'cerrado' ? (s.closedAt || s.createdAt) : null,
              closedBy: s.closedBy ? { name: s.closedBy } : null,
              shipmentId: s.shipmentId,
              driveFolderId: s.driveFolderId || ''
            };
            db.orders.push(order);
          } else {
            // actualizar metadatos sin borrar pallets locales si ya existen
            order.code = s.code; order.op = s.op; order.client = s.client; order.purchaseOrder = String(s.purchaseOrder||'');
            order.container = s.container||''; order.destination = s.destination||''; order.lot = String(s.lot||'');
            order.seal = s.seal||''; order.notes = s.notes||'';
            if (s.dispatchDate) order.dispatchDate = String(s.dispatchDate).slice(0,10);
            order.shipmentId = s.shipmentId; order.driveFolderId = s.driveFolderId||order.driveFolderId||'';
            if (s.status === 'cerrado' && !order.closedAt) { order.closedAt = s.closedAt || DB.nowIso(); order.closedBy = s.closedBy ? { name: s.closedBy } : order.closedBy; }
            if (s.status !== 'cerrado' && order.closedAt) { order.closedAt = null; order.closedBy = null; }
            if (!order.publishedAt) { order.publishedAt = s.activatedAt || s.createdAt; order.publishedBy = { name: s.activatedBy || s.createdBy || 'Sheets' }; }
          }
          // items desde DETALLE_EMBARQUES
          if (details && details.length) {
            order.items = details.map(d => ({
              itemId: String(d.itemId||'').trim(),
              description: d.description||'',
              thickness: Engine.thicknessNumber(d.thickness),
              programmed: Number(d.programmed)||0,
              pallets: Number(d.pallets)||0,
              boxes: Number(d.boxes)||0,
              bf: Number(d.bf)||0,
              m3: Number(d.m3)||0
            }));
          }
          // pallets desde LIBERACIONES + INSPECCIONES
          if (releases && releases.length) {
            const inspByRelease = new Map();
            (inspections||[]).forEach(ins => inspByRelease.set(ins.releaseId, ins));
            order.pallets = releases.map((rel, idx) => {
              const insp = inspByRelease.get(rel.releaseId);
              const quality = insp ? {
                status: insp.status === 'finalizada' ? 'aprobado' : (insp.status === 'borrador' ? 'en_inspeccion' : 'pendiente'),
                verifiedPanels: Number(insp.approvedPanels)||0,
                rejectedPanels: Number(insp.rejectedPanels)||0,
                inspectedPanels: Number(insp.inspectedPanels)||0,
                observations: insp.observations||'',
                inspectorName: insp.inspectorName||insp.createdBy||'',
                finalizedAt: insp.finalizedAt||null,
                finalizedBy: insp.finalizedBy||null
              } : { status: 'pendiente', verifiedPanels: 0, rejectedPanels: 0, inspectedPanels: 0 };
              // intentar recuperar palletType desde PALLETS sheet no está en API listReleases; usamos fallback
              return {
                id: rel.releaseId,
                itemId: String(rel.itemId||'').trim(),
                description: (order.items.find(it=> String(it.itemId).toUpperCase()===String(rel.itemId).toUpperCase() && Engine.thicknessNumber(it.thickness)===Engine.thicknessNumber(rel.thickness))||{}).description || '',
                thickness: Engine.thicknessNumber(rel.thickness),
                panels: Number(rel.releasedPanels)||0,
                packaging: (rel.pallets && String(rel.pallets).trim()) ? 'palet' : 'caja',
                palletType: 'simple',
                bf: 0, m3: 0,
                createdAt: rel.createdAt || rel.releasedAt || DB.nowIso(),
                createdBy: rel.createdBy || s.createdBy || 'Sheets',
                quality: quality
              };
            });
          }
        });
        db.orders.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
      });
      updateSyncState('Sincronizado con Sheets ✓');
      renderRoute();
      updateNotifications();
    } catch (e) {
      console.warn('Hydrate falló', e);
      updateSyncState('Modo local — sin conexión a Sheets');
    } finally {
      hydrating = false;
      setTimeout(()=> { if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) updateSyncState('Sincronizado con Sheets ✓'); }, 4000);
    }
  }

  function updateSyncState(msg) {
    const el = document.getElementById('syncLabel');
    if (el) el.textContent = msg;
  }

  function paintShellUser(user) {
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userRole').textContent = UI.roleLabel(user.role);
    document.getElementById('userAvatar').textContent = UI.initials(user.name);
    document.getElementById('menuName').textContent = user.name;
    document.getElementById('menuUser').textContent = `@${user.username} · ${UI.roleLabel(user.role)}`;
  }

  function applyPermissions() {
    const user = DB.currentUser();
    const role = user ? user.role : '';
    document.querySelectorAll('[data-perm]').forEach(el => {
      el.hidden = !can(el.getAttribute('data-perm'));
    });
    document.body.setAttribute('data-role', role);
    // Etiquetas dinámicas por rol
    document.querySelectorAll('.nav-label-super, .nav-label-pt, .nav-label-calidad, .nav-label-jefe').forEach(el => el.style.display = 'none');
    if (role === 'superadmin') document.querySelectorAll('.nav-label-super').forEach(el => el.style.display = '');
    else if (role === 'pt') document.querySelectorAll('.nav-label-pt').forEach(el => el.style.display = '');
    else if (role === 'calidad') document.querySelectorAll('.nav-label-calidad').forEach(el => el.style.display = '');
    else if (role === 'jefe_embarque') document.querySelectorAll('.nav-label-jefe').forEach(el => el.style.display = '');
    else document.querySelectorAll('.nav-label-super').forEach(el => el.style.display = '');
  }

  function startClock() {
    if (clockTimer) clearInterval(clockTimer);
    const tick = () => {
      const el = document.getElementById('footerClock');
      if (el) el.textContent = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    };
    tick();
    clockTimer = setInterval(tick, 30000);
  }

  /* ---------------- eventos globales ---------------- */

  function wireGlobalEvents() {
    window.addEventListener('hashchange', () => {
      if (!DB.currentUser()) { showLogin(); return; }
      const route = currentRoute();
      if (route.name !== 'nueva') state.draft = null;
      state.orderTab = state.nextOrderTab || 'resumen';
      state.nextOrderTab = null;
      state.palletForm = null;
      state.pendingPhotos = [];
      state.photoPreviewUrls = [];
      renderRoute();
    });

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.querySelectorAll('[data-demo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = btn.getAttribute('data-demo');
        const creds = {
          superadmin: ['superadmin', 'superadmin'],
          pt: ['terminado', 'terminado'],
          calidad: ['calidad', 'calidad'],
          jefe_embarque: ['jefe_embarque', 'jefe_embarque']
        }[role];
        document.getElementById('loginUser').value = creds[0];
        document.getElementById('loginPassword').value = creds[1];
        document.getElementById('loginForm').requestSubmit();
      });
    });

    const toggle = document.getElementById('togglePassword');
    toggle.addEventListener('click', () => {
      const input = document.getElementById('loginPassword');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Ver' : 'Ocultar';
      toggle.setAttribute('aria-pressed', String(!showing));
    });

    document.getElementById('logoutButton') && document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('userButton').addEventListener('click', e => {
      e.stopPropagation();
      const menu = document.getElementById('userMenu');
      menu.hidden = !menu.hidden;
      document.getElementById('notifPanel').hidden = true;
    });
    document.getElementById('userMenu').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      document.getElementById('userMenu').hidden = true;
      if (action === 'logout') logout();
      if (action === 'change-password') openPasswordModal();
      if (action === 'install-app') installApp();
    });

    document.getElementById('menuButton').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('scrim').classList.toggle('show');
    });
    document.getElementById('scrim').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('scrim').classList.remove('show');
    });

    document.getElementById('notifButton').addEventListener('click', e => {
      e.stopPropagation();
      const panel = document.getElementById('notifPanel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) paintNotifications();
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#notifPanel') && !e.target.closest('#notifButton')) {
        document.getElementById('notifPanel').hidden = true;
      }
      if (!e.target.closest('#userMenu') && !e.target.closest('#userButton')) {
        document.getElementById('userMenu').hidden = true;
      }
    });

    document.getElementById('lightboxClose').addEventListener('click', UI.closeLightbox);
    document.getElementById('lightbox').addEventListener('click', e => {
      if (e.target.id === 'lightbox' || e.target.id === 'lightboxCaption') UI.closeLightbox();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('modalRoot');
        const active = UI.getActiveModal();
        if (modal && !modal.hidden && active && !active.locked) UI.closeModal();
        else if (!document.getElementById('lightbox').hidden) UI.closeLightbox();
        else {
          document.getElementById('userMenu').hidden = true;
          document.getElementById('notifPanel').hidden = true;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (state.route.name === 'nueva' && state.draft) {
          e.preventDefault();
          saveOrder(false);
        }
      }
    });

    /* clicks delegados dentro del área de trabajo */
    view.addEventListener('click', handleViewClick);
    view.addEventListener('change', handleViewChange);

    /* formularios y cambios */
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);

    window.addEventListener('balsasud:toast', e => {
      if (e.detail) UI.toast(e.detail.message, e.detail.type, e.detail.detail);
    });

    DB.subscribe(() => {
      if (state.refreshing) return;
      if (!DB.currentUser()) { showLogin(); return; }
      paintShellUser(DB.currentUser());
      updateNotifications();
      const route = state.route;
      if (route.name === 'nueva') return;            // no interrumpir la captura
      if (UI.getActiveModal() && route.name === 'orden') {
        // un cambio remoto no debe cerrar la inspección en curso
        flashSync();
        return;
      }
      renderRoute();
      flashSync();
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const feedback = document.getElementById('loginFeedback');
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const button = e.target.querySelector('button[type="submit"]');
    feedback.textContent = '';
    button.disabled = true;
    button.querySelector('span').textContent = 'Verificando…';
    try {
      // Intentar login contra backend real
      if (window.BalsasudAPI) {
        try {
          const apiUser = await BalsasudAPI.login(user, pass);
          DB.setSession({ id: apiUser.userId, userId: apiUser.userId, username: apiUser.username, name: apiUser.name, role: apiUser.role });
          try { localStorage.setItem('balsasud.apiUser', JSON.stringify(apiUser)); } catch (e2) {}
          DB.log('login', { detail: `Inicio de sesión de ${apiUser.name} (${UI.roleLabel(apiUser.role)}).` });
          document.getElementById('loginForm').reset();
          if (!location.hash || location.hash === '#') location.hash = '#/panel';
          showApp();
          // sincronizar en segundo plano sin bloquear UI
          hydrateFromBackend().catch(()=>{});
          UI.toast(`Bienvenido, ${apiUser.name.split(' ')[0]}`, 'success', UI.roleLabel(apiUser.role));
          return;
        } catch (apiErr) {
          const msg = (apiErr.message || '').toLowerCase();
          if (msg.includes('contraseña') || msg.includes('incorrectos') || msg.includes('inactivo') || msg.includes('sesión')) {
            feedback.textContent = 'Contraseña incorrecta.';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginPassword').focus();
            return;
          }
          console.warn('API login fallo, usando modo local:', apiErr.message);
        }
      }
      const result = await DB.authenticate(user, pass);
      if (!result.ok) {
        feedback.textContent = result.error;
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
        return;
      }
      DB.setSession(result.user);
      DB.log('login', { detail: `Inicio de sesión de ${result.user.name} (${UI.roleLabel(result.user.role)}).` });
      document.getElementById('loginForm').reset();
      if (!location.hash || location.hash === '#') location.hash = '#/panel';
      showApp();
      UI.toast(`Bienvenido, ${result.user.name.split(' ')[0]}`, 'success', UI.roleLabel(result.user.role));
    } catch (err) {
      feedback.textContent = 'Ocurrió un error al iniciar sesión.';
      console.error(err);
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Ingresar';
    }
  }

  async function logout() {
    const user = DB.currentUser();
    if (user) DB.log('logout', { detail: `Cierre de sesión de ${user.name}.` });
    try { if (window.BalsasudAPI) await BalsasudAPI.logout(); } catch (e) {}
    try { localStorage.removeItem('balsasud.apiUser'); } catch (e2) {}
    stopQualityRealtime();
    DB.logout();
    document.getElementById('userMenu').hidden = true;
    document.getElementById('notifPanel').hidden = true;
    UI.closeModal();
    showLogin();
  }

  function stopQualityRealtime() {
    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
    if (realtimeUnsub) { try { realtimeUnsub(); } catch(e){} realtimeUnsub = null; }
  }

  function startQualityRealtime() {
    stopQualityRealtime();
    const user = DB.currentUser();
    if (!user || user.role !== 'calidad') return;
    lastSeenPalletIds = new Set(preparedOrders().flatMap(o => (o.pallets || []).map(p => p.id)));
    realtimeUnsub = DB.subscribe(() => handleNewPallets(true));
    realtimeTimer = setInterval(() => handleNewPallets(false), 15000);
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }

  async function handleNewPallets(isImmediate) {
    const user = DB.currentUser();
    if (!user || user.role !== 'calidad') return;
    try {
      if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
        try { await BalsasudAPI.syncQueue(); } catch(e){}
      }
    } catch(e){}
    const current = preparedOrders().flatMap(o => (o.pallets || []).map(p => ({ id: p.id, order: o, pallet: p })));
    const newOnes = current.filter(x => !lastSeenPalletIds.has(x.id));
    if (!newOnes.length) { if (!isImmediate) updateNotifications(); return; }
    newOnes.forEach(n => lastSeenPalletIds.add(n.id));
    updateNotifications();
    newOnes.slice(0,3).forEach(n => {
      const p = n.pallet;
      UI.toast(`Nuevo pallet de PT: ${n.order.code} · ${Engine.thicknessLabel(p.thickness)} · ${p.panels} paneles`, 'info', `Revisa en Calidad → ${n.order.code}`);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('BALSASUD - Nuevo pallet', { body: `${n.order.code} - ${Engine.thicknessLabel(p.thickness)} - ${p.panels} paneles`, icon: 'icon.svg' }); } catch(e){}
    });
    if (newOnes.length > 3) UI.toast(`${newOnes.length} pallets nuevos de Producto Terminado`, 'info', 'Revisión 1 a 1 disponible en Control de pallets / Conciliación');
    // refresca vista si está en calidad/pallets/panel/orden
    const r = state.route.name;
    if (['panel','pallets','conciliacion'].includes(r) || r.startsWith('orden')) renderRoute();
  }

  /* ---------------- PWA ---------------- */

  let deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const btn = document.getElementById('installApp');
    if (btn) btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('installApp');
    if (btn) btn.hidden = true;
  });

  async function installApp() {
    const btn = document.getElementById('installApp');
    if (!deferredInstallPrompt) {
      UI.toast('Instalación desde el navegador', 'info', 'Usa el menú del navegador → "Instalar aplicación" o "Agregar a la pantalla principal".');
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (btn) btn.hidden = true;
    UI.toast(choice && choice.outcome === 'accepted' ? 'Aplicación instalada' : 'Instalación cancelada', 'info');
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .catch(err => console.warn('PWA: no se pudo registrar el service worker.', err));
    });
  }

  function openPasswordModal() {
    UI.openModal({
      eyebrow: 'SEGURIDAD',
      title: 'Cambiar contraseña',
      size: 'sm',
      body: `<label>Contraseña actual<input type="password" id="pwdCurrent" autocomplete="current-password" /></label>
        <label>Nueva contraseña<input type="password" id="pwdNew" autocomplete="new-password" /></label>
        <label>Confirmar nueva contraseña<input type="password" id="pwdConfirm" autocomplete="new-password" /></label>
        <p class="field-error" id="pwdError" role="alert"></p>`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn-primary" id="pwdSave">Actualizar contraseña</button>`,
      onMount(modal) {
        modal.querySelector('#pwdSave').addEventListener('click', async () => {
          const err = modal.querySelector('#pwdError');
          const current = modal.querySelector('#pwdCurrent').value;
          const next = modal.querySelector('#pwdNew').value;
          const confirm = modal.querySelector('#pwdConfirm').value;
          const session = DB.currentUser();
          if (!session) return;
          err.textContent = '';
          if (next.length < 6) { err.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
          if (next !== confirm) { err.textContent = 'Las contraseñas no coinciden.'; return; }
          const check = await DB.authenticate(session.username, current);
          if (!check.ok) { err.textContent = 'La contraseña actual no es correcta.'; return; }
          const hash = await DB.hashPassword(session.username, next);
          DB.mutate(db => {
            const user = db.users.find(u => u.id === session.userId);
            if (user) user.passwordHash = hash;
            DB.log('password_change', { detail: `Cambio de contraseña de ${session.name}.` });
          });
          UI.closeModal();
          UI.toast('Contraseña actualizada', 'success');
        });
      }
    });
  }

  /* ---------------- navegación ---------------- */

  function currentRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const allowed = ['panel', 'ordenes', 'nueva', 'orden', 'pallets', 'conciliacion', 'reportes', 'usuarios', 'ayuda', 'jefe-embarque'];
    const name = allowed.includes(parts[0]) ? parts[0] : 'panel';
    state.route = { name, id: parts[1] || null };
    return state.route;
  }

  function go(path) {
    if (location.hash === '#/' + path) {
      if (state.nextOrderTab) {
        state.orderTab = state.nextOrderTab;
        state.nextOrderTab = null;
      }
      renderRoute();
    } else {
      location.hash = '#/' + path;
    }
  }

  const CRUMBS = {
    panel: ['Operación', 'Dashboard'],
    ordenes: ['Operación', 'Órdenes de despacho'],
    nueva: ['Operación', 'Nueva orden'],
    orden: ['Operación', 'Detalle de la orden'],
    pallets: ['Operación', 'Control de pallets'],
    conciliacion: ['Control', 'Conciliación'],
    reportes: ['Gestión', 'Reportes'],
    usuarios: ['Gestión', 'Usuarios y roles'],
    ayuda: ['Gestión', 'Guía y reglas'],
    'jefe-embarque': ['Operación', 'Jefe de Embarque']
  };

  function renderRoute() {
    const route = currentRoute();
    const key = `${route.name}/${route.id || ''}`;
    const changed = key !== state.lastRouteKey;
    state.lastRouteKey = key;

    const crumb = CRUMBS[route.name] || CRUMBS.panel;
    const crumbs = document.getElementById('crumbs');
    if (crumbs) crumbs.innerHTML = `<span>${UI.esc(crumb[0])}</span><b>/</b><strong>${UI.esc(crumb[1])}</strong>`;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('scrim').classList.remove('show');
    document.getElementById('notifPanel').hidden = true;

    const activeNav = route.name === 'orden' ? 'ordenes' : route.name;
    document.querySelectorAll('#sidebarNav a[data-route]').forEach(link => {
      const on = link.dataset.route === activeNav;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    try {
      switch (route.name) {
        case 'panel': renderPanel(); break;
        case 'ordenes': renderOrders(); break;
        case 'nueva': renderNewOrder(route.id); break;
        case 'orden': renderOrderDetail(route.id); break;
        case 'pallets': renderPalletsGlobal(); break;
        case 'conciliacion': renderConciliationGlobal(); break;
        case 'reportes': renderReports(); break;
        case 'usuarios': renderUsers(); break;
        case 'ayuda': renderHelp(); break;
        case 'jefe-embarque': renderJefeEmbarque(); break;
        default: renderPanel();
      }
      if (changed) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      UI.hydratePhotos(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="card error-card"><h2>No se pudo mostrar esta vista</h2><p>${UI.esc(err.message)}</p><button class="btn btn-ghost" type="button" data-action="reload">Recargar</button></div>`;
    }
  }

  function flashSync() {
    const el = document.getElementById('liveStatus');
    if (!el) return;
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 900);
  }

  function updateSyncState(text) {
    const label = document.getElementById('syncLabel');
    if (label) label.textContent = text;
    const live = document.querySelector('#liveStatus span:last-child');
    if (live) live.textContent = 'En vivo';
  }

  /* ---------------- notificaciones ---------------- */

  function collectAlerts() {
    const alerts = [];
    preparedOrders().forEach(order => {
      if (order._status === 'cerrado') return;
      order._rec.issues.forEach(issue => {
        alerts.push({
          orderId: order.id, orderCode: order.code, client: order.client,
          tag: issue.tag, message: issue.message, itemId: issue.itemId, thickness: issue.thickness,
          status: order._status
        });
      });
      const q = Engine.qualityCounts(order.pallets);
      if (order._status !== 'borrador' && q.total && (q.pending + q.inspecting) > 0) {
        alerts.push({
          orderId: order.id, orderCode: order.code, client: order.client,
          tag: 'INSPECCIÓN', message: `${q.pending + q.inspecting} pallet(s) pendientes de inspección de Calidad.`,
          status: order._status, info: true
        });
      }
    });
    return alerts;
  }

  function updateNotifications() {
    const alerts = collectAlerts();
    const badge = document.getElementById('notifCount');
    if (!badge) return;
    const count = alerts.filter(a => !a.info).length;
    if (count > 0) { badge.hidden = false; badge.textContent = count > 99 ? '99+' : String(count); }
    else badge.hidden = true;
    if (!document.getElementById('notifPanel').hidden) paintNotifications();
  }

  function paintNotifications() {
    const panel = document.getElementById('notifPanel');
    const alerts = collectAlerts();
    const differences = alerts.filter(a => !a.info);
    const pending = alerts.filter(a => a.info);
    panel.innerHTML = `<header class="notif-head"><div><p class="eyebrow">ALERTAS EN VIVO</p><h3>Diferencias y pendientes</h3></div>
      <button type="button" class="icon-btn" id="notifClose" aria-label="Cerrar">✕</button></header>
      <div class="notif-body">
        ${differences.length ? `<p class="notif-group">Diferencias detectadas <b>${differences.length}</b></p>
          ${differences.slice(0, 14).map(a => `<button type="button" class="notif-item tone-red" data-notif-order="${a.orderId}">
            <span class="notif-tag">${UI.esc(a.tag)}</span>
            <b>${UI.esc(a.orderCode)} · ${UI.esc(a.client)}</b>
            <span>${UI.esc(a.message)}</span>
          </button>`).join('')}` : `<div class="notif-empty">Sin diferencias detectadas.<br /><span>Los tres registros coinciden.</span></div>`}
        ${pending.length ? `<p class="notif-group">Pendientes de Calidad <b>${pending.length}</b></p>
          ${pending.slice(0, 8).map(a => `<button type="button" class="notif-item tone-amber" data-notif-order="${a.orderId}">
            <span class="notif-tag">CALIDAD</span><b>${UI.esc(a.orderCode)} · ${UI.esc(a.client)}</b><span>${UI.esc(a.message)}</span>
          </button>`).join('')}` : ''}
      </div>`;
    panel.querySelector('#notifClose').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelectorAll('[data-notif-order]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.hidden = true;
        go('orden/' + btn.getAttribute('data-notif-order'));
      });
    });
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */

  function renderPanel() {
    const orders = preparedOrders();
    const k = Engine.kpis(orders);
    const today = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    if (!orders.length) {
      view.innerHTML = UI.pageHead({
        eyebrow: 'CENTRO DE CONTROL',
        title: 'Dashboard de despachos',
        desc: `Hoy es ${today}. Aún no existen órdenes de despacho registradas.`,
        actions: can('order.create') ? `<button class="btn btn-primary" type="button" data-action="new-order">＋ Nueva orden</button>` : ''
      }) + `<div class="card onboarding">
        <div class="onboarding-mark">B</div>
        <h2>Bienvenido a BALSASUD · Control de Despachos</h2>
        <p>Configura tu primera orden, carga el TALLY SHEET y habilita la triple verificación entre Planificación, Producto Terminado y Calidad.</p>
        <div class="onboarding-steps">
          <div><b>01</b><span>Publica la orden con el TALLY SHEET autorizado</span></div>
          <div><b>02</b><span>Producto Terminado registra cada pallet</span></div>
          <div><b>03</b><span>Calidad inspecciona y aprueba</span></div>
          <div><b>04</b><span>El sistema concilia y libera</span></div>
        </div>
        <div class="onboarding-actions">
          ${can('order.create') ? `<button class="btn btn-primary" type="button" data-action="new-order">Crear orden de despacho</button>` : ''}
          <button class="btn btn-ghost" type="button" data-action="seed-demo">Cargar datos de demostración</button>
        </div>
      </div>`;
      return;
    }

    const active = orders.filter(o => o._status !== 'borrador');
    const thicknessMap = new Map();
    active.forEach(order => {
      order._rec.thicknesses.forEach(t => {
        const row = thicknessMap.get(t.thickness) || { thickness: t.thickness, label: t.thicknessLabel, tally: 0, pt: 0, quality: 0 };
        row.tally += t.tally; row.pt += t.pt; row.quality += t.quality;
        thicknessMap.set(t.thickness, row);
      });
    });
    const thicknesses = Array.from(thicknessMap.values()).sort((a, b) => a.thickness - b.thickness);

    const itemMap = new Map();
    active.forEach(order => {
      order._rec.rows.forEach(row => {
        if (!row.tally) return;
        const key = `${row.itemLabel}|${row.thickness}`;
        const item = itemMap.get(key) || { label: row.itemLabel, thickness: row.thicknessLabel, tally: 0, pt: 0, quality: 0 };
        item.tally += row.tally; item.pt += row.pt; item.quality += row.quality;
        itemMap.set(key, item);
      });
    });
    const topItems = Array.from(itemMap.values()).sort((a, b) => b.tally - a.tally).slice(0, 6);

    const statusGroups = [
      { label: 'Borrador', color: '#9aa8b6', value: orders.filter(o => o._status === 'borrador').length },
      { label: 'Pendiente PT', color: '#e0a33e', value: orders.filter(o => o._status === 'pendiente_pt').length },
      { label: 'En proceso', color: '#2b7cb8', value: orders.filter(o => ['registro', 'pendiente_calidad', 'inspeccion'].includes(o._status)).length },
      { label: 'Diferencias', color: '#d64545', value: orders.filter(o => ['con_diferencias', 'correccion'].includes(o._status)).length },
      { label: 'Corregidos', color: '#e0a33e', value: orders.filter(o => o._status === 'corregido').length },
      { label: 'Conciliado', color: '#2e9e6b', value: orders.filter(o => o._status === 'conciliado').length },
      { label: 'Liberado', color: '#1f7a52', value: orders.filter(o => ['liberado', 'despachado', 'cerrado'].includes(o._status)).length }
    ].filter(s => s.value > 0);

    const issues = [];
    active.forEach(order => order._rec.issues.forEach(issue => issues.push({ order, issue })));

    const running = active
      .filter(o => ['registro', 'pendiente_calidad', 'inspeccion', 'con_diferencias', 'correccion', 'corregido', 'conciliado'].includes(o._status))
      .sort((a, b) => b._rec.totals.cumplimiento - a._rec.totals.cumplimiento)
      .slice(0, 6);

    view.innerHTML = UI.pageHead({
      eyebrow: 'CENTRO DE CONTROL · PANEL EJECUTIVO',
      title: 'Dashboard de despachos',
      desc: `${today.charAt(0).toUpperCase() + today.slice(1)} · ${k.totalOrders} orden(es) en el sistema, ${k.pendingOrders} pendiente(s).`,
      actions: `${can('order.create') ? '<button class="btn btn-primary" type="button" data-action="new-order">＋ Nueva orden</button>' : ''}
        <button class="btn btn-ghost" type="button" data-action="refresh">↻ Actualizar</button>`
    }) + `
      <div class="kpi-grid">
        ${UI.kpiCard({ label: 'ÓRDENES TOTALES', value: UI.fmt(k.totalOrders), icon: '▤', tone: 'blue', sub: `<span>${k.inProcess} en proceso</span><span>${k.draft} borrador</span>` })}
        ${UI.kpiCard({ label: 'PENDIENTES', value: UI.fmt(k.pendingOrders), icon: '⏳', tone: 'amber', sub: 'Borrador o sin pallets' })}
        ${UI.kpiCard({ label: 'EN REVISIÓN DE CALIDAD', value: UI.fmt(k.inQuality), icon: '⌕', tone: 'blue', sub: 'Inspección en curso' })}
        ${UI.kpiCard({ label: 'CONCILIADAS', value: UI.fmt(k.conciliated), icon: '✓', tone: 'green', sub: 'Listas para liberar' })}
        ${UI.kpiCard({ label: 'LIBERADAS', value: UI.fmt(k.released + k.shipped), icon: '⇢', tone: 'green', sub: `${k.shipped} despachadas/cerradas` })}
        ${UI.kpiCard({ label: 'DIFERENCIAS', value: UI.fmt(k.differences), icon: '⚠', tone: 'red', sub: `${k.differencesOrders} orden(es) afectada(s)` })}
      </div>

      <div class="stat-strip">
        <div><span>Paneles programados</span><strong>${UI.fmt(k.programmed)}</strong>${UI.bar(100, 'gray')}</div>
        <div><span>Reportados por PT</span><strong>${UI.fmt(k.reported)}</strong>${UI.bar(k.fulfillment, 'blue')}<small>${UI.pct(k.fulfillment)}% del programa</small></div>
        <div><span>Aprobados por Calidad</span><strong>${UI.fmt(k.approved)}</strong>${UI.bar(k.qualityPct, 'green')}<small>${UI.pct(k.qualityPct)}% del programa</small></div>
        <div><span>Pallets pendientes</span><strong>${UI.fmt(k.pendingPallets)}</strong>${UI.bar(k.pendingPallets ? 100 : 0, 'amber')}</div>
        <div><span>Rechazados / corrección</span><strong>${UI.fmt(k.rejectedPallets + k.correctionPallets)}</strong>${UI.bar(k.rejectedPallets + k.correctionPallets ? 100 : 0, 'red')}</div>
        <div><span>Corregidos · reinspección</span><strong>${UI.fmt(k.correctedPallets)}</strong>${UI.bar(k.correctedPallets ? 100 : 0, 'amber')}</div>
        <div><span>Cumplimiento global</span><strong>${UI.pct(k.fulfillment)}%</strong>${UI.bar(k.fulfillment, 'green')}</div>
      </div>

      <div class="grid-2 charts-row">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">VOLUMEN</p><h2>Paneles por espesor</h2></div>
            <div class="legend">${legend([['TALLY', '#0f3355'], ['PT', '#2b7cb8'], ['Calidad', '#2e9e6b']])}</div></header>
          ${thicknesses.length ? UI.groupedBars({
            label: 'Paneles por espesor',
            data: thicknesses.map(t => ({ label: t.label, values: [t.tally, t.pt, t.quality], sub: `Δ ${t.pt - t.tally >= 0 ? '+' : ''}${UI.fmt(t.pt - t.tally)}` })),
            series: [{ key: 'tally', label: 'TALLY', color: '#0f3355' }, { key: 'pt', label: 'Producto Terminado', color: '#2b7cb8' }, { key: 'quality', label: 'Calidad', color: '#2e9e6b' }],
            height: 250
          }) : UI.emptyState('▭', 'Sin datos de espesor', 'Publica una orden para comenzar.')}
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">FLUJO</p><h2>Estado de los despachos</h2></div></header>
          <div class="donut-wrap">
            ${statusGroups.length ? UI.donut({ segments: statusGroups, centerLabel: 'ÓRDENES', label: 'Estado de los despachos' }) : UI.emptyState('◌', 'Sin órdenes', '')}
            <ul class="donut-legend">
              ${statusGroups.map(s => `<li><i style="background:${s.color}"></i><span>${UI.esc(s.label)}</span><b>${s.value}</b></li>`).join('')}
            </ul>
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">PRODUCTOS</p><h2>Paneles por ITEM ID</h2></div></header>
          ${topItems.length ? UI.groupedBars({
            label: 'Paneles por ITEM ID',
            data: topItems.map(i => ({ label: i.label, values: [i.tally, i.pt, i.quality], sub: i.thickness })),
            series: [{ key: 'tally', label: 'TALLY', color: '#0f3355' }, { key: 'pt', label: 'Producto Terminado', color: '#2b7cb8' }, { key: 'quality', label: 'Calidad', color: '#2e9e6b' }],
            height: 250
          }) : UI.emptyState('▭', 'Sin ítems registrados', '')}
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">CUMPLIMIENTO</p><h2>Avance por orden</h2></div>
            <a class="link" href="#/ordenes">Ver todas →</a></header>
          ${running.length ? `<div class="order-progress-list">
            ${running.map(order => {
              const p = Engine.progress(order);
              return `<button type="button" class="order-progress" data-action="open-order" data-id="${order.id}">
                <div class="op-head"><b>${UI.esc(order.code)}</b><span>${UI.esc(order.client)}</span>${UI.statusBadge(order._status)}</div>
                <div class="op-bars">
                  ${UI.progressLine(p.pt, 'blue', 'Producto Terminado')}
                  ${UI.progressLine(p.quality, 'green', 'Calidad')}
                </div>
              </button>`;
            }).join('')}
          </div>` : UI.emptyState('✓', 'Nada en proceso', 'Las órdenes publicadas aparecerán aquí.')}
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">ALERTAS</p><h2>Diferencias detectadas</h2></div><span class="count-chip">${issues.length}</span></header>
          ${issues.length ? `<div class="alert-list">
            ${issues.slice(0, 8).map(({ order, issue }) => `<button type="button" class="alert-row" data-action="open-order" data-id="${order.id}" data-tab="conciliacion">
              <span class="alert-tag">${UI.esc(issue.tag)}</span>
              <div><b>${UI.esc(order.code)} · ${UI.esc(order.client)}</b><span>${UI.esc(issue.itemId)} · ${UI.esc(issue.thickness)} — ${UI.esc(issue.message)}</span></div>
              <span class="alert-go">→</span>
            </button>`).join('')}
          </div>` : `<div class="clean-state"><span>✓</span><div><b>Sin diferencias</b><p>Los tres registros coinciden en las órdenes activas.</p></div></div>`}
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">OPERACIÓN</p><h2>Órdenes recientes</h2></div><a class="link" href="#/ordenes">Ver todas →</a></header>
          <div class="table-wrap compact">
            <table><thead><tr><th>Orden</th><th>Cliente</th><th>Paneles</th><th>Estado</th></tr></thead>
            <tbody>
              ${orders.slice(0, 6).map(order => `<tr class="clickable" data-action="open-order" data-id="${order.id}">
                <td><b>${UI.esc(order.code)}</b><small>${UI.esc(order.op || '—')}</small></td>
                <td>${UI.esc(order.client)}</td>
                <td>${UI.fmt(order._rec.totals.pt)} / ${UI.fmt(order._rec.totals.tally)}</td>
                <td>${UI.statusBadge(order._status)}</td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        </section>
      </div>
    `;
  }

  function legend(items) {
    return items.map(([label, color]) => `<span class="legend-item"><i style="background:${color}"></i>${UI.esc(label)}</span>`).join('');
  }

  /* ============================================================
     ÓRDENES
     ============================================================ */

  function filterOrders(orders) {
    const f = state.filters;
    const q = f.orderQ.trim().toLowerCase();
    return orders.filter(order => {
      if (f.orderStatus && order._status !== f.orderStatus) return false;
      if (f.orderClient && order.client !== f.orderClient) return false;
      if (!q) return true;
      return [order.code, order.op, order.purchaseOrder, order.client, order.container, order.destination, order.lot]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }

  function renderOrders() {
    const all = preparedOrders();
    const orders = filterOrders(all);
    const clients = Array.from(new Set(all.map(o => o.client).filter(Boolean))).sort();

    view.innerHTML = UI.pageHead({
      eyebrow: 'OPERACIÓN · DESPACHOS',
      title: 'Órdenes de despacho',
      desc: 'Cada orden concentra el TALLY SHEET autorizado, los pallets reportados y la inspección de Calidad.',
      actions: `${can('order.create') ? '<button class="btn btn-primary" type="button" data-action="new-order">＋ Nueva orden</button>' : ''}`
    }) + `
      <div class="toolbar card">
        <div class="field-inline grow">
          <label for="orderSearch">Buscar</label>
          <input id="orderSearch" data-filter="orderQ" type="search" placeholder="Código, OP, cliente, contenedor, lote…" value="${UI.esc(state.filters.orderQ)}" />
        </div>
        <div class="field-inline">
          <label for="orderStatusFilter">Estado</label>
          <select id="orderStatusFilter" data-filter="orderStatus">
            <option value="">Todos los estados</option>
            ${Object.entries(Engine.STATUS_META).map(([key, meta]) => `<option value="${key}" ${state.filters.orderStatus === key ? 'selected' : ''}>${UI.esc(meta.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field-inline">
          <label for="orderClientFilter">Cliente</label>
          <select id="orderClientFilter" data-filter="orderClient">
            <option value="">Todos</option>
            ${clients.map(c => `<option value="${UI.esc(c)}" ${state.filters.orderClient === c ? 'selected' : ''}>${UI.esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-count"><b>${orders.length}</b><span>orden(es)</span></div>
      </div>

      <div class="card table-card">
        <div class="table-wrap">
          <table class="data-table orders-table">
            <thead><tr>
              <th>Orden</th><th>OP / Cliente</th><th>Contenedor / Destino</th><th>Despacho</th>
              <th class="num">Pallets</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Calidad</th>
              <th>Cumpl.</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              ${orders.map(order => {
                const t = order._rec.totals;
                return `<tr class="clickable" data-action="open-order" data-id="${order.id}">
                  <td><b class="mono code-cell">${UI.esc(order.code)}</b><small>${UI.esc(order.lot || '')}</small></td>
                  <td><b>${UI.esc(order.client)}</b><small>${UI.esc(order.op || '—')} · OC ${UI.esc(order.purchaseOrder || '—')}</small></td>
                  <td>${UI.esc(order.container || '—')}<small>${UI.esc(order.destination || '—')}</small></td>
                  <td>${UI.fmtDate(order.dispatchDate)}</td>
                  <td class="num">${t.approvedPallets}/${t.pallets || 0}<small>${t.tallyPallets ? 'prog. ' + t.tallyPallets : ''}</small></td>
                  <td class="num">${UI.fmt(t.tally)}</td>
                  <td class="num">${UI.fmt(t.pt)}</td>
                  <td class="num">${UI.fmt(t.quality)}</td>
                  <td class="cell-bar">${UI.bar(t.cumplimiento, t.cumplimiento >= 100 ? 'green' : 'blue')}<span>${UI.pct(t.cumplimiento)}%</span></td>
                  <td>${UI.statusBadge(order._status)}</td>
                  <td class="cell-action"><span class="row-arrow">→</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${orders.length ? '' : UI.emptyState('▤', 'Sin resultados', 'Ajusta los filtros o crea una nueva orden.', can('order.create') ? '<button class="btn btn-primary" type="button" data-action="new-order">＋ Nueva orden</button>' : '')}
      </div>
    `;
  }

  /* ============================================================
     NUEVA ORDEN / EDICIÓN DE BORRADOR
     ============================================================ */

  function emptyDraft() {
    return {
      id: null,
      code: '',
      op: '',
      purchaseOrder: '',
      client: '',
      container: '',
      destination: '',
      dispatchDate: new Date().toISOString().slice(0, 10),
      lot: '',
      notes: '',
      items: [],
      tally: { fileName: '', fileType: '', fileSize: 0, storageKey: '', source: 'manual', extractedAt: null, text: '' },
      createdAt: null,
      createdBy: null,
      publishedAt: null,
      publishedBy: null,
      pallets: [],
      submittedAt: null,
      submittedBy: null
    };
  }

  function tallyPackagePreview(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const tallyPanels = rows.reduce((sum, row) => sum + (Number(row.panels) || 0), 0);
    return `<details class="tally-package-preview">
      <summary>Detalle de empaques del TALLY · ${rows.length} renglones · ${UI.fmt(tallyPanels)} paneles (solo referencia)</summary>
      <p class="hint">Estos renglones se extraen del documento como referencia. Producto Terminado debe registrar cada pallet/caja individualmente y Calidad debe inspeccionarlo; importar el TALLY no registra ni aprueba pallets.</p>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>No. TALLY</th><th>ITEM ID</th><th>Empaque</th><th>Tipo</th><th class="num">Empaques</th><th class="num">Paneles</th><th class="num">Peso neto</th><th class="num">Peso bruto</th></tr></thead>
        <tbody>${rows.map(row => `<tr>
          <td><b>${UI.esc(row.tallyNumber)}${row.duplicateNumber ? ' ⚠ repetido' : ''}</b></td>
          <td class="mono">${UI.esc(row.itemId)}</td>
          <td>${row.packaging === 'caja' ? 'Caja' : 'Palet'}</td>
          <td>${row.palletType === 'no_aplica' ? 'Suelto' : UI.esc(row.palletType.charAt(0).toUpperCase() + row.palletType.slice(1))}</td>
          <td class="num">${UI.fmt(row.packages)}</td><td class="num">${UI.fmt(row.panels)}</td>
          <td class="num">${UI.fmtDec(row.netWeight, 2)} kg</td><td class="num">${UI.fmt(row.grossWeight)} kg</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5"><b>Paneles del detalle TALLY</b></td><td class="num"><b>${UI.fmt(tallyPanels)}</b></td><td colspan="2"></td></tr></tfoot>
      </table></div>
    </details>`;
  }

  function renderNewOrder(id) {
    if (!can('order.create')) {
      view.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">🔒</div><h3>Acceso restringido</h3><p>Solo el Superadministrador puede crear órdenes de despacho.</p><a class="btn btn-ghost" href="#/ordenes">Volver a órdenes</a></div></div>`;
      return;
    }

    let order = null;
    if (id) {
      order = DB.getOrder(id);
      if (!order) {
        view.innerHTML = `<div class="card">${UI.emptyState('▤', 'Orden no encontrada', 'La orden solicitada no existe.', '<a class="btn btn-ghost" href="#/ordenes">Volver</a>')}</div>`;
        return;
      }
      if (order.publishedAt) { go('orden/' + order.id); return; }
    }

    if (!state.draft || (id && state.draft.id !== id) || (!id && state.draft.id)) {
      state.draft = order ? JSON.parse(JSON.stringify(order)) : emptyDraft();
      state.pendingTallyFile = null;
    }
    const draft = state.draft;
    const totalPanels = draft.items.reduce((t, i) => t + (Number(i.programmed) || 0), 0);
    const totalPallets = draft.items.reduce((t, i) => t + (Number(i.pallets) || 0), 0);
    const totalBoxes = draft.items.reduce((t, i) => t + (Number(i.boxes) || 0), 0);
    const hasItems = draft.items.some(i => i.itemId && Number(i.programmed) > 0);

    view.innerHTML = UI.pageHead({
      eyebrow: 'SUPERADMINISTRACIÓN · PLANIFICACIÓN',
      title: draft.id ? 'Editar orden en borrador' : 'Nueva orden de despacho',
      desc: 'Carga el TALLY SHEET autorizado, verifica la lectura automática y publica la orden para Producto Terminado y Calidad.',
      actions: `<a class="btn btn-ghost" href="#/ordenes">Cancelar</a>
        <button class="btn btn-outline" type="button" data-action="save-draft">Guardar borrador</button>
        <button class="btn btn-primary" type="button" data-action="publish-order">Publicar orden →</button>`
    }) + `<form id="orderForm" autocomplete="off" novalidate>

      <div class="flow-hint">
        <span class="flow-step done">01 Datos generales</span><i></i>
        <span class="flow-step ${hasItems ? 'done' : 'active'}">02 TALLY SHEET</span><i></i>
        <span class="flow-step ${hasItems ? 'active' : ''}">03 Revisión y publicación</span>
      </div>

      <section class="card form-card">
        <header class="card-head"><div><p class="eyebrow">PASO 01</p><h2>Datos generales del despacho</h2></div>
          <span class="req-note">Los campos con <b>*</b> son obligatorios</span></header>
        <div class="form-grid">
          <label>Orden de producción (OP) <span class="req">*</span>
            <input data-field="op" value="${UI.esc(draft.op)}" placeholder="Ej. 26SZ7132" /></label>
          <label>Orden de compra
            <input data-field="purchaseOrder" value="${UI.esc(draft.purchaseOrder)}" placeholder="Ej. 4400036519" /></label>
          <label>Cliente <span class="req">*</span>
            <input data-field="client" value="${UI.esc(draft.client)}" placeholder="Ej. BACHMANN" list="clientList" />
            <datalist id="clientList">${Array.from(new Set(DB.listOrders().map(o => o.client).filter(Boolean))).map(c => `<option value="${UI.esc(c)}"></option>`).join('')}</datalist></label>
          <label>Número de contenedor
            <input data-field="container" value="${UI.esc(draft.container)}" placeholder="Ej. TCLU1234567" /></label>
          <label>Destino
            <input data-field="destination" value="${UI.esc(draft.destination)}" placeholder="Ej. Miami, USA" /></label>
          <label>Fecha de despacho <span class="req">*</span>
            <input type="date" data-field="dispatchDate" value="${UI.esc(draft.dispatchDate)}" /></label>
          <label>Número de lote
            <input data-field="lot" value="${UI.esc(draft.lot)}" placeholder="Ej. 26199-26198" /></label>
          <label class="span-2">Observaciones generales
            <textarea data-field="notes" rows="2" placeholder="Indicaciones para Producto Terminado y Calidad...">${UI.esc(draft.notes)}</textarea></label>
        </div>
      </section>

      <section class="card form-card">
        <header class="card-head"><div><p class="eyebrow">PASO 02</p><h2>TALLY SHEET o Detalle de embarque</h2></div>
          <span class="badge badge-${draft.tally.fileName ? 'green' : 'gray'}">${draft.tally.fileName ? '◆ ' + UI.esc(draft.tally.fileName) : 'Sin archivo adjunto'}</span></header>

        <div class="tally-tools">
          <label class="dropzone" id="dropzone">
            <input type="file" id="tallyFile" accept=".pdf,.csv,.txt,.tsv" hidden />
            <span class="dz-icon">⇪</span>
            <b>Adjuntar TALLY SHEET o Detalle de embarque</b>
            <span>PDF original, CSV o TXT · lectura automática asistida</span>
            <small>El PDF se conserva como respaldo autorizado de la orden.</small>
          </label>
          <div class="paste-box">
            <label>O pega el contenido del TALLY SHEET
              <textarea id="tallyPaste" rows="7" placeholder="ITEM ID&#9;DESCRIPCIÓN&#9;ESPESOR&#9;CANTIDAD&#10;6230011251&#9;BALSA CORE&#9;10 mm&#9;534">${UI.esc(state.extractedText || '')}</textarea></label>
            <div class="paste-actions">
              <button class="btn btn-outline btn-sm" type="button" data-action="parse-pasted">Analizar texto</button>
              <button class="btn btn-ghost btn-sm" type="button" data-action="clear-tally">Limpiar</button>
            </div>
          </div>
        </div>

        <div id="tallyStatus" class="tally-status" hidden></div>
        ${state.extractedWarnings.length ? `<div class="warn-box"><b>Verifica la lectura</b><ul>${state.extractedWarnings.map(w => `<li>${UI.esc(w)}</li>`).join('')}</ul></div>` : ''}
        ${state.extractedText ? `<details class="raw-text"><summary>Ver texto detectado en el documento</summary><pre>${UI.esc(state.extractedText)}</pre></details>` : ''}

        <div class="items-editor">
          <div class="items-head"><h3>Productos autorizados</h3><button class="btn btn-outline btn-sm" type="button" data-action="add-item">＋ Agregar producto</button></div>
          <div class="table-wrap">
            <table class="data-table items-table">
              <thead><tr><th>ITEM ID *</th><th>Descripción</th><th class="w120">Espesor (mm) *</th><th class="w120">Paneles *</th><th class="w110">Pallets</th><th class="w100">Cajas</th><th></th></tr></thead>
              <tbody>
                ${draft.items.length ? draft.items.map((item, idx) => `<tr>
                  <td><input data-item="${idx}" data-field="itemId" value="${UI.esc(item.itemId)}" placeholder="6230011251" /></td>
                  <td><input data-item="${idx}" data-field="description" value="${UI.esc(item.description)}" placeholder="Descripción del producto" /></td>
                  <td><input type="number" step="0.01" min="0" data-item="${idx}" data-field="thickness" value="${UI.esc(item.thickness)}" /></td>
                  <td><input type="number" step="1" min="0" data-item="${idx}" data-field="programmed" value="${UI.esc(item.programmed)}" /></td>
                  <td><input type="number" step="1" min="0" data-item="${idx}" data-field="pallets" value="${UI.esc(item.pallets || '')}" /></td>
                  <td><input type="number" step="1" min="0" data-item="${idx}" data-field="boxes" value="${UI.esc(item.boxes || '')}" /></td>
                  <td class="cell-icon"><button type="button" class="icon-btn danger" data-action="remove-item" data-idx="${idx}" title="Eliminar producto">✕</button></td>
                </tr>`).join('') : `<tr><td colspan="7" class="table-empty">Sin productos. Carga el TALLY SHEET o agrega las líneas manualmente.</td></tr>`}
              </tbody>
              <tfoot><tr id="draftTotals">
                <td colspan="2"><b>Totales autorizados</b></td>
                <td class="num">—</td>
                <td class="num"><b id="draftTotalPanels">${UI.fmt(totalPanels)}</b></td>
                <td class="num"><b id="draftTotalPallets">${UI.fmt(totalPallets)}</b></td>
                <td class="num"><b id="draftTotalBoxes">${UI.fmt(totalBoxes)}</b></td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
          <p class="hint">La información del TALLY SHEET (o del Detalle de embarque FOR-OP-31) es la fuente oficial de cantidades y espesores autorizados. El Detalle no imprime ITEM ID: el sistema lo propone por espesor y tú debes confirmarlo. Cualquier corrección queda registrada en la auditoría.</p>
          ${tallyPackagePreview(draft.tally.packageRows)}
        </div>
      </section>

      <section class="card form-card">
        <header class="card-head"><div><p class="eyebrow">PASO 03</p><h2>Revisión y publicación</h2></div></header>
        <div class="review-grid">
          <div><span>Productos autorizados</span><b id="reviewItems">${draft.items.length}</b></div>
          <div><span>Paneles programados</span><b id="reviewPanels">${UI.fmt(totalPanels)}</b></div>
          <div><span>Unidades de empaque TALLY</span><b id="reviewPallets">${UI.fmt(totalPallets)}</b></div>
          <div><span>Cajas sueltas</span><b id="reviewBoxes">${UI.fmt(totalBoxes)}</b></div>
          <div><span>Estado</span><b>${draft.id ? 'Borrador guardado' : 'Sin guardar'}</b></div>
        </div>
        <p class="field-error" id="orderError" role="alert"></p>
        <div class="form-actions">
          <a class="btn btn-ghost" href="#/ordenes">Cancelar</a>
          <button class="btn btn-outline" type="button" data-action="save-draft">Guardar borrador</button>
          <button class="btn btn-primary" type="button" data-action="publish-order">Publicar y habilitar el flujo →</button>
        </div>
      </section>
    </form>`;

    const dz = document.getElementById('dropzone');
    if (dz) {
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', e => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleTallyFile(file);
      });
    }
  }

  function syncDraftFromForm() {
    if (!state.draft) return;
    document.querySelectorAll('[data-field]').forEach(input => {
      if (input.hasAttribute('data-item')) return;
      state.draft[input.getAttribute('data-field')] = input.value;
    });
  }

  function validateDraft(forPublish) {
    syncDraftFromForm();
    const draft = state.draft;
    const errors = [];
    if (!String(draft.client || '').trim()) errors.push('El cliente es obligatorio.');
    if (!String(draft.op || '').trim()) errors.push('La orden de producción (OP) es obligatoria.');
    if (!String(draft.dispatchDate || '').trim()) errors.push('La fecha de despacho es obligatoria.');
    const items = draft.items.filter(i => String(i.itemId || '').trim() || Number(i.programmed) > 0);
    if (!items.length) errors.push('Debes cargar al menos un producto del TALLY SHEET.');
    const keys = new Set();
    items.forEach((item, i) => {
      if (!String(item.itemId || '').trim()) errors.push(`Producto ${i + 1}: falta el ITEM ID.`);
      if (!(Number(item.thickness) > 0)) errors.push(`Producto ${i + 1}: el espesor debe ser mayor a 0.`);
      if (!(Number(item.programmed) > 0)) errors.push(`Producto ${i + 1}: la cantidad autorizada debe ser mayor a 0.`);
      const key = Engine.keyOf(item.itemId, item.thickness);
      if (keys.has(key)) errors.push(`Producto ${i + 1}: ITEM ${item.itemId} con espesor ${Engine.thicknessLabel(item.thickness)} está repetido.`);
      keys.add(key);
    });
    if (forPublish && errors.length) return errors;
    if (forPublish && !items.length) errors.push('Publica la orden solo cuando el TALLY SHEET esté completo.');
    return errors;
  }

  function applyTallyHeader(header) {
    if (!header) return;
    const draft = state.draft;
    const fields = ['op', 'purchaseOrder', 'client', 'destination', 'lot'];
    fields.forEach(field => {
      if (header[field] && !String(draft[field] || '').trim()) draft[field] = header[field];
    });
    // El formulario propone hoy por defecto; para el TALLY normalizamos la fecha al documento.
    const today = new Date().toISOString().slice(0, 10);
    if (header.dispatchDate && (!draft.dispatchDate || draft.dispatchDate === today)) {
      draft.dispatchDate = header.dispatchDate;
    }
  }

  async function handleTallyFile(file) {
    const status = document.getElementById('tallyStatus');
    if (status) { status.hidden = false; status.className = 'tally-status working'; status.innerHTML = `<span class="spinner"></span> Procesando <b>${UI.esc(file.name)}</b>…`; }
    state.pendingTallyFile = file;
    syncDraftFromForm();
    try {
      const result = await Tally.readFile(file);
      state.extractedText = result.text || '';
      state.extractedWarnings = result.warnings || [];
      applyTallyHeader(result.header);
      if (result.items && result.items.length) {
        state.draft.items = result.items.map(it => ({
          itemId: it.itemId, description: it.description, thickness: it.thickness,
          programmed: it.programmed, pallets: it.pallets || 0, boxes: it.boxes || 0,
          bf: it.bf || 0, m3: it.m3 || 0
        }));
        state.draft.tally = {
          fileName: file.name, fileType: file.type, fileSize: file.size,
          storageKey: state.draft.tally.storageKey || '',
          source: result.format || 'archivo', extractedAt: DB.nowIso(), text: result.text.slice(0, 4000),
          packageRows: result.packageRows || []
        };
        UI.toast(`${result.items.length} producto(s) detectado(s)`, 'success', 'Revisa y corrige las cantidades antes de publicar.');
      } else {
        state.draft.tally = Object.assign({}, state.draft.tally, {
          fileName: file.name, fileType: file.type, fileSize: file.size, source: result.format || 'archivo'
        });
        UI.toast('Archivo adjuntado', 'warn', 'No se detectaron filas automáticamente. Usa el pegado de texto o el ingreso manual.');
      }
      if (!state.extractedText) state.extractedWarnings = (result.warnings || []).concat(['Puedes pegar el texto del documento o registrar los productos manualmente.']);
      renderNewOrder(state.draft.id);
    } catch (err) {
      console.error(err);
      if (status) { status.className = 'tally-status error'; status.innerHTML = 'No se pudo leer el archivo. Adjúntalo como respaldo e ingresa los datos manualmente.'; }
      UI.toast('Error al leer el archivo', 'error', err.message);
    }
  }

  async function saveOrder(publish) {
    const errors = validateDraft(publish);
    const errorBox = document.getElementById('orderError');
    if (errors.length) {
      if (errorBox) errorBox.innerHTML = errors.map(e => `<span>• ${UI.esc(e)}</span>`).join('');
      UI.toast(publish ? 'No se puede publicar la orden' : 'Revisa los datos', 'error', errors[0]);
      if (errorBox) errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errorBox) errorBox.innerHTML = '';

    syncDraftFromForm();
    const draft = state.draft;
    const me = actor();
    const isNew = !draft.id;
    const orderId = draft.id || DB.uid('ord');

    if (state.pendingTallyFile) {
      const key = `tally:${orderId}`;
      await DB.saveFile(key, state.pendingTallyFile, {
        name: state.pendingTallyFile.name, type: state.pendingTallyFile.type,
        size: state.pendingTallyFile.size, kind: 'tally'
      });
      draft.tally.storageKey = key;
      draft.tally.fileName = draft.tally.fileName || state.pendingTallyFile.name;
      draft.tally.fileType = draft.tally.fileType || state.pendingTallyFile.type;
      draft.tally.fileSize = draft.tally.fileSize || state.pendingTallyFile.size;
      state.pendingTallyFile = null;
    }

    draft.items = draft.items
      .filter(i => String(i.itemId || '').trim() || Number(i.programmed) > 0)
      .map(i => ({
        itemId: String(i.itemId || '').trim(),
        description: String(i.description || '').trim(),
        thickness: Engine.thicknessNumber(i.thickness),
        programmed: Number(i.programmed) || 0,
        pallets: Number(i.pallets) || 0,
        boxes: Number(i.boxes) || 0,
        bf: Number(i.bf) || 0,
        m3: Number(i.m3) || 0,
        weight: Number(i.weight) || 0
      }));

    const order = {
      id: orderId,
      code: draft.code || '',
      op: String(draft.op || '').trim(),
      purchaseOrder: String(draft.purchaseOrder || '').trim(),
      client: String(draft.client || '').trim(),
      container: String(draft.container || '').trim(),
      destination: String(draft.destination || '').trim(),
      dispatchDate: draft.dispatchDate,
      lot: String(draft.lot || '').trim(),
      notes: String(draft.notes || '').trim(),
      items: draft.items,
      tally: draft.tally,
      pallets: draft.pallets || [],
      createdAt: draft.createdAt || DB.nowIso(),
      createdBy: draft.createdBy || me,
      publishedAt: draft.publishedAt || null,
      publishedBy: draft.publishedBy || null,
      submittedAt: draft.submittedAt || null,
      submittedBy: draft.submittedBy || null
    };

    if (publish) {
      order.publishedAt = order.publishedAt || DB.nowIso();
      order.publishedBy = order.publishedBy || me;
    }

    state.draft = null;
    state.extractedText = '';
    state.extractedWarnings = [];

    DB.mutate(db => {
      const existing = db.orders.find(o => o.id === orderId);
      if (!order.code) order.code = DB.nextOrderCode(db);
      if (existing) {
        Object.assign(existing, order);
      } else {
        db.orders.unshift(order);
      }
      DB.log(publish ? 'order_publish' : 'order_save', {
        orderId, orderCode: order.code,
        detail: publish
          ? `Orden ${order.code} publicada para Producto Terminado y Calidad (${order.items.length} productos, ${order.items.reduce((t, i) => t + i.programmed, 0)} paneles autorizados).`
          : `Orden ${order.code} guardada como borrador.`
      });
    });

    // Sincronización con backend real (Sheets/Drive) si hay sesión API
    if (publish && window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
      try {
        UI.toast('Sincronizando con Sheets...', 'info', order.code);
        const payload = {
          code: order.code,
          op: order.op,
          purchaseOrder: order.purchaseOrder,
          client: order.client,
          container: order.container,
          destination: order.destination,
          dispatchDate: order.dispatchDate,
          lot: order.lot,
          notes: order.notes,
          details: order.items.map(i => ({
            itemId: i.itemId,
            description: i.description,
            thickness: i.thickness,
            programmed: i.programmed,
            pallets: i.pallets,
            boxes: i.boxes || 0,
            bf: i.bf,
            m3: i.m3
          }))
        };
        const shipment = await BalsasudAPI.createShipment(payload);
        // Si hay TALLY adjunto, subir a Drive
        if (state.pendingTallyFile && shipment.shipmentId) {
          try { await BalsasudAPI.uploadTally(shipment.shipmentId, state.pendingTallyFile); } catch(e){ console.warn('Upload TALLY falló', e); }
        }
        // Activar embarque automáticamente
        try { await BalsasudAPI.activateShipment(shipment.shipmentId); UI.toast('Embarque activado en Sheets', 'success', shipment.code); } catch(e){ console.warn('Activate falló', e); }
      } catch (apiErr) {
        console.warn('Sync Sheets falló, queda solo local:', apiErr);
        UI.toast('Guardado local - sync Sheets pendiente', 'warning', apiErr.message);
      }
    }

    UI.toast(publish ? 'Orden publicada' : 'Borrador guardado', 'success', order.code);
    if (publish) {
      UI.broadcastToast(`Nueva orden ${order.code} publicada`, 'info', 'Producto Terminado y Calidad ya pueden trabajar en ella.');
    }
    go('orden/' + orderId);
  }

  /* ============================================================
     DETALLE DE LA ORDEN
     ============================================================ */

  const TAB_LABELS = {
    resumen: 'Resumen',
    tally: 'TALLY SHEET',
    pallets: 'Pallets',
    calidad: 'Calidad',
    conciliacion: 'Conciliación',
    evidencias: 'Evidencias',
    auditoria: 'Auditoría',
    reporte: 'Acta / Reporte'
  };

  const TAB_VISIBILITY = {
    superadmin: ['resumen', 'tally', 'pallets', 'calidad', 'conciliacion', 'evidencias', 'auditoria', 'reporte'],
    pt: ['resumen', 'tally', 'pallets', 'conciliacion', 'evidencias'],
    calidad: ['resumen', 'tally', 'pallets', 'calidad', 'conciliacion', 'evidencias', 'auditoria'],
    jefe_embarque: ['resumen', 'pallets', 'conciliacion', 'evidencias']
  };

  function renderOrderDetail(id) {
    const order = preparedOrder(id);
    if (!order) {
      view.innerHTML = `<div class="card">${UI.emptyState('▤', 'Orden no encontrada', 'Puede haber sido eliminada.', '<a class="btn btn-ghost" href="#/ordenes">Volver a órdenes</a>')}</div>`;
      return;
    }
    state.order = order;
    const rec = order._rec;
    const release = Engine.releaseCheck(order);
    const q = Engine.qualityCounts(order.pallets);
    const photoCount = (order.pallets || []).reduce((t, p) => t + ((p.evidence || []).length), 0);
    const tab = TAB_LABELS[state.orderTab] ? state.orderTab : 'resumen';

    const user = DB.currentUser() || { role: 'pt' };
    const allowed = new Set(TAB_VISIBILITY[user.role] || TAB_VISIBILITY.pt);
    const tabs = [
      ['resumen', 'Resumen', ''],
      ['tally', 'TALLY SHEET', ''],
      ['pallets', 'Pallets', order.pallets.length],
      ['calidad', 'Calidad', (q.pending + q.inspecting) || ''],
      ['conciliacion', 'Conciliación', rec.counts.differences || ''],
      ['evidencias', 'Evidencias', photoCount || ''],
      ['auditoria', 'Auditoría', ''],
      ['reporte', 'Acta / Reporte', '']
    ].filter(([key]) => allowed.has(key));
    const activeTab = allowed.has(tab) ? tab : (tabs[0] && tabs[0][0]) || 'resumen';

    view.innerHTML = `
      <div class="order-head">
        <div class="order-head-main">
          <a class="back-link" href="#/ordenes">← Órdenes</a>
          <div class="order-title-row">
            <h1 class="mono">${UI.esc(order.code)}</h1>
            ${UI.statusBadge(order._status)}
            ${rec.ok ? '<span class="badge badge-green"><i>✓</i>Triple verificación OK</span>' : (rec.hasDifferences ? '<span class="badge badge-red"><i>⚠</i>Diferencias detectadas</span>' : '')}
          </div>
          <p class="order-sub"><b>${UI.esc(order.client)}</b> · OP ${UI.esc(order.op || '—')} · ${UI.esc(order.container || 'sin contenedor')} → ${UI.esc(order.destination || '—')}</p>
        </div>
        <div class="order-actions">${orderActions(order, release)}</div>
      </div>

      ${orderStepper(order)}

      <div class="order-meta-strip">
        <div><span>Orden de compra</span><b>${UI.esc(order.purchaseOrder || '—')}</b></div>
        <div><span>Fecha de despacho</span><b>${UI.fmtDate(order.dispatchDate)}</b></div>
        <div><span>Lote</span><b>${UI.esc(order.lot || '—')}</b></div>
        <div><span>Paneles autorizados</span><b>${UI.fmt(rec.totals.tally)}</b></div>
        <div><span>Reportados / Aprobados</span><b>${UI.fmt(rec.totals.pt)} / ${UI.fmt(rec.totals.quality)}</b></div>
        <div><span>Pallets</span><b>${q.approved}/${q.total} aprobados${q.corrected ? ` · ${q.corrected} corregido(s)` : ''}</b></div>
      </div>

      ${order._status === 'borrador' ? `<div class="notice notice-amber"><b>Borrador</b><span>Esta orden aún no está visible para Producto Terminado ni Calidad. Publícala cuando el TALLY SHEET esté verificado.</span></div>` : ''}
      ${!release.ok && order.publishedAt && !order.releasedAt ? `<details class="release-blocker">
        <summary><b>⚠ Liberación bloqueada</b><span>${release.reasons.length} requisito(s) pendiente(s)</span></summary>
        <ul>${release.reasons.map(r => `<li>${UI.esc(r)}</li>`).join('')}</ul>
      </details>` : ''}

      <nav class="tabs-bar" role="tablist">
        ${tabs.map(([key, label, count]) => `<button type="button" class="tab-btn ${activeTab === key ? 'active' : ''}" data-action="order-tab" data-tab="${key}" role="tab" aria-selected="${activeTab === key}">
          ${UI.esc(label)}${count !== '' && count !== 0 ? `<span class="tab-count">${count}</span>` : ''}
        </button>`).join('')}
      </nav>

      <div class="tab-panel">
        ${renderOrderTab(order, rec, release, q, activeTab)}
      </div>
    `;

    if (tab === 'pallets' && state.palletForm) {
      const form = document.getElementById('palletFormCard');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (state.pendingPhotos.length) paintPendingPhotos();
  }

  function orderActions(order, release) {
    const me = DB.currentUser();
    const buttons = [];
    const closed = !!order.closedAt;

    if (order._status === 'borrador') {
      if (can('order.edit')) buttons.push(`<a class="btn btn-outline" href="#/nueva/${order.id}">✎ Editar</a>`);
      if (can('order.publish')) buttons.push(`<button class="btn btn-primary" type="button" data-action="publish-draft" data-id="${order.id}">Publicar orden</button>`);
    } else {
      if (!closed && can('order.submit') && !order.submittedAt && !order.releasedAt) {
        const disabled = !order.pallets.length;
        buttons.push(`<button class="btn btn-primary" type="button" data-action="send-quality" data-id="${order.id}" ${disabled ? 'disabled title="Registra al menos un pallet"' : ''}>Enviar a Calidad →</button>`);
      }
      if (!order.releasedAt && !closed && can('order.release')) {
        buttons.push(`<button class="btn btn-success" type="button" data-action="release" data-id="${order.id}" ${release.ok ? '' : 'disabled'} title="${release.ok ? 'Liberar el despacho' : UI.esc(release.reasons[0] || '')}">✓ Liberar despacho</button>`);
      }
      if (order.releasedAt && !order.shippedAt && can('order.ship')) {
        buttons.push(`<button class="btn btn-primary" type="button" data-action="ship" data-id="${order.id}">⇢ Marcar despachado</button>`);
      }
      if (order.shippedAt && !closed && can('order.close')) {
        buttons.push(`<button class="btn btn-success" type="button" data-action="close-order" data-id="${order.id}">■ Cerrar despacho</button>`);
      }
      if (closed && can('order.reopen')) {
        buttons.push(`<button class="btn btn-outline" type="button" data-action="reopen" data-id="${order.id}">↺ Reabrir</button>`);
      }
    }
    const role = (me && me.role) || 'pt';
    if ((TAB_VISIBILITY[role] || TAB_VISIBILITY.pt).includes('reporte')) {
      buttons.push(`<button class="btn btn-ghost" type="button" data-action="order-tab" data-tab="reporte">⎙ Reporte</button>`);
    }
    return buttons.join('');
  }

  function orderStepper(order) {
    const q = Engine.qualityCounts(order.pallets);
    const inspected = q.approved + q.rejected + q.correction;
    const steps = [
      { label: 'Publicación', done: !!order.publishedAt, hint: UI.fmtDate(order.publishedAt) },
      { label: 'Registro PT', done: order.pallets.length > 0, hint: `${order.pallets.length} pallets` },
      { label: 'Calidad', done: q.total > 0 && inspected === q.total, hint: `${q.approved}/${q.total} aprobados` },
      { label: 'Conciliación', done: order._rec.ok, hint: order._rec.ok ? 'Coinciden' : 'Pendiente' },
      { label: 'Liberación', done: !!order.releasedAt, hint: order.releasedAt ? UI.fmtDate(order.releasedAt) : 'Bloqueada' },
      { label: 'Cierre', done: !!order.closedAt, hint: order.closedAt ? UI.fmtDate(order.closedAt) : '—' }
    ];
    let activeSet = false;
    return `<ol class="stepper">${steps.map((s, i) => {
      let cls = s.done ? 'done' : '';
      if (!s.done && !activeSet) { cls = 'active'; activeSet = true; }
      return `<li class="${cls}"><span class="step-num">${s.done ? '✓' : String(i + 1).padStart(2, '0')}</span><div><b>${s.label}</b><small>${UI.esc(s.hint)}</small></div></li>`;
    }).join('')}</ol>`;
  }

  function renderOrderTab(order, rec, release, q, tab) {
    switch (tab) {
      case 'tally': return tallyTab(order, rec);
      case 'pallets': return palletsTab(order, rec, q);
      case 'calidad': return qualityTab(order, rec, q);
      case 'conciliacion': return conciliationTab(order, rec);
      case 'evidencias': return evidenceTab(order);
      case 'auditoria': return auditTab(order);
      case 'reporte': return reportTab(order, rec);
      default: return summaryTab(order, rec, release, q);
    }
  }

  function summaryTab(order, rec, release, q) {
    const audit = DB.auditFor(order.id).slice(0, 7);
    const ptSubmitted = order.submittedAt;
    return `<div class="grid-2">
      <section class="card">
        <header class="card-head"><div><p class="eyebrow">TRIPLE VERIFICACIÓN</p><h2>Conciliación por espesor</h2></div>
          ${rec.ok ? '<span class="badge badge-green">CONCILIADO</span>' : '<span class="badge badge-amber">EN PROCESO</span>'}</header>
        <div class="table-wrap">
          <table class="mini-table">
            <thead><tr><th>Espesor</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Calidad</th><th>Estado</th></tr></thead>
            <tbody>
              ${rec.thicknesses.length ? rec.thicknesses.map(t => {
                const ok = t.tally === t.pt && t.pt === t.quality;
                return `<tr><td><b>${UI.esc(t.thicknessLabel)}</b></td><td class="num">${UI.fmt(t.tally)}</td>
                  <td class="num ${t.diffPt !== 0 ? 'diff' : ''}">${UI.fmt(t.pt)}</td>
                  <td class="num ${t.diffQuality !== 0 ? 'diff' : ''}">${UI.fmt(t.quality)}</td>
                  <td>${ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-red">Δ</span>'}</td></tr>`;
              }).join('') : `<tr><td colspan="5" class="table-empty">Sin datos.</td></tr>`}
            </tbody>
            <tfoot><tr><td><b>TOTAL</b></td><td class="num"><b>${UI.fmt(rec.totals.tally)}</b></td><td class="num"><b>${UI.fmt(rec.totals.pt)}</b></td><td class="num"><b>${UI.fmt(rec.totals.quality)}</b></td>
              <td>${rec.ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-red">Δ</span>'}</td></tr></tfoot>
          </table>
        </div>
        <div class="card-foot"><span>Cumplimiento PT <b>${UI.pct(rec.totals.cumplimiento)}%</b></span><span>Aprobado Calidad <b>${UI.pct(rec.totals.approvedPct)}%</b></span>
          <button class="link" type="button" data-action="order-tab" data-tab="conciliacion">Ver detalle →</button></div>
      </section>

      <section class="card">
        <header class="card-head"><div><p class="eyebrow">INSPECCIÓN</p><h2>Estado de Calidad</h2></div>${ptSubmitted ? '' : '<span class="badge badge-amber">Sin enviar</span>'}</header>
        <div class="quality-breakdown">
          ${qualityRow('Pendientes', q.pending, 'amber')}
          ${qualityRow('En inspección', q.inspecting, 'blue')}
          ${qualityRow('Aprobados', q.approved, 'green')}
          ${qualityRow('Rechazados', q.rejected, 'red')}
          ${qualityRow('Requieren corrección', q.correction, 'red')}
          ${qualityRow('Corregidos · pendientes reinspección', q.corrected, 'amber')}
        </div>
        <div class="card-foot"><span>Total pallets <b>${q.total}</b></span>
          <button class="link" type="button" data-action="order-tab" data-tab="calidad">Abrir inspección →</button></div>
      </section>

      <section class="card">
        <header class="card-head"><div><p class="eyebrow">LIBERACIÓN</p><h2>Requisitos de cierre</h2></div>
          ${release.ok ? '<span class="badge badge-green">HABILITADA</span>' : '<span class="badge badge-red">BLOQUEADA</span>'}</header>
        <ul class="check-list">
          <li class="${order.publishedAt ? 'ok' : ''}"><i>${order.publishedAt ? '✓' : '○'}</i>TALLY SHEET publicado y autorizado</li>
          <li class="${order.pallets.length ? 'ok' : ''}"><i>${order.pallets.length ? '✓' : '○'}</i>Pallets registrados por Producto Terminado (${order.pallets.length})</li>
          <li class="${ptSubmitted ? 'ok' : ''}"><i>${ptSubmitted ? '✓' : '○'}</i>Despacho enviado a revisión de Calidad</li>
          <li class="${q.total > 0 && q.approved === q.total && q.corrected === 0 ? 'ok' : ''}"><i>${q.total > 0 && q.approved === q.total && q.corrected === 0 ? '✓' : '○'}</i>Todos los pallets aprobados (${q.approved}/${q.total}${q.corrected ? ` · ${q.corrected} corregido(s) pendiente(s)` : ''})</li>
          <li class="${q.corrected === 0 ? 'ok' : ''}"><i>${q.corrected === 0 ? '✓' : '○'}</i>Sin pallets en corrección / reinspección${q.corrected ? ` (${q.corrected} pendiente(s))` : ''}</li>
          <li class="${rec.ok ? 'ok' : ''}"><i>${rec.ok ? '✓' : '○'}</i>TALLY = Producto Terminado = Calidad</li>
        </ul>
        <div class="card-foot"><span>${release.ok ? 'El acta de liberación está disponible.' : (release.reasons[0] || '')}</span></div>
      </section>

      <section class="card">
        <header class="card-head"><div><p class="eyebrow">RESPONSABLES</p><h2>Trazabilidad del despacho</h2></div></header>
        <ul class="people-list">
          ${personRow('SA', 'Superadministrador', order.publishedBy ? order.publishedBy.name : (order.createdBy ? order.createdBy.name : '—'), order.publishedAt ? `Publicó ${UI.fmtDateTime(order.publishedAt)}` : 'Sin publicar')}
          ${personRow('PT', 'Producto Terminado', order.submittedBy ? order.submittedBy.name : (order.pallets[0] ? order.pallets[0].createdByName : '—'), order.submittedAt ? `Envió a Calidad ${UI.fmtDateTime(order.submittedAt)}` : 'En registro')}
          ${personRow('CA', 'Calidad', lastInspector(order), q.approved ? `${q.approved} pallet(s) aprobados` : 'Sin inspección')}
          ${order.releasedBy ? personRow('✓', 'Liberación', order.releasedBy.name, `${UI.fmtDateTime(order.releasedAt)} · ${UI.roleLabel(order.releasedBy.role)}`) : ''}
        </ul>
      </section>

      <section class="card span-2">
        <header class="card-head"><div><p class="eyebrow">BITÁCORA</p><h2>Actividad reciente</h2></div>
          <button class="link" type="button" data-action="order-tab" data-tab="auditoria">Ver auditoría completa →</button></header>
        <ul class="timeline">
          ${audit.length ? audit.map(a => `<li><span class="tl-dot tone-${auditTone(a.action)}"></span><div><b>${UI.esc(actionLabel(a.action))}</b><span>${UI.esc(a.detail)}</span></div><small>${UI.fmtDateTime(a.ts)} · ${UI.esc(a.userName)}</small></li>`).join('') : '<li class="table-empty">Sin movimientos.</li>'}
        </ul>
      </section>
    </div>`;
  }

  function qualityRow(label, value, tone) {
    return `<div class="quality-row tone-${tone}"><span class="qr-dot"></span><span>${UI.esc(label)}</span><b>${UI.fmt(value)}</b></div>`;
  }

  function personRow(badge, role, name, detail) {
    return `<li><span class="avatar sm tone-${badge === 'SA' ? 'blue' : badge === 'PT' ? 'amber' : 'green'}">${badge}</span>
      <div><b>${UI.esc(name || '—')}</b><span>${UI.esc(role)} · ${UI.esc(detail)}</span></div></li>`;
  }

  function lastInspector(order) {
    const inspected = (order.pallets || []).filter(p => p.quality && p.quality.byName);
    if (!inspected.length) return '—';
    return inspected[inspected.length - 1].quality.byName;
  }

  function tallyTab(order, rec) {
    const tally = order.tally || {};
    const sourceLabels = {
      detalle: 'Detalle de embarque (FOR-OP-31)',
      tally: 'TALLY SHEET',
      delimitado: 'CSV / TXT',
      texto: 'Texto pegado',
      pdf: 'PDF',
      manual: 'Manual'
    };
    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">FUENTE OFICIAL</p><h2>TALLY SHEET autorizado</h2></div>
        <div class="head-actions">
          ${tally.storageKey ? `<button class="btn btn-outline btn-sm" type="button" data-action="view-tally" data-id="${order.id}">Ver documento</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="download-tally" data-id="${order.id}">Descargar</button>` : ''}
        </div></header>
      <div class="tally-meta">
        <div><span>Archivo</span><b>${UI.esc(tally.fileName || 'Sin archivo adjunto')}</b></div>
        <div><span>Origen</span><b>${UI.esc(sourceLabels[tally.source] || tally.source || 'manual')}</b></div>
        <div><span>Lectura</span><b>${tally.extractedAt ? UI.fmtDateTime(tally.extractedAt) : 'Ingreso manual'}</b></div>
        <div><span>Publicado</span><b>${order.publishedAt ? UI.fmtDateTime(order.publishedAt) : 'Borrador'}</b></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ITEM ID</th><th>Descripción</th><th>Espesor</th><th class="num">Paneles</th><th class="num">Unid. empaque TALLY</th><th class="num">Reportado PT</th><th class="num">Δ</th></tr></thead>
          <tbody>
            ${(order.items || []).length ? order.items.map(item => {
              const row = rec.rows.find(r => r.key === Engine.keyOf(item.itemId, item.thickness));
              const diff = row ? row.pt - row.tally : 0;
              return `<tr>
                <td><b class="mono">${UI.esc(item.itemId)}</b></td>
                <td>${UI.esc(item.description || '—')}</td>
                <td>${Engine.thicknessLabel(item.thickness)}</td>
                <td class="num"><b>${UI.fmt(item.programmed)}</b></td>
                <td class="num">${UI.fmt(item.pallets || 0)}</td>
                <td class="num">${row ? UI.fmt(row.pt) : '0'}</td>
                <td class="num ${diff !== 0 ? 'diff' : ''}">${diff === 0 ? '—' : (diff > 0 ? '+' : '') + UI.fmt(diff)}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="8" class="table-empty">Sin productos autorizados.</td></tr>`}
          </tbody>
          <tfoot><tr><td colspan="3"><b>TOTAL AUTORIZADO</b></td><td class="num"><b>${UI.fmt(rec.totals.tally)}</b></td><td class="num"><b>${UI.fmt(rec.totals.tallyPallets)}</b></td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>
      <p class="hint">Este documento es la fuente oficial de cantidades y espesores. Cualquier modificación requiere autorización del Superadministrador y queda registrada con motivo.</p>
      ${tallyPackagePreview(tally.packageRows)}
    </section>`;
  }

  function palletsTab(order, rec, q) {
    const editableFlow = order.publishedAt && !order.releasedAt && !order.closedAt;
    const canAdd = editableFlow && can('pallets.create');
    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">PRODUCTO TERMINADO</p><h2>Pallets reportados</h2></div>
        <div class="head-actions">
          ${canAdd ? `<button class="btn btn-primary btn-sm" type="button" data-action="pallet-new">＋ Registrar pallet</button>` : ''}
          ${order.submittedAt ? `<span class="badge badge-blue">Enviado a Calidad ${UI.fmtDate(order.submittedAt)}</span>` : '<span class="badge badge-amber">En registro</span>'}
        </div></header>

      <div class="mini-kpis">
        <div><span>Registrados</span><b>${q.total}</b></div>
        <div class="tone-green"><span>Aprobados</span><b>${q.approved}</b></div>
        <div class="tone-amber"><span>Pendientes</span><b>${q.pending + q.inspecting}</b></div>
        <div class="tone-red"><span>Rechazados</span><b>${q.rejected}</b></div>
        <div class="tone-red"><span>Corrección</span><b>${q.correction}</b></div>
        <div class="tone-amber"><span>Corregidos · reinspección</span><b>${q.corrected}</b></div>
        <div><span>Paneles reportados</span><b>${UI.fmt(rec.totals.pt)} / ${UI.fmt(rec.totals.tally)}</b></div>
      </div>

      ${state.palletForm ? palletFormHTML(order) : ''}

      <div class="table-wrap">
        <table class="data-table pallet-table">
          <thead><tr>
            <th>#</th><th>ITEM ID</th><th>Descripción</th><th>Espesor</th><th>Empaque</th><th>Tipo</th>
            <th class="num">Paneles</th>
            <th>Responsable PT</th><th>Calidad</th><th>Conciliación</th><th></th>
          </tr></thead>
          <tbody>
            ${order.pallets.length ? order.pallets.map(p => {
              const qs = Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'] || Engine.Q_STATUS.pendiente;
              const row = rec.rows.find(r => r.key === Engine.keyOf(p.itemId, p.thickness));
              const rowMeta = row ? Engine.rowStatusMeta(row.status) : null;
              const canEditPallet = editableFlow && (
                p.quality && ['rechazado', 'requiere_correccion', 'corregido'].includes(p.quality.status)
                  ? can('pallets.edit')
                  : (!p.quality || p.quality.status === 'pendiente' ? can('pallets.edit') : can('order.edit'))
              );
              return `<tr>
                <td><b class="nowrap">${UI.esc(p.number)}</b>${(p.evidence || []).length ? `<small>${p.evidence.length} 📷</small>` : ''}</td>
                <td class="mono">${UI.esc(p.itemId)}</td>
                <td>${UI.esc(p.description || '—')}</td>
                <td>${Engine.thicknessLabel(p.thickness)}</td>
                <td>${UI.esc(Engine.PACKAGING[p.packaging] || p.packaging || '—')}</td>
                <td>${UI.esc(Engine.PALLET_TYPE[p.palletType] || '—')}</td>
                <td class="num"><b>${UI.fmt(p.panels)}</b></td>
                <td>${UI.esc(p.createdByName || '—')}${p.operatorName ? `<small>Op: ${UI.esc(p.operatorName)}</small>` : `<small>${UI.fmtDateTime(p.createdAt)}</small>`}</td>
                <td><span class="badge badge-${qs.tone}">${UI.esc(qs.label)}</span>${p.quality && p.quality.inspectorName ? `<small>Insp: ${UI.esc(p.quality.inspectorName)}</small>` : ''}</td>
                <td>${rowMeta ? `<span class="badge badge-${rowMeta.tone}">${UI.esc(rowMeta.label)}</span>` : '<span class="badge badge-red">No autorizado</span>'}</td>
                <td class="cell-actions">
                  ${canEditPallet ? `<button class="icon-btn" type="button" data-action="pallet-edit" data-id="${p.id}" title="Editar pallet">✎</button>` : ''}
                  ${editableFlow && can('order.edit') ? `<button class="icon-btn danger" type="button" data-action="pallet-delete" data-id="${p.id}" title="Eliminar pallet">✕</button>` : ''}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="11" class="table-empty">Aún no hay pallets registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${canAdd ? `<div class="card-foot"><span>Registra cada pallet individualmente con su evidencia fotográfica.</span>
        <button class="btn btn-outline btn-sm" type="button" data-action="pallet-new">＋ Nuevo pallet</button></div>` : ''}
      ${DB.currentUser() && DB.currentUser().role==='pt' && rec.totals.tally>0 && rec.totals.pt===rec.totals.tally && !order.closedAt ? `<div class="card-foot highlight"><span>Has completado ${UI.fmt(rec.totals.pt)} de ${UI.fmt(rec.totals.tally)} paneles. Firma y cierra tu entrega.</span><button class="btn btn-primary" type="button" data-action="pt-finalize" data-id="${order.id}">✓ Terminar y Firmar Entrega PT</button></div>` : ''}
    </section>`;
  }

  /* ---------------- formulario de pallet ---------------- */

  function palletFormHTML(order) {
    const mode = state.palletForm.mode;
    const editing = mode === 'edit' ? (order.pallets || []).find(p => p.id === state.palletForm.palletId) : null;
    const v = editing || {};
    const extra = state.palletForm.values || {};
    const value = (key, fallback) => extra[key] !== undefined ? extra[key] : (v[key] !== undefined && v[key] !== null ? v[key] : (fallback || ''));
    const nextNumber = `P-${String(order.pallets.length + 1).padStart(3, '0')}`;
    const items = order.items || [];

    return `<div class="pallet-form-card" id="palletFormCard">
      <header class="card-head"><div><p class="eyebrow">${mode === 'edit' ? 'CORRECCIÓN' : 'NUEVO REGISTRO'}</p><h2>${mode === 'edit' ? 'Editar pallet ' + UI.esc(v.number || '') : 'Registrar pallet'}</h2></div>
        <button class="icon-btn" type="button" data-action="pallet-cancel" aria-label="Cerrar">✕</button></header>
      <form id="palletForm" autocomplete="off" novalidate>
        <div class="form-grid">
          <label>ITEM ID autorizado <span class="req">*</span>
            <select id="pfItem" required>
              <option value="">Selecciona el producto…</option>
              ${items.map(it => {
                const key = Engine.keyOf(it.itemId, it.thickness);
                const row = order._rec.rows.find(r => r.key === key);
                const remaining = row ? Math.max(0, row.tally - row.pt) : 0;
                return `<option value="${UI.esc(it.itemId)}|${it.thickness}" ${value('itemId', '') === it.itemId && Number(value('thickness', 0)) === Number(it.thickness) ? 'selected' : ''}>
                  ${UI.esc(it.itemId)} · ${UI.esc(Engine.thicknessLabel(it.thickness))} · ${UI.esc(it.description || '')} · resta ${remaining}
                </option>`;
              }).join('')}
            </select></label>
          <label>Espesor del panel (mm) <span class="req">*</span>
            <input id="pfThickness" type="number" step="0.01" min="0" value="${UI.esc(value('thickness', ''))}" placeholder="Ej. 19" /></label>
          <label>Número de pallet <span class="req">*</span>
            <input id="pfNumber" value="${UI.esc(value('number', nextNumber))}" placeholder="Ej. P-001" /></label>
          <label>Cantidad de paneles <span class="req">*</span>
            <input id="pfPanels" type="number" step="1" min="1" value="${UI.esc(value('panels', ''))}" placeholder="Ej. 200" /></label>
          <label>Tipo de empaque <span class="req">*</span>
            <select id="pfPackaging">
              ${Object.entries(Engine.PACKAGING).map(([k, label]) => `<option value="${k}" ${value('packaging', 'palet') === k ? 'selected' : ''}>${label}</option>`).join('')}
            </select></label>
          <label>Tipo de pallet
            <select id="pfType">
              ${Object.entries(Engine.PALLET_TYPE).map(([k, label]) => `<option value="${k}" ${value('palletType', 'simple') === k ? 'selected' : ''}>${label}</option>`).join('')}
            </select></label>
          <label>Responsable físico del pallet <small>(opcional)</small>
            <input id="pfOperator" value="${UI.esc(value('operatorName', ''))}" placeholder="Ej. Juan Pérez" /></label>
          <label class="span-2">Observaciones
            <textarea id="pfObs" rows="2" placeholder="Novedades del pallet, condición del empaque, etc.">${UI.esc(value('observations', ''))}</textarea></label>
        </div>

        <div class="pallet-remaining" id="pfRemaining"></div>

        <div class="evidence-field">
          <div class="evidence-head"><b>Evidencia fotográfica (opcional)</b><span>Si deseas, adjunta fotos del pallet. En móvil puedes tomar la foto directamente.</span></div>
          <label class="file-button">
            <input id="pfPhotos" type="file" accept="image/*" multiple hidden />
            📷 Tomar o seleccionar fotos
          </label>
          <div class="photo-preview" id="pfPhotoPreview"></div>
          ${(editing && editing.evidence && editing.evidence.length) ? `<div class="photo-preview">
            ${editing.evidence.map(ev => `<div class="photo-thumb existing" data-photo-key="${ev.key}">
              <button type="button" class="photo-del" data-action="remove-evidence" data-key="${ev.key}" title="Quitar evidencia">✕</button>
            </div>`).join('')}
          </div>` : ''}
        </div>

        ${can('order.edit') ? `<label class="check-line"><input type="checkbox" id="pfOverride" /> Autorizar exceso sobre la cantidad del TALLY SHEET (solo Superadministrador, requiere motivo)</label>` : ''}
        <p class="field-error" id="palletError" role="alert"></p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-action="pallet-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${mode === 'edit' ? 'Guardar corrección' : 'Registrar pallet'}</button>
        </div>
      </form>
    </div>`;
  }

  function updatePalletRemaining() {
    const order = state.order;
    if (!order) return;
    const itemSel = document.getElementById('pfItem');
    const thickness = document.getElementById('pfThickness');
    const panels = document.getElementById('pfPanels');
    const hint = document.getElementById('pfRemaining');
    if (!itemSel || !panels || !hint) return;
    const [itemId] = (itemSel.value || '').split('|');
    if (!itemId) { hint.innerHTML = '<span>Selecciona un ITEM autorizado para ver el saldo disponible.</span>'; return; }
    const thk = Engine.thicknessNumber(thickness.value);
    const row = order._rec.rows.find(r => r.key === Engine.keyOf(itemId, thk));
    const editing = state.palletForm && state.palletForm.mode === 'edit'
      ? (order.pallets || []).find(p => p.id === state.palletForm.palletId) : null;
    const ownQty = editing ? Number(editing.panels) || 0 : 0;
    const authorized = row ? row.tally : 0;
    const reported = row ? row.pt - ownQty : 0;
    const remaining = row ? Math.max(0, authorized - reported) : 0;
    const qty = Number(panels.value) || 0;
    const exceeds = qty > remaining;
    hint.className = 'pallet-remaining' + (exceeds ? ' exceeds' : '');
    hint.innerHTML = row
      ? `<span>Autorizado: <b>${UI.fmt(authorized)}</b></span><span>Ya reportado: <b>${UI.fmt(reported)}</b></span><span>Disponible: <b>${UI.fmt(remaining)}</b></span>
         ${exceeds ? `<span class="over">⚠ Excede el saldo en ${UI.fmt(qty - remaining)} paneles</span>` : ''}`
      : `<span class="over">⚠ ITEM ID / espesor no autorizado en el TALLY SHEET.</span>`;
  }

  function paintPendingPhotos() {
    const box = document.getElementById('pfPhotoPreview');
    if (!box) return;
    box.innerHTML = state.pendingPhotos.map((file, idx) => `<div class="photo-thumb pending">
      ${state.photoPreviewUrls[idx] ? `<img src="${state.photoPreviewUrls[idx]}" alt="Evidencia" />` : ''}
      <button type="button" class="photo-del" data-action="remove-pending-photo" data-idx="${idx}">✕</button>
      <span>${UI.esc(file.name)}</span>
    </div>`).join('');
  }

  async function submitPallet(form) {
    const order = state.order;
    if (!order) return;
    const error = document.getElementById('palletError');
    const itemSel = document.getElementById('pfItem');
    const [selItemId, selThickness] = (itemSel.value || '').split('|');
    const thickness = Engine.thicknessNumber(document.getElementById('pfThickness').value || selThickness);
    const panels = Number(document.getElementById('pfPanels').value);
    const number = document.getElementById('pfNumber').value.trim();
    const packaging = document.getElementById('pfPackaging').value;
    const palletType = document.getElementById('pfType').value;
    const observations = document.getElementById('pfObs').value.trim();
    const operatorName = document.getElementById('pfOperator').value.trim();
    const editing = state.palletForm && state.palletForm.mode === 'edit'
      ? (order.pallets || []).find(p => p.id === state.palletForm.palletId) : null;

    const errors = [];
    if (!selItemId) errors.push('Selecciona un ITEM ID del TALLY SHEET.');
    if (!(thickness > 0)) errors.push('El espesor debe ser mayor a 0.');
    if (!(panels > 0)) errors.push('La cantidad de paneles debe ser mayor a 0.');
    if (!number) errors.push('El número de pallet es obligatorio.');
    if ((order.pallets || []).some(p => p.number.toLowerCase() === number.toLowerCase() && (!editing || p.id !== editing.id))) {
      errors.push(`El número de pallet ${number} ya existe en esta orden.`);
    }
    const row = order._rec.rows.find(r => r.key === Engine.keyOf(selItemId, thickness));
    if (!row) errors.push('El ITEM ID y espesor no están autorizados en el TALLY SHEET. Calidad no podrá aprobar este pallet.');
    if (errors.length) {
      error.innerHTML = errors.map(e => `<span>• ${UI.esc(e)}</span>`).join('');
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const ownQty = editing ? Number(editing.panels) || 0 : 0;
    const remaining = Math.max(0, row.tally - (row.pt - ownQty));
    let overrideReason = '';
    if (panels > remaining) {
      const override = document.getElementById('pfOverride');
      if (!override || !override.checked) {
        error.innerHTML = `<span>• La cantidad supera el saldo autorizado en ${UI.fmt(panels - remaining)} paneles. Solicita autorización al Superadministrador o corrige la cantidad.</span>`;
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      overrideReason = await UI.reasonDialog({
        eyebrow: 'AUTORIZACIÓN EXCEPCIONAL',
        title: 'Autorizar exceso sobre el TALLY SHEET',
        subtitle: 'Este exceso generará una alerta de conciliación y quedará registrado en la auditoría con tu nombre.',
        okLabel: 'Autorizar y registrar',
        danger: true,
        placeholder: 'Motivo por el que se autoriza reportar más paneles de los programados...'
      });
      if (!overrideReason) return;
    }

    if (window.DB.settings().requirePhotos && !state.pendingPhotos.length && !(editing && editing.evidence && editing.evidence.length)) {
      error.innerHTML = '<span>• Adjunta al menos una fotografía del pallet como evidencia.</span>';
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const palletId = editing ? editing.id : DB.uid('pal');
    const me = actor();
    const removed = (state.palletForm && state.palletForm.removedEvidence) || [];
    const evidence = (editing && editing.evidence ? editing.evidence.slice() : []).filter(ev => !removed.includes(ev.key));
    for (const key of removed) await DB.deleteFile(key);
    for (const file of state.pendingPhotos) {
      const key = `ev:${palletId}:${DB.uid('f')}`;
      await DB.saveFile(key, file, { name: file.name, type: file.type, size: file.size, kind: 'evidence' });
      evidence.push({ key, name: file.name, type: file.type, size: file.size, uploadedBy: me.name, uploadedAt: DB.nowIso() });
    }

    const reasons = [];
    if (editing && editing.quality && ['aprobado', 'rechazado', 'requiere_correccion', 'corregido'].includes(editing.quality.status)) {
      const reason = await UI.reasonDialog({
        eyebrow: 'CORRECCIÓN',
        title: 'Modificar un pallet ya inspeccionado',
        subtitle: 'La inspección de Calidad volverá al estado pendiente. El motivo es obligatorio.',
        okLabel: 'Guardar corrección',
        placeholder: 'Describe qué se corrige y por qué...'
      });
      if (!reason) return;
      reasons.push(reason);
    }

    const payload = {
      number,
      itemId: selItemId,
      description: (order.items.find(it => Engine.normItem(it.itemId) === Engine.normItem(selItemId)) || {}).description || '',
      thickness,
      panels,
      packaging,
      palletType: packaging === 'palet' ? palletType : 'no_aplica',
      netWeight: Number(document.getElementById('pfNet')?.value) || 0,
      grossWeight: Number(document.getElementById('pfGross')?.value) || 0,
      bf: Number(document.getElementById('pfBf')?.value) || 0,
      m3: Number(document.getElementById('pfM3')?.value) || 0,
      observations,
      operatorName,
      evidence
    };

    state.palletForm = null;
    state.pendingPhotos.forEach((_, i) => { if (state.photoPreviewUrls[i]) URL.revokeObjectURL(state.photoPreviewUrls[i]); });
    state.pendingPhotos = [];
    state.photoPreviewUrls = [];

    DB.mutate(db => {
      const ord = db.orders.find(o => o.id === order.id);
      if (!ord) return;
      if (editing) {
        const pallet = ord.pallets.find(p => p.id === editing.id);
        const before = { panels: pallet.panels, thickness: pallet.thickness, itemId: pallet.itemId, number: pallet.number };
        const cameFromRejectedOrCorrection = editing.quality && ['rechazado', 'requiere_correccion', 'corregido'].includes(editing.quality.status);
        Object.assign(pallet, payload);
        pallet.updatedAt = DB.nowIso();
        pallet.updatedByName = me.name;
        pallet.quality = { status: cameFromRejectedOrCorrection ? 'corregido' : 'pendiente' };
        pallet.history = pallet.history || [];
        pallet.history.push({
          ts: DB.nowIso(), userName: me.name, role: me.role, action: 'pallet_update',
          detail: cameFromRejectedOrCorrection
            ? `Corregido por PT. Antes: ${before.number} · ${before.itemId} · ${Engine.thicknessLabel(before.thickness)} · ${before.panels} paneles.${reasons.length ? ' Motivo: ' + reasons.join(' ') : ''}`
            : `Actualizado. Antes: ${before.number} · ${before.itemId} · ${Engine.thicknessLabel(before.thickness)} · ${before.panels} paneles.${reasons.length ? ' Motivo: ' + reasons.join(' ') : ''}`
        });
        DB.log('pallet_update', {
          orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: pallet.id,
          detail: `Pallet ${pallet.number} corregido por ${me.name}. ${overrideReason ? 'Exceso autorizado: ' + overrideReason : ''} ${reasons.join(' ')}`.trim()
        });
      } else {
        const pallet = Object.assign({
          id: palletId,
          createdAt: DB.nowIso(),
          createdBy: me,
          createdByName: me.name,
          updatedAt: DB.nowIso(),
          quality: { status: 'pendiente' },
          history: [{ ts: DB.nowIso(), userName: me.name, role: me.role, action: 'pallet_create', detail: 'Pallet registrado por Producto Terminado.' }]
        }, payload);
        ord.pallets.push(pallet);
        DB.log('pallet_create', {
          orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: pallet.id,
          detail: `Pallet ${pallet.number} · ${pallet.itemId} · ${Engine.thicknessLabel(pallet.thickness)} · ${pallet.panels} paneles. ${overrideReason ? 'Exceso autorizado: ' + overrideReason : ''}`.trim()
        });
      }
    });

    const isCorrectionReturn = editing && editing.quality && ['rechazado', 'requiere_correccion', 'corregido'].includes(editing.quality.status);
    UI.toast(isCorrectionReturn ? 'Corrección guardada · pendiente de reinspección' : (editing ? 'Pallet actualizado' : 'Pallet registrado'), 'success', `${number} · ${UI.fmt(panels)} paneles`);
    UI.broadcastToast(isCorrectionReturn ? 'Producto Terminado corrigió un pallet' : 'Producto Terminado actualizó pallets', 'info', `${order.code} · ${me.name}`);

    // Sincroniza con Sheets en segundo plano (no bloquea UI)
    if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
      (async () => {
        try {
          const shipments = await BalsasudAPI.listShipments();
          const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
          if (!shipment) return;
          await BalsasudAPI.createRelease({
            shipmentId: shipment.shipmentId,
            itemId: payload.itemId,
            thickness: payload.thickness,
            releasedPanels: payload.panels,
            pallets: payload.packaging === 'palet' ? [{ palletType: payload.palletType, packages: 1, panels: payload.panels }] : [],
            boxes: payload.packaging === 'caja' ? [{ packages: 1, panels: payload.panels }] : []
          });
        } catch (e) { console.warn('Sync pallet a Sheets falló', e); }
      })();
    }
  }

  /* ============================================================
     CALIDAD · INSPECCIÓN
     ============================================================ */

  function qualityTab(order, rec, q) {
    const filter = state.qualityFilter;
    const pallets = (order.pallets || []).filter(p => {
      const s = (p.quality && p.quality.status) || 'pendiente';
      if (filter === 'todos') return true;
      if (filter === 'pendientes') return s === 'pendiente' || s === 'en_inspeccion';
      if (filter === 'aprobados') return s === 'aprobado';
      if (filter === 'rechazados') return s === 'rechazado' || s === 'requiere_correccion';
      if (filter === 'corregidos') return s === 'corregido';
      return true;
    });
    const hasPallets = order.pallets && order.pallets.length;
    const canInspect = can('quality.inspect') && !order.closedAt && !order.releasedAt;

    const statusBadge = order.closedAt
      ? '<span class="badge badge-gray">Despacho cerrado</span>'
      : order.releasedAt
        ? '<span class="badge badge-green">Liberado</span>'
        : order.submittedAt
          ? `<span class="badge badge-blue">Recibido ${UI.fmtDateTime(order.submittedAt)}</span>`
          : hasPallets
            ? '<span class="badge badge-amber">Pallets en registro</span>'
            : '<span class="badge badge-amber">Sin pallets</span>';

    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">CONTROL DE CALIDAD</p><h2>Inspección de pallets</h2></div>
        <div class="head-actions">${statusBadge}</div></header>

      ${!hasPallets ? `<div class="notice notice-amber"><b>Producto Terminado aún no ha registrado pallets</b><span>Calidad podrá inspeccionar cuando PT registre el primer pallet.</span></div>` : ''}
      ${rec.ok && !order.closedAt && !order.releasedAt ? `<div class="notice notice-green"><b>✓ Despacho conciliado</b><span>TALLY SHEET = Producto Terminado = Calidad. La liberación está habilitada.</span></div>` : ''}

      <div class="mini-kpis">
        <div><span>Pallets</span><b>${q.total}</b></div>
        <div class="tone-green"><span>Aprobados</span><b>${q.approved}</b></div>
        <div class="tone-amber"><span>Pendientes</span><b>${q.pending + q.inspecting}</b></div>
        <div class="tone-red"><span>Rechazados</span><b>${q.rejected}</b></div>
        <div class="tone-red"><span>Corrección</span><b>${q.correction}</b></div>
        <div class="tone-amber"><span>Corregidos · reinspección</span><b>${q.corrected}</b></div>
        <div><span>Paneles aprobados</span><b>${UI.fmt(rec.totals.quality)} / ${UI.fmt(rec.totals.tally)}</b></div>
      </div>

      <div class="chip-row">
        ${[['todos', 'Todos'], ['pendientes', 'Pendientes'], ['aprobados', 'Aprobados'], ['rechazados', 'Rechazados'], ['corregidos', 'Corregidos']].map(([key, label]) =>
          `<button type="button" class="chip ${filter === key ? 'active' : ''}" data-action="quality-filter" data-filter="${key}">${label}</button>`).join('')}
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Estado</th><th>ITEM ID / Descripción</th><th>Espesor</th><th class="num">Reportado</th><th class="num">Verificado</th>
            <th>Inspector</th><th>Fecha</th><th>Observaciones</th><th></th></tr></thead>
          <tbody>
            ${pallets.length ? pallets.map(p => {
              const quality = p.quality || { status: 'pendiente' };
              const meta = Engine.Q_STATUS[quality.status] || Engine.Q_STATUS.pendiente;
              return `<tr>
                <td><b class="nowrap">${UI.esc(p.number)}</b></td>
                <td><span class="badge badge-${meta.tone}">${UI.esc(meta.label)}</span></td>
                <td><b class="mono">${UI.esc(p.itemId)}</b><small>${UI.esc(p.description || '—')}</small></td>
                <td>${Engine.thicknessLabel(p.thickness)}</td>
                <td class="num">${UI.fmt(p.panels)}</td>
                <td class="num">${quality.verifiedPanels !== undefined && quality.verifiedPanels !== null ? UI.fmt(quality.verifiedPanels) : '—'}</td>
                <td>${UI.esc(quality.byName || '—')}</td>
                <td>${quality.at ? UI.fmtDateTime(quality.at) : '—'}<small>${quality.at ? UI.relTime(quality.at) : ''}</small></td>
                <td class="cell-note">${UI.esc(quality.observations || '—')}</td>
                <td class="cell-actions">
                  ${canInspect ? `<button class="btn btn-sm ${quality.status === 'aprobado' ? 'btn-ghost' : 'btn-outline'}" type="button" data-action="inspect" data-id="${p.id}">${quality.status === 'aprobado' ? 'Revisar' : quality.status === 'corregido' ? 'Reinspeccionar' : 'Inspeccionar'}</button>` : ''}
                  ${can('order.edit') && quality.status === 'aprobado' && !order.closedAt ? `<button class="icon-btn" type="button" data-action="quality-revert" data-id="${p.id}" title="Revertir aprobación">↺</button>` : ''}
                  ${(p.evidence || []).length ? `<button class="icon-btn" type="button" data-action="view-pallet-photos" data-id="${p.id}" title="Ver evidencias">▣</button>` : ''}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="10" class="table-empty">No hay pallets en este filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="hint">Calidad no puede aprobar un pallet con ITEM ID, espesor o cantidad distintos al TALLY SHEET autorizado.</p>
      ${DB.currentUser() && DB.currentUser().role==='calidad' && rec.totals.quality===rec.totals.tally && rec.totals.tally>0 && !order.closedAt ? `<div class="card-foot highlight"><span>Has aprobado ${UI.fmt(rec.totals.quality)} de ${UI.fmt(rec.totals.tally)} paneles. Genera el PDF único final con todas las thicknesses y firmas.</span><button class="btn btn-primary" type="button" data-action="qc-finalize" data-id="${order.id}">✓ Liberación Final - Firmar y Generar PDF Único</button></div>` : ''}
    </section>`;
  }

  function openInspection(palletId) {
    const order = state.order;
    if (!order) return;
    const pallet = (order.pallets || []).find(p => p.id === palletId);
    if (!pallet) return;
    const rec = order._rec;
    const row = rec.rows.find(r => r.key === Engine.keyOf(pallet.itemId, pallet.thickness));
    const quality = pallet.quality || { status: 'pendiente' };
    const readOnly = quality.status === 'aprobado' && !can('order.edit');
    const approvedOthers = rec.rows.reduce((t, r) => {
      const isThis = r.key === Engine.keyOf(pallet.itemId, pallet.thickness) && r.pallets.some(p => p.id === pallet.id);
      if (!isThis) return t;
      return t + r.pallets.filter(p => p.id !== pallet.id && Engine.isApproved(p)).reduce((s, p) => s + Engine.approvedQty(p), 0);
    }, 0);
    const expectedThk = row ? row.thicknessLabel : 'no autorizado';
    UI.openModal({
      eyebrow: 'INSPECCIÓN DE CALIDAD',
      title: `Pallet ${pallet.number}`,
      subtitle: `ITEM ${pallet.itemId} · ${UI.esc(pallet.description || '')} · ${Engine.thicknessLabel(pallet.thickness)}`,
      size: 'lg',
      locked: false,
      body: `<div class="inspection-grid">
        <div class="inspection-left">
          <div class="inspection-facts">
            <div><span>Paneles reportados</span><b>${UI.fmt(pallet.panels)}</b></div>
            <div><span>Empaque</span><b>${UI.esc(Engine.PACKAGING[pallet.packaging] || '—')} · ${UI.esc(Engine.PALLET_TYPE[pallet.palletType] || '—')}</b></div>
            <div><span>Reportado por</span><b>${UI.esc(pallet.createdByName || '—')}</b></div>
            <div><span>Fecha de registro</span><b>${UI.fmtDateTime(pallet.createdAt)}</b></div>
            <div><span>Peso neto / bruto</span><b>${pallet.netWeight ? UI.fmt(pallet.netWeight) : '—'} / ${pallet.grossWeight ? UI.fmt(pallet.grossWeight) : '—'} kg</b></div>
            <div><span>Observaciones PT</span><b>${UI.esc(pallet.observations || '—')}</b></div>
          </div>

          <div class="tally-compare">
            <p class="eyebrow">CONTRASTE CON EL TALLY SHEET</p>
            <div class="compare-row"><span>Autorizado (${UI.esc(expectedThk)})</span><b>${row ? UI.fmt(row.tally) : '—'}</b></div>
            <div class="compare-row"><span>Aprobado previamente (otros pallets)</span><b>${UI.fmt(approvedOthers)}</b></div>
            <div class="compare-row"><span>Reportado por PT (total ítem)</span><b>${row ? UI.fmt(row.pt) : '—'}</b></div>
            <div class="compare-row accent"><span>Este pallet</span><b>${UI.fmt(pallet.panels)}</b></div>
            <div class="compare-row"><span>Total si se aprueba</span><b>${UI.fmt(approvedOthers + Number(pallet.panels || 0))}</b></div>
            ${row && row.diffPt !== 0 ? `<p class="inline-alert">⚠ El total del ítem presenta una diferencia de ${row.diffPt > 0 ? '+' : ''}${UI.fmt(row.diffPt)} paneles frente al TALLY SHEET.</p>` : ''}
            ${row && (approvedOthers + Number(pallet.panels || 0)) > row.tally ? `<p class="inline-alert">⚠ Aprobar este pallet excedería el TALLY autorizado (${UI.fmt(row.tally)}).</p>` : ''}
            ${!row ? '<p class="inline-alert">⚠ Este ITEM ID / espesor no está autorizado en el TALLY SHEET.</p>' : ''}
          </div>

          <div class="inspection-photos">
            <p class="eyebrow">EVIDENCIA FOTOGRÁFICA</p>
            <div class="photo-grid">
              ${(pallet.evidence || []).length ? pallet.evidence.map(ev => `<button type="button" class="photo-thumb" data-photo-key="${ev.key}" data-action="open-photo" data-caption="${UI.esc(pallet.number + ' · ' + pallet.itemId)}" title="${UI.esc(ev.name)}"></button>`).join('')
                : '<p class="muted">Sin evidencia fotográfica adjunta.</p>'}
            </div>
          </div>
        </div>

        <div class="inspection-right">
          <div class="field-row">
            <label>ITEM ID verificado<input id="qiItem" value="${UI.esc(pallet.itemId)}" ${readOnly ? 'disabled' : ''} /></label>
            <label>Espesor verificado (mm)<input id="qiThickness" type="number" step="0.01" value="${pallet.thickness}" ${readOnly ? 'disabled' : ''} /></label>
          </div>
          <div class="field-row">
            <label>Paneles verificados<input id="qiPanels" type="number" step="1" min="0" value="${pallet.panels}" ${readOnly ? 'disabled' : ''} /></label>
            <label>&nbsp;<span class="fixed-value">Reportado: <b>${UI.fmt(pallet.panels)}</b></span></label>
          </div>
          <fieldset class="check-fieldset" ${readOnly ? 'disabled' : ''}>
            <legend>Lista de verificación</legend>
            <label class="check-line"><input type="checkbox" id="qc1" ${quality.checklist && quality.checklist.dimensiones ? 'checked' : ''} /> Dimensiones y espesor conformes</label>
            <label class="check-line"><input type="checkbox" id="qc2" ${quality.checklist && quality.checklist.cantidad ? 'checked' : ''} /> Cantidad de paneles conforme</label>
            <label class="check-line"><input type="checkbox" id="qc3" ${quality.checklist && quality.checklist.empaque ? 'checked' : ''} /> Empaque y etiquetado conformes</label>
            <label class="check-line"><input type="checkbox" id="qc4" ${quality.checklist && quality.checklist.evidencia ? 'checked' : ''} /> Evidencia fotográfica disponible</label>
          </fieldset>
          <label>Observaciones de inspección
            <textarea id="qiObs" rows="3" ${readOnly ? 'disabled' : ''} placeholder="Hallazgos, condición del pallet, motivo de rechazo...">${UI.esc(quality.observations || '')}</textarea></label>
          <label>Inspector físico <small>(opcional)</small>
            <input id="qiInspector" value="${UI.esc(quality.inspectorName || '')}" ${readOnly ? 'disabled' : ''} placeholder="Ej. Ana Gómez" /></label>
          <p class="field-error" id="qiError" role="alert"></p>
          ${quality.status === 'aprobado' ? `<div class="notice notice-green compact"><b>Aprobado el ${UI.fmtDateTime(quality.at)}</b><span>por ${UI.esc(quality.byName || '—')}</span></div>` : ''}
          ${quality.status === 'rechazado' ? `<div class="notice notice-red compact"><b>Rechazado</b><span>${UI.esc(quality.observations || '')}</span></div>` : ''}
          ${quality.status === 'requiere_correccion' ? `<div class="notice notice-red compact"><b>Requiere corrección</b><span>${UI.esc(quality.observations || '')}</span></div>` : ''}
          ${quality.status === 'corregido' ? `<div class="notice notice-amber compact"><b>Corregido por Producto Terminado</b><span>Pendiente de reinspección. ${UI.esc(quality.observations || '')}</span></div>` : ''}
        </div>
      </div>`,
      footer: readOnly
        ? `<button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button>`
        : `<button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
           <button type="button" class="btn btn-outline" id="qiCorrection">↺ Requiere corrección</button>
           <button type="button" class="btn btn-danger" id="qiReject">✕ Rechazar</button>
           <button type="button" class="btn btn-success" id="qiApprove">✓ Aprobar pallet</button>`,
      onMount(modal) {
        UI.hydratePhotos(modal);
        if (readOnly) return;
        const err = modal.querySelector('#qiError');

        modal.querySelector('#qiApprove').addEventListener('click', () => {
          err.textContent = '';
          if (!row) { err.textContent = 'No se puede aprobar: el ITEM ID y espesor no están autorizados en el TALLY SHEET.'; return; }
          const vItem = Engine.normItem(modal.querySelector('#qiItem').value);
          const vThk = Engine.thicknessNumber(modal.querySelector('#qiThickness').value);
          const vPanels = Number(modal.querySelector('#qiPanels').value);
          if (vItem !== Engine.normItem(pallet.itemId) || vItem !== row.itemId) {
            err.textContent = 'El ITEM ID verificado no coincide con el pallet registrado ni con el TALLY SHEET.'; return;
          }
          if (vThk !== row.thickness) {
            err.textContent = `ALERTA DE ESPESOR: el espesor verificado (${Engine.thicknessLabel(vThk)}) no coincide con el autorizado (${row.thicknessLabel}).`; return;
          }
          if (!(vPanels > 0) || vPanels !== Number(pallet.panels)) {
            err.textContent = `La cantidad verificada (${vPanels}) no coincide con la reportada (${pallet.panels}). Marca "Requiere corrección" o rechaza el pallet.`; return;
          }
          if (!(modal.querySelector('#qc1').checked && modal.querySelector('#qc2').checked && modal.querySelector('#qc3').checked && modal.querySelector('#qc4').checked)) {
            err.textContent = 'Completa toda la lista de verificación antes de aprobar.'; return;
          }
          if (approvedOthers + vPanels > row.tally) {
            err.textContent = `Excede lo autorizado: aprobados ${approvedOthers} + este pallet ${vPanels} > TALLY ${row.tally}. No se puede aprobar.`; return;
          }
          const me = actor();
          const observations = modal.querySelector('#qiObs').value.trim();
          const inspectorName = modal.querySelector('#qiInspector').value.trim();
          DB.mutate(db => {
            const ord = db.orders.find(o => o.id === order.id);
            const target = ord.pallets.find(p => p.id === pallet.id);
            target.quality = {
              status: 'aprobado',
              verifiedItemId: pallet.itemId,
              verifiedThickness: vThk,
              verifiedPanels: vPanels,
              checklist: {
                dimensiones: modal.querySelector('#qc1').checked,
                cantidad: modal.querySelector('#qc2').checked,
                empaque: modal.querySelector('#qc3').checked,
                evidencia: modal.querySelector('#qc4').checked
              },
              observations,
              inspectorName,
              byId: me.id,
              byName: me.name,
              at: DB.nowIso()
            };
            target.history = target.history || [];
            target.history.push({ ts: DB.nowIso(), userName: me.name, role: me.role, action: 'quality_approve', detail: `Aprobado: ${vPanels} paneles · ${Engine.thicknessLabel(vThk)}.` });
            DB.log('quality_approve', {
              orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: target.id,
              detail: `Calidad aprobó el pallet ${target.number} (${target.itemId}, ${Engine.thicknessLabel(target.thickness)}, ${vPanels} paneles).`
            });
          });
          UI.closeModal();
          renderRoute();
          UI.toast('Pallet aprobado', 'success', `${pallet.number} · ${UI.fmt(vPanels)} paneles`);
          UI.broadcastToast('Calidad aprobó un pallet', 'success', `${order.code} · ${pallet.number}`);
          // Sync a Sheets/Drive en segundo plano
          if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
            (async () => {
              try {
                const shipments = await BalsasudAPI.listShipments();
                const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
                if (!shipment) return;
                const releases = await BalsasudAPI.listReleases(shipment.shipmentId);
                let release = releases.find(r => String(r.itemId).toUpperCase()===String(pallet.itemId).toUpperCase() && Number(r.thickness)===Number(pallet.thickness) && Number(r.releasedPanels)===Number(pallet.panels));
                if (!release) {
                  release = await BalsasudAPI.createRelease({ shipmentId: shipment.shipmentId, itemId: pallet.itemId, thickness: pallet.thickness, releasedPanels: pallet.panels });
                }
                const inspection = await BalsasudAPI.createInspection({
                  releaseId: release.releaseId,
                  itemId: pallet.itemId,
                  thickness: pallet.thickness,
                  inspectedPanels: vPanels,
                  approvedPanels: vPanels,
                  rejectedPanels: 0,
                  observations,
                  controlSheet: { inspectorName: me.name, productionResponsible: pallet.createdByName || '' },
                  samples: [{ sampleNo: 1, itemId: pallet.itemId, palletHeight: Engine.thicknessLabel(pallet.thickness), qualitySamplingCheck: '✓', observations }]
                });
                const res = await BalsasudAPI.finalizeInspection(inspection.inspectionId);
                UI.toast('PDF FOR-QC-08 generado en Drive', 'success', res.pdf ? res.pdf.driveUrl : inspection.inspectionId);
              } catch(e){ console.warn('Sync Calidad a Sheets falló', e); }
            })();
          }
          setTimeout(() => {
            const fresh = preparedOrder(order.id);
            if (fresh && fresh._rec.ok) {
              UI.toast('✓ Despacho conciliado', 'success', 'TALLY = Producto Terminado = Calidad. Liberación habilitada.');
            }
          }, 120);
        });

        modal.querySelector('#qiReject').addEventListener('click', async () => {
          const reason = await UI.reasonDialog({
            eyebrow: 'RECHAZO DE CALIDAD',
            title: `Rechazar pallet ${pallet.number}`,
            subtitle: 'El pallet regresará a Producto Terminado para su revisión y corrección.',
            okLabel: 'Rechazar pallet',
            danger: true,
            placeholder: 'Motivo del rechazo (diferencias de espesor, cantidad, empaque, calidad del panel...)'
          });
          if (!reason) return;
          const me = actor();
          const inspectorName = modal.querySelector('#qiInspector').value.trim();
          DB.mutate(db => {
            const ord = db.orders.find(o => o.id === order.id);
            const target = ord.pallets.find(p => p.id === pallet.id);
            target.quality = {
              status: 'rechazado',
              inspectorName,
              observations: reason,
              byId: me.id,
              byName: me.name,
              at: DB.nowIso(),
              verifiedPanels: Number(modal.querySelector('#qiPanels').value) || 0,
              verifiedThickness: Engine.thicknessNumber(modal.querySelector('#qiThickness').value),
              verifiedItemId: modal.querySelector('#qiItem').value.trim()
            };
            target.history = target.history || [];
            target.history.push({ ts: DB.nowIso(), userName: me.name, role: me.role, action: 'quality_reject', detail: `Rechazado. ${reason}` });
            DB.log('quality_reject', {
              orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: target.id,
              detail: `Calidad rechazó el pallet ${target.number}. Motivo: ${reason}`
            });
          });
          UI.closeModal();
          renderRoute();
          UI.toast('Pallet rechazado', 'warn', pallet.number);
          UI.broadcastToast('Calidad rechazó un pallet', 'error', `${order.code} · ${pallet.number}`);
          if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
            (async () => {
              try {
                const shipments = await BalsasudAPI.listShipments();
                const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
                if (!shipment) return;
                const releases = await BalsasudAPI.listReleases(shipment.shipmentId);
                let release = releases.find(r => String(r.itemId).toUpperCase()===String(pallet.itemId).toUpperCase() && Number(r.thickness)===Number(pallet.thickness));
                if (!release) release = await BalsasudAPI.createRelease({ shipmentId: shipment.shipmentId, itemId: pallet.itemId, thickness: pallet.thickness, releasedPanels: pallet.panels });
                const vPanels = Number(modal.querySelector('#qiPanels').value)||pallet.panels;
                const inspection = await BalsasudAPI.createInspection({ releaseId: release.releaseId, itemId: pallet.itemId, thickness: pallet.thickness, inspectedPanels: vPanels, approvedPanels: 0, rejectedPanels: vPanels, observations: reason });
                await BalsasudAPI.finalizeInspection(inspection.inspectionId);
              } catch(e){ console.warn('Sync rechazo falló', e); }
            })();
          }
        });

        modal.querySelector('#qiCorrection').addEventListener('click', async () => {
          const reason = await UI.reasonDialog({
            eyebrow: 'CORRECCIÓN',
            title: `Solicitar corrección · ${pallet.number}`,
            subtitle: 'El pallet volverá a Producto Terminado para que ajuste el registro.',
            okLabel: 'Solicitar corrección',
            danger: true,
            placeholder: 'Describe qué debe corregirse (cantidad, espesor, ITEM ID, evidencia...)'
          });
          if (!reason) return;
          const me = actor();
          const inspectorName = modal.querySelector('#qiInspector').value.trim();
          DB.mutate(db => {
            const ord = db.orders.find(o => o.id === order.id);
            const target = ord.pallets.find(p => p.id === pallet.id);
            target.quality = { status: 'requiere_correccion', observations: reason, inspectorName, byId: me.id, byName: me.name, at: DB.nowIso() };
            target.history = target.history || [];
            target.history.push({ ts: DB.nowIso(), userName: me.name, role: me.role, action: 'quality_correction', detail: `Requiere corrección. ${reason}` });
            DB.log('quality_correction', {
              orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: target.id,
              detail: `Calidad solicitó corrección del pallet ${target.number}. Motivo: ${reason}`
            });
          });
          UI.closeModal();
          renderRoute();
          UI.toast('Corrección solicitada', 'warn', pallet.number);
          UI.broadcastToast('Calidad solicitó una corrección', 'warn', `${order.code} · ${pallet.number}`);
          if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
            (async () => {
              try {
                const shipments = await BalsasudAPI.listShipments();
                const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
                if (!shipment) return;
                const releases = await BalsasudAPI.listReleases(shipment.shipmentId);
                let release = releases.find(r => String(r.itemId).toUpperCase()===String(pallet.itemId).toUpperCase() && Number(r.thickness)===Number(pallet.thickness));
                if (!release) release = await BalsasudAPI.createRelease({ shipmentId: shipment.shipmentId, itemId: pallet.itemId, thickness: pallet.thickness, releasedPanels: pallet.panels });
                await BalsasudAPI.createInspection({ releaseId: release.releaseId, itemId: pallet.itemId, thickness: pallet.thickness, inspectedPanels: Number(pallet.panels), approvedPanels: 0, rejectedPanels: 0, observations: reason });
              } catch(e){ console.warn('Sync corrección falló', e); }
            })();
          }
        });
      }
    });
  }

  function revertInspection(palletId) {
    const order = state.order;
    const pallet = (order.pallets || []).find(p => p.id === palletId);
    if (!pallet) return;
    UI.reasonDialog({
      eyebrow: 'REVERSIÓN DE INSPECCIÓN',
      title: `Revertir aprobación · ${pallet.number}`,
      subtitle: 'El pallet volverá a estado pendiente y deberá ser inspeccionado nuevamente.',
      okLabel: 'Revertir aprobación',
      danger: true,
      placeholder: 'Motivo por el cual se revierte la aprobación...'
    }).then(reason => {
      if (!reason) return;
      const me = actor();
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === order.id);
        const target = ord.pallets.find(p => p.id === pallet.id);
        target.quality = { status: 'pendiente', observations: reason };
        target.history = target.history || [];
        target.history.push({ ts: DB.nowIso(), userName: me.name, role: me.role, action: 'quality_revert', detail: `Aprobación revertida. ${reason}` });
        DB.log('quality_revert', {
          orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: target.id,
          detail: `Aprobación revertida del pallet ${target.number}. Motivo: ${reason}`
        });
      });
      UI.toast('Aprobación revertida', 'warn', pallet.number);
    });
  }

  /* ============================================================
     CONCILIACIÓN
     ============================================================ */

  function conciliationTab(order, rec) {
    const verdict = rec.ok
      ? { tone: 'green', title: 'DESPACHO CONCILIADO', text: 'TALLY SHEET = Producto Terminado = Calidad. Las cantidades coinciden por ITEM ID y por espesor.' }
      : rec.hasDifferences
        ? { tone: 'red', title: 'DIFERENCIAS DETECTADAS', text: 'Existen diferencias entre las tres fuentes. La liberación está bloqueada hasta corregirlas.' }
        : { tone: 'amber', title: 'CONCILIACIÓN EN PROCESO', text: 'Faltan registros o inspecciones para completar la triple verificación.' };

    return `<section class="conciliation">
      <div class="verdict tone-${verdict.tone}">
        <span class="verdict-icon">${rec.ok ? '✓' : rec.hasDifferences ? '⚠' : '◷'}</span>
        <div><h2>${verdict.title}</h2><p>${verdict.text}</p></div>
        <div class="verdict-totals">
          <div><span>TALLY</span><b>${UI.fmt(rec.totals.tally)}</b></div>
          <div><span>PT</span><b class="${rec.totals.pt !== rec.totals.tally ? 'diff-text' : ''}">${UI.fmt(rec.totals.pt)}</b></div>
          <div><span>CALIDAD</span><b class="${rec.totals.quality !== rec.totals.pt ? 'diff-text' : ''}">${UI.fmt(rec.totals.quality)}</b></div>
        </div>
      </div>

      <div class="card">
        <header class="card-head"><div><p class="eyebrow">MATRIZ DE CONCILIACIÓN</p><h2>Por ITEM ID y espesor</h2></div>
          <div class="head-actions"><button class="btn btn-outline btn-sm" type="button" data-action="print-report" data-report="conciliation">⎙ PDF</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="export-csv" data-report="conciliation">↓ CSV</button></div></header>
        <div class="table-wrap">
          <table class="data-table conciliation-table">
            <thead><tr>
              <th>Espesor</th><th>ITEM ID</th><th>Descripción</th>
              <th class="num">TALLY</th><th class="num">Producto Terminado</th><th class="num">Δ PT</th>
              <th class="num">Calidad</th><th class="num">Δ Calidad</th><th class="num">Pallets</th><th>Estado</th>
            </tr></thead>
            <tbody>
              ${rec.rows.length ? rec.rows.map(row => {
                const meta = Engine.rowStatusMeta(row.status);
                return `<tr>
                  <td><b>${UI.esc(row.thicknessLabel)}</b></td>
                  <td class="mono">${UI.esc(row.itemLabel)}</td>
                  <td>${UI.esc(row.description || '—')}</td>
                  <td class="num"><b>${UI.fmt(row.tally)}</b></td>
                  <td class="num">${UI.fmt(row.pt)}</td>
                  <td class="num ${row.diffPt !== 0 ? 'diff' : 'zero'}">${row.diffPt === 0 ? '0' : (row.diffPt > 0 ? '+' : '') + UI.fmt(row.diffPt)}</td>
                  <td class="num">${UI.fmt(row.quality)}</td>
                  <td class="num ${row.diffQuality !== 0 ? 'diff' : 'zero'}">${row.diffQuality === 0 ? '0' : (row.diffQuality > 0 ? '+' : '') + UI.fmt(row.diffQuality)}</td>
                  <td class="num">${row.approvedCount}/${row.palletCount}</td>
                  <td><span class="badge badge-${meta.tone}">${UI.esc(meta.label)}</span></td>
                </tr>`;
              }).join('') : `<tr><td colspan="10" class="table-empty">Sin datos para conciliar.</td></tr>`}
            </tbody>
            <tfoot><tr>
              <td colspan="3"><b>TOTAL GENERAL</b></td>
              <td class="num"><b>${UI.fmt(rec.totals.tally)}</b></td>
              <td class="num"><b>${UI.fmt(rec.totals.pt)}</b></td>
              <td class="num ${rec.totals.diffPt !== 0 ? 'diff' : ''}"><b>${rec.totals.diffPt === 0 ? '0' : (rec.totals.diffPt > 0 ? '+' : '') + UI.fmt(rec.totals.diffPt)}</b></td>
              <td class="num"><b>${UI.fmt(rec.totals.quality)}</b></td>
              <td class="num ${rec.totals.diffQuality !== 0 ? 'diff' : ''}"><b>${rec.totals.diffQuality === 0 ? '0' : (rec.totals.diffQuality > 0 ? '+' : '') + UI.fmt(rec.totals.diffQuality)}</b></td>
              <td class="num"><b>${rec.totals.approvedPallets}/${rec.totals.pallets}</b></td>
              <td>${rec.ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-red">Δ</span>'}</td>
            </tr></tfoot>
          </table>
        </div>
        <p class="hint">La comparación es estricta por ITEM ID y espesor: el sobrante de un espesor no compensa el faltante de otro.</p>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">RESUMEN</p><h2>Conciliación por espesor</h2></div></header>
          <div class="table-wrap">
            <table class="mini-table">
              <thead><tr><th>Espesor</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Calidad</th><th class="num">Δ</th><th></th></tr></thead>
              <tbody>
                ${rec.thicknesses.length ? rec.thicknesses.map(t => `<tr>
                  <td><b>${UI.esc(t.thicknessLabel)}</b></td>
                  <td class="num">${UI.fmt(t.tally)}</td>
                  <td class="num">${UI.fmt(t.pt)}</td>
                  <td class="num">${UI.fmt(t.quality)}</td>
                  <td class="num ${t.diffPt !== 0 ? 'diff' : ''}">${t.diffPt === 0 ? '0' : (t.diffPt > 0 ? '+' : '') + UI.fmt(t.diffPt)}</td>
                  <td>${t.ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-red">Δ</span>'}</td>
                </tr>`).join('') : `<tr><td colspan="6" class="table-empty">Sin espesores.</td></tr>`}
              </tbody>
              <tfoot><tr><td><b>TOTAL</b></td><td class="num"><b>${UI.fmt(rec.totals.tally)}</b></td><td class="num"><b>${UI.fmt(rec.totals.pt)}</b></td><td class="num"><b>${UI.fmt(rec.totals.quality)}</b></td><td class="num"><b>${rec.totals.diffPt === 0 ? '0' : (rec.totals.diffPt > 0 ? '+' : '') + UI.fmt(rec.totals.diffPt)}</b></td><td></td></tr></tfoot>
            </table>
          </div>
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">REGLAS DEL MOTOR</p><h2>Hallazgos y bloqueos</h2></div><span class="count-chip">${rec.issues.length}</span></header>
          ${rec.issues.length ? `<ul class="issue-list">
            ${rec.issues.map(issue => `<li class="tone-${issue.status === 'corregido' ? 'amber' : 'red'}">
              <span class="issue-tag">${UI.esc(issue.tag)}</span>
              <div><b>${UI.esc(issue.itemId)} · ${UI.esc(issue.thickness)}</b><p>${UI.esc(issue.message)}</p>
              <small>TALLY ${UI.fmt(issue.tally)} · PT ${UI.fmt(issue.pt)} · Calidad ${UI.fmt(issue.quality)}</small></div>
            </li>`).join('')}
          </ul>` : `<div class="clean-state"><span>✓</span><div><b>Sin hallazgos</b><p>Las tres fuentes coinciden por ITEM ID y espesor.</p></div></div>`}
          <div class="rules-box">
            <p class="eyebrow">REGLAS APLICADAS</p>
            <ul>
              <li>Si los tres registros coinciden → <b>CONCILIADO</b>.</li>
              <li>Diferencia reportada por PT → <b>DIFERENCIA EN PRODUCTO TERMINADO</b>.</li>
              <li>Diferencia en la verificación de Calidad → <b>DIFERENCIA EN CALIDAD</b>.</li>
              <li>Pallet sin inspección → <b>PENDIENTE</b>.</li>
              <li>ITEM ID fuera del TALLY → <b>bloqueo de aprobación</b>.</li>
              <li>Pallet rechazado, en corrección o corregido pendiente de reinspección → <b>liberación bloqueada</b>.</li>
              <li>Un pallet corregido por PT vuelve a Calidad para <b>reinspección explícita</b>.</li>
              <li>Espesor no autorizado → <b>ALERTA DE ESPESOR</b>.</li>
            </ul>
          </div>
        </section>
      </div>
    </section>`;
  }

  /* ============================================================
     EVIDENCIAS Y AUDITORÍA
     ============================================================ */

  function evidenceTab(order) {
    const pallets = (order.pallets || []).filter(p => (p.evidence || []).length);
    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">EVIDENCIA FOTOGRÁFICA</p><h2>Fotos de los pallets</h2></div>
        <span class="badge badge-gray">${pallets.reduce((t, p) => t + p.evidence.length, 0)} archivo(s)</span></header>
      ${pallets.length ? `<div class="evidence-groups">
        ${pallets.map(p => `<article class="evidence-group">
          <header><div><b>${UI.esc(p.number)}</b><span>${UI.esc(p.itemId)} · ${Engine.thicknessLabel(p.thickness)} · ${UI.fmt(p.panels)} paneles</span></div>
            <span class="badge badge-${(Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'] || {}).tone || 'gray'}">${UI.esc((Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'] || {}).label || 'Pendiente')}</span></header>
          <div class="photo-grid">
            ${p.evidence.map(ev => `<button type="button" class="photo-thumb" data-photo-key="${ev.key}" data-action="open-photo" data-caption="${UI.esc(p.number + ' · ' + p.itemId + ' · ' + (ev.name || ''))}" title="${UI.esc(ev.name || '')}"></button>`).join('')}
          </div>
        </article>`).join('')}
      </div>` : UI.emptyState('▣', 'Sin evidencias fotográficas', 'Producto Terminado adjunta las fotos al registrar cada pallet.')}
    </section>`;
  }

  function auditTab(order) {
    const entries = DB.auditFor(order.id).slice();
    const palletEntries = [];
    (order.pallets || []).forEach(p => {
      (p.history || []).forEach(h => palletEntries.push({
        ts: h.ts, userName: h.userName, role: h.role, action: h.action, detail: `${p.number}: ${h.detail}`
      }));
    });
    const all = entries.concat(palletEntries).sort((a, b) => new Date(b.ts) - new Date(a.ts));
    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">TRAZABILIDAD</p><h2>Auditoría de la orden</h2></div>
        <span class="badge badge-gray">${all.length} registro(s)</span></header>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            ${all.length ? all.map(a => `<tr>
              <td>${UI.fmtDateTime(a.ts)}<small>${UI.relTime(a.ts)}</small></td>
              <td><b>${UI.esc(a.userName)}</b></td>
              <td>${UI.esc(UI.roleLabel(a.role))}</td>
              <td><span class="badge badge-${auditTone(a.action)}">${UI.esc(actionLabel(a.action))}</span></td>
              <td class="cell-note">${UI.esc(a.detail || '—')}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="table-empty">Sin movimientos registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  const ACTION_LABELS = {
    order_save: 'Borrador guardado', order_publish: 'Orden publicada', order_submit: 'Envío a Calidad',
    order_release: 'Liberación', order_ship: 'Despacho', order_close: 'Cierre', order_reopen: 'Reapertura',
    pallet_create: 'Pallet registrado', pallet_update: 'Pallet corregido', pallet_delete: 'Pallet eliminado',
    quality_approve: 'Aprobación', quality_reject: 'Rechazo', quality_correction: 'Corrección solicitada',
    quality_revert: 'Reversión de aprobación', login: 'Inicio de sesión', logout: 'Cierre de sesión',
    user_create: 'Usuario creado', user_update: 'Usuario actualizado', settings_update: 'Configuración',
    password_change: 'Contraseña', demo_seed: 'Datos de demostración', init: 'Inicialización', backup: 'Respaldo'
  };

  function actionLabel(action) { return ACTION_LABELS[action] || action; }

  function auditTone(action) {
    if (/release|approve|close|ship|submit/.test(action)) return 'green';
    if (/reject|correction|delete|reopen|revert/.test(action)) return 'red';
    if (/create|publish|seed|init/.test(action)) return 'blue';
    return 'amber';
  }

  /* ============================================================
     ACTA Y REPORTES DE LA ORDEN
     ============================================================ */

  function reportTab(order, rec) {
    const acta = buildActaHTML(order);
    return `<section class="card">
      <header class="card-head"><div><p class="eyebrow">DOCUMENTO FINAL</p><h2>Acta de liberación</h2></div>
        <div class="head-actions">
          <button class="btn btn-primary btn-sm" type="button" data-action="print-acta" data-id="${order.id}">⎙ Imprimir / PDF</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="export-csv" data-report="conciliation" data-id="${order.id}">↓ Conciliación CSV</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="export-csv" data-report="pallets" data-id="${order.id}">↓ Pallets CSV</button>
        </div></header>
      ${order.releasedAt ? '' : '<div class="notice notice-amber compact"><b>Documento preliminar</b><span>El acta se emite formalmente cuando el despacho es liberado.</span></div>'}
      <div class="doc-preview">${acta}</div>
    </section>`;
  }

  function signatureData(order) {
    const inspected = (order.pallets || []).filter(p => p.quality && p.quality.byName);
    const ca = inspected.length ? inspected[inspected.length - 1].quality : null;
    return {
      sa: order.publishedBy || order.createdBy || null,
      saDate: order.publishedAt || order.createdAt,
      pt: order.submittedBy || (order.pallets[0] ? { name: order.pallets[0].createdByName } : null),
      ptDate: order.submittedAt,
      ca: ca ? { name: ca.byName } : null,
      caDate: ca ? ca.at : null
    };
  }

  function buildActaHTML(order) {
    const rec = order._rec || Engine.reconcile(order);
    const sig = signatureData(order);
    const q = Engine.qualityCounts(order.pallets);
    const release = Engine.releaseCheck(order);
    const body = `
      <section class="doc-section">
        <h1 class="doc-title">ACTA DE LIBERACIÓN DE DESPACHO</h1>
        <p class="doc-subtitle">${UI.esc(order.code)} · ${release.ok ? 'DESPACHO CONCILIADO Y LIBERADO' : 'DOCUMENTO PRELIMINAR'}</p>
        <div class="doc-info">
          <div><span>Orden de producción</span><b>${UI.esc(order.op || '—')}</b></div>
          <div><span>Orden de compra</span><b>${UI.esc(order.purchaseOrder || '—')}</b></div>
          <div><span>Cliente</span><b>${UI.esc(order.client)}</b></div>
          <div><span>Contenedor</span><b>${UI.esc(order.container || '—')}</b></div>
          <div><span>Destino</span><b>${UI.esc(order.destination || '—')}</b></div>
          <div><span>Fecha de despacho</span><b>${UI.fmtDateLong(order.dispatchDate)}</b></div>
          <div><span>Lote</span><b>${UI.esc(order.lot || '—')}</b></div>
          <div><span>Pallets</span><b>${q.total} (${q.approved} aprobados)</b></div>
        </div>
      </section>
      <section class="doc-section">
        <h2>1. Conciliación de cantidades</h2>
        <table class="doc-table">
          <thead><tr><th>Espesor</th><th>ITEM ID</th><th class="num">TALLY</th><th class="num">Producto Terminado</th><th class="num">Calidad</th><th class="num">Δ</th></tr></thead>
          <tbody>
            ${rec.rows.map(r => `<tr><td>${UI.esc(r.thicknessLabel)}</td><td>${UI.esc(r.itemLabel)}</td><td class="num">${UI.fmt(r.tally)}</td><td class="num">${UI.fmt(r.pt)}</td><td class="num">${UI.fmt(r.quality)}</td><td class="num">${r.diffPt === 0 && r.diffQuality === 0 ? '0' : (r.diffPt !== 0 ? (r.diffPt > 0 ? '+' : '') + UI.fmt(r.diffPt) : (r.diffQuality > 0 ? '+' : '') + UI.fmt(r.diffQuality))}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="2">TOTAL GENERAL</td><td class="num">${UI.fmt(rec.totals.tally)}</td><td class="num">${UI.fmt(rec.totals.pt)}</td><td class="num">${UI.fmt(rec.totals.quality)}</td><td class="num">${rec.totals.diffPt === 0 ? '0' : (rec.totals.diffPt > 0 ? '+' : '') + UI.fmt(rec.totals.diffPt)}</td></tr></tfoot>
        </table>
        <p class="doc-verdict">${rec.ok ? '✓ CONCILIADO: TALLY SHEET = PRODUCTO TERMINADO = CALIDAD.' : '⚠ CON DIFERENCIAS: no procede la liberación.'}</p>
      </section>
      <section class="doc-section">
        <h2>2. Resumen de inspección de Calidad</h2>
        <div class="doc-stats">
          <div><span>Pallet aprobados</span><b>${q.approved}</b></div>
          <div><span>Pendientes</span><b>${q.pending + q.inspecting}</b></div>
          <div><span>Rechazados</span><b>${q.rejected}</b></div>
          <div><span>Requieren corrección</span><b>${q.correction}</b></div>
          <div><span>Corregidos · pendientes reinspección</span><b>${q.corrected}</b></div>
        </div>
        <p>${release.ok
          ? 'Se certifica que la totalidad de los pallets fue verificada físicamente por el área de Calidad, coincidiendo ITEM ID, espesor y cantidad de paneles con el TALLY SHEET autorizado.'
          : 'El presente documento no constituye liberación: existen requisitos pendientes detallados en el sistema.'}</p>
      </section>
      <section class="doc-section">
        <h2>3. Responsables físicos por pallet</h2>
        <p>Cuando el operario o inspector físico fue diferente al usuario del sistema, se registró su nombre de forma opcional.</p>
        <div class="doc-stats">
          <div><span>Responsables PT físicos</span><b>${UI.esc(Array.from(new Set((order.pallets || []).map(p => p.operatorName).filter(Boolean))).join(', ') || 'No registrados')}</b></div>
          <div><span>Inspectores físicos de Calidad</span><b>${UI.esc(Array.from(new Set((order.pallets || []).map(p => p.quality && p.quality.inspectorName).filter(Boolean))).join(', ') || 'No registrados')}</b></div>
        </div>
      </section>
      <section class="doc-section">
        <h2>3. Responsables físicos por pallet</h2>
        <p>Cuando el operario o inspector físico fue diferente al usuario del sistema, se registró su nombre de forma opcional.</p>
        <div class="doc-stats">
          <div><span>Responsables PT físicos</span><b>${UI.esc(Array.from(new Set((order.pallets || []).map(p => p.operatorName).filter(Boolean))).join(', ') || 'No registrados')}</b></div>
          <div><span>Inspectores físicos de Calidad</span><b>${UI.esc(Array.from(new Set((order.pallets || []).map(p => p.quality && p.quality.inspectorName).filter(Boolean))).join(', ') || 'No registrados')}</b></div>
        </div>
      </section>
      <section class="doc-section">
        <h2>4. Declaración de triple verificación</h2>
        <p>La información del TALLY SHEET constituye la fuente oficial de cantidades y espesores autorizados. Producto Terminado reportó lo que físicamente preparó y Calidad verificó lo que físicamente inspeccionó y aprobó. Las tres fuentes coinciden por ITEM ID, por espesor y en el total general.</p>
        <div class="signatures">
          ${signatureBox('Superadministrador / Planificación', sig.sa ? sig.sa.name : '________________', sig.saDate)}
          ${signatureBox('Responsable de Producto Terminado', sig.pt ? sig.pt.name : '________________', sig.ptDate)}
          ${signatureBox('Responsable de Calidad', sig.ca ? sig.ca.name : '________________', sig.caDate)}
        </div>

        <div class="acta-qr-block">
          <div class="acta-qr">
            ${order.actaQrDataUrl ? `<img src="${order.actaQrDataUrl}" alt="QR de verificación del acta" />` : '<div class="qr-placeholder">QR no generado</div>'}
          </div>
          <div class="acta-qr-meta">
            <b>Verificación del acta</b>
            <span>Escanea este código para validar que el documento no ha sido alterado.</span>
            <code>${order.actaHash ? order.actaHash.slice(0, 40) + '…' : '—'}</code>
          </div>
        </div>
      </section>
      ${order.releaseNotes ? `<section class="doc-section"><h2>5. Observaciones de liberación</h2><p>${UI.esc(order.releaseNotes)}</p></section>` : ''}
    `;
    return UI.docShell('ACTA DE LIBERACIÓN', `${order.code} · ${order.client}`, body, { footer: release.ok ? 'Documento liberado' : 'Documento preliminar' });
  }

  function signatureBox(role, name, date) {
    return `<div class="signature"><div class="sig-line"></div><b>${UI.esc(name || '________________')}</b><span>${UI.esc(role)}</span><small>${date ? UI.fmtDateTime(date) : 'Fecha: __________'}</small></div>`;
  }

  /* ---------- Verificación QR del acta ---------- */
  function verifierBaseUrl() {
    const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    return local ? location.origin : 'https://palletsordenjvg.netlify.app';
  }

  function actaVerificationUrl(order) {
    const base = verifierBaseUrl();
    const hash = order.actaHash || '';
    const payload = btoa(unescape(encodeURIComponent(actaCanonicalPayload(order))));
    return `${base}/verificar.html?id=${encodeURIComponent(order.code || order.id)}&hash=${encodeURIComponent(hash)}&payload=${encodeURIComponent(payload)}`;
  }

  function actaCanonicalPayload(order) {
    const sig = signatureData(order);
    const rec = order._rec || Engine.reconcile(order);
    const q = Engine.qualityCounts(order.pallets);
    return JSON.stringify({
      id: order.id,
      code: order.code,
      op: order.op,
      purchaseOrder: order.purchaseOrder,
      client: order.client,
      lot: order.lot,
      destination: order.destination,
      dispatchDate: order.dispatchDate,
      panels: rec.totals.tally,
      pallets: q.total,
      approvedPallets: q.approved,
      sa: sig.sa ? sig.sa.name : null,
      saDate: sig.saDate,
      pt: sig.pt ? sig.pt.name : null,
      ptDate: sig.ptDate,
      ca: sig.ca ? sig.ca.name : null,
      caDate: sig.caDate,
      closedAt: order.closedAt,
      closedByName: order.closedBy ? order.closedBy.name : null
    });
  }

  async function computeActaHash(order) {
    const payload = actaCanonicalPayload(order);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateQRCodeDataURL(text) {
    return new Promise((resolve, reject) => {
      if (typeof QRCode === 'undefined') return reject('QRCode no cargado');
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:128px;height:128px;';
      document.body.appendChild(holder);
      try {
        const qr = new QRCode(holder, {
          text: text,
          width: 128,
          height: 128,
          colorDark: '#0a2540',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
        // QRCode.js genera un <img> o <canvas>; esperamos un frame y leemos.
        requestAnimationFrame(() => {
          const img = holder.querySelector('img');
          const canvas = holder.querySelector('canvas');
          const dataUrl = img ? img.src : (canvas ? canvas.toDataURL('image/png') : '');
          document.body.removeChild(holder);
          resolve(dataUrl);
        });
      } catch (e) {
        document.body.removeChild(holder);
        reject(e);
      }
    });
  }

  /* ============================================================
     MÓDULO GLOBAL DE PALLETS
     ============================================================ */

  function renderPalletsGlobal() {
    const orders = preparedOrders();
    const rows = [];
    orders.forEach(order => {
      (order.pallets || []).forEach(p => rows.push({ order, pallet: p }));
    });
    const f = state.filters;
    const q = f.palletQ.trim().toLowerCase();
    const filtered = rows.filter(({ order, pallet }) => {
      if (f.palletOrder && order.id !== f.palletOrder) return false;
      if (f.palletQuality && ((pallet.quality && pallet.quality.status) || 'pendiente') !== f.palletQuality) return false;
      if (f.palletThickness && Engine.thicknessNumber(pallet.thickness) !== Number(f.palletThickness)) return false;
      if (!q) return true;
      return [pallet.number, pallet.itemId, pallet.description, order.code, order.client, pallet.createdByName]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    const thicknesses = Array.from(new Set(rows.map(r => Engine.thicknessNumber(r.pallet.thickness)))).sort((a, b) => a - b);
    const k = Engine.kpis(orders);

    view.innerHTML = UI.pageHead({
      eyebrow: 'OPERACIÓN · TRAZABILIDAD',
      title: 'Control individual de pallets',
      desc: 'Todos los pallets registrados con su estado de Calidad, conciliación y evidencia fotográfica.',
      actions: `<button class="btn btn-ghost" type="button" data-action="export-csv" data-report="pallets-global">↓ Exportar pallets</button>`
    }) + `
      <div class="stat-strip five">
        <div><span>Pallets registrados</span><strong>${UI.fmt(rows.length)}</strong></div>
        <div><span>Aprobados</span><strong>${UI.fmt(rows.filter(r => (r.pallet.quality && r.pallet.quality.status) === 'aprobado').length)}</strong></div>
        <div><span>Pendientes</span><strong>${UI.fmt(rows.filter(r => !r.pallet.quality || ['pendiente', 'en_inspeccion'].includes(r.pallet.quality.status)).length)}</strong></div>
        <div><span>Rechazados / corrección</span><strong>${UI.fmt(rows.filter(r => r.pallet.quality && ['rechazado', 'requiere_correccion'].includes(r.pallet.quality.status)).length)}</strong></div>
        <div><span>Corregidos · reinspección</span><strong>${UI.fmt(rows.filter(r => r.pallet.quality && r.pallet.quality.status === 'corregido').length)}</strong></div>
      </div>

      <div class="toolbar card">
        <div class="field-inline grow"><label for="palletSearch">Buscar</label>
          <input id="palletSearch" data-filter="palletQ" type="search" placeholder="Pallet, ITEM ID, orden, cliente…" value="${UI.esc(f.palletQ)}" /></div>
        <div class="field-inline"><label for="palletOrderFilter">Orden</label>
          <select id="palletOrderFilter" data-filter="palletOrder"><option value="">Todas</option>
            ${orders.map(o => `<option value="${o.id}" ${f.palletOrder === o.id ? 'selected' : ''}>${UI.esc(o.code)} · ${UI.esc(o.client)}</option>`).join('')}
          </select></div>
        <div class="field-inline"><label for="palletQualityFilter">Calidad</label>
          <select id="palletQualityFilter" data-filter="palletQuality"><option value="">Todos</option>
            ${Object.entries(Engine.Q_STATUS).map(([k2, meta]) => `<option value="${k2}" ${f.palletQuality === k2 ? 'selected' : ''}>${UI.esc(meta.label)}</option>`).join('')}
          </select></div>
        <div class="field-inline"><label for="palletThicknessFilter">Espesor</label>
          <select id="palletThicknessFilter" data-filter="palletThickness"><option value="">Todos</option>
            ${thicknesses.map(t => `<option value="${t}" ${Number(f.palletThickness) === t ? 'selected' : ''}>${Engine.thicknessLabel(t)}</option>`).join('')}
          </select></div>
        <div class="toolbar-count"><b>${filtered.length}</b><span>pallet(s)</span></div>
      </div>

      <div class="card table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Orden</th><th>Pallet</th><th>ITEM ID</th><th>Espesor</th><th>Empaque</th><th class="num">Paneles</th>
              <th>Responsable PT</th><th>Calidad</th><th>Fotos</th><th></th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map(({ order, pallet }) => {
                const meta = Engine.Q_STATUS[(pallet.quality && pallet.quality.status) || 'pendiente'] || Engine.Q_STATUS.pendiente;
                return `<tr class="clickable" data-action="open-order" data-id="${order.id}" data-tab="pallets">
                  <td><b class="mono">${UI.esc(order.code)}</b><small>${UI.esc(order.client)}</small></td>
                  <td><b>${UI.esc(pallet.number)}</b></td>
                  <td class="mono">${UI.esc(pallet.itemId)}</td>
                  <td>${Engine.thicknessLabel(pallet.thickness)}</td>
                  <td>${UI.esc(Engine.PACKAGING[pallet.packaging] || '—')}</td>
                  <td class="num"><b>${UI.fmt(pallet.panels)}</b></td>
                  <td>${UI.esc(pallet.createdByName || '—')}${pallet.operatorName ? `<small>Op: ${UI.esc(pallet.operatorName)}</small>` : `<small>${UI.fmtDate(pallet.createdAt)}</small>`}</td>
                  <td><span class="badge badge-${meta.tone}">${UI.esc(meta.label)}</span>${pallet.quality && pallet.quality.inspectorName ? `<small>Insp: ${UI.esc(pallet.quality.inspectorName)}</small>` : ''}</td>
                  <td class="num">${(pallet.evidence || []).length || '—'}</td>
                  <td class="cell-action"><span class="row-arrow">→</span></td>
                </tr>`;
              }).join('') : `<tr><td colspan="10" class="table-empty">No hay pallets con estos filtros.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ============================================================
     MÓDULO GLOBAL DE CONCILIACIÓN
     ============================================================ */

  function renderConciliationGlobal() {
    const orders = preparedOrders().filter(o => o._status !== 'borrador');
    const totals = orders.reduce((t, o) => {
      t.tally += o._rec.totals.tally; t.pt += o._rec.totals.pt; t.quality += o._rec.totals.quality;
      t.diff += o._rec.counts.differences + o._rec.counts.rejected;
      return t;
    }, { tally: 0, pt: 0, quality: 0, diff: 0 });

    view.innerHTML = UI.pageHead({
      eyebrow: 'CONTROL · TRIPLE VERIFICACIÓN',
      title: 'Conciliación de despachos',
      desc: 'Estado del motor de conciliación para cada orden: TALLY SHEET, Producto Terminado y Calidad.',
      actions: `<button class="btn btn-ghost" type="button" data-action="export-csv" data-report="conciliation-global">↓ Exportar conciliación</button>`
    }) + `
      <div class="conciliation-hero ${totals.diff ? 'tone-red' : 'tone-green'}">
        <div class="ch-icon">${totals.diff ? '⚠' : '✓'}</div>
        <div><h2>${totals.diff ? totals.diff + ' diferencia(s) activas' : 'Todos los despachos conciliados'}</h2>
          <p>${totals.diff ? 'Existen diferencias que bloquean la liberación de una o más órdenes.' : 'TALLY = Producto Terminado = Calidad en todas las órdenes activas.'}</p></div>
        <div class="ch-totals">
          <div><span>TALLY</span><b>${UI.fmt(totals.tally)}</b></div>
          <div><span>PT</span><b>${UI.fmt(totals.pt)}</b></div>
          <div><span>Calidad</span><b>${UI.fmt(totals.quality)}</b></div>
        </div>
      </div>

      <div class="card table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Orden</th><th>Cliente</th><th>Estado</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Δ PT</th>
              <th class="num">Calidad</th><th class="num">Δ Calidad</th><th class="num">Pallets</th><th>Hallazgos</th><th></th></tr></thead>
            <tbody>
              ${orders.length ? orders.map(order => {
                const t = order._rec.totals;
                return `<tr class="clickable" data-action="open-order" data-id="${order.id}" data-tab="conciliacion">
                  <td><b class="mono">${UI.esc(order.code)}</b><small>${UI.esc(order.op || '')}</small></td>
                  <td>${UI.esc(order.client)}</td>
                  <td>${UI.statusBadge(order._status)}</td>
                  <td class="num">${UI.fmt(t.tally)}</td>
                  <td class="num">${UI.fmt(t.pt)}</td>
                  <td class="num ${t.diffPt !== 0 ? 'diff' : 'zero'}">${t.diffPt === 0 ? '0' : (t.diffPt > 0 ? '+' : '') + UI.fmt(t.diffPt)}</td>
                  <td class="num">${UI.fmt(t.quality)}</td>
                  <td class="num ${t.diffQuality !== 0 ? 'diff' : 'zero'}">${t.diffQuality === 0 ? '0' : (t.diffQuality > 0 ? '+' : '') + UI.fmt(t.diffQuality)}</td>
                  <td class="num">${t.approvedPallets}/${t.pallets}</td>
                  <td>${order._rec.issues.length ? `<span class="badge badge-red">${order._rec.issues.length}</span>` : '<span class="badge badge-green">0</span>'}</td>
                  <td class="cell-action"><span class="row-arrow">→</span></td>
                </tr>`;
              }).join('') : `<tr><td colspan="11" class="table-empty">Sin órdenes publicadas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ============================================================
     CENTRO DE REPORTES
     ============================================================ */

  function renderReports() {
    const orders = preparedOrders();
    const selected = state.reportOrderId || (orders[0] ? orders[0].id : '');
    const cards = [
      ['tally', 'TALLY SHEET', 'Productos autorizados, cantidades y espesores por ITEM ID.', '▤'],
      ['pallets', 'Pallets registrados', 'Detalle de cada pallet con empaque, cantidades, pesos y evidencias.', '▦'],
      ['inspection', 'Inspección de Calidad', 'Checklist, cantidades verificadas, inspectores y observaciones.', '⌕'],
      ['conciliation', 'Conciliación de cantidades', 'Matriz TALLY vs Producto Terminado vs Calidad con diferencias.', '⇄'],
      ['differences', 'Reporte de diferencias', 'Hallazgos, rechazos y bloqueos que impiden la liberación.', '⚠'],
      ['acta', 'Acta de liberación', 'Documento formal con las tres firmas responsables.', '⎙']
    ];

    view.innerHTML = UI.pageHead({
      eyebrow: 'GESTIÓN · DOCUMENTOS',
      title: 'Reportes y exportaciones',
      desc: 'Genera documentos en PDF (impresión) o Excel (CSV) para cualquier orden de despacho.',
      actions: ''
    }) + `
      <div class="card">
        <div class="report-select">
          <label>Orden de despacho
            <select id="reportOrderSelect">
              <option value="">Selecciona una orden…</option>
              ${orders.map(o => `<option value="${o.id}" ${selected === o.id ? 'selected' : ''}>${UI.esc(o.code)} · ${UI.esc(o.client)} · ${UI.esc(o._status.toUpperCase())}</option>`).join('')}
            </select>
          </label>
          ${selected ? `<div class="report-preview-actions">
            <button class="btn btn-primary" type="button" data-action="print-report" data-report="acta">⎙ Acta de liberación</button>
            <button class="btn btn-outline" type="button" data-action="export-csv" data-report="conciliation">↓ Conciliación CSV</button>
          </div>` : ''}
        </div>
      </div>

      <div class="report-grid">
        ${cards.map(([type, title, desc, icon]) => `<article class="report-card">
          <div class="report-icon">${icon}</div>
          <h3>${UI.esc(title)}</h3>
          <p>${UI.esc(desc)}</p>
          <div class="report-actions">
            <button class="btn btn-outline btn-sm" type="button" data-action="${type === 'acta' ? 'print-report' : 'print-report'}" data-report="${type}" ${selected ? '' : 'disabled'}>⎙ PDF</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="export-csv" data-report="${type}" ${selected ? '' : 'disabled'}>↓ Excel</button>
          </div>
        </article>`).join('')}
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">EXPORTACIÓN MASIVA</p><h2>Datos del sistema</h2></div></header>
          <div class="data-actions">
            <button class="btn btn-outline" type="button" data-action="export-csv" data-report="orders-global">↓ Órdenes (CSV)</button>
            <button class="btn btn-outline" type="button" data-action="export-csv" data-report="pallets-global">↓ Pallets (CSV)</button>
            <button class="btn btn-outline" type="button" data-action="export-csv" data-report="conciliation-global">↓ Conciliación (CSV)</button>
          </div>
        </section>
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">RESPALDO</p><h2>Continuidad operativa</h2></div></header>
          <p class="card-text">Descarga un respaldo completo (JSON) con órdenes, pallets, inspecciones y auditoría. En modo local, la información vive en este navegador.</p>
          <div class="data-actions">
            <button class="btn btn-outline" type="button" data-action="export-backup">⤓ Descargar respaldo</button>
            ${can('data.manage') ? '<button class="btn btn-ghost" type="button" data-action="go-users">Usuarios y configuración →</button>' : ''}
          </div>
        </section>
      </div>
    `;
  }

  /* ============================================================
     USUARIOS Y CONFIGURACIÓN
     ============================================================ */

  function renderUsers() {
    if (!can('users.manage')) {
      view.innerHTML = `<div class="card">${UI.emptyState('🔒', 'Acceso restringido', 'Solo el Superadministrador administra usuarios y configuración.', '<a class="btn btn-ghost" href="#/panel">Volver al dashboard</a>')}</div>`;
      return;
    }
    const users = DB.listUsers();
    const settings = DB.settings();
    view.innerHTML = UI.pageHead({
      eyebrow: 'GESTIÓN · SEGURIDAD',
      title: 'Usuarios y roles',
      desc: 'Tres roles con permisos separados. Cada acción queda registrada con usuario, fecha y hora.',
      actions: `<button class="btn btn-primary" type="button" data-action="user-new">＋ Nuevo usuario</button>`
    }) + `
      <div class="card table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              ${users.map(user => `<tr>
                <td><div class="user-cell"><span class="avatar tone-${user.role === 'superadmin' ? 'blue' : user.role === 'pt' ? 'amber' : 'green'}">${UI.initials(user.name)}</span><b>${UI.esc(user.name)}</b></div></td>
                <td class="mono">@${UI.esc(user.username)}</td>
                <td>${UI.toneBadge(user.role === 'superadmin' ? 'blue' : user.role === 'pt' ? 'amber' : 'green', UI.roleLabel(user.role))}</td>
                <td>${user.active ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Inactivo</span>'}</td>
                <td>${UI.fmtDate(user.createdAt)}</td>
                <td class="cell-actions">
                  <button class="icon-btn" type="button" data-action="user-edit" data-id="${user.id}" title="Editar usuario">✎</button>
                  <button class="icon-btn" type="button" data-action="user-password" data-id="${user.id}" title="Restablecer contraseña">⚿</button>
                  <button class="icon-btn ${user.active ? 'danger' : ''}" type="button" data-action="user-toggle" data-id="${user.id}" title="${user.active ? 'Desactivar' : 'Activar'}">${user.active ? '⊘' : '✓'}</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">CONFIGURACIÓN</p><h2>Parámetros de operación</h2></div></header>
          <form id="settingsForm" class="settings-form">
            <label>Empresa<input id="setCompany" value="${UI.esc(settings.company)}" /></label>
            <label>Planta / ubicación<input id="setPlant" value="${UI.esc(settings.plant)}" /></label>
            <label class="check-line"><input type="checkbox" id="setPhotos" ${settings.requirePhotos ? 'checked' : ''} /> Exigir evidencia fotográfica al registrar pallets</label>
            <button class="btn btn-outline" type="submit">Guardar configuración</button>
          </form>
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">DATOS</p><h2>Respaldo y mantenimiento</h2></div></header>
          <div class="data-actions vertical">
            <button class="btn btn-outline" type="button" data-action="export-backup">⤓ Descargar respaldo completo (JSON)</button>
            <label class="btn btn-outline file-button full">
              ⤒ Restaurar respaldo
              <input type="file" id="importFile" accept="application/json,.json" hidden />
            </label>
            <button class="btn btn-ghost" type="button" data-action="seed-demo">◇ Cargar datos de demostración</button>
            <button class="btn btn-danger-ghost" type="button" data-action="reset-data">⌫ Reiniciar base local</button>
          </div>
          <p class="hint">En producción, conecta Supabase para compartir datos entre dispositivos. El esquema SQL está incluido en <b>supabase-schema.sql</b>.</p>
        </section>
      </div>
    `;
  }

  function openUserModal(userId) {
    const editing = userId ? DB.findUser(userId) : null;
    UI.openModal({
      eyebrow: editing ? 'EDITAR USUARIO' : 'NUEVO USUARIO',
      title: editing ? editing.name : 'Crear cuenta de área',
      size: 'sm',
      body: `<form id="userForm">
        <label>Nombre completo<input id="ufName" value="${UI.esc(editing ? editing.name : '')}" /></label>
        <label>Usuario<input id="ufUsername" value="${UI.esc(editing ? editing.username : '')}" ${editing ? 'disabled' : ''} autocomplete="off" /></label>
        <label>Rol<select id="ufRole">
          <option value="superadmin" ${editing && editing.role === 'superadmin' ? 'selected' : ''}>Superadministrador</option>
          <option value="pt" ${editing && editing.role === 'pt' ? 'selected' : ''}>Producto Terminado</option>
          <option value="calidad" ${editing && editing.role === 'calidad' ? 'selected' : ''}>Calidad</option>
        </select></label>
        <label>${editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input id="ufPassword" type="password" autocomplete="new-password" /></label>
        <p class="field-error" id="ufError" role="alert"></p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${editing ? 'Guardar cambios' : 'Crear usuario'}</button>
        </div>
      </form>`,
      onMount() { setTimeout(() => { const f = document.getElementById('ufName'); if (f) f.focus(); }, 40); }
    });
  }

  async function saveUserForm() {
    const err = document.getElementById('ufError');
    const name = document.getElementById('ufName').value.trim();
    const username = document.getElementById('ufUsername').value.trim().toLowerCase();
    const role = document.getElementById('ufRole').value;
    const password = document.getElementById('ufPassword').value;
    const editingId = state.editingUserId;
    err.textContent = '';
    if (!name) { err.textContent = 'El nombre es obligatorio.'; return; }
    if (!username) { err.textContent = 'El usuario es obligatorio.'; return; }
    if (!/^[a-z0-9._-]{3,20}$/.test(username)) { err.textContent = 'Usa de 3 a 20 caracteres (letras, números, punto, guion).'; return; }
    if (!editingId && password.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (editingId && password && password.length < 6) { err.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
    if (!editingId && DB.findUser(username)) { err.textContent = 'Ese nombre de usuario ya existe.'; return; }
    const btn = document.querySelector('#userForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      // Si hay backend real, usa API (actualiza Sheets/Drive)
      if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
        if (editingId) {
          const editingUser = DB.userById(editingId) || { username };
          // busca userId real en backend por username
          let apiUserId = editingId;
          try {
            const list = await BalsasudAPI.listUsers();
            const found = list.find(u => (u.username||'').toLowerCase() === (editingUser.username||username).toLowerCase());
            if (found) apiUserId = found.userId;
          } catch(e){}
          await BalsasudAPI.updateUser({ userId: apiUserId, name, role, password: password || undefined, active: true });
          // espejo local
          DB.mutate(db => {
            const u = db.users.find(x => x.id === editingId);
            if (u) { u.name = name; u.role = role; if (password) DB.hashPassword(username, password).then(h => u.passwordHash = h); }
          });
        } else {
          await BalsasudAPI.createUser({ username, name, role, password });
          const hash = await DB.hashPassword(username, password);
          DB.mutate(db => {
            db.users.push({ id: DB.uid('usr'), username, name, role, active: true, passwordHash: hash, createdAt: DB.nowIso() });
          });
        }
        state.editingUserId = null;
        UI.closeModal();
        UI.toast(editingId ? 'Usuario actualizado en Sheets' : 'Usuario creado en Sheets', 'success', 'Se actualizará en todos los dispositivos');
        renderRoute();
        return;
      }
    } catch (apiErr) {
      err.textContent = apiErr.message || 'Error al guardar en el backend. Intentando local…';
      console.warn(apiErr);
      // si falla API, cae a local abajo
      if (btn) { btn.disabled = false; btn.textContent = editingId ? 'Guardar cambios' : 'Crear usuario'; }
      return;
    }
    const hash = password ? await DB.hashPassword(username, password) : null;
    const me = actor();
    DB.mutate(db => {
      if (editingId) {
        const user = db.users.find(u => u.id === editingId);
        user.name = name;
        user.role = role;
        if (hash) user.passwordHash = hash;
        DB.log('user_update', { detail: `Usuario @${user.username} actualizado por ${me.name}.` });
      } else {
        db.users.push({
          id: DB.uid('usr'), username, name, role, active: true,
          passwordHash: hash, createdAt: DB.nowIso()
        });
        DB.log('user_create', { detail: `Usuario @${username} (${UI.roleLabel(role)}) creado por ${me.name}.` });
      }
    });
    state.editingUserId = null;
    UI.closeModal();
    UI.toast(editingId ? 'Usuario actualizado' : 'Usuario creado', 'success');
    renderRoute();
  }

  function resetUserPassword(userId) {
    const user = DB.userById(userId);
    if (!user) return;
    UI.openModal({
      eyebrow: 'RESTABLECER ACCESO',
      title: `Nueva contraseña · ${user.name}`,
      size: 'sm',
      body: `<label>Nueva contraseña<input type="password" id="rpPassword" autocomplete="new-password" /></label>
        <label>Confirmar contraseña<input type="password" id="rpConfirm" autocomplete="new-password" /></label>
        <p class="field-error" id="rpError" role="alert"></p>`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn-primary" id="rpSave">Actualizar</button>`,
      onMount(modal) {
        modal.querySelector('#rpSave').addEventListener('click', async () => {
          const pass = modal.querySelector('#rpPassword').value;
          const confirm = modal.querySelector('#rpConfirm').value;
          const err = modal.querySelector('#rpError');
          if (pass.length < 6) { err.textContent = 'Mínimo 6 caracteres.'; return; }
          if (pass !== confirm) { err.textContent = 'Las contraseñas no coinciden.'; return; }
          const btn = modal.querySelector('#rpSave');
          btn.disabled = true; btn.textContent = 'Actualizando…';
          try {
            if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
              let apiUserId = user.id;
              try {
                const list = await BalsasudAPI.listUsers();
                const found = list.find(u => (u.username||'').toLowerCase() === user.username.toLowerCase());
                if (found) apiUserId = found.userId;
              } catch(e){}
              await BalsasudAPI.updateUser({ userId: apiUserId, password: pass });
              const hash = await DB.hashPassword(user.username, pass);
              DB.mutate(db => {
                const u = db.users.find(x => x.id === user.id);
                if (u) u.passwordHash = hash;
              });
              UI.closeModal();
              UI.toast('Contraseña actualizada en Sheets', 'success', user.name + ' ya puede ingresar con la nueva clave');
              return;
            }
          } catch (apiErr) {
            err.textContent = apiErr.message || 'Error en backend';
            btn.disabled = false; btn.textContent = 'Actualizar';
            return;
          }
          const hash = await DB.hashPassword(user.username, pass);
          const me = actor();
          DB.mutate(db => {
            const u = db.users.find(x => x.id === user.id);
            u.passwordHash = hash;
            DB.log('user_update', { detail: `Contraseña de @${u.username} restablecida por ${me.name}.` });
          });
          UI.closeModal();
          UI.toast('Contraseña actualizada', 'success', user.name);
        });
      }
    });
  }

  /* ============================================================
     GUÍA
     ============================================================ */

  function renderHelp() {
    view.innerHTML = UI.pageHead({
      eyebrow: 'DOCUMENTACIÓN OPERATIVA',
      title: 'Guía y reglas del sistema',
      desc: 'Flujo obligatorio de triple verificación, estados y criterios de liberación.'
    }) + `
      <div class="grid-2">
        <section class="card">
          <header class="card-head"><div><p class="eyebrow">FLUJO</p><h2>Seis pasos obligatorios</h2></div></header>
          <ol class="flow-list">
            <li><b>01</b><div><strong>Superadministrador</strong><span>Crea la orden, adjunta el TALLY SHEET, verifica la lectura y publica.</span></div></li>
            <li><b>02</b><div><strong>Producto Terminado</strong><span>Registra cada pallet con ITEM ID, espesor, cantidad, empaque y fotos.</span></div></li>
            <li><b>03</b><div><strong>Calidad</strong><span>Verifica físicamente y aprueba, rechaza o solicita corrección por pallet.</span></div></li>
            <li><b>04</b><div><strong>Conciliación automática</strong><span>El motor compara TALLY, PT y Calidad por ITEM ID y espesor.</span></div></li>
            <li><b>05</b><div><strong>Liberación</strong><span>Se habilita solo si los tres registros coinciden y no hay pallets pendientes, rechazados, en corrección ni corregidos pendientes de reinspección.</span></div></li>
            <li><b>06</b><div><strong>Cierre</strong><span>Acta final con firmas, cantidades, responsables y fechas. Bloqueo de modificaciones.</span></div></li>
          </ol>
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">SEGURIDAD</p><h2>Roles y permisos</h2></div></header>
          <div class="role-cards">
            <article><span class="avatar tone-blue">SA</span><div><b>Superadministrador</b><p>Crea y publica órdenes, corrige el TALLY, autoriza excesos, libera, despacha, cierra y reabre. Administra usuarios.</p></div></article>
            <article><span class="avatar tone-amber">PT</span><div><b>Producto Terminado</b><p>Registra y corrige pallets, adjunta evidencias y envía el despacho a Calidad. No puede aprobar ni liberar.</p></div></article>
            <article><span class="avatar tone-green">CA</span><div><b>Calidad</b><p>Inspecciona, aprueba, rechaza o solicita corrección. Autoriza la liberación cuando la conciliación es exacta.</p></div></article>
          </div>
          <div class="notice notice-blue compact"><b>Datos locales</b><span>Esta versión guarda la información en el navegador (IndexedDB/localStorage). Abre cada rol en una pestaña para ver la sincronización en vivo.</span></div>
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">ESTADOS</p><h2>Ciclo de vida del despacho</h2></div></header>
          <div class="status-list">
            ${Object.entries(Engine.STATUS_META).map(([key, meta]) => `<div class="status-row"><span class="badge badge-${meta.tone}">${UI.esc(meta.label)}</span><small>${statusDescription(key)}</small></div>`).join('')}
          </div>
        </section>

        <section class="card">
          <header class="card-head"><div><p class="eyebrow">REGLAS</p><h2>Conciliación y liberación</h2></div></header>
          <ul class="rules-detail">
            <li>La comparación es por <b>Número de OP, ITEM ID, descripción, espesor, número de pallet y cantidad</b>.</li>
            <li>Si los tres registros coinciden → <b>CONCILIADO</b>.</li>
            <li>Diferencia reportada por PT → <b>DIFERENCIA EN PRODUCTO TERMINADO</b>.</li>
            <li>Diferencia verificada por Calidad → <b>DIFERENCIA EN CALIDAD</b>.</li>
            <li>Pallet sin registrar o sin inspeccionar → <b>PENDIENTE</b>.</li>
            <li>ITEM ID no autorizado → <b>aprobación bloqueada</b>.</li>
            <li>Espesor distinto al TALLY → <b>ALERTA DE ESPESOR</b>.</li>
            <li>Pallet rechazado, en corrección o corregido pendiente de reinspección → <b>sin liberación total</b>.</li>
            <li>El sobrante de un espesor <b>no compensa</b> el faltante de otro.</li>
            <li>Después del cierre, toda modificación requiere <b>autorización del Superadministrador</b> y motivo registrado.</li>
          </ul>
        </section>

        <section class="card span-2">
          <header class="card-head"><div><p class="eyebrow">ACCESO</p><h2>Cuentas de demostración</h2></div></header>
          <div class="demo-table">
            <div><span class="avatar tone-blue">SA</span><div><b>Superadministrador</b><code>superadmin / super#2026</code></div></div>
            <div><span class="avatar tone-amber">PT</span><div><b>Producto Terminado</b><code>terminado / pt#2026</code></div></div>
            <div><span class="avatar tone-green">CA</span><div><b>Calidad</b><code>calidad / calidad#2026</code></div></div>
          </div>
          <p class="hint">Cambia las contraseñas desde el menú de usuario. Para producción, migra a Supabase Auth (ver <b>supabase-schema.sql</b>) y sirve la aplicación por HTTPS.</p>
        </section>
      </div>
    `;
  }

  let jefeData = null;
  let jefeLoading = false;

  async function renderJefeEmbarque() {
    const user = DB.currentUser();
    if (!user || !can('jefe.view')) {
      view.innerHTML = `<div class="card error-card"><h2>Acceso restringido</h2><p>Solo Jefe de Embarque y Superadministrador pueden acceder a este módulo.</p></div>`;
      return;
    }
    if (!window.BalsasudAPI || !BalsasudAPI.isLoggedIn()) {
      view.innerHTML = UI.pageHead({ eyebrow: 'JEFE DE EMBARQUE', title: 'Jefe de Embarque', desc: 'Inicia sesión con el backend para ver los embarques. En modo local, usa órdenes locales.' }) + `<div class="card"><p class="hint">Sin conexión a Sheets. Los datos locales se muestran abajo.</p></div>` + renderJefeLocal();
      return;
    }
    if (jefeLoading) {
      view.innerHTML = UI.pageHead({ eyebrow: 'JEFE DE EMBARQUE', title: 'Cargando embarques…', desc: 'Sincronizando con Sheets.' }) + `<div class="card"><p> Cargando…</p></div>`;
      return;
    }
    jefeLoading = true;
    try {
      const list = await BalsasudAPI.jefeList();
      jefeData = list;
      view.innerHTML = buildJefeHTML(list);
      // hidratar fotos? no
    } catch (e) {
      view.innerHTML = `<div class="card error-card"><h2>No se pudo cargar</h2><p>${UI.esc(e.message)}</p><button class="btn btn-primary" data-action="jefe-reload">Reintentar</button></div>`;
    } finally { jefeLoading = false; }
  }

  function renderJefeLocal() {
    const orders = preparedOrders();
    if (!orders.length) return `<div class="card"><p class="table-empty">Sin órdenes locales.</p></div>`;
    return `<div class="grid-1">${orders.map(o=> `<div class="card"><header class="card-head"><div><p class="eyebrow">${UI.esc(o.op)} · ${UI.esc(o.client)}</p><h2>${UI.esc(o.code)}</h2></div><span class="badge badge-blue">${UI.esc(o.statusLabel || o.status)}</span></div><p class="hint">${o.pallets.length} pallets · ${o.tally ? o.tally.length : 0} ítems TALLY</p></div>`).join('')}</div>`;
  }

  function buildJefeHTML(list) {
    const totalPendientes = list.reduce((s,x)=> s + x.pendientes, 0);
    const totalAutorizados = list.reduce((s,x)=> s + x.autorizados, 0);
    const totalEmbarcados = list.reduce((s,x)=> s + x.embarcados, 0);
    const totalPallets = list.reduce((s,x)=> s + x.total, 0);
    const avance = totalPallets ? Math.round((totalAutorizados/totalPallets)*100) : 0;
    return UI.pageHead({ eyebrow: 'JEFE DE EMBARQUE · MODO GERENCIAL', title: 'Panel de autorización y embarque', desc: 'Selecciona el TALLY, revisa pallets liberados por PT y Calidad, autoriza 1 a 1 y registra el embarque físico por filas (9 filas, foto opcional).' }) + `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Embarques pendientes</span><b>${list.filter(x=>x.pendientes>0).length}</b><small>${totalPendientes} pallets por autorizar</small></div>
        <div class="kpi-card tone-amber"><span>Cargas pendientes</span><b>${totalPendientes}</b><small>por autorizar</small></div>
        <div class="kpi-card tone-green"><span>Cargas autorizadas</span><b>${totalAutorizados}</b><small>de ${totalPallets}</small></div>
        <div class="kpi-card tone-blue"><span>Embarcados</span><b>${totalEmbarcados}</b><small>registrados como embarcados</small></div>
        <div class="kpi-card"><span>Avance general</span><b>${avance}%</b><small>${totalAutorizados}/${totalPallets} autorizados</small><div class="progress"><div style="width:${avance}%"></div></div></div>
      </div>
      <div class="card">
        <header class="card-head"><div><p class="eyebrow">BANDEJA DE EMBARQUES</p><h2>Selecciona un TALLY</h2></div>
          <div class="head-actions"><input id="jefeSearch" placeholder="Buscar OP, cliente, contenedor, embarque…" style="min-width:280px" oninput="window.__jefeFilter && window.__jefeFilter(this.value)" /></div>
        </header>
        <div class="table-wrap">
          <table class="data-table" id="jefeTable">
            <thead><tr><th>Embarque</th><th>OP / Cliente</th><th>Contenedor / Destino</th><th>TALLY</th><th class="num">Pallets</th><th class="num">Autorizados</th><th class="num">Avance</th><th></th></tr></thead>
            <tbody>
              ${list.map(x=> {
                const s = x.shipment;
                return `<tr data-shipment="${s.shipmentId}">
                  <td><b>${UI.esc(s.code)}</b><small>${UI.esc(s.lot||'')} · ${UI.fmtDate(s.dispatchDate)}</small></td>
                  <td>${UI.esc(s.op)}<small>${UI.esc(s.client)}</small></td>
                  <td>${UI.esc(s.container||'—')}<small>${UI.esc(s.destination||'')}</small></td>
                  <td><button type="button" class="btn btn-ghost btn-sm" data-action="jefe-view-tally" data-shipment="${s.shipmentId}">Ver TALLY</button></td>
                  <td class="num"><b>${x.total}</b></td>
                  <td class="num"><b>${x.autorizados}</b> / ${x.total}</td>
                  <td class="num"><div class="progress small"><div style="width:${x.avance}%"></div></div><small>${x.avance}%</small></td>
                  <td><button type="button" class="btn btn-primary btn-sm" data-action="jefe-open" data-shipment="${s.shipmentId}">Abrir control</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div id="jefeDetail"></div>
    `;
  }

  async function openJefeControl(shipmentId) {
    const detail = document.getElementById('jefeDetail');
    if (!detail) return;
    detail.innerHTML = `<div class="card"><p>Cargando pallets…</p></div>`;
    try {
      const full = await BalsasudAPI.getShipment(shipmentId);
      const releases = await BalsasudAPI.listReleases(shipmentId);
      const inspections = await BalsasudAPI.listInspections({ shipmentId });
      const list = await BalsasudAPI.jefeList();
      jefeData = list;
      const jefeInfo = list.find(x=>x.shipment.shipmentId===shipmentId);
      const autorizaciones = (jefeInfo && jefeInfo.autorizaciones) ? jefeInfo.autorizaciones : [];
      const fisicos = (jefeInfo && jefeInfo.fisicos) ? jefeInfo.fisicos : [];
      detail.innerHTML = buildJefeControlHTML(full, full.details||[], releases||[], inspections||[], autorizaciones, fisicos);
      detail.dataset.shipmentId = shipmentId;
    } catch(e) {
      detail.innerHTML = `<div class="card error-card"><p>${UI.esc(e.message)}</p></div>`;
    }
  }

  function buildJefeControlHTML(shipment, details, releases, inspections, autorizaciones, fisicos) {
    const inspByRelease = new Map((inspections||[]).map(i=> [i.releaseId, i]));
    const autByRelease = new Map((autorizaciones||[]).map(a=> [a.releaseId, a]));
    const fisByRelease = new Map();
    (fisicos||[]).forEach(f=> { try{ JSON.parse(f.releaseIds||'[]').forEach(id=> fisByRelease.set(id, f)); } catch(e){} });
    const detailByItem = new Map((details||[]).map(d=> [String(d.itemId), d]));
    const groups = [];
    const grouped = new Map();
    (releases||[]).forEach(rel => {
      const key = `${rel.itemId}_${rel.thickness}`;
      if (!grouped.has(key)) {
        const det = detailByItem.get(String(rel.itemId)) || {};
        grouped.set(key, { itemId: rel.itemId, thickness: rel.thickness, description: det.description || '', releases: [], totalPanels: 0, authorizedPanels: 0 });
      }
      const g = grouped.get(key);
      const insp = inspByRelease.get(rel.releaseId);
      const aut = autByRelease.get(rel.releaseId);
      const calidadOk = insp && insp.status==='finalizada' && Number(insp.approvedPanels)===Number(rel.releasedPanels);
      const fis = fisByRelease.get(rel.releaseId);
      g.releases.push(Object.assign({}, rel, { calidadOk, aut: !!aut, canAuth: calidadOk && !aut, fis }));
      g.totalPanels += Number(rel.releasedPanels);
      if (aut) g.authorizedPanels += Number(rel.releasedPanels);
    });
    grouped.forEach(g => {
      g.releases.sort((a,b) => (a.aut === b.aut) ? 0 : (a.aut ? 1 : -1));
      groups.push(g);
    });
    groups.sort((a,b) => String(a.itemId).localeCompare(String(b.itemId)) || Number(a.thickness) - Number(b.thickness));
    const allPendientes = groups.reduce((s,g)=> s + g.releases.filter(r=>r.canAuth).length, 0);
    return `
      <section class="card">
        <header class="card-head"><div><p class="eyebrow">TALLY SELECCIONADO</p><h2>${UI.esc(shipment.code)} · ${UI.esc(shipment.op)} · ${UI.esc(shipment.client)}</h2><p class="hint">Lote ${UI.esc(shipment.lot||'')} · Contenedor ${UI.esc(shipment.container||'—')} → ${UI.esc(shipment.destination||'')} · TALLY: ${details.length} ítems, ${details.reduce((s,d)=>s+Number(d.programmed||0),0)} paneles</p></div>
          <div class="head-actions"><button class="btn btn-outline btn-sm" data-action="jefe-view-tally" data-shipment="${shipment.shipmentId}">Ver PDF TALLY</button></div>
        </header>
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>ITEM ID</th><th>Descripción</th><th>Espesor</th><th class="num">Programado</th></tr></thead>
          <tbody>${details.map(d=> `<tr><td class="mono">${UI.esc(d.itemId)}</td><td>${UI.esc(d.description||'')}</td><td>${Engine.thicknessLabel(d.thickness)}</td><td class="num">${UI.fmt(d.programmed)}</td></tr>`).join('')}</tbody></table>
        </div>
      </section>
      <section class="card">
        <header class="card-head"><div><p class="eyebrow">CARGA LIBERADA</p><h2>Confirmar carga por ítem</h2><p class="hint">Toca el ✓ de cada pallet para confirmar que va todo OK. Solo se habilitan los liberados por PT y aprobados por Calidad.</p></div>
          <div class="head-actions"><button class="btn btn-primary btn-sm" data-action="jefe-autorizar-all" data-shipment="${shipment.shipmentId}" ${allPendientes?'' : 'disabled'}>✓ Marcar todos OK (${allPendientes})</button></div>
        </header>
        <div class="jefe-checklist">
          ${groups.map(g => `
            <div class="jefe-item-group">
              <div class="jefe-item-head">
                <div><b class="mono">${UI.esc(g.itemId)}</b> · ${Engine.thicknessLabel(g.thickness)}<small>${UI.esc(g.description)}</small></div>
                <div class="jefe-item-meta"><span class="badge badge-blue">${UI.fmt(g.totalPanels)} paneles</span><span class="badge ${g.authorizedPanels>=g.totalPanels ? 'badge-green' : 'badge-amber'}">${g.releases.filter(r=>r.aut).length}/${g.releases.length} OK</span></div>
              </div>
              <div class="jefe-pallet-list">
                ${g.releases.map(rel => `
                  <label class="jefe-check ${rel.aut ? 'checked' : ''} ${!rel.canAuth ? 'disabled' : ''}">
                    <input type="checkbox" data-action="jefe-check" data-shipment="${shipment.shipmentId}" data-release="${rel.releaseId}" ${rel.aut ? 'checked disabled' : ''} ${!rel.canAuth ? 'disabled' : ''}>
                    <span class="checkmark" aria-hidden="true">✓</span>
                    <span class="jefe-check-info">
                      <b>${UI.esc(rel.releaseId.slice(-6))}</b>
                      <small>${UI.fmt(rel.releasedPanels)} paneles${rel.palletType ? ' · ' + UI.esc(rel.palletType) : ''}${rel.fis ? ' · Fila ' + UI.esc(rel.fis.fila) : ''}</small>
                    </span>
                    <span class="jefe-check-status">${rel.aut ? 'Autorizado' : (rel.calidadOk ? 'Listo para OK' : 'Pendiente Calidad')}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('') || '<p class="table-empty">Sin pallets liberados.</p>'}
        </div>
      </section>
      <section class="card">
        <header class="card-head"><div><p class="eyebrow">EMBARQUE FÍSICO</p><h2>9 filas × 4 pallets + Fila 10 cajas en puerta</h2><p class="hint">Distribuye 4 pallets por fila (1‑9) y hasta 12 cajas sueltas en la Fila 10. Puedes adjuntar foto opcional por fila.</p></div>
          <div class="head-actions"><button class="btn btn-outline btn-sm" data-action="jefe-distribuir" data-shipment="${shipment.shipmentId}">⇄ Distribuir automáticamente</button></div>
        </header>
        <div class="grid-3" style="gap:12px">
          ${(() => {
            const autReleaseIds = new Set((autorizaciones||[]).filter(a=>a.estado==='autorizado').map(a=>a.releaseId));
            const embarcados = new Set();
            (fisicos||[]).forEach(f=> { try { JSON.parse(f.releaseIds||'[]').forEach(id=> embarcados.add(id)); } catch(e){} });
            const disponibles = (releases||[]).filter(r=> autReleaseIds.has(r.releaseId) && !embarcados.has(r.releaseId));
            const palletsDisp = disponibles.filter(r=> (r.packaging||'pallet') !== 'caja');
            const cajasDisp = disponibles.filter(r=> (r.packaging||'pallet') === 'caja');
            return Array.from({length:10},(_,i)=> {
              const n = i+1;
              const esPuerta = n===10;
              const max = esPuerta ? 12 : 4;
              const opts = esPuerta ? cajasDisp : palletsDisp;
              const label = esPuerta ? 'Cajas en puerta' : 'Pallets';
              return `<div class="card ${esPuerta?'jefe-fila-puerta':''}" style="padding:10px">
                <b>Fila ${n}</b>${esPuerta?' <span class="badge badge-amber">12 cajas</span>':' <span class="badge badge-blue">4 pallets</span>'}<br/>
                <small class="hint">${label} en esta fila (máx. ${max})</small>
                <div style="margin:6px 0">
                  <select id="fila-${n}-select" multiple size="3" style="width:100%; min-height:60px" data-max="${max}">
                    ${opts.map(r=> `<option value="${r.releaseId}">${r.itemId} · ${Engine.thicknessLabel(r.thickness)} · ${r.releasedPanels} p.</option>`).join('')}
                  </select>
                </div>
                <label class="file-button" style="font-size:12px"><input type="file" id="fila-${n}-foto" accept="image/*" hidden />📷 Foto Fila ${n} (opcional)</label>
                <div id="fila-${n}-preview" style="margin-top:6px"></div>
                <button class="btn btn-primary btn-sm" data-action="jefe-fila" data-shipment="${shipment.shipmentId}" data-fila="${n}" style="margin-top:8px; width:100%">Guardar Fila ${n}</button>
              </div>`;
            }).join('');
          })()}
        </div>
      </section>
      <section class="card">
        <header class="card-head"><div><p class="eyebrow">CIERRE</p><h2>Acta final de embarque</h2></div></header>
        <p class="hint">Solo se habilita cuando todos los pallets del TALLY estén autorizados y embarcados, y las 3 firmas estén listas.</p>
        <button class="btn btn-primary" data-action="jefe-acta" data-shipment="${shipment.shipmentId}">Generar ACTA FINAL DE EMBARQUE (3 firmas + QR)</button>
      </section>
    `;
  }

  function statusDescription(key) {
    return {
      borrador: 'Orden creada por el Superadministrador, aún no visible.',
      pendiente_pt: 'Publicada, sin pallets registrados.',
      registro: 'Producto Terminado está registrando pallets.',
      pendiente_calidad: 'Enviada a Calidad, sin inspecciones.',
      inspeccion: 'Calidad está inspeccionando pallets.',
      con_diferencias: 'Existen diferencias entre las tres fuentes.',
      correccion: 'Hay pallets rechazados o que requieren corrección.',
      corregido: 'Hay pallets corregidos por Producto Terminado y pendientes de reinspección.',
      conciliado: 'TALLY = PT = Calidad, lista para liberar.',
      liberado: 'Liberación formal registrada con acta.',
      despachado: 'Contenedor despachado.',
      cerrado: 'Cierre definitivo, sin modificaciones sin autorización.'
    }[key] || '';
  }

  /* ============================================================
     CONSTRUCTORES DE DOCUMENTOS
     ============================================================ */

  function reportOrderFrom(el) {
    const id = (el && el.dataset.id) || state.reportOrderId || (state.order && state.order.id);
    return id ? preparedOrder(id) : null;
  }

  function reportShell(title, order, body, footer) {
    return UI.docShell(title, `${order.code} · ${order.client} · OP ${order.op || '—'}`, body, { footer: footer || '' });
  }

  function buildTallyReport(order) {
    const rec = order._rec;
    const body = `<section class="doc-section">
      <h1 class="doc-title">REPORTE DE TALLY SHEET</h1>
      <p class="doc-subtitle">${UI.esc(order.code)} · ${UI.esc(order.client)}</p>
      <div class="doc-info">
        <div><span>Orden de producción</span><b>${UI.esc(order.op || '—')}</b></div>
        <div><span>Orden de compra</span><b>${UI.esc(order.purchaseOrder || '—')}</b></div>
        <div><span>Contenedor</span><b>${UI.esc(order.container || '—')}</b></div>
        <div><span>Destino</span><b>${UI.esc(order.destination || '—')}</b></div>
        <div><span>Fecha de despacho</span><b>${UI.fmtDateLong(order.dispatchDate)}</b></div>
        <div><span>Lote</span><b>${UI.esc(order.lot || '—')}</b></div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Productos autorizados</h2>
      <table class="doc-table"><thead><tr><th>ITEM ID</th><th>Descripción</th><th>Espesor</th><th class="num">Paneles</th><th class="num">Pallets</th></tr></thead>
      <tbody>${(order.items || []).map(i => `<tr><td>${UI.esc(i.itemId)}</td><td>${UI.esc(i.description || '—')}</td><td>${Engine.thicknessLabel(i.thickness)}</td><td class="num">${UI.fmt(i.programmed)}</td><td class="num">${UI.fmt(i.pallets)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">TOTAL</td><td class="num">${UI.fmt(rec.totals.tally)}</td><td class="num">${UI.fmt(rec.totals.tallyPallets)}</td></tr></tfoot></table>
    </section>`;
    return reportShell('REPORTE DE TALLY SHEET', order, body);
  }

  function buildPalletsReport(order) {
    const body = `<section class="doc-section">
      <h1 class="doc-title">REPORTE DE PALLETS REGISTRADOS</h1>
      <p class="doc-subtitle">${UI.esc(order.code)} · ${UI.esc(order.client)}</p>
      <table class="doc-table"><thead><tr><th>#</th><th>ITEM ID</th><th>Espesor</th><th>Empaque</th><th class="num">Paneles</th><th class="num">Peso neto</th><th class="num">Peso bruto</th><th>Responsable PT</th><th>Responsable PT físico</th><th>Calidad</th><th>Inspector físico</th></tr></thead>
      <tbody>${(order.pallets || []).map(p => {
        const q = Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'];
        return `<tr><td>${UI.esc(p.number)}</td><td>${UI.esc(p.itemId)}</td><td>${Engine.thicknessLabel(p.thickness)}</td><td>${UI.esc(Engine.PACKAGING[p.packaging] || '—')}</td><td class="num">${UI.fmt(p.panels)}</td><td class="num">${p.netWeight ? UI.fmt(p.netWeight) : '—'}</td><td class="num">${p.grossWeight ? UI.fmt(p.grossWeight) : '—'}</td><td>${UI.esc(p.createdByName || '—')}</td><td>${UI.esc(p.operatorName || '—')}</td><td>${UI.esc(q ? q.label : '—')}</td><td>${UI.esc((p.quality && p.quality.inspectorName) || '—')}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="4">TOTAL</td><td class="num">${UI.fmt(order._rec.totals.pt)}</td><td colspan="4"></td></tr></tfoot></table>
      <p>Total de pallets registrados: <b>${order.pallets.length}</b>. Paneles reportados: <b>${UI.fmt(order._rec.totals.pt)}</b> de ${UI.fmt(order._rec.totals.tally)} autorizados.</p>
    </section>`;
    return reportShell('REPORTE DE PALLETS', order, body);
  }

  function buildInspectionReport(order) {
    const body = `<section class="doc-section">
      <h1 class="doc-title">REPORTE DE INSPECCIÓN DE CALIDAD</h1>
      <p class="doc-subtitle">${UI.esc(order.code)} · ${UI.esc(order.client)}</p>
      <table class="doc-table"><thead><tr><th>#</th><th>ITEM ID / Descripción</th><th>Espesor</th><th class="num">Reportado</th><th class="num">Verificado</th><th>Estado</th><th>Inspector</th><th>Fecha</th><th>Observaciones</th></tr></thead>
      <tbody>${(order.pallets || []).map(p => {
        const q = p.quality || { status: 'pendiente' };
        const meta = Engine.Q_STATUS[q.status] || Engine.Q_STATUS.pendiente;
        return `<tr><td>${UI.esc(p.number)}</td><td>${UI.esc(p.itemId)} · ${UI.esc(p.description || '')}</td><td>${Engine.thicknessLabel(p.thickness)}</td><td class="num">${UI.fmt(p.panels)}</td><td class="num">${q.verifiedPanels != null ? UI.fmt(q.verifiedPanels) : '—'}</td><td>${UI.esc(meta.label)}</td><td>${UI.esc(q.byName || '—')}</td><td>${q.at ? UI.fmtDateTime(q.at) : '—'}</td><td>${UI.esc(q.observations || '—')}</td></tr>`;
      }).join('')}</tbody></table>
    </section>`;
    return reportShell('REPORTE DE INSPECCIÓN', order, body);
  }

  function buildConciliationReport(order) {
    const rec = order._rec;
    const body = `<section class="doc-section">
      <h1 class="doc-title">REPORTE DE CONCILIACIÓN DE CANTIDADES</h1>
      <p class="doc-subtitle">${UI.esc(order.code)} · ${UI.esc(order.client)} · ${rec.ok ? 'CONCILIADO' : 'CON DIFERENCIAS'}</p>
      <div class="doc-stats">
        <div><span>Paneles TALLY</span><b>${UI.fmt(rec.totals.tally)}</b></div>
        <div><span>Producto Terminado</span><b>${UI.fmt(rec.totals.pt)}</b></div>
        <div><span>Calidad</span><b>${UI.fmt(rec.totals.quality)}</b></div>
        <div><span>Δ general</span><b>${rec.totals.diffPt === 0 ? '0' : (rec.totals.diffPt > 0 ? '+' : '') + UI.fmt(rec.totals.diffPt)}</b></div>
      </div>
      <table class="doc-table"><thead><tr><th>Espesor</th><th>ITEM ID</th><th>Descripción</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Δ PT</th><th class="num">Calidad</th><th class="num">Δ Calidad</th><th>Estado</th></tr></thead>
      <tbody>${rec.rows.map(r => {
        const meta = Engine.rowStatusMeta(r.status);
        return `<tr><td>${UI.esc(r.thicknessLabel)}</td><td>${UI.esc(r.itemLabel)}</td><td>${UI.esc(r.description || '—')}</td><td class="num">${UI.fmt(r.tally)}</td><td class="num">${UI.fmt(r.pt)}</td><td class="num">${r.diffPt === 0 ? '0' : (r.diffPt > 0 ? '+' : '') + UI.fmt(r.diffPt)}</td><td class="num">${UI.fmt(r.quality)}</td><td class="num">${r.diffQuality === 0 ? '0' : (r.diffQuality > 0 ? '+' : '') + UI.fmt(r.diffQuality)}</td><td>${UI.esc(meta.label)}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="3">TOTAL GENERAL</td><td class="num">${UI.fmt(rec.totals.tally)}</td><td class="num">${UI.fmt(rec.totals.pt)}</td><td class="num">${rec.totals.diffPt === 0 ? '0' : (rec.totals.diffPt > 0 ? '+' : '') + UI.fmt(rec.totals.diffPt)}</td><td class="num">${UI.fmt(rec.totals.quality)}</td><td class="num">${rec.totals.diffQuality === 0 ? '0' : (rec.totals.diffQuality > 0 ? '+' : '') + UI.fmt(rec.totals.diffQuality)}</td><td></td></tr></tfoot></table>
      ${rec.issues.length ? `<h2>Hallazgos</h2><ul class="doc-list">${rec.issues.map(i => `<li><b>${UI.esc(i.tag)}</b> ${UI.esc(i.itemId)} · ${UI.esc(i.thickness)} — ${UI.esc(i.message)}</li>`).join('')}</ul>` : '<p class="doc-verdict">✓ Sin diferencias: las tres fuentes coinciden.</p>'}
    </section>`;
    return reportShell('REPORTE DE CONCILIACIÓN', order, body);
  }

  function buildDifferencesReport(order) {
    const rec = order._rec;
    const release = Engine.releaseCheck(order);
    const body = `<section class="doc-section">
      <h1 class="doc-title">REPORTE DE DIFERENCIAS</h1>
      <p class="doc-subtitle">${UI.esc(order.code)} · ${UI.esc(order.client)}</p>
      ${rec.issues.length ? `<table class="doc-table"><thead><tr><th>Tipo</th><th>ITEM ID</th><th>Espesor</th><th class="num">TALLY</th><th class="num">PT</th><th class="num">Calidad</th><th>Detalle</th></tr></thead>
        <tbody>${rec.issues.map(i => `<tr><td><b>${UI.esc(i.tag)}</b></td><td>${UI.esc(i.itemId)}</td><td>${UI.esc(i.thickness)}</td><td class="num">${UI.fmt(i.tally)}</td><td class="num">${UI.fmt(i.pt)}</td><td class="num">${UI.fmt(i.quality)}</td><td>${UI.esc(i.message)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="doc-verdict">✓ No se detectaron diferencias.</p>'}
      <h2>Bloqueos de liberación</h2>
      ${release.reasons.length ? `<ul class="doc-list">${release.reasons.map(r => `<li>${UI.esc(r)}</li>`).join('')}</ul>` : '<p>✓ Sin bloqueos: el despacho puede liberarse.</p>'}
    </section>`;
    return reportShell('REPORTE DE DIFERENCIAS', order, body);
  }

  function buildReportHTML(type, order) {
    if (!order) return null;
    switch (type) {
      case 'tally': return buildTallyReport(order);
      case 'pallets': return buildPalletsReport(order);
      case 'inspection': return buildInspectionReport(order);
      case 'conciliation': return buildConciliationReport(order);
      case 'differences': return buildDifferencesReport(order);
      case 'acta': return buildActaHTML(order);
      default: return null;
    }
  }

  /* ---------------- CSV ---------------- */

  function csvFor(type, order) {
    const rec = order._rec;
    const q = Engine.qualityCounts(order.pallets);
    switch (type) {
      case 'tally':
        return {
          name: `TALLY_${order.code}`,
          rows: [
            ['ITEM ID', 'Descripción', 'Espesor (mm)', 'Paneles autorizados', 'Pallets', 'BF', 'M3', 'Reportado PT', 'Aprobado Calidad', 'Delta PT'],
            ...(order.items || []).map(item => {
              const row = rec.rows.find(r => r.key === Engine.keyOf(item.itemId, item.thickness)) || { pt: 0, quality: 0 };
              return [item.itemId, item.description, Engine.thicknessNumber(item.thickness), item.programmed, item.pallets || 0, item.bf || 0, item.m3 || 0, row.pt, row.quality, row.pt - item.programmed];
            }),
            ['TOTAL', '', '', rec.totals.tally, rec.totals.tallyPallets, '', '', rec.totals.pt, rec.totals.quality, rec.totals.diffPt]
          ]
        };
      case 'pallets':
        return {
          name: `PALLETS_${order.code}`,
          rows: [
            ['Orden', 'Pallet', 'ITEM ID', 'Descripción', 'Espesor (mm)', 'Empaque', 'Tipo', 'Paneles', 'Peso neto', 'Peso bruto', 'BF', 'M3', 'Responsable PT sistema', 'Responsable PT físico', 'Fecha registro', 'Estado calidad', 'Inspector sistema', 'Inspector físico', 'Fecha inspección', 'Observaciones', 'Fotos'],
            ...(order.pallets || []).map(p => [
              order.code, p.number, p.itemId, p.description, Engine.thicknessNumber(p.thickness),
              Engine.PACKAGING[p.packaging] || p.packaging, Engine.PALLET_TYPE[p.palletType] || p.palletType,
              p.panels, p.netWeight || '', p.grossWeight || '', p.bf || '', p.m3 || '',
              p.createdByName || '', p.operatorName || '', p.createdAt || '',
              (Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'] || {}).label || '',
              (p.quality && p.quality.byName) || '', (p.quality && p.quality.inspectorName) || '', (p.quality && p.quality.at) || '',
              (p.quality && p.quality.observations) || '', (p.evidence || []).length
            ])
          ]
        };
      case 'inspection':
        return {
          name: `INSPECCION_${order.code}`,
          rows: [
            ['Orden', 'Pallet', 'ITEM ID', 'Espesor (mm)', 'Reportado', 'Verificado', 'Estado', 'Inspector', 'Fecha', 'Observaciones', 'Dimensiones', 'Cantidad', 'Empaque', 'Evidencia'],
            ...(order.pallets || []).map(p => {
              const quality = p.quality || { status: 'pendiente' };
              return [order.code, p.number, p.itemId, Engine.thicknessNumber(p.thickness), p.panels,
                quality.verifiedPanels != null ? quality.verifiedPanels : '',
                (Engine.Q_STATUS[quality.status] || {}).label || '', quality.byName || '', quality.at || '', quality.observations || '',
                quality.checklist && quality.checklist.dimensiones ? 'Sí' : 'No',
                quality.checklist && quality.checklist.cantidad ? 'Sí' : 'No',
                quality.checklist && quality.checklist.empaque ? 'Sí' : 'No',
                quality.checklist && quality.checklist.evidencia ? 'Sí' : 'No'];
            })
          ]
        };
      case 'conciliation':
        return {
          name: `CONCILIACION_${order.code}`,
          rows: [
            ['Orden', 'Espesor', 'ITEM ID', 'Descripción', 'TALLY', 'Producto Terminado', 'Delta PT', 'Calidad', 'Delta Calidad', 'Pallets aprobados', 'Pallets totales', 'Estado'],
            ...rec.rows.map(r => [order.code, Engine.thicknessNumber(r.thickness), r.itemLabel, r.description, r.tally, r.pt, r.diffPt, r.quality, r.diffQuality, r.approvedCount, r.palletCount, Engine.rowStatusMeta(r.status).label]),
            ['', '', 'TOTAL GENERAL', '', rec.totals.tally, rec.totals.pt, rec.totals.diffPt, rec.totals.quality, rec.totals.diffQuality, rec.totals.approvedPallets, rec.totals.pallets, rec.ok ? 'CONCILIADO' : 'CON DIFERENCIAS']
          ]
        };
      case 'differences':
        return {
          name: `DIFERENCIAS_${order.code}`,
          rows: [
            ['Orden', 'Tipo', 'ITEM ID', 'Espesor', 'TALLY', 'PT', 'Calidad', 'Mensaje'],
            ...rec.issues.map(i => [order.code, i.tag, i.itemId, i.thickness, i.tally, i.pt, i.quality, i.message]),
            ...Engine.releaseCheck(order).reasons.map(r => [order.code, 'BLOQUEO', '', '', '', '', '', r])
          ]
        };
      case 'acta':
        return {
          name: `ACTA_${order.code}`,
          rows: [
            ['ACTA DE LIBERACIÓN', order.code],
            ['Cliente', order.client],
            ['OP', order.op],
            ['OC', order.purchaseOrder],
            ['Contenedor', order.container],
            ['Destino', order.destination],
            ['Fecha de despacho', order.dispatchDate],
            ['Estado', order._status],
            ['Paneles TALLY', rec.totals.tally],
            ['Paneles Producto Terminado', rec.totals.pt],
            ['Paneles Calidad', rec.totals.quality],
            ['Pallets', q.total],
            ['Aprobados', q.approved],
            ['Rechazados', q.rejected],
            ['Requieren corrección', q.correction],
            ['Corregidos · pendientes reinspección', q.corrected],
            ['Conciliado', rec.ok ? 'SÍ' : 'NO'],
            ['Liberado', order.releasedAt ? UI.fmtDateTime(order.releasedAt) : 'NO'],
            ['Liberado por', order.releasedBy ? order.releasedBy.name : '—']
          ]
        };
      default: return null;
    }
  }

  function csvGlobal(type) {
    const orders = preparedOrders();
    if (type === 'orders-global') {
      return {
        name: 'ORDENES',
        rows: [
          ['Código', 'OP', 'OC', 'Cliente', 'Contenedor', 'Destino', 'Fecha despacho', 'Lote', 'Estado', 'Paneles TALLY', 'Paneles PT', 'Paneles Calidad', 'Pallets', 'Aprobados', '¿Conciliado?'],
          ...orders.map(o => [o.code, o.op, o.purchaseOrder, o.client, o.container, o.destination, o.dispatchDate, o.lot, o._status, o._rec.totals.tally, o._rec.totals.pt, o._rec.totals.quality, o._rec.totals.pallets, o._rec.totals.approvedPallets, o._rec.ok ? 'SÍ' : 'NO'])
        ]
      };
    }
    if (type === 'pallets-global') {
      const rows = [['Orden', 'Cliente', 'Pallet', 'ITEM ID', 'Descripción', 'Espesor (mm)', 'Empaque', 'Paneles', 'Responsable PT sistema', 'Responsable PT físico', 'Estado calidad', 'Inspector sistema', 'Inspector físico', 'Fotos']];
      orders.forEach(o => (o.pallets || []).forEach(p => rows.push([
        o.code, o.client, p.number, p.itemId, p.description, Engine.thicknessNumber(p.thickness),
        Engine.PACKAGING[p.packaging] || p.packaging, p.panels, p.createdByName || '', p.operatorName || '',
        (Engine.Q_STATUS[(p.quality && p.quality.status) || 'pendiente'] || {}).label || '',
        (p.quality && p.quality.byName) || '', (p.quality && p.quality.inspectorName) || '', (p.evidence || []).length
      ])));
      return { name: 'PALLETS', rows };
    }
    if (type === 'conciliation-global') {
      const rows = [['Orden', 'Cliente', 'Estado', 'Espesor', 'ITEM ID', 'TALLY', 'PT', 'Delta PT', 'Calidad', 'Delta Calidad', 'Estado conciliación']];
      orders.filter(o => o._status !== 'borrador').forEach(o => {
        o._rec.rows.forEach(r => rows.push([o.code, o.client, o._status, r.thicknessLabel, r.itemLabel, r.tally, r.pt, r.diffPt, r.quality, r.diffQuality, Engine.rowStatusMeta(r.status).label]));
      });
      return { name: 'CONCILIACION', rows };
    }
    return null;
  }

  function exportReport(type, order) {
    const global = ['orders-global', 'pallets-global', 'conciliation-global'].includes(type);
    const csv = global ? csvGlobal(type) : (order ? csvFor(type, order) : null);
    if (!csv) { UI.toast('Selecciona una orden', 'warn'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const code = order ? `_${order.code}` : '';
    UI.downloadCSV(`BALSASUD_${csv.name}${code}_${date}.csv`, csv.rows);
    UI.toast('Exportación generada', 'success', `${csv.name} · ${csv.rows.length - 1} fila(s)`);
  }

  /* ---------------- archivos de la orden ---------------- */

  async function openTallyFile(orderId, download) {
    const order = DB.getOrder(orderId);
    const meta = order && order.tally;
    if (!meta || !meta.storageKey) {
      UI.toast('Sin archivo adjunto', 'warn', 'Esta orden se registró con ingreso manual o el archivo no está disponible.');
      return;
    }
    const blob = await DB.getFile(meta.storageKey);
    if (!blob) {
      UI.toast('Archivo no disponible', 'error', 'El PDF no se encuentra en el almacenamiento de este navegador.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    if (download) a.download = meta.fileName || 'TALLY.pdf';
    else a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openPalletPhotos(palletId) {
    const order = state.order;
    const pallet = order && (order.pallets || []).find(p => p.id === palletId);
    if (!pallet) return;
    UI.openModal({
      eyebrow: 'EVIDENCIA',
      title: `Fotos · ${pallet.number}`,
      subtitle: `${pallet.itemId} · ${Engine.thicknessLabel(pallet.thickness)}`,
      size: 'md',
      body: `<div class="photo-grid large">${(pallet.evidence || []).map(ev => `<button type="button" class="photo-thumb" data-photo-key="${ev.key}" data-action="open-photo" data-caption="${UI.esc(pallet.number + ' · ' + (ev.name || ''))}"></button>`).join('')}</div>`,
      footer: '<button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button>',
      onMount(modal) { UI.hydratePhotos(modal); }
    });
  }

  /* ============================================================
     FLUJO: PUBLICAR, ENVIAR, LIBERAR, DESPACHAR, CERRAR
     ============================================================ */

  function publishDraft(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    if (!order.items.length) { UI.toast('No se puede publicar', 'error', 'El TALLY SHEET no tiene productos autorizados.'); return; }
    UI.confirmDialog({
      eyebrow: 'PUBLICACIÓN',
      title: `Publicar ${order.code}`,
      message: 'La orden quedará disponible para Producto Terminado y Calidad. El TALLY SHEET no podrá modificarse sin dejar evidencia.',
      list: [`${order.items.length} producto(s) autorizados`, `${UI.fmt(order._rec.totals.tally)} paneles programados`, `Cliente: ${UI.esc(order.client)}`],
      okLabel: 'Publicar orden'
    }).then(ok => {
      if (!ok) return;
      const me = actor();
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === orderId);
        ord.publishedAt = DB.nowIso();
        ord.publishedBy = me;
        DB.log('order_publish', { orderId, orderCode: ord.code, detail: `Orden ${ord.code} publicada por ${me.name}.` });
      });
      UI.toast('Orden publicada', 'success', order.code);
      UI.broadcastToast(`Orden ${order.code} publicada`, 'info', 'Producto Terminado y Calidad ya pueden trabajar.');
    });
  }

  function sendToQuality(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    if (!order.pallets.length) { UI.toast('Sin pallets', 'error', 'Registra al menos un pallet antes de enviar a Calidad.'); return; }
    UI.confirmDialog({
      eyebrow: 'ENVÍO A CALIDAD',
      title: `Enviar ${order.code} a revisión`,
      message: 'Producto Terminado confirma que el registro de pallets está completo. Calidad recibirá el despacho para inspección física.',
      list: [`${order.pallets.length} pallet(s)`, `${UI.fmt(order._rec.totals.pt)} paneles reportados`, `TALLY autorizado: ${UI.fmt(order._rec.totals.tally)} paneles`],
      okLabel: 'Enviar a Calidad'
    }).then(ok => {
      if (!ok) return;
      const me = actor();
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === orderId);
        ord.submittedAt = DB.nowIso();
        ord.submittedBy = me;
        DB.log('order_submit', { orderId, orderCode: ord.code, detail: `${me.name} envió ${ord.pallets.length} pallet(s) a revisión de Calidad.` });
      });
      UI.toast('Despacho enviado a Calidad', 'success', order.code);
      UI.broadcastToast('Despacho enviado a Calidad', 'info', `${order.code} · ${order.pallets.length} pallets`);
    });
  }

  function openReleaseModal(order) {
    const release = Engine.releaseCheck(order);
    if (!release.ok) {
      UI.toast('Liberación bloqueada', 'error', release.reasons[0] || 'Existen requisitos pendientes.');
      return;
    }
    const rec = order._rec;
    const q = Engine.qualityCounts(order.pallets);
    UI.openModal({
      eyebrow: 'LIBERACIÓN FORMAL',
      title: `Liberar despacho ${order.code}`,
      subtitle: 'La triple verificación coincide. Al liberar se habilita el acta oficial con las tres firmas.',
      size: 'md',
      body: `<div class="release-summary">
        <div class="release-verdict"><b>✓ TALLY SHEET = PRODUCTO TERMINADO = CALIDAD</b><span>${UI.fmt(rec.totals.tally)} paneles · ${q.total} pallets aprobados</span></div>
        <div class="release-grid">
          <div><span>Paneles autorizados</span><b>${UI.fmt(rec.totals.tally)}</b></div>
          <div><span>Reportados</span><b>${UI.fmt(rec.totals.pt)}</b></div>
          <div><span>Aprobados</span><b>${UI.fmt(rec.totals.quality)}</b></div>
          <div><span>Pallets</span><b>${q.total}</b></div>
        </div>
        <label>Observaciones de liberación (opcional)
          <textarea id="releaseNotes" rows="2" placeholder="Notas para el acta de liberación..."></textarea></label>
        <label class="check-line"><input type="checkbox" id="releaseConfirm" /> Confirmo que la verificación física fue completada por las tres áreas.</label>
        <p class="field-error" id="releaseError" role="alert"></p>
      </div>`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn-success" id="releaseConfirmBtn">✓ Liberar despacho</button>`,
      onMount(modal) {
        modal.querySelector('#releaseConfirmBtn').addEventListener('click', () => {
          const err = modal.querySelector('#releaseError');
          if (!modal.querySelector('#releaseConfirm').checked) {
            err.textContent = 'Debes confirmar la verificación física de las tres áreas.';
            return;
          }
          const notes = modal.querySelector('#releaseNotes').value.trim();
          const me = actor();
          UI.closeModal();
          DB.mutate(db => {
            const ord = db.orders.find(o => o.id === order.id);
            ord.releasedAt = DB.nowIso();
            ord.releasedBy = me;
            ord.releaseNotes = notes;
            DB.log('order_release', {
              orderId: ord.id, orderCode: ord.code,
              detail: `Despacho liberado por ${me.name} (${UI.roleLabel(me.role)}). TALLY ${rec.totals.tally} = PT ${rec.totals.pt} = Calidad ${rec.totals.quality}.`
            });
          });
          UI.toast('Despacho liberado', 'success', `${order.code} · acta disponible`);
          UI.broadcastToast('✓ Despacho liberado', 'success', `${order.code} · ${order.client}`);
        });
      }
    });
  }

  function shipOrder(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    UI.confirmDialog({
      eyebrow: 'DESPACHO',
      title: `Marcar ${order.code} como despachado`,
      message: 'Confirma que el contenedor salió de planta. El acta de liberación queda como respaldo documental.',
      list: [`${UI.esc(order.container || 'Sin contenedor')} → ${UI.esc(order.destination || '—')}`, `${order._rec.totals.pallets} pallets`],
      okLabel: 'Confirmar despacho'
    }).then(ok => {
      if (!ok) return;
      const me = actor();
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === orderId);
        ord.shippedAt = DB.nowIso();
        ord.shippedBy = me;
        DB.log('order_ship', { orderId, orderCode: ord.code, detail: `Despacho marcado como enviado por ${me.name}.` });
      });
      UI.toast('Despacho confirmado', 'success', order.code);
    });
  }

  async function closeOrder(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    const ok = await UI.confirmDialog({
      eyebrow: 'CIERRE',
      title: `Cerrar despacho ${order.code}`,
      message: 'El cierre es definitivo. Cualquier modificación posterior requerirá autorización del Superadministrador y un motivo registrado.',
      list: [`${order._rec.totals.tally} paneles conciliados`, `${order._rec.totals.pallets} pallets aprobados`, order.releasedAt ? 'Despacho liberado' : '⚠ Sin liberación registrada'],
      okLabel: 'Cerrar despacho',
      danger: true
    });
    if (!ok) return;

    const me = actor();
    DB.mutate(db => {
      const ord = db.orders.find(o => o.id === orderId);
      ord.closedAt = DB.nowIso();
      ord.closedBy = me;
      DB.log('order_close', { orderId, orderCode: ord.code, detail: `Despacho cerrado por ${me.name}.` });
    });

    // Generar hash y QR de verificación del acta después de cerrar
    let actaHash = '';
    let actaQrDataUrl = '';
    try {
      const closedOrder = preparedOrder(orderId);
      actaHash = await computeActaHash(closedOrder);
      actaQrDataUrl = await generateQRCodeDataURL(actaVerificationUrl({ ...closedOrder, actaHash }));
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === orderId);
        ord.actaHash = actaHash;
        ord.actaQrDataUrl = actaQrDataUrl;
        ord.actaVerifiedAt = null;
      });
      DB.log('order_acta_hash', { orderId, orderCode: order.code, detail: `Hash de acta generado: ${actaHash.slice(0, 16)}...` });
    } catch (e) {
      console.warn('No se pudo generar el QR de verificación', e);
    }
    UI.toast('Despacho cerrado', 'success', order.code);
    UI.broadcastToast('Despacho cerrado', 'info', order.code);
  }

  async function ptFinalize(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    if (order._rec.totals.tally !== order._rec.totals.pt) {
      UI.toast('Aún no has liberado todo lo programado', 'warn', `${order._rec.totals.pt}/${order._rec.totals.tally} paneles`);
      return;
    }
    const ok = await UI.confirmDialog({
      eyebrow: 'ENTREGA PT',
      title: `Terminar y Firmar Entrega PT — ${order.code}`,
      message: `Vas a firmar el registro de ${UI.fmt(order._rec.totals.pt)} paneles en ${order.pallets.length} pallets/cajas. Se generará un PDF único con todos los espesores y quedará guardado en Drive /ENTREGA_PT.`,
      list: order._rec.rows.map(r => `${r.itemLabel} — ${r.thicknessLabel}: ${UI.fmt(r.pt)}/${UI.fmt(r.tally)}`),
      okLabel: 'Firmar y Generar PDF Único'
    });
    if (!ok) return;
    const btn = document.querySelector('[data-action="pt-finalize"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF...'; }
    try {
      if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
        const shipments = await BalsasudAPI.listShipments();
        const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
        if (!shipment) throw new Error('No se encontró el embarque en Sheets. Publica primero la orden.');
        const res = await BalsasudAPI.finalizePT(shipment.shipmentId);
        UI.toast('Entrega PT firmada', 'success', 'PDF único generado');
        UI.openModal({
          eyebrow: 'ENTREGA PT FIRMADA',
          title: `Acta PT — ${order.code}`,
          body: `<p>PDF único con todos los espesores generado y guardado en Drive.</p><p><a href="${res.pdf.driveUrl}" target="_blank" class="btn btn-primary">Abrir PDF en Drive</a></p><p class="hint">Carpeta: ${shipment.code}/ENTREGA_PT</p>`,
          footer: `<button class="btn btn-primary" data-modal-close>Cerrar</button>`
        });
        DB.mutate(db => {
          const ord = db.orders.find(o => o.id === orderId);
          ord.ptFinalizedAt = DB.nowIso();
          ord.ptFinalizedBy = actor();
        });
        renderRoute();
      } else {
        DB.mutate(db => {
          const ord = db.orders.find(o => o.id === orderId);
          ord.ptFinalizedAt = DB.nowIso();
          ord.ptFinalizedBy = actor();
        });
        UI.toast('Entrega PT finalizada (local)', 'success', 'Sin conexión a Sheets, guardado local');
        renderRoute();
      }
    } catch (e) {
      UI.toast('Error al firmar PT', 'error', e.message);
      if (btn) { btn.disabled = false; btn.textContent = '✓ Terminar y Firmar Entrega PT'; }
    }
  }

  async function qcFinalize(orderId) {
    const order = preparedOrder(orderId);
    if (!order) return;
    if (order._rec.totals.quality !== order._rec.totals.tally) {
      UI.toast('Aún no está todo aprobado por Calidad', 'warn', `${order._rec.totals.quality}/${order._rec.totals.tally} aprobados`);
      return;
    }
    const q = Engine.qualityCounts(order.pallets);
    if (q.pending + q.inspecting > 0) {
      UI.toast('Quedan pallets pendientes de inspección', 'warn');
      return;
    }
    const ok = await UI.confirmDialog({
      eyebrow: 'LIBERACIÓN FINAL',
      title: `Liberación Final — Firmar y Generar PDF Único — ${order.code}`,
      message: `Se generará un PDF único consolidado con todos los espesores (${UI.fmt(order._rec.totals.quality)} paneles), detalle por pallet y firmas de PT, Calidad y Gerencia. Quedará en Drive /CONTROL_CALIDAD y cerrará el embarque.`,
      list: order._rec.rows.map(r => `${r.itemLabel} — ${r.thicknessLabel}: ${UI.fmt(r.quality)}/${UI.fmt(r.tally)}`),
      okLabel: 'Firmar Liberación Final'
    });
    if (!ok) return;
    const btn = document.querySelector('[data-action="qc-finalize"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF...'; }
    try {
      if (window.BalsasudAPI && BalsasudAPI.isLoggedIn()) {
        const shipments = await BalsasudAPI.listShipments();
        const shipment = shipments.find(s => s.op === order.op || s.code === order.code);
        if (!shipment) throw new Error('No se encontró el embarque en Sheets');
        const res = await BalsasudAPI.finalizeQuality(shipment.shipmentId);
        UI.toast('Liberación Final firmada', 'success', 'PDF único generado - Embarque cerrado');
        UI.openModal({
          eyebrow: 'LIBERACIÓN FINAL FIRMADA',
          title: `Liberación Final — ${order.code}`,
          body: `<p>PDF único consolidado generado y guardado en Drive.</p><p><a href="${res.pdf.driveUrl}" target="_blank" class="btn btn-primary">Abrir PDF en Drive</a></p><p class="hint">Carpeta: ${shipment.code}/CONTROL_CALIDAD — Embarque ahora cerrado</p>`,
          footer: `<button class="btn btn-primary" data-modal-close>Cerrar</button>`
        });
        DB.mutate(db => {
          const ord = db.orders.find(o => o.id === orderId);
          ord.closedAt = DB.nowIso();
          ord.closedBy = actor();
        });
        renderRoute();
      } else {
        DB.mutate(db => {
          const ord = db.orders.find(o => o.id === orderId);
          ord.closedAt = DB.nowIso();
          ord.closedBy = actor();
        });
        UI.toast('Liberación Final (local)', 'success');
        renderRoute();
      }
    } catch (e) {
      UI.toast('Error en Liberación Final', 'error', e.message);
      if (btn) { btn.disabled = false; btn.textContent = '✓ Liberación Final - Firmar y Generar PDF Único'; }
    }
  }

  function reopenOrder(orderId) {
    UI.reasonDialog({
      eyebrow: 'REAPERTURA',
      title: 'Reabrir despacho cerrado',
      subtitle: 'Solo el Superadministrador puede reabrir. El motivo queda en la auditoría.',
      okLabel: 'Reabrir despacho',
      danger: true,
      placeholder: 'Motivo por el que se reabre el despacho...'
    }).then(reason => {
      if (!reason) return;
      const me = actor();
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === orderId);
        ord.closedAt = null;
        ord.closedBy = null;
        DB.log('order_reopen', { orderId, orderCode: ord.code, detail: `Despacho reabierto por ${me.name}. Motivo: ${reason}` });
      });
      UI.toast('Despacho reabierto', 'warn', 'Las modificaciones vuelven a estar habilitadas.');
    });
  }

  function deletePallet(palletId) {
    const order = state.order;
    const pallet = order && (order.pallets || []).find(p => p.id === palletId);
    if (!pallet) return;
    UI.reasonDialog({
      eyebrow: 'ELIMINAR PALLET',
      title: `Eliminar ${pallet.number}`,
      subtitle: 'La eliminación de un registro reportado queda auditada con su motivo.',
      okLabel: 'Eliminar pallet',
      danger: true,
      placeholder: 'Motivo de la eliminación...'
    }).then(async reason => {
      if (!reason) return;
      const me = actor();
      for (const ev of (pallet.evidence || [])) await DB.deleteFile(ev.key);
      DB.mutate(db => {
        const ord = db.orders.find(o => o.id === order.id);
        ord.pallets = ord.pallets.filter(p => p.id !== palletId);
        DB.log('pallet_delete', {
          orderId: ord.id, orderCode: ord.code, entity: 'pallet', entityId: palletId,
          detail: `Pallet ${pallet.number} eliminado por ${me.name}. Motivo: ${reason}`
        });
      });
      UI.toast('Pallet eliminado', 'warn', pallet.number);
    });
  }

  /* ============================================================
     DEMOSTRACIÓN
     ============================================================ */

  function isoDaysAgo(days, hour) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour === undefined ? 10 : hour, 15, 0, 0);
    return d.toISOString();
  }
  function dateInDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function makeDemoOrder(cfg, people) {
    const pallets = [];
    let seq = 0;
    const items = cfg.items.map(([itemId, description, thickness, programmed]) => ({
      itemId, description, thickness, programmed, pallets: 0, bf: 0, m3: 0, weight: 0
    }));

    items.forEach(item => {
      let remaining = item.programmed - (cfg.short && cfg.short.itemId === item.itemId ? cfg.short.by : 0);
      const chunks = [];
      while (remaining > 0) {
        const take = Math.min(200, remaining);
        chunks.push(take);
        remaining -= take;
      }
      item.pallets = chunks.length;
      chunks.forEach(panels => {
        seq += 1;
        const pallet = {
          id: DB.uid('pal'),
          number: `P-${String(seq).padStart(3, '0')}`,
          itemId: item.itemId,
          description: item.description,
          thickness: item.thickness,
          panels,
          packaging: 'palet',
          palletType: seq % 7 === 0 ? 'doble' : 'simple',
          netWeight: Math.round(panels * 1.8),
          grossWeight: Math.round(panels * 1.8 + 22),
          bf: Math.round(panels * 1.42),
          m3: Math.round(panels * 0.00207 * 100) / 100,
          observations: '',
          evidence: [],
          createdBy: people.pt,
          createdByName: people.pt.name,
          createdAt: cfg.submittedAt || cfg.publishedAt,
          updatedAt: cfg.submittedAt || cfg.publishedAt,
          quality: { status: 'pendiente' },
          history: [{ ts: cfg.submittedAt || cfg.publishedAt, userName: people.pt.name, role: 'pt', action: 'pallet_create', detail: 'Pallet registrado por Producto Terminado.' }]
        };
        const approved = cfg.quality === 'all' || (cfg.quality === 'most' && !(cfg.notApproved || []).includes(seq));
        if (approved) {
          pallet.quality = {
            status: 'aprobado', verifiedItemId: item.itemId, verifiedThickness: item.thickness, verifiedPanels: panels,
            checklist: { dimensiones: true, cantidad: true, empaque: true, evidencia: true },
            observations: '', byId: people.ca.id, byName: people.ca.name, at: cfg.inspectedAt
          };
          pallet.history.push({ ts: cfg.inspectedAt, userName: people.ca.name, role: 'calidad', action: 'quality_approve', detail: `Aprobado: ${panels} paneles · ${Engine.thicknessLabel(item.thickness)}.` });
        }
        if ((cfg.rejected || []).includes(seq)) {
          pallet.quality = {
            status: 'rechazado', verifiedItemId: item.itemId, verifiedThickness: item.thickness, verifiedPanels: panels,
            observations: 'Empaque deteriorado y diferencia de espesor detectada en la inspección física.',
            byId: people.ca.id, byName: people.ca.name, at: cfg.inspectedAt
          };
        }
        if ((cfg.correction || []).includes(seq)) {
          pallet.quality = {
            status: 'requiere_correccion', verifiedItemId: item.itemId, verifiedThickness: item.thickness, verifiedPanels: panels,
            observations: 'La etiqueta no coincide con el ITEM ID reportado. Corregir y reenviar.',
            byId: people.ca.id, byName: people.ca.name, at: cfg.inspectedAt
          };
        }
        pallets.push(pallet);
      });
    });

    const order = {
      id: DB.uid('ord'),
      code: cfg.code,
      op: cfg.op,
      purchaseOrder: cfg.oc,
      client: cfg.client,
      container: cfg.container,
      destination: cfg.destination,
      dispatchDate: cfg.dispatchDate || dateInDays(3),
      lot: cfg.lot || '',
      notes: cfg.notes || '',
      items,
      tally: {
        fileName: `TALLY_${cfg.code}.pdf`, fileType: 'application/pdf', fileSize: 0,
        storageKey: '', source: 'PDF (demostración)', extractedAt: cfg.createdAt, text: ''
      },
      pallets,
      createdAt: cfg.createdAt,
      createdBy: people.sa,
      publishedAt: cfg.publishedAt || null,
      publishedBy: cfg.publishedAt ? people.sa : null,
      submittedAt: cfg.submittedAt || null,
      submittedBy: cfg.submittedAt ? people.pt : null,
      releasedAt: cfg.releasedAt || null,
      releasedBy: cfg.releasedAt ? people.sa : null,
      releaseNotes: cfg.releaseNotes || '',
      shippedAt: null,
      closedAt: null
    };
    return order;
  }

  function seedDemo() {
    const users = DB.listUsers();
    const pick = role => users.find(u => u.role === role) || { id: 'demo', name: UI.roleLabel(role) };
    const sa = pick('superadmin');
    const pt = pick('pt');
    const ca = pick('calidad');
    const people = {
      sa: { id: sa.id, name: sa.name, role: 'superadmin' },
      pt: { id: pt.id, name: pt.name, role: 'pt' },
      ca: { id: ca.id, name: ca.name, role: 'calidad' }
    };

    const configs = [
      {
        code: 'OD-2026-0001', op: '26SZ7132', oc: '4400036519', client: 'BACHMANN',
        container: 'TCLU1234567', destination: 'Miami, USA', lot: '26199-26198',
        dispatchDate: dateInDays(2),
        items: [
          ['6230011251', 'BALSA CORE SG 1.25" (10 mm)', 10, 534],
          ['6230011252', 'BALSA CORE SG 19 mm', 19, 1689],
          ['6230011253', 'BALSA CORE SG 25 mm', 25, 574],
          ['6230011254', 'BALSA CORE SG 38 mm', 38, 1040],
          ['6230011255', 'BALSA CORE SG 44 mm', 44, 344]
        ],
        quality: 'all',
        createdAt: isoDaysAgo(6), publishedAt: isoDaysAgo(5),
        submittedAt: isoDaysAgo(3), inspectedAt: isoDaysAgo(2),
        releasedAt: isoDaysAgo(1),
        releaseNotes: 'Despacho verificado en planta: cantidades y espesores coinciden en las tres áreas.'
      },
      {
        code: 'OD-2026-0002', op: '26SZ7401', oc: '4400037108', client: 'KLAUSNER',
        container: 'BMOU8842190', destination: 'Guayaquil, EC', lot: '26210-26211',
        dispatchDate: dateInDays(4),
        items: [
          ['6230011261', 'BALSA CORE SG 19 mm PREMIUM', 19, 800],
          ['6230011262', 'BALSA CORE SG 38 mm PREMIUM', 38, 600]
        ],
        quality: 'all',
        createdAt: isoDaysAgo(4), publishedAt: isoDaysAgo(3),
        submittedAt: isoDaysAgo(1), inspectedAt: isoDaysAgo(0, 8)
      },
      {
        code: 'OD-2026-0003', op: '26SZ7455', oc: '4400037220', client: 'MOLINOS DEL VALLE',
        container: 'CSNU7712345', destination: 'Callao, PE', lot: '26220-26222',
        dispatchDate: dateInDays(5),
        items: [
          ['6230011271', 'BALSA CORE SG 19 mm', 19, 1200],
          ['6230011272', 'BALSA CORE SG 25 mm', 25, 400]
        ],
        quality: 'most', notApproved: [4, 6, 8], rejected: [4], correction: [8],
        short: { itemId: '6230011271', by: 20 },
        createdAt: isoDaysAgo(3), publishedAt: isoDaysAgo(2),
        submittedAt: isoDaysAgo(1), inspectedAt: isoDaysAgo(0, 9)
      },
      {
        code: 'OD-2026-0004', op: '26SZ7500', oc: '4400037888', client: 'PLYWOOD TRADING',
        container: '', destination: 'Houston, USA', lot: '26230',
        dispatchDate: dateInDays(9),
        items: [
          ['6230011281', 'BALSA CORE SG 10 mm', 10, 300],
          ['6230011282', 'BALSA CORE SG 44 mm', 44, 150]
        ],
        quality: 'none', createdAt: isoDaysAgo(0, 8), publishedAt: null, submittedAt: null
      }
    ];

    DB.mutate(db => {
      configs.forEach(cfg => {
        if (db.orders.some(o => o.code === cfg.code)) return;
        const order = makeDemoOrder(cfg, people);
        db.orders.push(order);
        DB.log('demo_seed', { orderId: order.id, orderCode: order.code, detail: `Orden de demostración ${order.code} creada (${order._status || cfg.code}).` });
      });
      DB.log('demo_seed', { detail: 'Datos de demostración cargados en el sistema.' });
    });

    preparedOrders();
    UI.toast('Datos de demostración cargados', 'success', '4 órdenes con distintos estados del flujo');
    setTimeout(() => go('panel'), 80);
  }

  function exportBackup() {
    const data = DB.exportDB();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    UI.downloadBlob(blob, `BALSASUD_respaldo_${new Date().toISOString().slice(0, 10)}.json`);
    DB.mutate(() => { DB.log('backup', { detail: 'Respaldo completo descargado.' }); });
    UI.toast('Respaldo descargado', 'success', `${data.orders.length} órdenes`);
  }

  /* ============================================================
     MANEJADORES DE EVENTOS
     ============================================================ */

  function handleViewChange(event) {
    const el = event.target.closest('[data-action]');
    if (!el || !view.contains(el)) return;
    const action = el.getAttribute('data-action');
    if (action === 'jefe-check') {
      const sid = el.getAttribute('data-shipment');
      const rid = el.getAttribute('data-release');
      if (!el.checked) return; // solo autoriza al marcar
      el.disabled = true;
      BalsasudAPI.jefeAutorizar({ shipmentId: sid, releaseId: rid }).then(() => {
        UI.toast('Pallet autorizado', 'success');
        openJefeControl(sid);
      }).catch(e => {
        UI.toast(e.message, 'error');
        el.disabled = false;
        el.checked = false;
      });
    }
  }

  async function handleViewClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el || !view.contains(el)) return;
    const action = el.getAttribute('data-action');
    const id = el.getAttribute('data-id');
    const order = state.order;

    switch (action) {
      case 'new-order': go('nueva'); break;
      case 'refresh': renderRoute(); UI.toast('Vista actualizada', 'info'); break;
      case 'reload': location.reload(); break;
      case 'open-order': {
        const tab = el.getAttribute('data-tab');
        if (tab) state.nextOrderTab = tab;
        go('orden/' + id);
        break;
      }
      case 'order-tab':
        state.orderTab = el.getAttribute('data-tab');
        renderOrderDetail(state.route.id);
        break;
      case 'save-draft': saveOrder(false); break;
      case 'publish-order': saveOrder(true); break;
      case 'publish-draft': publishDraft(id); break;
      case 'add-item':
        syncDraftFromForm();
        state.draft.items.push({ itemId: '', description: '', thickness: '', programmed: '', pallets: '', boxes: '', bf: '', m3: '' });
        renderNewOrder(state.draft.id);
        break;
      case 'remove-item':
        syncDraftFromForm();
        state.draft.items.splice(Number(el.getAttribute('data-idx')), 1);
        renderNewOrder(state.draft.id);
        break;
      case 'parse-pasted': {
        syncDraftFromForm();
        const text = (document.getElementById('tallyPaste') || {}).value || '';
        const parsed = Tally.parseText(text);
        state.extractedText = Tally.cleanText(text);
        state.extractedWarnings = parsed.warnings || [];
        applyTallyHeader(parsed.header);
        if (parsed.items.length) {
          state.draft.items = parsed.items.map(it => ({
            itemId: it.itemId, description: it.description, thickness: it.thickness,
            programmed: it.programmed, pallets: it.pallets || 0, boxes: it.boxes || 0,
            bf: it.bf || 0, m3: it.m3 || 0
          }));
          state.draft.tally = Object.assign({}, state.draft.tally, {
            source: parsed.format || 'texto',
            packageRows: parsed.packageRows || []
          });
          UI.toast(`${parsed.items.length} producto(s) reconocido(s)`, 'success', 'Verifica las cantidades.');
        } else {
          UI.toast('No se reconocieron filas', 'warn', 'Agrega los productos manualmente en la tabla.');
        }
        renderNewOrder(state.draft.id);
        break;
      }
      case 'clear-tally':
        syncDraftFromForm();
        state.extractedText = '';
        state.extractedWarnings = [];
        state.draft.items = [];
        state.pendingTallyFile = null;
        state.draft.tally = emptyDraft().tally;
        renderNewOrder(state.draft.id);
        break;
      case 'send-quality': sendToQuality(id); break;
      case 'release': {
        const fresh = preparedOrder(id);
        if (fresh) openReleaseModal(fresh);
        break;
      }
      case 'ship': shipOrder(id); break;
      case 'close-order': await closeOrder(id); break;
      case 'reopen': reopenOrder(id); break;
      case 'pallet-new':
        state.orderTab = 'pallets';
        state.palletForm = { mode: 'new', values: {}, removedEvidence: [] };
        state.pendingPhotos = [];
        state.photoPreviewUrls = [];
        renderOrderDetail(state.route.id);
        break;
      case 'pallet-edit':
        state.orderTab = 'pallets';
        state.palletForm = { mode: 'edit', palletId: id, removedEvidence: [] };
        state.pendingPhotos = [];
        state.photoPreviewUrls = [];
        renderOrderDetail(state.route.id);
        break;
      case 'pallet-cancel':
        state.palletForm = null;
        state.pendingPhotos.forEach((_, i) => { if (state.photoPreviewUrls[i]) URL.revokeObjectURL(state.photoPreviewUrls[i]); });
        state.pendingPhotos = [];
        state.photoPreviewUrls = [];
        renderOrderDetail(state.route.id);
        break;
      case 'pallet-delete': deletePallet(id); break;
      case 'pt-finalize': ptFinalize(id); break;
      case 'qc-finalize': qcFinalize(id); break;
      case 'remove-pending-photo': {
        const idx = Number(el.getAttribute('data-idx'));
        if (state.photoPreviewUrls[idx]) URL.revokeObjectURL(state.photoPreviewUrls[idx]);
        state.pendingPhotos.splice(idx, 1);
        state.photoPreviewUrls.splice(idx, 1);
        paintPendingPhotos();
        break;
      }
      case 'remove-evidence': {
        const key = el.getAttribute('data-key');
        if (state.palletForm) {
          state.palletForm.removedEvidence = state.palletForm.removedEvidence || [];
          if (!state.palletForm.removedEvidence.includes(key)) state.palletForm.removedEvidence.push(key);
        }
        const chip = el.closest('.photo-thumb');
        if (chip) chip.remove();
        break;
      }
      case 'inspect': openInspection(id); break;
      case 'quality-revert': revertInspection(id); break;
      case 'quality-filter':
        state.qualityFilter = el.getAttribute('data-filter');
        renderOrderDetail(state.route.id);
        break;
      case 'view-pallet-photos': openPalletPhotos(id); break;
      case 'open-photo':
        UI.openLightbox(el.getAttribute('data-photo-key'), el.getAttribute('data-caption'));
        break;
      case 'view-tally': openTallyFile(id, false); break;
      case 'download-tally': openTallyFile(id, true); break;
      case 'print-acta': {
        const target = id ? preparedOrder(id) : order;
        if (target) UI.printHtml(buildActaHTML(target), `ACTA_${target.code}`);
        break;
      }
      case 'print-report': {
        const type = el.getAttribute('data-report');
        if (type === 'acta') {
          const target = reportOrderFrom(el);
          if (target) UI.printHtml(buildActaHTML(target), `ACTA_${target.code}`);
          break;
        }
        const target = reportOrderFrom(el);
        if (!target) { UI.toast('Selecciona una orden', 'warn'); break; }
        const html = buildReportHTML(type, target);
        if (html) UI.printHtml(html, `${type.toUpperCase()}_${target.code}`);
        break;
      }
      case 'export-csv': {
        const type = el.getAttribute('data-report');
        if (['orders-global', 'pallets-global', 'conciliation-global'].includes(type)) exportReport(type, null);
        else {
          const target = reportOrderFrom(el);
          if (!target) { UI.toast('Selecciona una orden', 'warn'); break; }
          exportReport(type, target);
        }
        break;
      }
      case 'export-backup': exportBackup(); break;
      case 'seed-demo':
        UI.confirmDialog({
          eyebrow: 'DEMOSTRACIÓN',
          title: 'Cargar datos de demostración',
          message: 'Se agregarán cuatro órdenes con distintos estados del flujo: liberada, conciliada, en corrección y borrador.',
          okLabel: 'Cargar demostración'
        }).then(ok => { if (ok) seedDemo(); });
        break;
      case 'reset-data':
        UI.confirmDialog({
          eyebrow: 'ZONA DE RIESGO',
          title: 'Reiniciar la base local',
          message: 'Se eliminarán todas las órdenes, pallets, inspecciones y auditoría de este navegador. Los usuarios se restauran a los valores iniciales.',
          okLabel: 'Eliminar todo y reiniciar',
          danger: true
        }).then(ok => {
          if (!ok) return;
          DB.resetDB();
          UI.toast('Base local reiniciada', 'warn', 'Recargando…');
          setTimeout(() => location.reload(), 600);
        });
        break;
      case 'user-new':
        state.editingUserId = null;
        openUserModal(null);
        break;
      case 'user-edit':
        state.editingUserId = id;
        openUserModal(id);
        break;
      case 'user-password': resetUserPassword(id); break;
      case 'user-toggle': {
        const user = DB.userById(id);
        if (!user) break;
        const me = DB.currentUser();
        if (me && me.userId === user.id) { UI.toast('No puedes desactivar tu propia cuenta', 'error'); break; }
        UI.confirmDialog({
          eyebrow: 'USUARIOS',
          title: `${user.active ? 'Desactivar' : 'Activar'} a ${user.name}`,
          message: user.active ? 'El usuario no podrá iniciar sesión hasta ser reactivado.' : 'El usuario podrá iniciar sesión nuevamente.',
          okLabel: user.active ? 'Desactivar' : 'Activar',
          danger: user.active
        }).then(ok => {
          if (!ok) return;
          DB.mutate(db => {
            const u = db.users.find(x => x.id === id);
            u.active = !u.active;
            DB.log('user_update', { detail: `Usuario @${u.username} ${u.active ? 'activado' : 'desactivado'}.` });
          });
          UI.toast(user.active ? 'Usuario desactivado' : 'Usuario activado', 'success', user.name);
        });
        break;
      }
      case 'go-users': go('usuarios'); break;
      case 'jefe-reload': renderJefeEmbarque(); break;
      case 'jefe-open': openJefeControl(id || el.getAttribute('data-shipment')); break;
      case 'jefe-view-tally': {
        const sid = el.getAttribute('data-shipment');
        const tabs = document.querySelectorAll('#sidebarNav a'); // noop
        // abrir TALLY en Drive si está disponible
        BalsasudAPI.getShipment(sid).then(s=> {
          if (s.documents && s.documents.length) {
            const tally = s.documents.find(d=> d.type==='tally');
            if (tally) window.open(tally.driveUrl, '_blank');
            else UI.toast('Sin TALLY adjunto', 'warn');
          } else UI.toast('Sin TALLY adjunto', 'warn');
        }).catch(e=> UI.toast(e.message,'error'));
        break;
      }
      case 'jefe-autorizar': {
        const sid = el.getAttribute('data-shipment'); const rid = el.getAttribute('data-release');
        el.disabled = true; el.textContent = 'Autorizando…';
        BalsasudAPI.jefeAutorizar({ shipmentId: sid, releaseId: rid }).then(()=> {
          UI.toast('Pallet autorizado', 'success');
          openJefeControl(sid);
        }).catch(e=> { UI.toast(e.message,'error'); el.disabled=false; el.textContent='✓ Visto bueno'; });
        break;
      }
      case 'jefe-autorizar-all': {
        const sid = el.getAttribute('data-shipment');
        el.disabled = true; el.textContent = 'Autorizando…';
        (async () => {
          const full = await BalsasudAPI.getShipment(sid);
          const releases = await BalsasudAPI.listReleases(sid);
          const inspections = await BalsasudAPI.listInspections({ shipmentId: sid });
          const list = await BalsasudAPI.jefeList();
          const jefeInfo = list.find(x => x.shipment.shipmentId === sid);
          const autIds = new Set((jefeInfo && jefeInfo.autorizaciones ? jefeInfo.autorizaciones : []).map(a => a.releaseId));
          const inspByRelease = new Map((inspections || []).map(i => [i.releaseId, i]));
          const pendientes = (releases || []).filter(r => {
            if (autIds.has(r.releaseId)) return false;
            const insp = inspByRelease.get(r.releaseId);
            return insp && insp.status === 'finalizada' && Number(insp.approvedPanels) === Number(r.releasedPanels);
          });
          if (!pendientes.length) { UI.toast('No hay pallets pendientes por autorizar', 'info'); return; }
          let ok = 0, err = 0;
          for (const r of pendientes) {
            try {
              await BalsasudAPI.jefeAutorizar({ shipmentId: sid, releaseId: r.releaseId });
              ok++;
            } catch (e) { err++; }
            await new Promise(res => setTimeout(res, 80));
          }
          UI.toast(`${ok} pallets autorizados${err ? `, ${err} errores` : ''}`, err ? 'warn' : 'success');
          openJefeControl(sid);
        })().catch(e => { UI.toast(e.message, 'error'); el.disabled = false; el.textContent = '✓ Marcar todos OK'; });
        break;
      }
      case 'jefe-embarcar': {
        const sid = el.getAttribute('data-shipment'); const rid = el.getAttribute('data-release');
        el.disabled = true;
        BalsasudAPI.jefeEmbarcar({ shipmentId: sid, releaseId: rid }).then(()=> {
          UI.toast('Marcado como embarcado', 'success');
          openJefeControl(sid);
        }).catch(e=> { UI.toast(e.message,'error'); el.disabled=false; });
        break;
      }
      case 'jefe-fila': {
        const sid = el.getAttribute('data-shipment'); const fila = el.getAttribute('data-fila');
        const sel = document.getElementById(`fila-${fila}-select`);
        const fileInput = document.getElementById(`fila-${fila}-foto`);
        const releaseIds = Array.from(sel.selectedOptions).map(o=> o.value);
        if (!releaseIds.length) { UI.toast('Selecciona al menos un pallet para la fila','warn'); break; }
        const max = Number(sel.getAttribute('data-max') || (fila==='10' ? 12 : 4));
        if (releaseIds.length > max) { UI.toast(`La fila ${fila} admite máximo ${max} ${fila==='10'?'cajas':'pallets'}`,'warn'); break; }
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        el.disabled = true; el.textContent = 'Guardando…';
        BalsasudAPI.jefeFila({ shipmentId: sid, fila, releaseIds, contenedor: '', observaciones: '', file }).then(()=> {
          UI.toast(`Fila ${fila} guardada${file?' con foto':''}`, 'success');
          openJefeControl(sid);
        }).catch(e=> { UI.toast(e.message,'error'); el.disabled=false; el.textContent=`Guardar Fila ${fila}`; });
        break;
      }
      case 'jefe-distribuir': {
        const sid = el.getAttribute('data-shipment');
        el.disabled = true; el.textContent = 'Distribuyendo…';
        (async () => {
          const full = await BalsasudAPI.getShipment(sid);
          const releases = await BalsasudAPI.listReleases(sid);
          const inspections = await BalsasudAPI.listInspections({ shipmentId: sid });
          const list = await BalsasudAPI.jefeList();
          const jefeInfo = list.find(x => x.shipment.shipmentId === sid);
          const autIds = new Set((jefeInfo && jefeInfo.autorizaciones ? jefeInfo.autorizaciones : []).filter(a=>a.estado==='autorizado').map(a => a.releaseId));
          const embarcados = new Set();
          (jefeInfo && jefeInfo.fisicos ? jefeInfo.fisicos : []).forEach(f=> { try { JSON.parse(f.releaseIds||'[]').forEach(id=> embarcados.add(id)); } catch(e){} });
          const inspByRelease = new Map((inspections || []).map(i => [i.releaseId, i]));
          const disponibles = (releases || []).filter(r => {
            if (!autIds.has(r.releaseId) || embarcados.has(r.releaseId)) return false;
            const insp = inspByRelease.get(r.releaseId);
            return insp && insp.status === 'finalizada' && Number(insp.approvedPanels) === Number(r.releasedPanels);
          });
          const pallets = disponibles.filter(r => (r.packaging||'pallet') !== 'caja');
          const cajas = disponibles.filter(r => (r.packaging||'pallet') === 'caja');
          let ok = 0, err = 0;
          // Filas 1-9: 4 pallets cada una
          for (let f=1; f<=9; f++) {
            const ids = pallets.splice(0, 4).map(r=>r.releaseId);
            if (!ids.length) continue;
            try { await BalsasudAPI.jefeFila({ shipmentId: sid, fila: String(f), releaseIds: ids, contenedor: '', observaciones: 'Distribución automática' }); ok++; }
            catch (e) { err++; }
            await new Promise(res => setTimeout(res, 80));
          }
          // Fila 10: cajas en puerta (hasta 12)
          const ids10 = cajas.splice(0, 12).map(r=>r.releaseId);
          if (ids10.length) {
            try { await BalsasudAPI.jefeFila({ shipmentId: sid, fila: '10', releaseIds: ids10, contenedor: '', observaciones: 'Distribución automática cajas en puerta' }); ok++; }
            catch (e) { err++; }
          }
          if (pallets.length || cajas.length) {
            UI.toast(`Distribución parcial: sobran ${pallets.length} pallets y ${cajas.length} cajas sin fila`, 'warn');
          } else {
            UI.toast(`${ok} filas guardadas${err ? `, ${err} errores` : ''}`, err ? 'warn' : 'success');
          }
          openJefeControl(sid);
        })().catch(e => { UI.toast(e.message, 'error'); el.disabled = false; el.textContent = '⇄ Distribuir automáticamente'; });
        break;
      }
      case 'jefe-acta': {
        const sid = el.getAttribute('data-shipment');
        el.disabled = true; el.textContent = 'Generando acta…';
        BalsasudAPI.jefeActaFinal(sid).then(res=> {
          UI.toast('Acta final generada', 'success');
          UI.openModal({ eyebrow:'ACTA FINAL', title: 'Acta de Embarque — ' + (res.shipment.code||''), body:`<p>PDF generado con 3 firmas.</p><p><a href="${res.pdf.driveUrl}" target="_blank" class="btn btn-primary">Abrir PDF en Drive</a></p><p class="hint">Carpeta: ACTAS_EMBARQUE</p>`, footer:'<button class="btn btn-primary" data-modal-close>Cerrar</button>'});
          el.disabled=false; el.textContent='Generar ACTA FINAL DE EMBARQUE (3 firmas + QR)';
        }).catch(e=> { UI.toast(e.message,'error'); el.disabled=false; el.textContent='Generar ACTA FINAL DE EMBARQUE (3 firmas + QR)'; });
        break;
      }
      default: break;
    }
  }

  function handleSubmit(event) {
    const form = event.target;
    if (form.id === 'palletForm') {
      event.preventDefault();
      submitPallet(form);
    } else if (form.id === 'settingsForm') {
      event.preventDefault();
      saveSettings();
    } else if (form.id === 'userForm') {
      event.preventDefault();
      saveUserForm();
    }
  }

  function saveSettings() {
    const company = document.getElementById('setCompany').value.trim();
    const plant = document.getElementById('setPlant').value.trim();
    const requirePhotos = document.getElementById('setPhotos').checked;
    DB.mutate(db => {
      Object.assign(db.settings, { company, plant, requirePhotos });
      DB.log('settings_update', { detail: 'Configuración de operación actualizada.' });
    });
    UI.toast('Configuración guardada', 'success');
  }

  function applyFilter(el) {
    const key = el.getAttribute('data-filter');
    if (!key) return;
    state.filters[key] = el.value;
    const id = el.id;
    const pos = el.selectionStart;
    renderRoute();
    if (el.tagName === 'INPUT') {
      const next = document.getElementById(id);
      if (next) {
        next.focus();
        if (pos !== null && pos !== undefined) {
          try { next.setSelectionRange(pos, pos); } catch (e) { /* noop */ }
        }
      }
    }
  }

  function updateDraftTotals() {
    if (!state.draft) return;
    const panels = state.draft.items.reduce((t, i) => t + (Number(i.programmed) || 0), 0);
    const pallets = state.draft.items.reduce((t, i) => t + (Number(i.pallets) || 0), 0);
    const boxes = state.draft.items.reduce((t, i) => t + (Number(i.boxes) || 0), 0);
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('draftTotalPanels', UI.fmt(panels));
    set('draftTotalPallets', UI.fmt(pallets));
    set('draftTotalBoxes', UI.fmt(boxes));
    set('reviewItems', String(state.draft.items.length));
    set('reviewPanels', UI.fmt(panels));
    set('reviewPallets', UI.fmt(pallets));
    set('reviewBoxes', UI.fmt(boxes));
  }

  function handleInput(event) {
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;

    if (el.hasAttribute('data-item') && state.draft) {
      const idx = Number(el.getAttribute('data-item'));
      const field = el.getAttribute('data-field');
      if (state.draft.items[idx]) {
        state.draft.items[idx][field] = el.value;
        updateDraftTotals();
      }
      return;
    }

    if (el.hasAttribute('data-field') && state.draft && el.closest('#orderForm')) {
      state.draft[el.getAttribute('data-field')] = el.value;
      return;
    }

    if (el.id === 'pfPanels' || el.id === 'pfThickness') {
      updatePalletRemaining();
      return;
    }

    if (el.hasAttribute('data-filter')) applyFilter(el);
  }

  function handleChange(event) {
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;

    if (el.id === 'tallyFile' && el.files && el.files[0]) {
      handleTallyFile(el.files[0]);
      return;
    }

    if (el.id === 'pfItem') {
      const [itemId, thickness] = (el.value || '').split('|');
      const thk = document.getElementById('pfThickness');
      if (thk && thickness) thk.value = thickness;
      updatePalletRemaining();
      return;
    }

    if (el.id === 'pfPhotos' && el.files) {
      state.pendingPhotos.forEach((_, i) => { if (state.photoPreviewUrls[i]) URL.revokeObjectURL(state.photoPreviewUrls[i]); });
      state.pendingPhotos = Array.from(el.files);
      state.photoPreviewUrls = state.pendingPhotos.map(f => URL.createObjectURL(f));
      paintPendingPhotos();
      return;
    }

    if (el.id === 'reportOrderSelect') {
      state.reportOrderId = el.value;
      renderReports();
      return;
    }

    if (el.id === 'importFile' && el.files && el.files[0]) {
      const file = el.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          UI.confirmDialog({
            eyebrow: 'RESTAURAR RESPALDO',
            title: 'Reemplazar los datos actuales',
            message: `El respaldo contiene ${data.orders ? data.orders.length : 0} orden(es). Se reemplazará toda la base local de este navegador.`,
            okLabel: 'Restaurar respaldo',
            danger: true
          }).then(ok => {
            if (!ok) return;
            DB.importDB(data);
            UI.toast('Respaldo restaurado', 'success', 'Recargando…');
            setTimeout(() => location.reload(), 700);
          });
        } catch (err) {
          UI.toast('Archivo inválido', 'error', 'No es un respaldo JSON de BALSASUD.');
        }
      };
      reader.readAsText(file);
      return;
    }

    if (el.hasAttribute('data-filter')) {
      applyFilter(el);
      return;
    }

    if (el.id === 'pfPackaging') {
      // el tipo de pallet solo aplica a pallets
      const type = document.getElementById('pfType');
      if (type) type.disabled = el.value !== 'palet';
      return;
    }
  }

  /* ---------------- inicio ---------------- */

  boot();
  // En desarrollo local desactivamos el Service Worker para evitar cachés persistentes.
  // Para producción/PWA descomenta la siguiente línea o condiciónala por hostname.
  if (!/127\.0\.0\.1|localhost/.test(location.hostname)) registerServiceWorker();
})();
