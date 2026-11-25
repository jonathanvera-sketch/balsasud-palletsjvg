/* ============================================================
   BALSASUD · MOTOR DE CONCILIACIÓN
   Compara TALLY SHEET (autorizado) vs Producto Terminado (reportado)
   vs Calidad (aprobado), por ITEM ID + ESPESOR. Sin compensaciones.
   ============================================================ */
(function () {
  'use strict';

  const STATUS_META = {
    borrador:          { label: 'Borrador', tone: 'gray',   icon: '✎' },
    pendiente_pt:      { label: 'Pendiente de Producto Terminado', tone: 'amber', icon: '⏳' },
    registro:          { label: 'En registro de pallets', tone: 'blue', icon: '▦' },
    pendiente_calidad: { label: 'Pendiente de Calidad', tone: 'amber', icon: '⏳' },
    inspeccion:        { label: 'En inspección', tone: 'blue', icon: '⌕' },
    con_diferencias:   { label: 'Con diferencias', tone: 'red', icon: '⚠' },
    correccion:        { label: 'En corrección', tone: 'red', icon: '↺' },
    corregido:         { label: 'Corregido · pendiente de reinspección', tone: 'amber', icon: '↺' },
    conciliado:        { label: 'Conciliado', tone: 'green', icon: '✓' },
    liberado:          { label: 'Liberado', tone: 'green', icon: '✓' },
    despachado:        { label: 'Despachado', tone: 'green', icon: '⇢' },
    cerrado:           { label: 'Cerrado', tone: 'gray', icon: '■' }
  };

  const ROW_STATUS = {
    conciliado:        { label: 'Conciliado', tone: 'green' },
    diferencia_pt:     { label: 'Diferencia en Producto Terminado', tone: 'red' },
    diferencia_calidad:{ label: 'Diferencia en Calidad', tone: 'red' },
    pendiente:         { label: 'Pendiente', tone: 'amber' },
    rechazado:         { label: 'Pallet rechazado', tone: 'red' },
    correccion:        { label: 'Requiere corrección', tone: 'red' },
    corregido:         { label: 'Corregido · pendiente de reinspección', tone: 'amber' },
    alerta_espesor:    { label: 'Alerta de espesor', tone: 'red' },
    no_autorizado:     { label: 'ITEM ID no autorizado', tone: 'red' }
  };

  const Q_STATUS = {
    pendiente:            { label: 'Pendiente de inspección', tone: 'amber' },
    en_inspeccion:        { label: 'En inspección', tone: 'blue' },
    aprobado:             { label: 'Aprobado por Calidad', tone: 'green' },
    rechazado:            { label: 'Rechazado por Calidad', tone: 'red' },
    requiere_correccion:  { label: 'Requiere corrección', tone: 'red' },
    corregido:            { label: 'Corregido · pendiente de reinspección', tone: 'amber' }
  };

  const PACKAGING = {
    palet: 'Palet',
    caja: 'Caja',
    suelto: 'Suelto'
  };

  const PALLET_TYPE = {
    simple: 'Simple',
    doble: 'Doble',
    no_aplica: 'No aplica'
  };

  /* ---------------- utilidades numéricas ---------------- */

  function thicknessNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Math.round(value * 100) / 100;
    const clean = String(value).replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function thicknessLabel(value) {
    const n = thicknessNumber(value);
    if (!n) return '—';
    return `${Number.isInteger(n) ? n : n.toFixed(1)} mm`;
  }

  function normItem(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function keyOf(itemId, thickness) {
    return `${normItem(itemId)}|${thicknessNumber(thickness)}`;
  }

  function n(value) {
    const x = Number(value);
    return isNaN(x) ? 0 : x;
  }

  function isApproved(p) { return p.quality && p.quality.status === 'aprobado'; }
  function isRejected(p) { return p.quality && p.quality.status === 'rechazado'; }
  function needsCorrection(p) { return p.quality && p.quality.status === 'requiere_correccion'; }
  function isCorrected(p) { return p.quality && p.quality.status === 'corregido'; }
  function isPending(p) { return !p.quality || ['pendiente', 'en_inspeccion'].includes(p.quality.status); }

  function approvedQty(p) {
    if (!isApproved(p)) return 0;
    const v = p.quality && p.quality.verifiedPanels;
    return v === undefined || v === null || v === '' ? n(p.panels) : n(v);
  }

  /* ---------------- conciliación ---------------- */

  function reconcile(order) {
    const rows = new Map();
    const items = order.items || [];
    const pallets = order.pallets || [];

    items.forEach(it => {
      const thk = thicknessNumber(it.thickness);
      const key = keyOf(it.itemId, thk);
      let row = rows.get(key);
      if (!row) {
        row = {
          key, itemId: normItem(it.itemId), itemLabel: it.itemId, description: it.description || '',
          thickness: thk, thicknessLabel: thicknessLabel(thk),
          tally: 0, tallyPallets: 0, programmedPallets: 0, bf: 0, m3: 0,
          pt: 0, quality: 0, palletCount: 0, approvedCount: 0, rejectedCount: 0,
          correctionCount: 0, correctedCount: 0, pendingCount: 0,
          tallied: true, thicknessAlert: false, unauthorized: false,
          pallets: [], issues: [], status: 'pendiente'
        };
        rows.set(key, row);
      }
      row.tally += n(it.programmed);
      row.tallyPallets += n(it.pallets);
      row.bf += n(it.bf);
      row.m3 += n(it.m3);
    });

    const itemIdsInTally = new Set(items.map(it => normItem(it.itemId)));

    pallets.forEach(p => {
      const thk = thicknessNumber(p.thickness);
      const key = keyOf(p.itemId, thk);
      let row = rows.get(key);
      if (!row) {
        row = {
          key, itemId: normItem(p.itemId), itemLabel: p.itemId, description: p.description || '',
          thickness: thk, thicknessLabel: thicknessLabel(thk),
          tally: 0, tallyPallets: 0, programmedPallets: 0, bf: 0, m3: 0,
          pt: 0, quality: 0, palletCount: 0, approvedCount: 0, rejectedCount: 0,
          correctionCount: 0, correctedCount: 0, pendingCount: 0,
          tallied: false,
          thicknessAlert: itemIdsInTally.has(normItem(p.itemId)),
          unauthorized: !itemIdsInTally.has(normItem(p.itemId)),
          pallets: [], issues: [], status: 'pendiente'
        };
        rows.set(key, row);
      }
      row.palletCount += 1;
      row.pt += n(p.panels);
      row.pallets.push(p);
      if (isApproved(p)) { row.approvedCount += 1; row.quality += approvedQty(p); }
      else if (isRejected(p)) { row.rejectedCount += 1; }
      else if (needsCorrection(p)) { row.correctionCount += 1; }
      else if (isCorrected(p)) { row.correctedCount += 1; }
      else { row.pendingCount += 1; }
      if (!row.description && p.description) row.description = p.description;
    });

    const list = Array.from(rows.values()).sort((a, b) => {
      if (a.thickness !== b.thickness) return a.thickness - b.thickness;
      return a.itemId.localeCompare(b.itemId);
    });

    list.forEach(row => {
      row.diffPt = row.pt - row.tally;
      row.diffQuality = row.quality - row.pt;
      row.pending = Math.max(0, row.tally - row.pt);
      row.cumplimiento = row.tally > 0 ? Math.min(999, Math.round((row.pt / row.tally) * 1000) / 10) : (row.pt > 0 ? 100 : 0);

      if (row.unauthorized) {
        row.status = 'no_autorizado';
        row.issues.push(`ITEM ID ${row.itemLabel} no existe en el TALLY SHEET autorizado.`);
      } else if (row.thicknessAlert) {
        row.status = 'alerta_espesor';
        row.issues.push(`Espesor ${row.thicknessLabel} no autorizado para el ITEM ${row.itemLabel} en el TALLY SHEET.`);
      } else if (row.rejectedCount > 0) {
        row.status = 'rechazado';
        row.issues.push(`${row.rejectedCount} pallet(s) rechazado(s) por Calidad.`);
      } else if (row.correctionCount > 0) {
        row.status = 'correccion';
        row.issues.push(`${row.correctionCount} pallet(s) requieren corrección.`);
      } else if (row.correctedCount > 0) {
        row.status = 'corregido';
        row.issues.push(`${row.correctedCount} pallet(s) corregido(s) por PT y pendiente(s) de reinspección.`);
      } else if (row.pt === 0 && row.tally > 0) {
        row.status = 'pendiente';
        row.issues.push(`Sin pallets reportados por Producto Terminado (${row.tally} paneles autorizados).`);
      } else if (row.diffPt !== 0) {
        row.status = 'diferencia_pt';
        row.issues.push(`Producto Terminado reporta ${fmtSigned(row.diffPt)} paneles frente al TALLY SHEET.`);
      } else if (row.pendingCount > 0) {
        row.status = 'pendiente';
        row.issues.push(`${row.pendingCount} pallet(s) pendiente(s) de inspección de Calidad.`);
      } else if (row.diffQuality !== 0) {
        row.status = 'diferencia_calidad';
        row.issues.push(`Calidad registra ${fmtSigned(row.diffQuality)} paneles frente a Producto Terminado.`);
      } else {
        row.status = 'conciliado';
      }
    });

    const totals = list.reduce((t, row) => {
      t.tally += row.tally;
      t.pt += row.pt;
      t.quality += row.quality;
      t.pallets += row.palletCount;
      t.approvedPallets += row.approvedCount;
      t.rejectedPallets += row.rejectedCount;
      t.correctionPallets += row.correctionCount;
      t.correctedPallets += row.correctedCount;
      t.pendingPallets += row.pendingCount;
      t.tallyPallets += row.tallyPallets;
      return t;
    }, { tally: 0, pt: 0, quality: 0, pallets: 0, approvedPallets: 0, rejectedPallets: 0, correctionPallets: 0, correctedPallets: 0, pendingPallets: 0, tallyPallets: 0 });

    totals.diffPt = totals.pt - totals.tally;
    totals.diffQuality = totals.quality - totals.pt;
    totals.cumplimiento = totals.tally ? Math.round((totals.pt / totals.tally) * 1000) / 10 : (totals.pt ? 100 : 0);
    totals.approvedPct = totals.tally ? Math.round((totals.quality / totals.tally) * 1000) / 10 : 0;

    const byThickness = new Map();
    list.forEach(row => {
      const t = byThickness.get(row.thickness) || {
        thickness: row.thickness, thicknessLabel: row.thicknessLabel,
        tally: 0, pt: 0, quality: 0, rows: 0, ok: true
      };
      t.tally += row.tally; t.pt += row.pt; t.quality += row.quality; t.rows += 1;
      if (row.status !== 'conciliado') t.ok = false;
      byThickness.set(row.thickness, t);
    });

    const thicknesses = Array.from(byThickness.values()).sort((a, b) => a.thickness - b.thickness);
    thicknesses.forEach(t => { t.diffPt = t.pt - t.tally; t.diffQuality = t.quality - t.pt; });

    const issues = [];
    list.forEach(row => {
      if (row.status === 'conciliado' || row.status === 'pendiente') return;
      const tag = row.status === 'diferencia_pt' ? 'DIFERENCIA PT'
        : row.status === 'diferencia_calidad' ? 'DIFERENCIA CALIDAD'
        : row.status === 'alerta_espesor' ? 'ALERTA DE ESPESOR'
        : row.status === 'no_autorizado' ? 'ITEM NO AUTORIZADO'
        : row.status === 'rechazado' ? 'RECHAZO'
        : row.status === 'corregido' ? 'CORREGIDO'
        : 'CORRECCIÓN';
      issues.push({
        key: row.key, tag, status: row.status, itemId: row.itemLabel,
        thickness: row.thicknessLabel, tally: row.tally, pt: row.pt, quality: row.quality,
        message: row.issues.join(' ')
      });
    });

    const hasDifferences = list.some(r => ['diferencia_pt', 'diferencia_calidad', 'alerta_espesor', 'no_autorizado', 'rechazado', 'correccion', 'corregido'].includes(r.status));
    const allConciliated = list.length > 0 && list.every(r => r.status === 'conciliado');
    const hasCorrected = totals.correctedPallets > 0;
    const ok = allConciliated && !hasCorrected && totals.tally === totals.pt && totals.pt === totals.quality;

    return {
      rows: list, totals, thicknesses, issues, hasDifferences,
      allConciliated, ok,
      counts: {
        rows: list.length,
        conciliated: list.filter(r => r.status === 'conciliado').length,
        differences: list.filter(r => ['diferencia_pt', 'diferencia_calidad', 'alerta_espesor', 'no_autorizado'].includes(r.status)).length,
        rejected: list.filter(r => r.status === 'rechazado').length
      }
    };
  }

  function fmtSigned(v) {
    const x = Math.round(Number(v) || 0);
    return x > 0 ? `+${x}` : String(x);
  }

  /* ---------------- estado del despacho ---------------- */

  function deriveStatus(order) {
    if (!order) return 'borrador';
    if (order.closedAt) return 'cerrado';
    if (order.shippedAt) return 'despachado';
    if (order.releasedAt) return 'liberado';
    if (!order.publishedAt) return 'borrador';

    const pallets = order.pallets || [];
    if (!pallets.length) return 'pendiente_pt';
    if (!order.submittedAt) return 'registro';

    const counts = qualityCounts(pallets);
    if (counts.rejected > 0 || counts.correction > 0) return 'correccion';
    if (counts.corrected > 0) return 'corregido';
    if (counts.pending > 0 || counts.inspecting > 0) {
      return (counts.approved > 0 || counts.inspecting > 0) ? 'inspeccion' : 'pendiente_calidad';
    }

    const rec = order._rec || reconcile(order);
    return rec.ok ? 'conciliado' : 'con_diferencias';
  }

  function qualityCounts(pallets) {
    const c = { pending: 0, inspecting: 0, approved: 0, rejected: 0, correction: 0, corrected: 0, total: 0 };
    const MAP = {
      pendiente: 'pending',
      en_inspeccion: 'inspecting',
      aprobado: 'approved',
      rechazado: 'rejected',
      requiere_correccion: 'correction',
      corregido: 'corrected'
    };
    (pallets || []).forEach(p => {
      c.total += 1;
      const s = (p.quality && p.quality.status) || 'pendiente';
      c[MAP[s] || 'pending'] += 1;
    });
    return c;
  }

  function statusMeta(status) {
    return STATUS_META[status] || { label: status, tone: 'gray', icon: '•' };
  }

  function rowStatusMeta(status) {
    return ROW_STATUS[status] || { label: status, tone: 'gray' };
  }

  /* ---------------- liberación ---------------- */

  function releaseCheck(order) {
    const reasons = [];
    if (!order) return { ok: false, reasons: ['Orden inexistente.'] };
    if (!order.publishedAt) reasons.push('La orden aún no ha sido publicada.');
    const pallets = order.pallets || [];
    if (!pallets.length) reasons.push('No hay pallets registrados por Producto Terminado.');
    if (!order.submittedAt) reasons.push('Producto Terminado no ha enviado el despacho a revisión de Calidad.');

    const q = qualityCounts(pallets);
    if (q.pending > 0) reasons.push(`${q.pending} pallet(s) pendientes de inspección de Calidad.`);
    if (q.inspecting > 0) reasons.push(`${q.inspecting} pallet(s) en inspección.`);
    if (q.rejected > 0) reasons.push(`${q.rejected} pallet(s) rechazados por Calidad.`);
    if (q.correction > 0) reasons.push(`${q.correction} pallet(s) requieren corrección.`);
    if (q.corrected > 0) reasons.push(`${q.corrected} pallet(s) corregido(s) por PT y pendiente(s) de reinspección.`);

    const rec = order._rec || reconcile(order);
    if (!(order.items || []).length) reasons.push('El TALLY SHEET no tiene ítems autorizados.');
    rec.rows.forEach(row => {
      if (row.status === 'conciliado') return;
      reasons.push(`${row.thicknessLabel} · ITEM ${row.itemLabel}: ${rowStatusMeta(row.status).label} (TALLY ${row.tally} / PT ${row.pt} / Calidad ${row.quality}).`);
    });
    if (rec.totals.tally !== rec.totals.pt) {
      reasons.push(`Total general: TALLY ${rec.totals.tally} ≠ Producto Terminado ${rec.totals.pt}.`);
    }
    if (rec.totals.pt !== rec.totals.quality) {
      reasons.push(`Total general: Producto Terminado ${rec.totals.pt} ≠ Calidad ${rec.totals.quality}.`);
    }

    return { ok: reasons.length === 0, reasons, rec, quality: q };
  }

  /* ---------------- avance ---------------- */

  function progress(order) {
    const rec = order._rec || reconcile(order);
    const q = qualityCounts(order.pallets || []);
    return {
      pt: rec.totals.cumplimiento || 0,
      quality: rec.totals.approvedPct || 0,
      pallets: q.total ? Math.round((q.approved / q.total) * 100) : 0,
      q, rec
    };
  }

  /* ---------------- KPIs globales ---------------- */

  function kpis(orders) {
    const k = {
      totalOrders: orders.length,
      draft: 0, pendingPt: 0, registering: 0, inQuality: 0, correctedOrders: 0, conciliated: 0, released: 0, shipped: 0,
      pendingOrders: 0, inProcess: 0,
      programmed: 0, reported: 0, approved: 0,
      pendingPallets: 0, rejectedPallets: 0, correctionPallets: 0, correctedPallets: 0,
      differences: 0, differencesOrders: 0,
      fulfillment: 0, qualityPct: 0
    };

    orders.forEach(order => {
      const status = order._status || deriveStatus(order);
      const rec = order._rec || reconcile(order);
      if (status === 'borrador') k.draft += 1;
      else {
        k.programmed += rec.totals.tally;
        k.reported += rec.totals.pt;
        k.approved += rec.totals.quality;
        k.pendingPallets += rec.totals.pendingPallets;
        k.rejectedPallets += rec.totals.rejectedPallets;
        k.correctionPallets += rec.totals.correctionPallets;
        k.correctedPallets += rec.totals.correctedPallets;
      }
      if (status === 'borrador' || status === 'pendiente_pt') k.pendingPt += 1;
      if (status === 'registro') k.registering += 1;
      if (status === 'pendiente_calidad' || status === 'inspeccion') k.inQuality += 1;
      if (status === 'corregido') k.correctedOrders += 1;
      if (status === 'conciliado') k.conciliated += 1;
      if (status === 'liberado') k.released += 1;
      if (status === 'despachado' || status === 'cerrado') k.shipped += 1;
      if (['registro', 'pendiente_calidad', 'inspeccion', 'con_diferencias', 'correccion', 'corregido'].includes(status)) k.inProcess += 1;
      if (rec.hasDifferences) { k.differencesOrders += 1; k.differences += rec.counts.differences + rec.counts.rejected + rec.totals.correctedPallets; }
    });

    k.pendingOrders = k.draft + k.pendingPt;
    k.fulfillment = k.programmed ? Math.round((k.reported / k.programmed) * 1000) / 10 : 0;
    k.qualityPct = k.programmed ? Math.round((k.approved / k.programmed) * 1000) / 10 : 0;

    return k;
  }

  /** Prepara una orden con campos calculados (status y conciliación). */
  function prepare(order) {
    const rec = reconcile(order);
    const status = deriveStatus(Object.assign({}, order, { _rec: rec }));
    return Object.assign({}, order, { _rec: rec, _status: status });
  }

  function prepareAll(orders) { return orders.map(prepare); }

  window.Engine = {
    STATUS_META, ROW_STATUS, Q_STATUS, PACKAGING, PALLET_TYPE,
    thicknessNumber, thicknessLabel, normItem, keyOf,
    reconcile, deriveStatus, statusMeta, rowStatusMeta, qualityCounts,
    releaseCheck, progress, kpis, prepare, prepareAll,
    isApproved, isRejected, needsCorrection, isCorrected, isPending, approvedQty
  };
})();
