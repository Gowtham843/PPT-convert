/**
 * Phase 2: Map OOXML shape IDs to SVG elements using glimpse session + aria-label index.
 */

/**
 * Build object map for one slide from glimpse shapes() + OOXML shapes.
 * @returns {Array<{pptxId,name,svgSelector,orderingSlot,kind}>}
 */
function buildObjectMap(glimpseShapes, ooxmlShapes) {
  const byId = new Map((ooxmlShapes || []).map((s) => [String(s.id), s]));
  const nameCounts = new Map();

  for (const sh of glimpseShapes || []) {
    const n = sh.name || '';
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }

  const nameSeen = new Map();
  return (glimpseShapes || []).map((sh) => {
    const pptxId = String(sh.id);
    const name = sh.name || '';
    const idx = nameSeen.get(name) || 0;
    nameSeen.set(name, idx + 1);

    const duplicateName = (nameCounts.get(name) || 0) > 1;
    const svgSelector = duplicateName
      ? `[data-sp-id="${pptxId}"][data-sp-idx="${idx}"]`
      : `[data-sp-id="${pptxId}"]`;

    const oo = byId.get(pptxId);
    return {
      pptxId,
      name,
      svgId: `sp-${pptxId}`,
      svgSelector,
      orderingSlot: sh.handle?.orderingSlot ?? idx,
      kind: sh.kind || oo?.kind || 'shape',
      bounds: sh.bounds || null,
      duplicateName,
      nameIndex: idx,
    };
  });
}

/**
 * Annotate SVG with data-sp-id and data-sp-idx for reliable targeting.
 */
function annotateSvgWithObjectMap(svg, objectMap) {
  let out = svg;
  const byName = new Map();
  for (const obj of objectMap) {
    if (!obj.name) continue;
    if (!byName.has(obj.name)) byName.set(obj.name, []);
    byName.get(obj.name).push(obj);
  }

  for (const obj of objectMap) {
    if (!obj.name || !obj.pptxId) continue;
    const label = obj.name.replace(/"/g, '&quot;');
    const needle = `aria-label="${label}"`;
    if (!out.includes(needle)) continue;

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<g[^>]*?)${escaped}`, 'g');
    let matchIdx = 0;
    out = out.replace(re, (full, prefix) => {
      const idx = obj.duplicateName ? obj.nameIndex : 0;
      if (obj.duplicateName && matchIdx !== idx) {
        matchIdx++;
        return full;
      }
      matchIdx++;
      return `${prefix} data-sp-id="${obj.pptxId}" data-sp-idx="${idx}" ${needle}`;
    });
  }

  // Fallback: unmatched ids still get data-sp-id only via OOXML if glimpse missed name
  for (const obj of objectMap) {
    const idNeedle = `data-sp-id="${obj.pptxId}"`;
    if (out.includes(idNeedle)) continue;
    const label = (obj.name || '').replace(/"/g, '&quot;');
    if (!label) continue;
    const needle = `aria-label="${label}"`;
    if (!out.includes(needle)) continue;
    out = out.replace(
      new RegExp(`(<g[^>]*?)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, ''),
      `$1 data-sp-id="${obj.pptxId}" data-sp-idx="${obj.nameIndex || 0}" ${needle}`
    );
  }

  return out;
}

module.exports = { buildObjectMap, annotateSvgWithObjectMap };
