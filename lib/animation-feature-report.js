/**
 * animation-feature-report.json generator — honest PASS/PARTIAL/FAIL/NOT_PRESENT.
 */

const fs = require('fs');
const path = require('path');
const { EFFECT_DEFINITIONS } = require('./animation-engine');
const { verifySvgTarget } = require('./animation-debug');

const STATUS = {
  pass: 'PASS',
  partial: 'PARTIAL',
  fail: 'FAIL',
  na: 'NOT_PRESENT',
};

function allTimeline(slides) {
  return slides.flatMap((s) => s.timeline || []);
}

function hasEffect(timeline, effects) {
  return timeline.some((t) => effects.includes(t.effect));
}

function mappingStatus(slide, outputDir) {
  const svgPath = path.join(outputDir, (slide.svg || '').replace(/^\.\//, ''));
  const anims = slide.timeline || [];
  if (!anims.length) return STATUS.na;
  let ok = 0;
  for (const a of anims) {
    const map = (slide.objectMap || []).find((m) => m.pptxId === String(a.targetObject || a.objectId));
    const chk = verifySvgTarget(svgPath, a.targetObject || a.objectId, map?.svgSelector);
    if (chk.found) ok++;
  }
  if (ok === anims.length) return STATUS.pass;
  if (ok > 0) return STATUS.partial;
  return STATUS.fail;
}

function effectStatus(timeline, effectNames) {
  if (!hasEffect(timeline, effectNames)) return STATUS.na;
  const supported = effectNames.every((e) => EFFECT_DEFINITIONS[e]?.supported !== false);
  return supported ? STATUS.partial : STATUS.fail;
}

function transitionStatus(slides, type) {
  const found = slides.some((s) => s.transition?.type === type || s.transition?.rawType === type);
  if (!found) return STATUS.na;
  const renderable = slides.some((s) => s.transition?.renderable && s.transition?.type === type);
  return renderable ? STATUS.partial : STATUS.fail;
}

function morphStatus(slides) {
  const morph = slides.filter((s) => s.transition?.morph?.detected);
  if (!morph.length) return STATUS.na;
  return morph.some((s) => s.transition?.morph?.prototype) ? STATUS.partial : STATUS.fail;
}

function buildAnimationFeatureReport(presentation, outputDir) {
  const slides = presentation.slides || [];
  const timeline = allTimeline(slides);

  const summary = {
    animationDetection: timeline.length ? STATUS.pass : STATUS.na,
    animationObjectMapping: slides.some((s) => (s.timeline || []).length)
      ? worst(slides.map((s) => mappingStatus(s, outputDir)))
      : STATUS.na,
    fade: effectStatus(timeline, ['fade']),
    appear: effectStatus(timeline, ['appear']),
    disappear: effectStatus(timeline, ['disappear', 'fadeOut']),
    fly: effectStatus(timeline, ['flyIn', 'flyOut', 'float']),
    zoom: effectStatus(timeline, ['zoom']),
    spin: effectStatus(timeline, ['spin']),
    motionPath: effectStatus(timeline, ['motion']),
    clickTrigger: timeline.some((t) => t.trigger === 'onClick' || t.trigger === 'on_click')
      ? STATUS.partial
      : STATUS.na,
    withPrevious: timeline.some((t) => t.trigger === 'withPrevious' || t.trigger === 'with_previous')
      ? STATUS.partial
      : STATUS.na,
    afterPrevious: timeline.some(
      (t) => t.trigger === 'afterPrevious' || t.trigger === 'after_previous'
    )
      ? STATUS.partial
      : STATUS.na,
    objectClickTrigger: timeline.some(
      (t) => t.trigger === 'objectClick' || t.trigger === 'object_click'
    )
      ? STATUS.partial
      : STATUS.na,
    videoClickToPlay: slides.some((s) =>
      (s.media || []).some((m) => m.type === 'video' && m.startOnClick)
    )
      ? STATUS.partial
      : STATUS.na,
    audio: slides.some((s) => (s.media || []).some((m) => m.type === 'audio'))
      ? STATUS.partial
      : STATUS.na,
    fadeTransition: transitionStatus(slides, 'fade'),
    pushTransition: transitionStatus(slides, 'push'),
    wipeTransition: transitionStatus(slides, 'wipe'),
    morphDetection: morphStatus(slides),
  };

  return {
    generatedAt: new Date().toISOString(),
    source: presentation.source,
    note: 'PASS requires browser-verified behavior; PARTIAL = detected + mapped but not browser-verified in CI',
    summary,
    slides: slides.map((s) => ({
      index: s.index,
      objectCount: s.objects?.length || 0,
      animationCount: s.timeline?.length || 0,
      clickGroups: s.clickSteps?.length || 0,
      transition: s.transition?.rawType || s.transition?.type,
      morph: s.transition?.morph || null,
      mapping: mappingStatus(s, outputDir),
    })),
  };
}

function worst(list) {
  const rank = { FAIL: 0, PARTIAL: 1, PASS: 2, NOT_PRESENT: 3 };
  return list.reduce((w, v) => (rank[v] < rank[w] ? v : w), STATUS.na);
}

function writeAnimationFeatureReport(presentation, outputDir) {
  const report = buildAnimationFeatureReport(presentation, outputDir);
  const outPath = path.join(outputDir, 'animation-feature-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  const rootPath = path.join(path.dirname(outputDir), 'animation-feature-report.json');
  if (path.basename(outputDir) !== 'output') {
    fs.writeFileSync(rootPath, JSON.stringify(report, null, 2));
  }
  return report;
}

module.exports = { buildAnimationFeatureReport, writeAnimationFeatureReport, STATUS };
