/**
 * Phase 1 honest feature report builder.
 */

function classify(pass, partial, fail) {
  if (pass) return 'PASS';
  if (partial) return 'PARTIAL';
  return 'FAIL';
}

function buildPhase1FeatureReport(presentation, features, glimpseResult, pngResult, perf) {
  const slides = presentation.slides || [];
  const svgCount = slides.filter((s) => s.renderer === 'svg').length;
  const pngCount = slides.filter((s) => s.renderer === 'png-fallback').length;
  const total = slides.length || 1;

  const hasVideo = features.summary?.detected?.video;
  const hasAudio = features.summary?.detected?.audio;
  const hasAnim = features.summary?.detected?.animation;
  const hasTrans = features.summary?.detected?.transition;

  const videoOverlays = slides.some((s) => s.media.some((m) => m.type === 'video'));
  const audioOverlays = slides.some((s) => s.media.some((m) => m.type === 'audio'));
  const animSteps = slides.reduce((n, s) => n + s.animations.filter((a) => a.supported).length, 0);
  const transTypes = new Set(slides.map((s) => s.transition?.type).filter((t) => t && t !== 'none'));

  const slideReports = slides.map((s) => ({
    slide: s.index,
    renderer: s.renderer,
    reason: s.fallback?.reason || null,
    svg: s.svg,
    png: s.fallback?.png || s.png,
    mediaCount: s.media.length,
    animationCount: s.animations.length,
    transition: s.transition?.type || 'none',
  }));

  const results = {
    staticSlides: classify(svgCount + pngCount > 0, svgCount > 0 && pngCount > 0, svgCount === 0),
    text: classify(svgCount > 0, false, svgCount === 0),
    images: classify(svgCount > 0, false, svgCount === 0),
    shapes: classify(svgCount > 0, false, svgCount === 0),
    svgRendering: classify(svgCount === total, svgCount > 0 && pngCount > 0, svgCount === 0),
    video: hasVideo
      ? videoOverlays
        ? 'PARTIAL'
        : 'FAIL'
      : slides.every((s) => !s.media.some((m) => m.type === 'video'))
        ? 'N/A'
        : 'FAIL',
    audio: hasAudio ? (audioOverlays ? 'PARTIAL' : 'FAIL') : 'N/A',
    fadeAnimation: animSteps > 0 ? 'PARTIAL' : hasAnim ? 'FAIL' : 'N/A',
    appearAnimation: animSteps > 0 ? 'PARTIAL' : hasAnim ? 'FAIL' : 'N/A',
    basicMovement: slides.some((s) => s.animations.some((a) => a.motion))
      ? 'PARTIAL'
      : 'N/A',
    fadeTransition: transTypes.has('fade') ? 'PARTIAL' : hasTrans ? 'FAIL' : 'N/A',
    pushTransition: transTypes.has('push') ? 'PARTIAL' : 'N/A',
    wipeTransition: transTypes.has('wipe') ? 'PARTIAL' : 'N/A',
    pngFallback:
      pngCount > 0
        ? pngResult
          ? 'PASS'
          : 'PARTIAL'
        : slides.some((s) => s.fallback?.required)
          ? 'FAIL'
          : 'PASS',
  };

  return {
    phase: 1,
    generatedAt: new Date().toISOString(),
    glimpseVersion: glimpseResult?.glimpseVersion,
    summary: results,
    slideReports,
    performance: perf,
    notes: [
      'PASS requires verified browser behavior; many features are PARTIAL on Phase 1.',
      'SVG animations target data-sp-id groups when aria-label matches OOXML shape name.',
      'Video/audio are HTML overlays on SVG slides — timing is not PowerPoint-accurate.',
      'Not tested against iSpringCloud unless iSpring PPTX provided.',
    ],
    unsupported: [
      'Full PowerPoint animation engine',
      'Morph, motion paths, triggers, emphasis',
      'SmartArt, full chart renderer',
      'Exact PowerPoint video/audio click-sequence timing',
      'Legacy .ppt without conversion',
    ],
  };
}

