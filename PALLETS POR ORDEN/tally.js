/* ============================================================
   BALSASUD · LECTURA ASISTIDA DEL TALLY SHEET
   Extrae texto de PDF (sin dependencias) y reconoce filas de
   producto (ITEM ID / descripción / espesor / cantidad / pallets).
   CSV, TXT y pegado manual también son compatibles.
   Todo resultado es una PROPUESTA: el Superadministrador confirma.
   ============================================================ */
(function () {
  'use strict';

  const HEADER_HINTS = {
    itemId: /^(item(\s*id)?|c[oó]digo(\s*item)?|sku|producto)$/i,
    description: /^(descripci[oó]n|desc|material|nombre|producto)$/i,
    thickness: /^(espesor|thick(ness)?|mm|pulg|calibre)$/i,
    programmed: /^(cantidad|cant\.?|paneles|qty|sheets|unidades|piezas|total(\s*paneles)?)$/i,
    pallets: /^(pallets|paletas|bultos|cajas)$/i,
    bf: /^(bf|board\s*feet|pies)$/i,
    m3: /^(m3|m³|metros?\s*c[uú]bicos?)$/i,
    weight: /^(peso|kg|weight)$/i,
    lot: /^(lote|lot)$/i,
    op: /^(op|orden\s*de\s*producci[oó]n)$/i
  };

  function parseNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Math.round(value * 1000) / 1000;
    let s = String(value).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
  }

  function thicknessNumber(value) {
    const n = parseNumber(String(value || '').replace(/mm|pulg|"/gi, ''));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/\u0000/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .join('\n');
  }

  /* ---------------- CSV / TXT delimitado ---------------- */

  function splitDelimited(line, delimiter) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  function detectDelimiter(text) {
    const sample = text.split('\n').slice(0, 12).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    sample.split('\n').forEach(line => {
      Object.keys(counts).forEach(d => { counts[d] += (line.split(d).length - 1); });
    });
    let best = ',';
    Object.keys(counts).forEach(d => { if (counts[d] > counts[best]) best = d; });
    return counts[best] ? best : null;
  }

  function parseDelimited(text) {
    const delimiter = detectDelimiter(text);
    if (!delimiter) return null;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const rows = lines.map(line => splitDelimited(line, delimiter));
    const headerIndex = rows.findIndex(row => {
      const joined = row.join(' ').toLowerCase();
      return /(item|c[oó]digo|espesor|thick|cantidad|paneles|qty)/.test(joined) && row.length >= 3;
    });
    if (headerIndex < 0) return null;

    const header = rows[headerIndex].map(h => h.toLowerCase().trim());
    const col = {};
    header.forEach((h, i) => {
      Object.keys(HEADER_HINTS).forEach(field => {
        if (col[field] === undefined && HEADER_HINTS[field].test(h)) col[field] = i;
      });
    });
    if (col.itemId === undefined) {
      const guess = header.findIndex(h => /item|c[oó]digo|sku/.test(h));
      if (guess >= 0) col.itemId = guess;
    }
    if (col.thickness === undefined) {
      const guess = header.findIndex(h => /espesor|thick|mm/.test(h));
      if (guess >= 0) col.thickness = guess;
    }
    if (col.programmed === undefined) {
      const guess = header.findIndex(h => /cantidad|paneles|qty|sheets/.test(h));
      if (guess >= 0) col.programmed = guess;
    }
    if (col.itemId === undefined || col.programmed === undefined) return null;

    const items = [];
    const warnings = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row.join('').trim()) continue;
      const flat = row.join(' ').toLowerCase();
      if (/^(total|subtotal|suma|gran total)/.test(String(row[0] || '').trim().toLowerCase()) || /gran total/.test(flat)) continue;
      const itemId = String(row[col.itemId] || '').trim();
      if (!itemId) continue;
      const programmed = parseNumber(row[col.programmed]);
      if (!programmed) { warnings.push(`Fila ${i + 1} sin cantidad válida; se omitió.`); continue; }
      items.push({
        itemId,
        description: col.description !== undefined ? String(row[col.description] || '').trim() : '',
        thickness: col.thickness !== undefined ? thicknessNumber(row[col.thickness]) : 0,
        programmed,
        pallets: col.pallets !== undefined ? parseNumber(row[col.pallets]) : 0,
        bf: col.bf !== undefined ? parseNumber(row[col.bf]) : 0,
        m3: col.m3 !== undefined ? parseNumber(row[col.m3]) : 0,
        weight: col.weight !== undefined ? parseNumber(row[col.weight]) : 0
      });
    }
    if (!items.length) return null;
    return { items, warnings, format: 'delimitado' };
  }

  /* ---------------- TALLY SHEET específico ---------------- */

  function fractionToNumber(value) {
    const s = String(value || '').trim();
    if (!s) return 0;
    if (s.includes(' ')) {
      const parts = s.split(/\s+/);
      const whole = parseNumber(parts[0]);
      const frac = fractionToNumber(parts[1]);
      return whole + frac;
    }
    const m = s.match(/^(\d+)\/(\d+)$/);
    if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
    return parseNumber(s);
  }

  function inchThicknessToMm(value) {
    const inches = fractionToNumber(value);
    return inches ? Math.round(inches * 25.4 * 100 + 1e-8) / 100 : 0;
  }

  const TALLY_ROW_RE = /^(\d{6,14})\b/;

  function parseTallyPackages(text) {
    const rows = [];
    const rowRe = /^\s*(\d{1,3})\s+(\d{6,14})\s+(Palet|Pallet|Caja)\s+(Simple|Doble|Suelto)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*(?:BF)?\s*([\d.,]+)\s*$/i;
    cleanText(text).split('\n').forEach(line => {
      const m = line.match(rowRe);
      if (!m) return;
      const packaging = /^caja$/i.test(m[3]) ? 'caja' : 'palet';
      rows.push({
        tallyNumber: m[1],
        itemId: m[2],
        packaging,
        palletType: /^suelto$/i.test(m[4]) ? 'no_aplica' : m[4].toLowerCase(),
        packages: parseNumber(m[5]),
        panels: parseNumber(m[6]),
        netWeight: parseNumber(m[7]),
        grossWeight: parseNumber(m[8]),
        bf: parseNumber(m[9]),
        m3: parseNumber(m[10])
      });
    });
    const seen = new Map();
    rows.forEach(row => {
      const count = (seen.get(row.tallyNumber) || 0) + 1;
      seen.set(row.tallyNumber, count);
      row.duplicateNumber = count > 1 || rows.filter(r => r.tallyNumber === row.tallyNumber).length > 1;
    });
    return rows;
  }

  function parseTallyHeader(text) {
    const normalized = cleanText(text);
    const header = {};
    const orderLine = normalized.match(/(?:^|\n)\s*(\d{2}[A-Z]{2}\d+)\s+(\d{5,})\s+(.+?)(?:\s+FSC\s+100%|\s*$)/im);
    if (orderLine) {
      header.op = orderLine[1].trim();
      header.purchaseOrder = orderLine[2].trim();
      header.client = orderLine[3].trim();
    }

    const destinationLine = normalized.match(/(?:^|\n)\s*([A-Za-zÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜ .'-]{1,40})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{4,})\s+([A-Z0-9-]{3,})\s*$/im);
    if (destinationLine) {
      header.destination = destinationLine[1].trim();
      const date = destinationLine[2].split('/');
      header.dispatchDate = `${date[2]}-${date[0].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
      header.lot = destinationLine[3].trim();
      header.seal = destinationLine[4].trim();
    }
    return header;
  }

  function parseTallyRows(text) {
    const items = [];
    const warnings = [];
    const packageRows = parseTallyPackages(text);
    const lines = cleanText(text).split('\n');
    lines.forEach(line => {
      if (!line || line.length < 8) return;
      if (/^total\b/i.test(line.trim())) return;
      const m = TALLY_ROW_RE.exec(line);
      if (!m) return;
      const itemId = m[1];

      const thickMatch = line.match(/(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+(?:[.,]\d+)?)\s*(mm|mms|mil[ií]metros?|pulg(?:adas)?|")/i);
      if (!thickMatch) return;
      const rawThick = thickMatch[1];
      const unit = (thickMatch[2] || '').toLowerCase();
      let thickness = 0;
      if (unit === 'mm' || unit === 'mms' || unit.startsWith('mil')) {
        thickness = thicknessNumber(rawThick);
      } else {
        thickness = inchThicknessToMm(rawThick);
      }
      if (!thickness) return;

      const descEnd = thickMatch.index + thickMatch[0].length;
      const tail = line.slice(descEnd);
      let descriptionEnd = tail.search(/\s+\d[\d.,]*(?:\s|$)/);
      if (descriptionEnd < 0) descriptionEnd = tail.length;
      const description = line.slice(m[0].length, descEnd + descriptionEnd)
        .replace(/[|;]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const nums = [];
      tail.replace(/\d[\d.,]*/g, raw => { nums.push(parseNumber(raw)); return raw; });
      if (!nums.length) return;

      const programmed = Number.isInteger(nums[0]) ? nums[0] : 0;
      if (!programmed) return;

      let bf = 0, m3 = 0;
      const bfMatch = tail.match(/(\d[\d.,]*)\s*BF/i);
      if (bfMatch) bf = parseNumber(bfMatch[1]);
      const m3Match = tail.match(/BF[\s\S]*?(\d[\d.,]*)\s*$/);
      if (m3Match) m3 = parseNumber(m3Match[1]);

      const existing = items.find(it => it.itemId === itemId && it.thickness === thickness);
      if (existing) {
        existing.programmed += programmed;
        existing.weight = (existing.weight || 0) + (nums[1] || 0);
        existing.totalWeight = (existing.totalWeight || 0) + (nums[2] || 0);
        existing.bf = Math.max(existing.bf, bf);
        existing.m3 = Math.max(existing.m3, m3);
      } else {
        items.push({
          itemId, description, thickness, programmed,
          weight: nums[1] || 0, totalWeight: nums[2] || 0,
          bf, m3, pallets: 0
        });
      }
    });

    if (!items.length) return null;
    if (packageRows.length) {
      const byItem = new Map();
      packageRows.forEach(row => {
        const tally = byItem.get(row.itemId) || { panels: 0, pallets: 0, boxes: 0 };
        tally.panels += row.panels;
        if (row.packaging === 'caja') tally.boxes += row.packages;
        else tally.pallets += 1;
        byItem.set(row.itemId, tally);
      });
      items.forEach(item => {
        const detail = byItem.get(item.itemId);
        if (detail) {
          item.pallets = detail.pallets;
          item.boxes = detail.boxes;
        }
        if (detail && detail.panels !== item.programmed) {
          warnings.push(`ITEM ${item.itemId}: los renglones de empaque suman ${detail.panels} paneles; el TALLY autoriza ${item.programmed}.`);
        }
      });
      const packagePanels = packageRows.reduce((sum, row) => sum + row.panels, 0);
      const itemPanels = items.reduce((sum, item) => sum + item.programmed, 0);
      if (packagePanels !== itemPanels) {
        warnings.push(`El detalle de pallets/cajas suma ${packagePanels} paneles y la tabla de productos suma ${itemPanels}. Verifica el TALLY antes de publicar.`);
      }
      const duplicates = [...new Set(packageRows.filter(row => row.duplicateNumber).map(row => row.tallyNumber))];
      if (duplicates.length) warnings.push(`El TALLY repite el número de pallet ${duplicates.join(', ')}. Se conservaron los renglones por separado.`);
    }
    const printedTotal = lines.map(line => line.match(/^\s*TOTAL\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*BF\s*([\d.,]+)\s*$/i)).find(Boolean);
    if (printedTotal) {
      const expected = {
        panels: parseNumber(printedTotal[1]),
        unitWeight: parseNumber(printedTotal[2]),
        totalWeight: parseNumber(printedTotal[3]),
        bf: parseNumber(printedTotal[4]),
        m3: parseNumber(printedTotal[5])
      };
      const actual = {
        panels: items.reduce((sum, item) => sum + item.programmed, 0),
        unitWeight: items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0),
        totalWeight: items.reduce((sum, item) => sum + (Number(item.totalWeight) || 0), 0),
        bf: items.reduce((sum, item) => sum + (Number(item.bf) || 0), 0),
        m3: items.reduce((sum, item) => sum + (Number(item.m3) || 0), 0)
      };
      ['panels', 'unitWeight', 'totalWeight'].forEach(field => {
        if (Math.round(actual[field] * 100) !== Math.round(expected[field] * 100)) {
          const labels = { panels: 'paneles', unitWeight: 'peso unitario total', totalWeight: 'peso total en kg' };
          warnings.push(`Verifica el total de ${labels[field]}: líneas ${actual[field].toFixed(2)} frente al total impreso ${expected[field].toFixed(2)}.`);
        }
      });
    }
    return { items, packageRows, warnings, format: 'tally' };
  }

  /* ---------------- DETALLE DE EMBARQUE (FOR-OP-31) ----------------
     Documento que alimenta el TALLY: no imprime ITEM ID, solo
     Espesor (pulgadas) | Tipo | Paneles por empaque | Empaques | Total.
     36 pallets + 12 cajas => 48 renglones y 4,425 paneles.
     El ITEM ID se propone a partir del espesor y el Superadministrador
     lo confirma antes de publicar. */

  const INCH_LABELS = {
    '0.25': '1/4"', '0.5': '1/2"', '0.75': '3/4"', '1': '1"',
    '1.25': '1-1/4"', '1.5': '1-1/2"', '1.75': '1-3/4"', '2': '2"'
  };

  const DETALLE_ITEM_BY_INCH = {
    '0.25': '6230010251',
    '0.5': '6230010501',
    '0.75': '6230010751',
    '1': '6230011001',
    '1.25': '6230011251',
    '1.5': '6230011501',
    '1.75': '6230011751',
    '2': '6230012001'
  };

  function detalleItemId(inches) {
    const key = String(Math.round(inches * 100) / 100);
    if (DETALLE_ITEM_BY_INCH[key]) return DETALLE_ITEM_BY_INCH[key];
    const code = Math.round(inches * 1000) + 1;
    return code > 0 ? '623001' + String(code).padStart(4, '0') : '';
  }

  const DETALLE_ROW_RE = /((?:\d+[ \t]+)?\d+[ \t]*\/[ \t]*\d+|\d+(?:[.,]\d+)?)[ \t]*["”″']?[ \t]*(Simple|Doble|Boxes?|Cajas?)[ \t]+(\d[\d.,]*)[ \t]+(\d[\d.,]*)[ \t]+(\d[\d.,]*)/gi;

  const DETALLE_SUMMARY_ROW_RE = /^[ \t]*((?:\d+[ \t]+)?\d+[ \t]*\/[ \t]*\d+|\d+(?:[.,]\d+)?)[ \t]*["”″']?[ \t]+(\d+)[ \t]+(\d+)[ \t]+(\d+)/;

  function looksLikeDetalle(text) {
    const head = String(text || '').slice(0, 6000);
    return /DETALLE\s+DE\s+EMBARQUE/i.test(head) ||
      /Espesor[ \t]+Tipo[ \t]+Paneles[ \t]+Paletas/i.test(head) ||
      /Espesor[ \t]+Paletas[ \t]+Boxes[ \t]+Paneles/i.test(head);
  }

  function parseDetalleRows(text) {
    const rows = [];
    DETALLE_ROW_RE.lastIndex = 0;
    let m;
    while ((m = DETALLE_ROW_RE.exec(text)) !== null) {
      const inches = fractionToNumber(String(m[1]).replace(/\s+/g, ' ').trim());
      if (!(inches > 0)) continue;
      const typeRaw = m[2].toLowerCase();
      const packaging = /^box|^caja/.test(typeRaw) ? 'caja' : 'palet';
      const perPackage = parseNumber(m[3]);
      const packages = parseNumber(m[4]);
      if (!(perPackage > 0) || !(packages > 0)) continue;
      rows.push({
        inches,
        packaging,
        palletType: packaging === 'caja' ? 'no_aplica' : (typeRaw.indexOf('simple') === 0 ? 'simple' : 'doble'),
        perPackage,
        packages,
        rowTotal: parseNumber(m[5])
      });
    }
    return rows;
  }

  function parseDetalleEmbarque(text) {
    const normalized = cleanText(text);
    const lines = normalized.split('\n');
    const warnings = [];

    const detail = parseDetalleRows(normalized);
    if (!detail.length) return null;

    const byThickness = new Map();
    const packageRows = [];
    let sequence = 0;

    detail.forEach(row => {
      const mm = inchThicknessToMm(row.inches);
      const itemId = detalleItemId(row.inches);
      let entry = byThickness.get(mm);
      if (!entry) {
        entry = { itemId, inches: row.inches, thickness: mm, pallets: 0, boxes: 0, panels: 0 };
        byThickness.set(mm, entry);
      }
      if (row.packaging === 'caja') entry.boxes += row.packages;
      else entry.pallets += row.packages;
      entry.panels += row.packages * row.perPackage;

      const shownTotal = row.packages * row.perPackage;
      if (row.rowTotal && Math.round(row.rowTotal) !== Math.round(shownTotal)) {
        warnings.push(`${INCH_LABELS[String(row.inches)] || row.inches + '"'} ${row.packaging === 'caja' ? 'Boxes' : row.palletType}: la columna Total dice ${row.rowTotal} y ${row.packages} x ${row.perPackage} da ${shownTotal}.`);
      }

      for (let i = 0; i < row.packages; i++) {
        sequence += 1;
        packageRows.push({
          tallyNumber: String(sequence),
          itemId,
          packaging: row.packaging,
          palletType: row.palletType,
          packages: 1,
          panels: row.perPackage,
          netWeight: 0,
          grossWeight: 0,
          bf: 0,
          m3: 0,
          duplicateNumber: false
        });
      }
    });

    const items = Array.from(byThickness.values())
      .sort((a, b) => a.thickness - b.thickness)
      .map(entry => {
        const key = String(Math.round(entry.inches * 100) / 100);
        const label = INCH_LABELS[key] || key + '"';
        return {
          itemId: entry.itemId,
          description: `BALSA CORE ${label}`,
          thickness: entry.thickness,
          programmed: entry.panels,
          pallets: entry.pallets,
          boxes: entry.boxes,
          bf: 0,
          m3: 0,
          weight: 0,
          inchesLabel: label
        };
      });

    /* Comprobación contra la tabla resumen del documento. */
    const summaryStart = lines.findIndex(line => /^Espesor[ \t]+Paletas[ \t]+Boxes[ \t]+Paneles/i.test(line));
    let printedTotal = 0;
    if (summaryStart >= 0) {
      for (let i = summaryStart + 1; i < lines.length; i++) {
        const totalMatch = lines[i].match(/^[ \t]*Total[ \t]+Paneles[ \t]+([\d.,]+)/i);
        if (totalMatch) { printedTotal = parseNumber(totalMatch[1]); break; }
        const s = lines[i].match(DETALLE_SUMMARY_ROW_RE);
        if (!s) continue;
        const inches = fractionToNumber(String(s[1]).replace(/\s+/g, ' ').trim());
        if (!(inches > 0)) continue;
        const mm = inchThicknessToMm(inches);
        const entry = byThickness.get(mm);
        if (!entry) continue;
        const pallets = parseNumber(s[2]);
        const boxes = parseNumber(s[3]);
        const panels = parseNumber(s[4]);
        const label = INCH_LABELS[String(Math.round(inches * 100) / 100)] || inches + '"';
        if (entry.pallets !== pallets) warnings.push(`${label}: el resumen dice ${pallets} pallets y el detalle suma ${entry.pallets}.`);
        if (entry.boxes !== boxes) warnings.push(`${label}: el resumen dice ${boxes} cajas y el detalle suma ${entry.boxes}.`);
        if (Math.round(entry.panels) !== Math.round(panels)) warnings.push(`${label}: el resumen dice ${panels} paneles y el detalle suma ${Math.round(entry.panels)}.`);
      }
    }

    const detailPanels = items.reduce((sum, item) => sum + item.programmed, 0);
    if (printedTotal && Math.round(printedTotal) !== Math.round(detailPanels)) {
      warnings.push(`El documento imprime "Total Paneles ${printedTotal}" y el detalle suma ${detailPanels}. Revisa la lectura.`);
    }

    warnings.unshift('El Detalle de embarque no imprime ITEM ID: se propuso un código a partir del espesor. Confirma los ITEM ID antes de publicar.');

    return { items, packageRows, warnings, format: 'detalle' };
  }

  function parseDetalleHeader(text) {
    const header = {};
    const opLine = cleanText(text).match(/(?:^|\n)[ \t]*(?:OP[:\s-]*)?(\d{2}[A-Z]{2}\d{3,})[ \t]*(?:\n|$)/);
    if (opLine) header.op = opLine[1];
    return header;
  }

  /* ---------------- texto libre ---------------- */

  const THICKNESS_RE = /(\d+(?:[.,]\d+)?)\s*(mm|mms|mil[ií]metros?|pulg(?:adas)?|")/i;
  const ITEM_RE = /\b([A-Z]{0,4}[- ]?\d{6,14})\b/;

  function isTotalLine(line) {
    return /^(total|totales|subtotal|suma|gran total|ttal)\b/i.test(line.trim()) ||
      /\bgran\s+total\b/i.test(line);
  }

  function extractDescription(line, itemEnd, thickStart) {
    let chunk = line.slice(itemEnd, thickStart >= itemEnd ? thickStart : undefined);
    chunk = chunk.replace(/[|;]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!chunk) {
      const alpha = line.match(/[A-Za-zÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜ0-9 .\/-]{3,}/g);
      if (alpha) {
        const filtered = alpha.filter(t => !/^(item|espesor|cantidad|total|mm|pulg)$/i.test(t.trim()));
        if (filtered.length) chunk = filtered[0].trim();
      }
    }
    return chunk.slice(0, 90);
  }

  function parseLooseLines(text) {
    const items = [];
    const warnings = [];
    const skipped = [];
    const lines = cleanText(text).split('\n');

    lines.forEach((line, index) => {
      if (!line || line.length < 5) return;
      if (isTotalLine(line)) return;
      const itemMatch = line.match(ITEM_RE);
      if (!itemMatch) { skipped.push(line); return; }
      const thickMatch = THICKNESS_RE.exec(line);
      if (!thickMatch) { skipped.push(line); return; }

      const itemId = itemMatch[1].replace(/\s+/g, '');
      const itemStart = itemMatch.index;
      const itemEnd = itemMatch.index + itemMatch[0].length;
      const thickStart = thickMatch.index;
      const thickness = thicknessNumber(thickMatch[1] + (thickMatch[2] === '"' ? '' : ''));
      if (!thickness) { skipped.push(line); return; }

      const rest = line.slice(thickStart + thickMatch[0].length);
      const beforeThick = line.slice(0, thickStart);
      const tokens = [];
      const numberRe = /\d[\d.,]*/g;
      let m;
      while ((m = numberRe.exec(rest)) !== null) tokens.push({ raw: m[0], value: parseNumber(m[0]), index: m.index });
      const beforeTokens = [];
      const numberRe2 = /\d[\d.,]*/g;
      while ((m = numberRe2.exec(beforeThick)) !== null) {
        if (m.index >= itemStart && m.index < itemEnd) continue;
        beforeTokens.push({ raw: m[0], value: parseNumber(m[0]), index: m.index });
      }

      let qty = 0;
      const intTokens = tokens.filter(t => Number.isInteger(t.value) && t.value > 0 && t.value < 500000);
      if (intTokens.length) qty = intTokens[0].value;
      else if (beforeTokens.length) qty = beforeTokens[beforeTokens.length - 1].value;
      if (!qty) { skipped.push(line); return; }

      const decTokens = tokens.filter(t => !Number.isInteger(t.value));
      const description = extractDescription(line, itemEnd, thickStart);
      const existing = items.find(it => it.itemId === itemId && it.thickness === thickness);
      if (existing) existing.programmed += qty;
      else items.push({
        itemId,
        description,
        thickness,
        programmed: qty,
        pallets: 0,
        bf: decTokens[0] ? Math.round(decTokens[0].value) : 0,
        m3: decTokens[1] ? decTokens[1].value : 0,
        weight: 0
      });
      if (index > 400) return;
    });

    if (!items.length) warnings.push('No se reconoció ninguna fila con ITEM ID + espesor + cantidad. Revisa el texto o usa el ingreso manual.');
    if (skipped.length > items.length * 2 && items.length) {
      warnings.push(`Se ignoraron ${skipped.length} líneas que no parecían filas de producto. Verifica el resultado.`);
    }
    return { items, warnings, format: 'texto' };
  }

  function parseText(rawText) {
    const text = cleanText(rawText);
    if (!text.trim()) return { items: [], warnings: ['El texto está vacío.'], format: 'texto' };

    if (looksLikeDetalle(text)) {
      const detalle = parseDetalleEmbarque(text);
      if (detalle && detalle.items.length) {
        detalle.header = parseDetalleHeader(text);
        return detalle;
      }
    }

    const tally = parseTallyRows(text);
    if (tally && tally.items.length) {
      tally.header = parseTallyHeader(text);
      return tally;
    }

    const delimited = text.includes(',') || text.includes(';') || text.includes('\t') || text.includes('|')
      ? parseDelimited(text) : null;
    if (delimited && delimited.items.length) {
      if (/espesor|thick|cantidad|qty/i.test(text.split('\n')[0] || '')) return delimited;
    }

    const loose = parseLooseLines(text);
    if (loose.items.length) return loose;
    return delimited || loose;
  }

  /* ---------------- PDF ---------------- */

  function latin1(bytes) {
    let out = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return out;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    for (const format of ['deflate', 'deflate-raw']) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
        const buf = await new Response(stream).arrayBuffer();
        if (buf.byteLength) return new Uint8Array(buf);
      } catch (e) { /* probar el otro formato */ }
    }
    return null;
  }

  function decodePdfString(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch !== '\\') { out += ch; continue; }
      const next = raw[++i];
      if (next === undefined) break;
      switch (next) {
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case '(': out += '('; break;
        case ')': out += ')'; break;
        case '\\': out += '\\'; break;
        default:
          if (/[0-7]/.test(next)) {
            let oct = next;
            for (let k = 0; k < 2 && /[0-7]/.test(raw[i + 1]); k++) oct += raw[++i];
            out += String.fromCharCode(parseInt(oct, 8));
          } else out += next;
      }
    }
    return out;
  }

  function decodeHexString(raw) {
    const hex = raw.replace(/[^0-9A-Fa-f]/g, '');
    let out = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    if (out.charCodeAt(0) === 0xFE && out.charCodeAt(1) === 0xFF) {
      try {
        return new TextDecoder('utf-16be').decode(Uint8Array.from(out.slice(2), c => c.charCodeAt(0)));
      } catch (e) { /* noop */ }
    }
    return out;
  }

  /* ---------------- fuentes y mapa ToUnicode ---------------- */

  function hexToUnicode(hex) {
    const clean = String(hex || '').replace(/[^0-9A-Fa-f]/g, '');
    if (clean.length <= 2) return String.fromCharCode(parseInt(clean || '20', 16));
    let out = '';
    for (let i = 0; i + 3 < clean.length + 1; i += 4) {
      const unit = clean.substr(i, 4);
      if (unit.length < 4) break;
      out += String.fromCharCode(parseInt(unit, 16));
    }
    return out;
  }

  function parseCMap(text) {
    const map = new Map();
    const blocks = String(text || '').match(/beginbfchar[\s\S]*?endbfchar/g) || [];
    blocks.forEach(block => {
      const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let m;
      while ((m = re.exec(block)) !== null) map.set(parseInt(m[1], 16), hexToUnicode(m[2]));
    });
    const ranges = String(text || '').match(/beginbfrange[\s\S]*?endbfrange/g) || [];
    ranges.forEach(block => {
      const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        const from = parseInt(m[1], 16);
        const to = parseInt(m[2], 16);
        if (m[4]) {
          const base = m[4];
          const head = base.slice(0, Math.max(0, base.length - 4));
          const last = parseInt(base.slice(-4) || '0', 16);
          for (let code = from; code <= to && code - from < 4096; code++) {
            const unit = ((last + (code - from)) & 0xFFFF).toString(16).padStart(4, '0');
            map.set(code, hexToUnicode(head + unit));
          }
        } else if (m[5]) {
          const items = m[5].match(/<([0-9A-Fa-f]+)>/g) || [];
          items.forEach((item, i) => {
            const code = from + i;
            if (code <= to) map.set(code, hexToUnicode(item.slice(1, -1)));
          });
        }
      }
    });
    return map;
  }

  function streamBytesFromText(raw) {
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xFF;
    return out;
  }

  async function buildFontMaps(latin) {
    const objRe = /(\d+)\s+0\s+obj\b/g;
    const marks = [];
    let m;
    while ((m = objRe.exec(latin)) !== null) marks.push({ num: Number(m[1]), start: m.index, bodyStart: objRe.lastIndex });

    const bodies = new Map();
    marks.forEach((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : latin.length;
      bodies.set(mark.num, latin.slice(mark.bodyStart, end));
    });

    const fontToCMap = new Map();
    bodies.forEach((body, num) => {
      if (!/\/BaseFont|\/Type\s*\/Font/.test(body)) return;
      const tu = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (!tu) return;
      fontToCMap.set(num, { cmap: Number(tu[1]), composite: /\/Subtype\s*\/Type0/.test(body) });
    });

    const fonts = {};
    const dictRe = /\/Font\s*<<([\s\S]*?)>>/g;
    while ((m = dictRe.exec(latin)) !== null) {
      const pairRe = /\/([A-Za-z0-9#_.+-]+)\s+(\d+)\s+0\s+R/g;
      let p;
      while ((p = pairRe.exec(m[1])) !== null) {
        const info = fontToCMap.get(Number(p[2]));
        if (!info) continue;
        const name = p[1];
        if (fonts[name]) continue;
        const cmapBody = bodies.get(info.cmap) || '';
        const sIdx = cmapBody.indexOf('stream');
        if (sIdx === -1) continue;
        let s = sIdx + 6;
        if (cmapBody[s] === '\r') s++;
        if (cmapBody[s] === '\n') s++;
        const eIdx = cmapBody.indexOf('endstream', s);
        if (eIdx === -1) continue;
        let stop = eIdx;
        while (stop > s && /[\s\x00]/.test(cmapBody[stop - 1])) stop--;
        fonts[name] = {
          composite: info.composite,
          raw: cmapBody.slice(s, stop),
          compressed: /\/FlateDecode/.test(cmapBody.slice(0, sIdx))
        };
      }
    }

    for (const name of Object.keys(fonts)) {
      const font = fonts[name];
      let text = font.raw;
      if (font.compressed) {
        const inflated = await inflate(streamBytesFromText(font.raw));
        if (inflated) text = latin1(inflated);
        else console.warn('No se pudo inflar cmap de', name);
      }
      font.map = parseCMap(text);
    }
    return fonts;
  }

  function decodeRun(item, font) {
    const bytes = item.hex !== undefined
      ? (item.hex.replace(/[^0-9A-Fa-f]/g, '').match(/.{1,2}/g) || []).map(h => parseInt(h, 16))
      : Array.from(item.str || '', ch => ch.charCodeAt(0) & 0xFF);
    if (!font || !font.map || !font.map.size) return String.fromCharCode.apply(null, bytes);

    if (font.composite === false) {
      let out = '';
      bytes.forEach(code => { out += font.map.get(code) || String.fromCharCode(code); });
      return out;
    }

    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      out += font.map.get(code) || '';
    }
    if (bytes.length % 2) out += font.map.get(bytes[bytes.length - 1]) || '';
    return out;
  }

  function arrayText(raw, font) {
    const parts = [];
    const re = /\(((?:\\[\s\S]|[^()\\])*)\)|<([0-9A-Fa-f\s]*)>/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      parts.push(decodeRun(m[1] !== undefined ? { str: decodePdfString(m[1]) } : { hex: m[2] }, font));
    }
    return parts.join('');
  }

  /* Reconstruye el texto respetando la posición de cada fragmento. */
  function layoutFromContent(content, fonts) {
    const chunks = [];
    let stack = [];
    let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
    let font = null;
    let size = 10;

    const re = /\/([A-Za-z0-9#_.+-]+)|\(((?:\\[\s\S]|[^()\\])*)\)|<([0-9A-Fa-f\s]*)>|\[((?:\\.|[^\]\\])*)\]|(-?\d*\.?\d+)|([A-Za-z*'"]+)/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m[1] !== undefined) { stack.push({ name: m[1] }); continue; }
      if (m[2] !== undefined) { stack.push({ str: decodePdfString(m[2]) }); continue; }
      if (m[3] !== undefined) { stack.push({ hex: m[3] }); continue; }
      if (m[4] !== undefined) { stack.push({ arr: m[4] }); continue; }
      if (m[5] !== undefined) { stack.push({ num: parseFloat(m[5]) }); continue; }

      const op = m[6];
      const nums = stack.filter(t => t.num !== undefined).map(t => t.num);
      const textItem = stack.filter(t => t.str !== undefined || t.hex !== undefined).pop();

      if (op === 'BT') {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      } else if (op === 'Tf') {
        const named = stack.find(t => t.name !== undefined);
        if (named && fonts[named.name]) font = fonts[named.name];
        if (nums.length) size = nums[nums.length - 1] || size;
      } else if (op === 'Tm' && nums.length >= 6) {
        [a, b, c, d, e, f] = nums.slice(-6);
      } else if ((op === 'Td' || op === 'TD') && nums.length >= 2) {
        const tx = nums[nums.length - 2];
        const ty = nums[nums.length - 1];
        e = a * tx + c * ty + e;
        f = b * tx + d * ty + f;
      } else if (op === 'T*') {
        f = f - size * 1.2;
      } else if (op === 'Tj' && textItem) {
        chunks.push({ x: e, y: f, size, text: decodeRun(textItem, font) });
      } else if (op === 'TJ') {
        const arr = stack.find(t => t.arr !== undefined);
        if (arr) chunks.push({ x: e, y: f, size, text: arrayText(arr.arr, font) });
      } else if ((op === "'" || op === '"') && textItem) {
        f = f - size * 1.2;
        chunks.push({ x: e, y: f, size, text: decodeRun(textItem, font) });
      }
      stack = [];
    }

    chunks.sort((p, q) => (p.y - q.y) || (p.x - q.x));
    const lines = [];
    let current = null;
    chunks.forEach(chunk => {
      if (!chunk.text) return;
      const tolerance = Math.max(2, (chunk.size || 10) * 0.35);
      if (!current || Math.abs(chunk.y - current.y) > tolerance) {
        current = { y: chunk.y, items: [chunk] };
        lines.push(current);
      } else {
        current.items.push(chunk);
      }
    });

    function approxWidth(text, size) { return (text || '').length * (size || 10) * 0.55; }

    return lines.map(line => {
      const items = line.items.slice().sort((p, q) => p.x - q.x);
      let out = items[0].text || '';
      let prevX = items[0].x;
      let prevSize = items[0].size || 10;
      for (let i = 1; i < items.length; i++) {
        const it = items[i];
        const gap = it.x - (prevX + approxWidth(items[i - 1].text, prevSize));
        const spaceGap = (it.size || 10) * 0.45;
        out += (gap > spaceGap ? ' ' : '') + (it.text || '');
        prevX = it.x;
        prevSize = it.size || 10;
      }
      return out.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n');
  }

  function textFromContent(content) {
    let out = '';
    let lastWasNewline = false;
    const tokenRe = /\((?:\\[\s\S]|[^()\\])*\)|<[0-9A-Fa-f\s]+>|\bT[JjdDm*]|\bET\b|\bBT\b|\bTf\b|\bTd\b/g;
    let m;
    while ((m = tokenRe.exec(content)) !== null) {
      const token = m[0];
      if (token[0] === '(') {
        out += decodePdfString(token.slice(1, -1));
        lastWasNewline = false;
      } else if (token[0] === '<') {
        out += decodeHexString(token.slice(1, -1));
        lastWasNewline = false;
      } else if (token === 'Td' || token === 'TD' || token === 'T*' || token === 'ET' || token === 'BT' || token === 'Tm') {
        if (!lastWasNewline) { out += '\n'; lastWasNewline = true; }
      } else if (token === 'Tj' || token === 'TJ') {
        if (!lastWasNewline) out += ' ';
      }
    }
    return out;
  }

  async function extractPdf(buffer) {
    const bytes = new Uint8Array(buffer);
    const latin = latin1(bytes);

    let fonts = {};
    try { fonts = await buildFontMaps(latin); } catch (e) { /* fallback sin mapas de fuente */ }

    const streams = [];
    let idx = 0;
    while ((idx = latin.indexOf('stream', idx)) !== -1) {
      const before = latin.slice(Math.max(0, idx - 3), idx);
      if (before === 'end') { idx += 6; continue; }
      let start = idx + 6;
      if (latin[start] === '\r') start++;
      if (latin[start] === '\n') start++;
      const end = latin.indexOf('endstream', start);
      if (end === -1) break;
      let stop = end;
      while (stop > start && (bytes[stop - 1] === 0x0A || bytes[stop - 1] === 0x0D)) stop--;
      streams.push(bytes.subarray(start, stop));
      idx = end + 9;
    }

    const parts = [];
    const seen = new Set();
    for (const s of streams) {
      let candidate = null;
      const rawText = latin1(s);
      if (/BT[\s\S]{0,4000}(Tj|TJ)/.test(rawText)) candidate = rawText;
      else {
        const inf = await inflate(s);
        if (inf) {
          const t = latin1(inf);
          if (/BT[\s\S]{0,4000}(Tj|TJ)/.test(t)) candidate = t;
        }
      }
      if (!candidate) continue;
      const text = (Object.keys(fonts).length ? layoutFromContent(candidate, fonts) : textFromContent(candidate));
      const key = text.slice(0, 200) + text.length;
      if (text.trim() && !seen.has(key)) { seen.add(key); parts.push(text); }
    }

    const text = cleanText(parts.join('\n'));
    return { text, pages: parts.length };
  }

  async function readFile(file) {
    const name = (file.name || '').toLowerCase();
    const warnings = [];
    let text = '';

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      let buffer;
      try { buffer = await file.arrayBuffer(); }
      catch (e) { return { items: [], text: '', warnings: ['No se pudo leer el archivo PDF.'], format: 'pdf' }; }

      try {
        const result = await extractPdf(buffer);
        text = result.text;
      } catch (e) {
        console.warn('Error extrayendo PDF', e);
        warnings.push('No se pudo extraer el texto del PDF automáticamente. Puedes pegar el texto o ingresar los datos manualmente.');
      }

      if (!text.trim()) {
        warnings.push('El PDF no contiene texto seleccionable (posible escaneo). Usa el pegado de texto o el ingreso manual; el archivo quedará adjunto como respaldo.');
        return { items: [], text: '', warnings, format: 'pdf' };
      }

      const letters = (text.match(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g) || []).length;
      if (letters / Math.max(1, text.length) < 0.12) {
        warnings.push('El texto del PDF parece usar una codificación de fuente especial. Verifica el texto extraído o ingresa los datos manualmente.');
      }
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv') || (file.type || '').startsWith('text/')) {
      text = await file.text();
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return {
        items: [], text: '',
        warnings: ['Para Excel, exporta el TALLY SHEET como CSV y vuelve a cargarlo, o pega el texto.'],
        format: 'excel'
      };
    } else {
      return { items: [], text: '', warnings: ['Formato no compatible. Usa PDF, CSV, TXT o ingreso manual.'], format: 'otro' };
    }

    const parsed = parseText(text);
    return {
      items: parsed.items,
      packageRows: parsed.packageRows || [],
      header: parsed.header || (parsed.format === 'tally' ? parseTallyHeader(text) : {}),
      text,
      warnings: warnings.concat(parsed.warnings || []),
      format: parsed.format
    };
  }

  window.Tally = { readFile, parseText, parseDelimited, parseLooseLines, parseNumber, cleanText, thicknessNumber, parseDetalleEmbarque, detalleItemId };
})();
