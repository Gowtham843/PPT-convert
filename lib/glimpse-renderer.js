/**
 * pptx-glimpse SVG renderer — Phase 2 with editor session object mapping.
 */

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { buildObjectMap, annotateSvgWithObjectMap } = require('./object-mapper');
const { buildLayeredSvg } = require('./ppt-layers');

const GLIMPSE_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../node_modules/pptx-glimpse/package.json'), 'utf8')
).version;

function slideNeedsPngFallback(coverage, slideFeatures) {
  if (slideFeatures?.renderHints?.tableHtml) return false;
  if (slideFeatures?.hasTable && !slideFeatures?.renderHints?.tableHtml) return true;
  if (slideFeatures?.hasChart && !slideFeatures?.renderHints?.chartSvg) return true;

  if (coverage) {
    if ((coverage.skippedElements || 0) > 0) return true;
    if ((coverage.unresolvedElements || 0) > 0) return true;
    // fallbackElements = internal glimpse blip/SVG substitutes; not a PNG trigger if output is complete
    return false;
  }

  return true;
}

async function renderPptxToSvgs(pptxPath, svgDir, features, pptLayers = null) {
  const { convertPptxToSvg, createPptxEditorSession } = await import('pptx-glimpse');
  const buf = fs.readFileSync(pptxPath);
  const inputSize = buf.length;
  const t0 = Date.now();
  const [report, session] = await Promise.all([
    convertPptxToSvg(buf),
    createPptxEditorSession(buf),
  ]);
  const svgGenerationMs = Date.now() - t0;

  fse.ensureDirSync(svgDir);
  const coverageBySlide = new Map();
  for (const c of report.supportCoverage?.slides || report.supportCoverage || []) {
    coverageBySlide.set(c.slideNumber, c);
  }

  const slides = [];
  let totalSvgBytes = 0;

  for (const item of report.slides || []) {
    const idx = item.slideNumber;
    const file = `slide-${String(idx).padStart(3, '0')}.svg`;
    const feat = features.slides?.[idx - 1];
    const coverage = coverageBySlide.get(idx) || null;

    const glimpseShapes = session.shapes(idx) || [];
    const objectMap = buildObjectMap(glimpseShapes, feat?.shapes);
    if (feat) feat.objectMap = objectMap;

    let svg = item.svg || '';
    svg = annotateSvgWithObjectMap(svg, objectMap);
    const layered =
      pptLayers &&
      buildLayeredSvg(pptLayers, idx, parseViewBoxWidth(svg) || 960, parseViewBoxHeight(svg) || 540, objectMap);
    if (layered) svg = layered;

    const outPath = path.join(svgDir, file);
    fs.writeFileSync(outPath, svg);
    totalSvgBytes += Buffer.byteLength(svg);

    const needsFallback = !layered && slideNeedsPngFallback(coverage, feat);
    slides.push({
      index: idx,
      file,
      path: `svg/${file}`,
      width: parseViewBoxWidth(svg) || 960,
      height: parseViewBoxHeight(svg) || 720,
      coverage,
      objectMap,
      needsPngFallback: needsFallback,
      fallbackReason: needsFallback
        ? feat?.renderHints?.pngFallbackReason ||
          (feat?.hasTable ? 'table detected' : feat?.hasChart ? 'chart detected' : 'glimpse coverage incomplete')
        : null,
    });
  }

  return {
    glimpseVersion: GLIMPSE_VERSION,
    slideCount: slides.length,
    slides,
    svgGenerationMs,
    inputSizeBytes: inputSize,
    totalSvgBytes,
    supportCoverage: report.supportCoverage,
    diagnostics: report.diagnostics || null,
  };
}

function parseViewBoxSize(svg) {
  const m = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/);
  if (m) return { width: parseFloat(m[3]), height: parseFloat(m[4]) };
  const w = svg.match(/\bwidth="([\d.]+)"/);
  const h = svg.match(/\bheight="([\d.]+)"/);
  if (w && h) return { width: parseFloat(w[1]), height: parseFloat(h[1]) };
  return null;
}

function parseViewBoxWidth(svg) {
  return parseViewBoxSize(svg)?.width ?? null;
}

function parseViewBoxHeight(svg) {
  return parseViewBoxSize(svg)?.height ?? null;
}

function annotateSvgWithShapeIds(svg, shapes) {
  const objectMap = (shapes || []).map((s, i) => ({
    pptxId: String(s.id),
    name: s.name,
    nameIndex: i,
    duplicateName: false,
  }));
  return annotateSvgWithObjectMap(svg, objectMap);
}

module.exports = {
  GLIMPSE_VERSION,
  renderPptxToSvgs,
  annotateSvgWithShapeIds,
  annotateSvgWithObjectMap,
  slideNeedsPngFallback,
};
