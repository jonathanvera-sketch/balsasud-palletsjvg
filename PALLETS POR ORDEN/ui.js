/* ============================================================
   BALSASUD · COMPONENTES DE INTERFAZ
   Utilidades de formato, modales, notificaciones, gráficos SVG,
   exportaciones y evidencias fotográficas.
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- formato ---------------- */

  const nf = new Intl.NumberFormat('es-EC');
  const nf1 = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(value) {
    const n = Number(value);
    return isNaN(n) ? '0' : nf.format(Math.round(n));
  }

  function fmtDec(value, digits) {
    const n = Number(value);
    if (isNaN(n)) return '0';
    return digits === 1 ? nf1.format(n) : nf.format(n);
  }

  function pct(value) {
    const n = Number(value);
    if (isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  function fmtDateLong(value) {
    if (!value) return '—';
    const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  function relTime(value) {
    if (!value) return '—';
    const diff = Date.now() - new Date(value).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 30) return `hace ${d} d`;
    return fmtDate(value);
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function roleLabel(role) {
    return { superadmin: 'Superadministrador', pt: 'Producto Terminado', calidad: 'Calidad' }[role] || role;
  }

  function roleShort(role) {
    return { superadmin: 'SA', pt: 'PT', calidad: 'CA' }[role] || '—';
  }

  /* ---------------- piezas visuales ---------------- */

  function statusBadge(status, extraClass) {
    const meta = window.Engine ? window.Engine.statusMeta(status) : { label: status, tone: 'gray', icon: '•' };
    return `<span class="badge badge-${meta.tone} ${extraClass || ''}"><i>${meta.icon}</i>${esc(meta.label)}</span>`;
  }

  function toneBadge(tone, label) {
    return `<span class="badge badge-${tone}">${esc(label)}</span>`;
  }

  function bar(value, tone) {
    const v = pct(value);
    return `<span class="mini-track"><i class="tone-${tone || 'blue'}" style="width:${v}%"></i></span>`;
  }

  function progressLine(value, tone, label) {
    const v = pct(value);
    return `<div class="progress-line">
      ${label ? `<div class="progress-line-head"><span>${esc(label)}</span><b>${v}%</b></div>` : ''}
      <span class="mini-track lg"><i class="tone-${tone || 'blue'}" style="width:${v}%"></i></span>
    </div>`;
  }

  function emptyState(icon, title, text, actionHtml) {
    return `<div class="empty-state"><div class="empty-icon">${icon || '◌'}</div>
      <h3>${esc(title)}</h3><p>${esc(text || '')}</p>${actionHtml || ''}</div>`;
  }

  function pageHead(opts) {
    return `<div class="page-head">
      <div class="page-head-copy">
        <p class="eyebrow">${esc(opts.eyebrow || '')}</p>
        <h1>${opts.title || ''}</h1>
        ${opts.desc ? `<p class="page-desc">${opts.desc}</p>` : ''}
      </div>
      <div class="page-actions">${opts.actions || ''}</div>
    </div>`;
  }

  function kpiCard(opts) {
    return `<article class="kpi-card tone-${opts.tone || 'blue'}">
      <div class="kpi-top"><span>${esc(opts.label)}</span><span class="kpi-icon">${opts.icon || '•'}</span></div>
      <strong>${opts.value}</strong>
      ${opts.sub ? `<div class="kpi-sub">${opts.sub}</div>` : ''}
    </article>`;
  }

  /* ---------------- toasts ---------------- */

  function toast(message, type, detail) {
    const stack = $('#toastStack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast toast-${type || 'info'}`;
    node.innerHTML = `<span class="toast-dot"></span><div><b>${esc(message)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</div><button type="button" aria-label="Cerrar">✕</button>`;
    node.querySelector('button').addEventListener('click', () => node.remove());
    stack.appendChild(node);
    setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 300); }, 4600);
  }

  function broadcastToast(message, type, detail) {
    if (window.DB) window.DB.broadcast({ type: 'toast', detail: { message, type, detail } });
  }

  /* ---------------- modales ---------------- */

  let activeModal = null;

  function openModal(opts) {
    const root = $('#modalRoot');
    if (!root) return;
    activeModal = opts;
    root.hidden = false;
    root.innerHTML = `<div class="modal-backdrop" data-close="1"></div>
      <div class="modal modal-${opts.size || 'md'}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Diálogo')}">
        <header class="modal-head">
          <div><p class="eyebrow">${esc(opts.eyebrow || '')}</p><h2>${esc(opts.title || '')}</h2>
          ${opts.subtitle ? `<p class="modal-sub">${esc(opts.subtitle)}</p>` : ''}</div>
          <button type="button" class="icon-btn" data-modal-close aria-label="Cerrar">✕</button>
        </header>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer ? `<footer class="modal-foot">${opts.footer}</footer>` : ''}
      </div>`;
    document.body.classList.add('modal-open');
    root.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));
    const backdrop = root.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => { if (!opts.locked) closeModal(); });
    if (typeof opts.onMount === 'function') opts.onMount(root.querySelector('.modal'));
    const focusable = root.querySelector('input, select, textarea, button.btn-primary');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }

  function closeModal() {
    const root = $('#modalRoot');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    activeModal = null;
    document.body.classList.remove('modal-open');
  }

  function confirmDialog(opts) {
    const o = opts || {};
    return new Promise(resolve => {
      openModal({
        eyebrow: o.eyebrow || 'CONFIRMACIÓN',
        title: o.title || '¿Confirmar acción?',
        subtitle: o.subtitle || '',
        size: 'sm',
        body: `<p class="modal-text">${o.message || ''}</p>${o.list ? `<ul class="modal-list">${o.list.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}`,
        footer: `<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(o.okLabel || 'Confirmar')}</button>`,
        onMount(modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(false); });
          modal.querySelector('[data-ok]').addEventListener('click', () => { closeModal(); resolve(true); });
        }
      });
      const root = $('#modalRoot');
      const obs = new MutationObserver(() => {
        if (root.hidden) { obs.disconnect(); resolve(false); }
      });
      obs.observe(root, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  function reasonDialog(opts) {
    const o = opts || {};
    return new Promise(resolve => {
      openModal({
        eyebrow: o.eyebrow || 'JUSTIFICACIÓN',
        title: o.title || 'Motivo de la acción',
        subtitle: o.subtitle || 'El motivo es obligatorio y quedará registrado en la auditoría.',
        size: 'sm',
        body: `<label>Motivo <span class="req">*</span>
            <textarea id="reasonText" rows="3" placeholder="${esc(o.placeholder || 'Describe el motivo de la corrección...')}"></textarea>
          </label>
          <p class="field-error" id="reasonError" role="alert"></p>`,
        footer: `<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(o.okLabel || 'Registrar')}</button>`,
        onMount(modal) {
          const text = modal.querySelector('#reasonText');
          const err = modal.querySelector('#reasonError');
          modal.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(null); });
          modal.querySelector('[data-ok]').addEventListener('click', () => {
            const value = text.value.trim();
            if (value.length < 4) {
              err.textContent = 'Escribe un motivo de al menos 4 caracteres.';
              text.focus();
              return;
            }
            closeModal();
            resolve(value);
          });
          text.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) modal.querySelector('[data-ok]').click();
          });
        }
      });
      const root = $('#modalRoot');
      const obs = new MutationObserver(() => {
        if (root.hidden) { obs.disconnect(); resolve(null); }
      });
      obs.observe(root, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  /* ---------------- gráficos SVG ---------------- */

  function groupedBars(opts) {
    const data = opts.data || [];
    const series = opts.series || [];
    const width = opts.width || 620;
    const height = opts.height || 260;
    const margin = { top: 14, right: 10, bottom: 44, left: 52 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const max = Math.max(1, ...data.flatMap(d => d.values.map(v => Number(v) || 0)));
    const ticks = 4;
    const step = Math.ceil(max / ticks / 10) * 10 || 1;
    const top = step * ticks;

    const groupW = plotW / Math.max(1, data.length);
    const barW = Math.max(4, Math.min(26, (groupW - 12) / series.length));

    let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.label || 'Gráfico')}">`;
    for (let i = 0; i <= ticks; i++) {
      const y = margin.top + plotH - (plotH * i) / ticks;
      const val = step * i;
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid"/>`;
      svg += `<text x="${margin.left - 8}" y="${y + 4}" class="chart-tick" text-anchor="end">${fmt(val)}</text>`;
    }

    data.forEach((d, di) => {
      const gx = margin.left + di * groupW;
      const groupCenter = gx + groupW / 2;
      const startX = groupCenter - (series.length * barW + (series.length - 1) * 3) / 2;
      d.values.forEach((v, si) => {
        const val = Number(v) || 0;
        const h = Math.max(val > 0 ? 2 : 0, (val / top) * plotH);
        const x = startX + si * (barW + 3);
        const y = margin.top + plotH - h;
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${series[si].color}"><title>${esc(d.label)} · ${esc(series[si].label)}: ${fmt(val)}</title></rect>`;
      });
      const label = String(d.label);
      const short = label.length > 11 ? label.slice(0, 10) + '…' : label;
      svg += `<text x="${groupCenter}" y="${height - 24}" class="chart-tick" text-anchor="middle">${esc(short)}</text>`;
      if (d.sub) svg += `<text x="${groupCenter}" y="${height - 9}" class="chart-tick dim" text-anchor="middle">${esc(d.sub)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  function donut(opts) {
    const segments = (opts.segments || []).filter(s => Number(s.value) > 0);
    const total = segments.reduce((t, s) => t + Number(s.value), 0);
    const size = 168;
    const stroke = 26;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;
    let svg = `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.label || 'Distribución')}">`;
    svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(15,40,66,.08)" stroke-width="${stroke}"/>`;
    segments.forEach(s => {
      const frac = Number(s.value) / total;
      const len = frac * c;
      svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
        stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${fmt(s.value)}</title></circle>`;
      offset += len;
    });
    svg += `<text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" class="donut-value">${fmt(total)}</text>`;
    svg += `<text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" class="donut-label">${esc(opts.centerLabel || 'TOTAL')}</text>`;
    svg += '</svg>';
    return svg;
  }

  /* ---------------- exportaciones ---------------- */

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadCSV(filename, rows) {
    const content = rows.map(row => row.map(cell => {
      const value = cell === null || cell === undefined ? '' : String(cell);
      return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  }

  function printHtml(html, title) {
    const root = $('#printRoot');
    if (!root) return;
    root.innerHTML = html;
    const prevTitle = document.title;
    if (title) document.title = title;
    document.body.classList.add('printing');
    const cleanup = () => {
      document.body.classList.remove('printing');
      document.title = prevTitle;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1500);
    }, 60);
  }

  function docShell(title, subtitle, body, opts) {
    const o = opts || {};
    return `<div class="print-doc">
      <header class="print-head">
        <div class="print-brand"><span class="brand-mark">B</span><div><b>BALSASUD S.A.</b><span>CONTROL DE DESPACHOS</span></div></div>
        <div class="print-meta"><b>${esc(title)}</b><span>${esc(subtitle || '')}</span><span>Emitido: ${fmtDateTime(new Date().toISOString())}</span></div>
      </header>
      ${body}
      <footer class="print-foot"><span>BALSASUD S.A. · Documento generado por el Sistema de Control de Despachos</span><span>${esc(o.footer || '')}</span></footer>
    </div>`;
  }

  /* ---------------- evidencias ---------------- */

  const photoCache = new Map();

  async function getPhotoUrl(key) {
    if (photoCache.has(key)) return photoCache.get(key);
    const blob = await window.DB.getFile(key);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    photoCache.set(key, url);
    return url;
  }

  async function hydratePhotos(root) {
    const nodes = $$('[data-photo-key]', root || document);
    await Promise.all(nodes.map(async node => {
      const key = node.getAttribute('data-photo-key');
      const url = await getPhotoUrl(key);
      if (!url) {
        node.classList.add('photo-missing');
        node.innerHTML = '<span>Sin archivo</span>';
        return;
      }
      if (node.tagName === 'IMG') node.src = url;
      else node.style.backgroundImage = `url("${url}")`;
      node.classList.add('loaded');
    }));
  }

  async function openLightbox(key, caption) {
    const box = $('#lightbox');
    const img = $('#lightboxImg');
    const cap = $('#lightboxCaption');
    const url = await getPhotoUrl(key);
    if (!url) { toast('No se encontró el archivo de la evidencia.', 'error'); return; }
    img.src = url;
    cap.textContent = caption || '';
    box.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeLightbox() {
    const box = $('#lightbox');
    if (!box) return;
    box.hidden = true;
    $('#lightboxImg').src = '';
    document.body.classList.remove('modal-open');
  }

  window.UI = {
    $, $$, esc, fmt, fmtDec, pct, fmtDate, fmtDateLong, fmtDateTime, relTime, initials, roleLabel, roleShort,
    statusBadge, toneBadge, bar, progressLine, emptyState, pageHead, kpiCard,
    toast, broadcastToast, openModal, closeModal, confirmDialog, reasonDialog, getActiveModal: () => activeModal,
    groupedBars, donut, downloadBlob, downloadCSV, printHtml, docShell,
    getPhotoUrl, hydratePhotos, openLightbox, closeLightbox
  };
})();
