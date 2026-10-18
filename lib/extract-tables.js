/**
 * Phase 2: Extract tables from slide OOXML → HTML representation.
 */

const { parseAttrs, emuToPct } = require('./ooxml-utils');

function extractCellText(cellBlock) {
  const parts = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let m;
  while ((m = re.exec(cellBlock))) {
    parts.push(
      m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    );
  }
  return parts.join('\n').trim();
}

function extractCellFill(cellBlock) {
  const srgb = cellBlock.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);
  if (srgb) return `#${srgb[1]}`;
  return null;
}

function extractTables(slideXml, slideW, slideH) {
  const tables = [];
  const tblRe = /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g;
  let m;
  while ((m = tblRe.exec(slideXml))) {
    const block = m[0];
    if (!/<a:tbl[\s>]/.test(block)) continue;

    const id = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'id') || String(tables.length + 1);
    const name = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'name') || `Table ${id}`;
    const xfrm = {
      x: parseAttrs(block.match(/<a:off\b[^>]*>/)?.[0] || '', 'x'),
      y: parseAttrs(block.match(/<a:off\b[^>]*>/)?.[0] || '', 'y'),
      cx: parseAttrs(block.match(/<a:ext\b[^>]*>/)?.[0] || '', 'cx'),
      cy: parseAttrs(block.match(/<a:ext\b[^>]*>/)?.[0] || '', 'cy'),
    };

    const rows = [];
    const rowRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
    let rm;
    while ((rm = rowRe.exec(block))) {
      const rowBlock = rm[0];
      const cells = [];
      const cellRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
      let cm;
      while ((cm = cellRe.exec(rowBlock))) {
        const cellBlock = cm[0];
        const gridSpan = parseAttrs(cellBlock, 'gridSpan');
        cells.push({
          text: extractCellText(cellBlock),
          colSpan: gridSpan ? Number(gridSpan) : 1,
          fill: extractCellFill(cellBlock),
          align: parseAttrs(cellBlock.match(/<a:pPr\b[^>]*>/)?.[0] || '', 'algn') || 'l',
        });
      }
      rows.push({ cells });
    }

    tables.push({
      id: String(id),
      name,
      rows,
      rowCount: rows.length,
      colCount: rows[0]?.cells?.length || 0,
      leftPct: xfrm.x != null ? emuToPct(xfrm.x, slideW) : 10,
      topPct: xfrm.y != null ? emuToPct(xfrm.y, slideH) : 20,
      widthPct: xfrm.cx != null ? emuToPct(xfrm.cx, slideW) : 80,
      heightPct: xfrm.cy != null ? emuToPct(xfrm.cy, slideH) : 40,
    });
  }

  return tables;
}

function renderTableHtml(table) {
  const alignMap = { ctr: 'center', r: 'right', l: 'left' };
  let html = `<table class="ppt-table" style="width:100%;height:100%;border-collapse:collapse;font-size:12px;">`;
  for (const row of table.rows) {
    html += '<tr>';
    for (const cell of row.cells) {
      const bg = cell.fill ? `background:${cell.fill};` : '';
      const align = alignMap[cell.align] || 'left';
      html += `<td colspan="${cell.colSpan}" style="border:1px solid #888;padding:4px;text-align:${align};${bg}">${escapeHtml(cell.text)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { extractTables, renderTableHtml };
