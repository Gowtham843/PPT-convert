/**
 * Phase 2 fidelity report + scoring (honest — not from XML detection alone).
 */

function classify(pass, partial) {
  if (pass) return 'PASS';
  if (partial) return 'PARTIAL';
  return 'FAIL';
}

function effectPresent(timeline, effects) {
  return (timeline || []).some((t) => effects.includes(t.effect));
}

function buildPhase2FeatureReport(presentation, features, glimpseResult, pngResult, perf) {
  const slides = presentation.slides || [];
  const total = slides.length || 1;
  const svgCount = slides.filter((s) => s.renderer === 'svg').length;
  const pngCount = slides.filter((s) => s.renderer === 'png-fallback').length;

  const allTimeline = slides.flatMap((s) => s.timeline || []);
  const renderableTimeline = allTimeline.filter((t) => t.viewerSupported !== false);
  const hasVideo = features.summary?.detected?.video;
  const hasAudio = features.summary?.detected?.audio;
  const videoOverlays = slides.some((s) => s.media.some((m) => m.type === 'video'));
  const audioOverlays = slides.some((s) => s.media.some((m) => m.type === 'audio'));
  const hasTables = features.summary?.detected?.tables;
  const hasCharts = features.summary?.detected?.charts;
  const hasSmartArt = features.summary?.detected?.smartArt;
  const tableHtml = slides.some((s) => (s.tables || []).length);
  const chartSvg = slides.some((s) => (s.charts || []).length);
  const transTypes = new Set(slides.map((s) => s.transition?.type).filter((t) => t && t !== 'none'));
  const clickSteps = slides.reduce((n, s) => n + (s.clickSteps?.length || 0), 0);

  const summary = {
    staticRendering: classify(svgCount + pngCount > 0, svgCount > 0 && pngCount > 0),
    text: classify(svgCount > 0, false),
    fonts: features.theme ? 'PARTIAL' : 'FAIL',
    images: classify(svgCount > 0, false),
    shapes: classify(svgCount > 0, false),
    tables: hasTables ? (tableHtml ? 'PARTIAL' : pngCount > 0 ? 'PARTIAL' : 'FAIL') : 'N/A',
    charts: hasCharts ? (chartSvg ? 'PARTIAL' : pngCount > 0 ? 'PARTIAL' : 'FAIL') : 'N/A',
    smartArt: hasSmartArt ? (pngCount > 0 ? 'PARTIAL' : 'FAIL') : 'N/A',
    video: hasVideo ? (videoOverlays ? 'PARTIAL' : 'FAIL') : 'N/A',
    audio: hasAudio ? (audioOverlays ? 'PARTIAL' : 'FAIL') : 'N/A',
    appear: effectPresent(allTimeline, ['appear']) ? 'PARTIAL' : 'N/A',
    fade: effectPresent(allTimeline, ['fade']) ? 'PARTIAL' : 'N/A',
    flyIn: effectPresent(allTimeline, ['flyIn']) ? 'PARTIAL' : 'N/A',
    flyOut: effectPresent(allTimeline, ['flyOut']) ? 'PARTIAL' : 'N/A',
    zoom: effectPresent(allTimeline, ['zoom']) ? 'PARTIAL' : 'N/A',
    spin: effectPresent(allTimeline, ['spin']) ? 'PARTIAL' : 'N/A',
    motion: effectPresent(allTimeline, ['motion']) ? 'PARTIAL' : 'N/A',
    fadeTransition: transTypes.has('fade') ? 'PARTIAL' : 'N/A',
    pushTransition: transTypes.has('push') ? 'PARTIAL' : 'N/A',
    wipeTransition: transTypes.has('wipe') ? 'PARTIAL' : 'N/A',
    otherTransitions: [...transTypes].some((t) => !['fade', 'push', 'wipe', 'none'].includes(t))
      ? 'PARTIAL'
      : 'N/A',
    clickTriggers: clickSteps > 0 ? 'PARTIAL' : allTimeline.length ? 'FAIL' : 'N/A',
    animationSequencing: clickSteps > 1 ? 'PARTIAL' : renderableTimeline.length ? 'PARTIAL' : 'N/A',
  };

  const fidelity = computeFidelityScores(summary, presentation, features);

  return {
    phase: 2,
    generatedAt: new Date().toISOString(),
    glimpseVersion: glimpseResult?.glimpseVersion,
    summary,
    fidelity,
    performance: perf,
    slideReports: slides.map((s) => ({
      slide: s.index,
      renderer: s.renderer,
      timelineSteps: s.timeline?.length || 0,
      clickSteps: s.clickSteps?.length || 0,
      tables: s.tables?.length || 0,
      charts: s.charts?.length || 0,
      transition: s.transition?.type,
      objectMapCount: s.objectMap?.length || 0,
    })),
    blockers: [
      'pptx-glimpse does not expose spid in SVG — mapping via editor session + aria-label index',
      'PowerPoint presetID coverage incomplete — many effects map to CSS approximations',
      'Chart OOXML → static SVG is basic; complex charts need PNG or commercial renderer',
      'SmartArt requires PNG fallback — no open-source SmartArt → SVG path verified',
      'Font theme resolved but embedded fonts not shipped — browser substitution',
      'No iSpring reference deck provided for parity verification',
    ],
    notes: [
      'PARTIAL = structurally implemented; verify in browser before claiming PASS',
      'Fidelity scores are rubric-based estimates, not automatic XML detection',
    ],
  };
}

