/**
 * Phase 2: SmartArt / diagram detection (per-slide only).
 */

const fs = require('fs');
const path = require('path');

function detectSmartArt(extractDir, slideXml, rels) {
  const slideHasDgm = /<dgm:relIds\b/.test(slideXml);
  const hasDiagramRel = Object.values(rels || {}).some(
    (r) =>
      (r.type || '').toLowerCase().includes('diagram') ||
      (r.target || '').includes('diagrams/')
  );
  const hasContentPartDiagram =
    /<p:contentPart\b/.test(slideXml) &&
    (/<dgm:/.test(slideXml) || hasDiagramRel);

  const detected = slideHasDgm || hasDiagramRel || hasContentPartDiagram;

  return {
    detected,
    hasDiagramRel,
    slideHasDgm,
    recommendation: detected
      ? 'SmartArt on this slide — PNG fallback only if SVG coverage fails'
      : null,
  };
}

module.exports = { detectSmartArt };
