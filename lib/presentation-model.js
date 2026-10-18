/**
 * Build Phase 1 presentation.json from glimpse SVG + OOXML features.
 */

const { GLIMPSE_VERSION } = require('./glimpse-renderer');
const { buildScheduledSteps, getInitialHiddenIds, clickStepDuration } = require('./animation-engine');
const { normalizeSlideMedia } = require('./media-engine');
const { renderTableHtml } = require('./extract-tables');
const { renderChartSvg } = require('./extract-charts');

const REF_WIDTH = 960;

function mediaObjects(slide) {
  return normalizeSlideMedia({ ...slide, media: slide.media || [] });
}

function normalizeObjects(shapes, objectMap) {
  return (shapes || []).map((s, i) => {
    const map = (objectMap || []).find((m) => m.pptxId === String(s.id));
    return {
      id: String(s.id),
      name: s.name,
      type:
        s.kind === 'image'
          ? 'image'
          : s.text
            ? 'text'
            : s.kind === 'video'
              ? 'video'
              : s.kind === 'audio'
                ? 'audio'
                : s.kind === 'group'
                  ? 'group'
                  : 'shape',
      text: s.text || null,
      src: s.src || null,
      fill: s.fill || null,
      fontSize: s.fontSizePt || null,
      xPct: s.leftPct,
      yPct: s.topPct,
      widthPct: s.widthPct,
      heightPct: s.heightPct,
      rotation: s.rotation || null,
      zOrder: map?.orderingSlot ?? i,
      svgSelector: map?.svgSelector || `[data-sp-id="${s.id}"]`,
      visible: true,
    };
  });
}

function animationMeta(slide) {
  return (slide.animations || []).map((a) => ({
    objectId: a.objectId,
    effect: a.effect,
    start: a.start,
    duration: a.duration || 500,
    delay: a.delay || 0,
    order: a.order,
    supported: !!a.supported,
    motion: a.motion || null,
  }));
}

function buildPhase1Presentation(features, glimpseResult, pngResult, performance) {
  const slides = (features.slides || []).map((feat, i) => {
    const g = glimpseResult.slides[i];
    const pngFile = pngResult?.slides?.[i] || null;
    const useSvg = g && !g.needsPngFallback;
    const renderer = useSvg ? 'svg' : 'png-fallback';
    const pngPath = pngFile ? `slides/${pngFile}` : null;
    const svgPath = g ? g.path : null;

    return {
      index: feat.index || i + 1,
      renderer,
      svg: svgPath,
      png: pngPath,
      width: g?.width || pngResult?.width || REF_WIDTH,
      height: g?.height || pngResult?.height || 720,
      background: feat.background || '#FFFFFF',
      transition: {
        type: feat.transition?.supported ? feat.transition.type : 'none',
        speed: feat.transition?.speed || 'med',
        supported: ['none', 'fade', 'push', 'wipe'].includes(feat.transition?.type || 'none'),
      },
      animations: animationMeta(feat),
      media: mediaObjects(feat),
      objects: normalizeObjects(feat.shapes, g?.objectMap),
      fallback: {
        required: !useSvg,
        reason: g?.fallbackReason || (feat.hasTable ? 'table' : feat.hasChart ? 'chart' : null),
        png: pngPath,
        svg: svgPath,
      },
      coverage: g?.coverage || null,
    };
  });

  return {
    schema: 'ppt-converter.presentation.phase1',
    source: features.originalFile,
    generatedAt: new Date().toISOString(),
    renderer: {
      primary: 'pptx-glimpse',
      glimpseVersion: glimpseResult.glimpseVersion || GLIMPSE_VERSION,
      fallback: 'libreoffice-pdf-png',
      note: 'Phase 1 — not iSpring equivalent unless tested against iSpring export',
    },
    slideSize: {
      widthPx: glimpseResult.slides[0]?.width || REF_WIDTH,
      heightPx: glimpseResult.slides[0]?.height || 720,
      widthEmu: features.slideWidthEmu,
      heightEmu: features.slideHeightEmu,
    },
    performance,
    slides,
    stats: {
      slideCount: slides.length,
      svgSlideCount: slides.filter((s) => s.renderer === 'svg').length,
      pngFallbackSlideCount: slides.filter((s) => s.renderer === 'png-fallback').length,
    },
  };
}

function buildPhase2Presentation(features, glimpseResult, pngResult, performance) {
  const base = buildPhase1Presentation(features, glimpseResult, pngResult, performance);
  const slides = base.slides.map((s, i) => {
    const feat = features.slides[i];
    const g = glimpseResult.slides[i];
    const { timeline, clickSteps, objectClickSteps } = buildScheduledSteps(feat?.timeline || []);
    const hiddenIds = getInitialHiddenIds(timeline);

    const tableOverlays = (feat?.tables || [])
      .filter(() => feat?.renderHints?.tableHtml)
      .map((t) => ({
        id: t.id,
        html: renderTableHtml(t),
        xPct: t.leftPct,
        yPct: t.topPct,
        widthPct: t.widthPct,
        heightPct: t.heightPct,
      }));

    const chartOverlays = (feat?.charts || [])
      .filter((c) => c.renderable && feat?.renderHints?.chartSvg)
      .map((c) => ({
        id: c.id,
        type: c.type,
        svg: renderChartSvg(c),
        xPct: c.leftPct,
        yPct: c.topPct,
        widthPct: c.widthPct,
        heightPct: c.heightPct,
      }));

    return {
      ...s,
      transition: feat?.transition || s.transition,
      timeline,
      clickSteps,
      objectClickSteps,
      clickStepDurationMs: clickSteps.map((b) => clickStepDuration(b)),
      hiddenOnLoad: hiddenIds,
      objectMap: g?.objectMap || feat?.objectMap || [],
      tables: tableOverlays,
      charts: chartOverlays,
      smartArt: feat?.smartArt || null,
      fonts: feat?.fonts || [],
      renderHints: feat?.renderHints || null,
    };
  });

  return {
    ...base,
    schema: 'ppt-converter.presentation.phase2',
    phase: 2,
    theme: features.theme || null,
    renderer: {
      ...base.renderer,
      note: 'Phase 2 — fidelity research POC; not iSpring equivalent unless verified',
    },
    slides,
  };
}

module.exports = { buildPhase1Presentation, buildPhase2Presentation };
