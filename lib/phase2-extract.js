/**
 * Phase 2 OOXML extraction — extends Phase 1 features with timeline, tables, charts, theme.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const os = require('os');
const { extractPptxFeatures } = require('./extract-pptx');
const { parseSlideTimeline } = require('./timeline-parser');
const { detectTransition } = require('./transition-engine');
const { extractTables } = require('./extract-tables');
const { extractSlideCharts } = require('./extract-charts');
const { readTheme, extractSlideFonts } = require('./extract-theme');
const { detectSmartArt } = require('./extract-smartart');

function parseRelsLocal(relsPath) {
  if (!fs.existsSync(relsPath)) return {};
  const xml = fs.readFileSync(relsPath, 'utf8');
  const map = {};
  const re = /<Relationship\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const id = tag.match(/Id="([^"]*)"/)?.[1];
    const type = tag.match(/Type="([^"]*)"/)?.[1] || '';
    const target = tag.match(/Target="([^"]*)"/)?.[1];
    if (id && target) map[id] = { type, target: target.replace(/\\/g, '/') };
  }
  return map;
}

function enrichMediaTiming(slideXml, media) {
  return (media || []).map((m) => {
    const blockRe = new RegExp(`<p:video|<p:audio|<p:media[^>]*>[\\s\\S]*?spid="${m.objectId}"`, 'i');
    const hasMediaNode = blockRe.test(slideXml);
    const mute = /<p:video\b[^>]*mute="1"/.test(slideXml) || false;
    return {
      ...m,
      muted: mute,
      hideDuringShow: false,
      endAfterSlide: false,
      timelineLinked: hasMediaNode,
    };
  });
}

function extractPhase2Features(pptxPath, outputDir) {
  const base = extractPptxFeatures(pptxPath, outputDir);
  if (!base.slides?.length) return { ...base, phase: 2, theme: null };

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-p2-'));
  try {
    execFileSync('unzip', ['-qq', '-o', pptxPath, '-d', extractDir], { stdio: 'pipe' });
    const theme = readTheme(extractDir);
    const slideW = base.slideWidthEmu;
    const slideH = base.slideHeightEmu;

    const slides = base.slides.map((slide) => {
      const slidePath = path.join(extractDir, 'ppt', 'slides', slide.file);
      const relsPath = path.join(extractDir, 'ppt', 'slides', '_rels', `${slide.file}.rels`);
      const xml = fs.readFileSync(slidePath, 'utf8');
      const rels = parseRelsLocal(relsPath);

      const timeline = parseSlideTimeline(xml);
      const transition = detectTransition(xml);
      const tables = extractTables(xml, slideW, slideH);
      const charts = extractSlideCharts(xml, rels, extractDir, slideW, slideH);
      const smartArt = detectSmartArt(extractDir, xml, rels);
      const fonts = extractSlideFonts(xml);

      const tableRenderable = tables.length > 0 && tables.every((t) => t.rowCount > 0);
      const chartRenderable = charts.some((c) => c.renderable);
      const useTableHtml = tableRenderable && !smartArt.detected;
      const useChartSvg = chartRenderable && !smartArt.detected;

      return {
        ...slide,
        timeline,
        transition,
        tables,
        charts,
        smartArt,
        fonts,
        media: enrichMediaTiming(xml, slide.media),
        objectMap: null,
        renderHints: {
          tableHtml: useTableHtml,
          chartSvg: useChartSvg,
          smartArtOnSlide: smartArt.detected,
          pngFallbackReason:
            tables.length && !useTableHtml
              ? 'table-complex'
              : charts.length && !useChartSvg
                ? 'chart-complex'
                : null,
        },
      };
    });

    const enriched = {
      ...base,
      phase: 2,
      theme,
      slides,
      summary: {
        ...base.summary,
        detected: {
          ...base.summary.detected,
          tables: slides.some((s) => s.tables?.length),
          charts: slides.some((s) => s.charts?.length),
          smartArt: slides.some((s) => s.smartArt?.detected),
          fonts: !!theme || slides.some((s) => s.fonts?.length),
        },
      },
    };

    fs.writeFileSync(path.join(outputDir, 'timelines.json'), JSON.stringify(
      slides.map((s) => ({ slide: s.index, timeline: s.timeline, transition: s.transition })),
      null,
      2
    ));
    fs.writeFileSync(path.join(outputDir, 'object-map.json'), JSON.stringify(
      slides.map((s) => ({ slide: s.index, objects: s.objectMap || [] })),
      null,
      2
    ));

    return enriched;
  } finally {
    try {
      fse.removeSync(extractDir);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { extractPhase2Features };