function computeFidelityScores(summary, presentation, features) {
  const score = (key) => (summary[key] === 'PASS' ? 90 : summary[key] === 'PARTIAL' ? 55 : summary[key] === 'N/A' ? null : 15);

  const staticVisual = Math.round(
    ((score('staticRendering') ?? 70) + (score('text') ?? 50) + (score('images') ?? 50) + (score('shapes') ?? 50)) / 4
  );
  const media = Math.round(((score('video') ?? 40) + (score('audio') ?? 40)) / 2);
  const animation = Math.round(
    ((score('fade') ?? 30) +
      (score('appear') ?? 30) +
      (score('clickTriggers') ?? 20) +
      (score('animationSequencing') ?? 20)) /
      4
  );
  const transition = Math.round(
    ((score('fadeTransition') ?? 40) +
      (score('pushTransition') ?? 40) +
      (score('wipeTransition') ?? 40) +
      (score('otherTransitions') ?? 30)) /
      4
  );
  const font = score('fonts') ?? 35;

  const parts = [staticVisual, media, animation, transition, font].filter((x) => x != null);
  const overall = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

  return {
    staticVisualFidelity: staticVisual,
    mediaFidelity: media,
    animationFidelity: animation,
    transitionFidelity: transition,
    fontFidelity: font,
    overall,
    methodology:
      'Rubric: PASS≈90, PARTIAL≈55, FAIL≈15 per category; overall is mean of five categories. Not iSpring-calibrated.',
    estimatedISpringParity: Math.min(overall, 45),
    estimatedISpringNote:
      'Capped conservatively without side-by-side iSpring browser test. Real parity likely lower for animations/transitions.',
  };
}

function printPhase2Result(report) {
  const s = report.summary;
  const f = report.fidelity;
  console.log('\n==============================');
  console.log('PHASE 2 FIDELITY REPORT');
  console.log('==============================\n');
  console.log(`Static rendering       ${s.staticRendering}`);
  console.log(`Text                   ${s.text}`);
  console.log(`Fonts                  ${s.fonts}`);
  console.log(`Images                 ${s.images}`);
  console.log(`Shapes                 ${s.shapes}`);
  console.log(`Tables                 ${s.tables}`);
  console.log(`Charts                 ${s.charts}`);
  console.log(`SmartArt               ${s.smartArt}`);
  console.log(`Video                  ${s.video}`);
  console.log(`Audio                  ${s.audio}`);
  console.log('');
  console.log(`Appear                 ${s.appear}`);
  console.log(`Fade                   ${s.fade}`);
  console.log(`Fly In                 ${s.flyIn}`);
  console.log(`Fly Out                ${s.flyOut}`);
  console.log(`Zoom                   ${s.zoom}`);
  console.log(`Spin                   ${s.spin}`);
  console.log(`Motion                 ${s.motion}`);
  console.log('');
  console.log(`Fade transition        ${s.fadeTransition}`);
  console.log(`Push transition        ${s.pushTransition}`);
  console.log(`Wipe transition        ${s.wipeTransition}`);
  console.log(`Other transitions      ${s.otherTransitions}`);
  console.log(`Click triggers         ${s.clickTriggers}`);
  console.log(`Animation sequencing   ${s.animationSequencing}`);
  console.log('\n--- Fidelity scores (rubric) ---');
  console.log(`Static visual:    ${f.staticVisualFidelity}/100`);
  console.log(`Media:            ${f.mediaFidelity}/100`);
  console.log(`Animation:        ${f.animationFidelity}/100`);
  console.log(`Transition:       ${f.transitionFidelity}/100`);
  console.log(`Font:             ${f.fontFidelity}/100`);
  console.log(`Overall:          ${f.overall}/100`);
  console.log(`Est. iSpring parity (conservative): ~${f.estimatedISpringParity}%`);
}

