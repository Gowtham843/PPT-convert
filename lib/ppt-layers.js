/**
 * Option C: build a slide SVG from PowerPoint-drawn images
 * (made by windows/export-pptx-layers.ps1).
 * Background = slide with animated shapes hidden. Each animated shape is its own
 * image inside <g data-sp-id>, so the existing animation runtime targets it unchanged.
 */
const fs = require('fs');
const path = require('path');

const PX_TO_PT = 0.75; // Shape.Export writes PNG at 96 dpi

function loadPptLayers(dir) {
  const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, '');
  return { ...JSON.parse(raw), dir };
}

function dataUri(dir, file) {
  return `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
}

function buildLayeredSvg(layers, slideNo, vbW, vbH, objectMap) {
  const s = (layers.slides || []).find((x) => x.index === slideNo);
  if (!s) return null;
  const k = vbW / layers.slideWidthPt;
  const parts = [`<image x="0" y="0" width="${vbW}" height="${vbH}" href="${dataUri(layers.dir, s.background)}"/>`];
  for (const l of s.layers || []) {
    // Export may add margin for shadow/outline, so centre the image on the shape.
    const w = l.imgW * PX_TO_PT * k;
    const h = l.imgH * PX_TO_PT * k;
    const x = (l.left + l.width / 2) * k - w / 2;
    const y = (l.top + l.height / 2) * k - h / 2;
    const idx = (objectMap || []).find((o) => o.pptxId === String(l.id))?.nameIndex ?? 0;
    parts.push(
      `<g data-sp-id="${l.id}" data-sp-idx="${idx}"><image x="${x}" y="${y}" width="${w}" height="${h}" href="${dataUri(layers.dir, l.file)}"/></g>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">${parts.join('')}</svg>`;
}

module.exports = { loadPptLayers, buildLayeredSvg };