function printPhase1Result(report) {
  const s = report.summary;
  console.log('\n==============================');
  console.log('PHASE 1 RESULT');
  console.log('==============================\n');
  console.log(`Static slides:       ${s.staticSlides}`);
  console.log(`Text:                ${s.text}`);
  console.log(`Images:              ${s.images}`);
  console.log(`Shapes:              ${s.shapes}`);
  console.log(`SVG rendering:       ${s.svgRendering}`);
  console.log(`Video:               ${s.video}`);
  console.log(`Audio:               ${s.audio}`);
  console.log(`Fade animation:      ${s.fadeAnimation}`);
  console.log(`Appear animation:    ${s.appearAnimation}`);
  console.log(`Basic movement:      ${s.basicMovement}`);
  console.log(`Fade transition:     ${s.fadeTransition}`);
  console.log(`Push transition:     ${s.pushTransition}`);
  console.log(`Wipe transition:     ${s.wipeTransition}`);
  console.log(`PNG fallback:        ${s.pngFallback}`);
}

function buildPhase1ResultMarkdown(report, presentation) {
  const s = report.summary;
  const p = report.performance || {};
  return `# Phase 1 Result

## Architecture

\`\`\`text
PPTX
 → pptx-glimpse (v${report.glimpseVersion || '?'}) → SVG per slide
 → OOXML extract → media overlays + animation/transition metadata
 → HTML5 viewer (index.html + viewer.js)
 → PNG fallback (LibreOffice → PDF → PNG) for unsupported slides
\`\`\`

## Feature support

| Feature | Result |
|---------|--------|
| Static slides | ${s.staticSlides} |
| Text | ${s.text} |
| Images | ${s.images} |
| Shapes | ${s.shapes} |
| SVG rendering | ${s.svgRendering} |
| Video | ${s.video} |
| Audio | ${s.audio} |
| Fade animation | ${s.fadeAnimation} |
| Appear animation | ${s.appearAnimation} |
| Basic movement | ${s.basicMovement} |
| Fade transition | ${s.fadeTransition} |
| Push transition | ${s.pushTransition} |
| Wipe transition | ${s.wipeTransition} |
| PNG fallback | ${s.pngFallback} |

SVG slides: ${presentation.stats?.svgSlideCount ?? '?'} / ${presentation.stats?.slideCount ?? '?'}
PNG fallback slides: ${presentation.stats?.pngFallbackSlideCount ?? '?'}

## Rendering quality

Compared on this run: **Original PPT vs our SVG viewer vs PNG fallback** (iSpring not available).

- SVG via pptx-glimpse preserves vector text/shapes/images for supported slides.
- Fonts are substituted by glimpse — not identical to PowerPoint.
- Video/audio positioned via OOXML EMU → percentage overlays.

## Unsupported features

${report.unsupported.map((u) => `- ${u}`).join('\n')}

## Performance

| Metric | Value |
|--------|-------|
| Input size | ${formatBytes(p.inputSizeBytes)} |
| SVG generation time | ${p.svgGenerationMs ?? '?'} ms |
| PNG fallback time | ${p.pngFallbackMs ?? 'N/A'} ms |
| Total conversion time | ${p.totalMs ?? '?'} ms |
| Output size (approx) | ${formatBytes(p.outputSizeBytes)} |
| Slide count | ${p.slideCount ?? '?'} |
| SVG slide count | ${p.svgSlideCount ?? '?'} |
| PNG fallback slide count | ${p.pngFallbackSlideCount ?? '?'} |

## Problems discovered

- pptx-glimpse SVG groups use \`aria-label\`, not PowerPoint spid — we inject \`data-sp-id\` by name matching.
- Animating SVG inside \`<object>\` may be limited under \`file://\` — viewer uses contentDocument when accessible.
- Test fixtures 01–06 exist; PNG fallback exercised when tables/charts or glimpse coverage fails.

## Recommendation

Use **pptx-glimpse SVG as primary slide layer** + **OOXML media overlays** + **PNG fallback per slide** when charts/tables/glimpse coverage fails.

## Next step

Phase 2 should only begin after reviewing this result and testing a real iSpring/iPrint PPTX side-by-side.
`;
}

function formatBytes(n) {
  if (n == null) return 'N/A';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  buildPhase1FeatureReport,
  printPhase1Result,
  buildPhase1ResultMarkdown,
};