function buildPhase2Conclusion(report) {
  const f = report.fidelity;
  return `
==============================
PHASE 2 CONCLUSION
==============================

Estimated iSpring fidelity: ~${f.estimatedISpringParity}% (conservative; no iSpring deck tested)

Good enough for:
- Static/text/shape/image decks via pptx-glimpse SVG
- Basic HTML5 video/audio overlays with controls
- Click-through animation demos (fade/appear/fly approximations)
- Basic slide transitions (CSS subset)
- Research/POC to measure gaps vs commercial HTML5 export

Not good enough for:
- iSpringCloud/iPrintCloud parity (animations, triggers, media timing)
- Complex charts, SmartArt, embedded font fidelity
- Exact PowerPoint animation preset reproduction
- Production LMS delivery without per-deck QA

Main blockers:
- Incomplete OOXML animation preset → visual effect mapping
- SVG object IDs not native in glimpse output (workaround: editor session map)
- Tables/charts/SmartArt need PNG or commercial renderer for fidelity
- Browser autoplay restrictions vs PowerPoint media behavior

Can we continue with open-source?
MAYBE

If NO (production iSpring-like):
Recommended commercial renderer: Aspose.Slides HTML5 export, or iSpring SDK / Nutrient/PDFTron PPT SDK

If YES (research path):
Phase 3 priorities:
1. Side-by-side test with real iSpring/iPrint PPTX
2. Evaluate Aspose/Nutrient trial on same decks
3. Motion path + emphasis preset library expansion
4. Embedded font extraction (woff) where licensed
`;
}

function buildPhase2ResultMarkdown(report, presentation) {
  const s = report.summary;
  const f = report.fidelity;
  const p = report.performance || {};
  return `# Phase 2 Result

## Architecture

\`\`\`text
PPTX → pptx-glimpse SVG + editor session object map
     → OOXML timeline/tables/charts/theme/media
     → Phase 2 HTML5 player (click-through animations)
     → PNG fallback (SmartArt/complex chart/unresolved glimpse)
\`\`\`

## Feature support

| Feature | Result |
|---------|--------|
| Static rendering | ${s.staticRendering} |
| Text | ${s.text} |
| Fonts | ${s.fonts} |
| Images | ${s.images} |
| Shapes | ${s.shapes} |
| Tables | ${s.tables} |
| Charts | ${s.charts} |
| SmartArt | ${s.smartArt} |
| Video | ${s.video} |
| Audio | ${s.audio} |
| Appear | ${s.appear} |
| Fade | ${s.fade} |
| Fly In | ${s.flyIn} |
| Fly Out | ${s.flyOut} |
| Zoom | ${s.zoom} |
| Spin | ${s.spin} |
| Motion | ${s.motion} |
| Fade transition | ${s.fadeTransition} |
| Push transition | ${s.pushTransition} |
| Wipe transition | ${s.wipeTransition} |
| Other transitions | ${s.otherTransitions} |
| Click triggers | ${s.clickTriggers} |
| Animation sequencing | ${s.animationSequencing} |

## Fidelity scores

| Category | Score |
|----------|-------|
| Static visual | ${f.staticVisualFidelity}/100 |
| Media | ${f.mediaFidelity}/100 |
| Animation | ${f.animationFidelity}/100 |
| Transition | ${f.transitionFidelity}/100 |
| Font | ${f.fontFidelity}/100 |
| **Overall** | **${f.overall}/100** |
| Est. iSpring parity | ~${f.estimatedISpringParity}% |

Methodology: ${f.methodology}

## Performance

| Metric | Value |
|--------|-------|
| Input size | ${formatBytes(p.inputSizeBytes)} |
| SVG generation | ${p.svgGenerationMs ?? '?'} ms |
| PNG fallback | ${p.pngFallbackMs ?? 'N/A'} ms |
| Total | ${p.totalMs ?? '?'} ms |
| SVG slides | ${p.svgSlideCount ?? presentation.stats?.svgSlideCount ?? '?'} |
| PNG fallback slides | ${p.pngFallbackSlideCount ?? '?'} |

## Blockers

${report.blockers.map((b) => `- ${b}`).join('\n')}

${buildPhase2Conclusion(report)}
`;
}

function formatBytes(n) {
  if (n == null) return 'N/A';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  buildPhase2FeatureReport,
  printPhase2Result,
  buildPhase2ResultMarkdown,
  buildPhase2Conclusion,
};
