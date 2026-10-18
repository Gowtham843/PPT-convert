/**
 * Animation engine — primitives composed into PowerPoint-like effects.
 * Browser runtime lives in viewer-animation-runtime.js (Web Animations API).
 */

const {
  scheduleSlideTimeline,
  scheduleClickGroup,
  clickStepDuration,
  partitionTimeline,
} = require('./timeline-scheduler');

/** Primitive property sets for effect composition (server-side metadata). */
const PRIMITIVES = {
  opacity: (from, to) => ({ property: 'opacity', from, to }),
  translateY: (from, to) => ({ property: 'transform', template: 'translateY', from, to }),
  translateX: (from, to) => ({ property: 'transform', template: 'translateX', from, to }),
  scale: (from, to) => ({ property: 'transform', template: 'scale', from, to }),
  rotate: (from, to) => ({ property: 'transform', template: 'rotate', from, to }),
};

/** Supported effects → composed primitives (used for detection/reporting). */
const EFFECT_DEFINITIONS = {
  appear: { type: 'entrance', primitives: ['opacity:0->1'], supported: true },
  disappear: { type: 'exit', primitives: ['opacity:1->0'], supported: true },
  fade: { type: 'entrance', primitives: ['opacity:0->1'], supported: true },
  fadeOut: { type: 'exit', primitives: ['opacity:1->0'], supported: true },
  flyIn: { type: 'entrance', primitives: ['opacity:0->1', 'translateY:-40px->0'], supported: true },
  flyOut: { type: 'exit', primitives: ['opacity:1->0', 'translateY:0->-40px'], supported: true },
  float: { type: 'entrance', primitives: ['opacity:0->1', 'translateY:20px->0'], supported: true },
  zoom: { type: 'entrance', primitives: ['opacity:0->1', 'scale:0.2->1'], supported: true },
  growShrink: { type: 'emphasis', primitives: ['scale:1->1.15'], supported: true },
  spin: { type: 'emphasis', primitives: ['rotate:0->360'], supported: true },
  motion: { type: 'entrance', primitives: ['opacity:0->1', 'translateY:16px->0'], supported: true },
  box: { type: 'entrance', primitives: ['clip'], supported: true },
  circle: { type: 'entrance', primitives: ['clip'], supported: true },
  diamond: { type: 'entrance', primitives: ['clip'], supported: true },
  blinds: { type: 'entrance', primitives: ['clip'], supported: true },
  checkerboard: { type: 'entrance', primitives: ['clip'], supported: true },
  dissolve: { type: 'entrance', primitives: ['opacity'], supported: true },
  randombars: { type: 'entrance', primitives: ['clip'], supported: true },
  strips: { type: 'entrance', primitives: ['clip'], supported: true },
  wedge: { type: 'entrance', primitives: ['clip'], supported: true },
  wheel: { type: 'entrance', primitives: ['clip'], supported: true },
  plus: { type: 'entrance', primitives: ['clip'], supported: true },
  peek: { type: 'entrance', primitives: ['opacity', 'translateY:20px->0'], supported: true },
  split: { type: 'entrance', primitives: ['clip'], supported: true },
  wipe: { type: 'entrance', primitives: ['clip'], supported: true },
  colorPulse: { type: 'emphasis', primitives: ['color'], supported: true },
  fillColor: { type: 'emphasis', primitives: ['color'], supported: true },
  fontColor: { type: 'emphasis', primitives: ['color'], supported: true },
  lineColor: { type: 'emphasis', primitives: ['color'], supported: true },
  spiral: { type: 'entrance', primitives: ['rotate', 'scale'], supported: true },
  swivel: { type: 'entrance', primitives: ['rotate', 'scale'], supported: true },
  boomerang: { type: 'entrance', primitives: ['translateX', 'rotate'], supported: true },
  bounce: { type: 'entrance', primitives: ['translateY', 'opacity'], supported: true },
  curveUp: { type: 'entrance', primitives: ['translateY'], supported: true },
  curveDown: { type: 'exit', primitives: ['translateY'], supported: true },
  drop: { type: 'entrance', primitives: ['translateY', 'opacity'], supported: true },
  riseUp: { type: 'entrance', primitives: ['translateY', 'opacity'], supported: true },
  floatDown: { type: 'entrance', primitives: ['translateY', 'opacity'], supported: true },
  whip: { type: 'entrance', primitives: ['translateX', 'rotate'], supported: true },
  centerRevolve: { type: 'entrance', primitives: ['rotate', 'scale'], supported: true },
  sinkDown: { type: 'exit', primitives: ['translateY'], supported: true },
  transparency: { type: 'emphasis', primitives: ['opacity:1->0.4'], supported: true },
  teeter: { type: 'emphasis', primitives: ['rotate'], supported: true },
  pulse: { type: 'emphasis', primitives: ['opacity'], supported: true },
  shimmer: { type: 'emphasis', primitives: ['opacity', 'translateX'], supported: true },
};

function normalizeEffectName(effect) {
  if (effect === 'fadeIn') return 'fade';
  if (effect === 'fadeOut') return 'fadeOut';
  if (effect === 'fly') return 'flyIn';
  return effect;
}

function normalizeTimelineEntry(entry, index) {
  const effect = normalizeEffectName(entry.effect);
  const def = EFFECT_DEFINITIONS[effect] || EFFECT_DEFINITIONS.fade;
  let trigger = entry.trigger;
  if (trigger === 'on_click') trigger = 'onClick';
  else if (trigger === 'with_previous') trigger = 'withPrevious';
  else if (trigger === 'after_previous') trigger = 'afterPrevious';
  else if (trigger === 'object_click') trigger = 'objectClick';
  else if (trigger === 'automatic' || trigger === 'onBegin') trigger = 'automatic';
  return {
    ...entry,
    id: entry.id || `animation-${entry.order ?? index}`,
    targetObject: String(entry.objectId),
    effect,
    trigger,
    triggerObject: entry.triggerObject || entry.triggerDetail?.object || null,
    triggerDetail:
      entry.triggerDetail ||
      (entry.triggerObject ? { type: 'objectClick', object: String(entry.triggerObject) } : null),
    entrance: entry.type === 'entrance' || (entry.type !== 'motion' && entry.type !== 'exit' && entry.type !== 'emphasis' && def.type === 'entrance'),
    exit: entry.type === 'exit' || def.type === 'exit',
    emphasis: entry.type === 'emphasis' || (entry.type !== 'exit' && def.type === 'emphasis'),
    viewerSupported: def.supported && entry.renderable !== false,
    effectDef: def,
    ooxml: entry.ooxml || {
      presetClass: entry.presetClass,
      presetID: entry.presetID,
      filter: entry.filter,
      nodeType: entry.nodeType,
    },
  };
}

function prepareSlideTimeline(timeline) {
  return (timeline || []).map(normalizeTimelineEntry);
}

function getInitialHiddenIds(timeline) {
  const hidden = new Set();
  for (const step of timeline || []) {
    if (step.entrance && step.viewerSupported !== false) {
      hidden.add(String(step.targetObject || step.objectId));
    }
  }
  return [...hidden];
}

function buildScheduledSteps(timeline) {
  const normalized = prepareSlideTimeline(timeline);
  const { main, objectClick } = partitionTimeline(normalized);
  const clickSteps = scheduleSlideTimeline(main);
  const objectClickSteps = objectClick.map((entry) =>
    scheduleClickGroup([entry])
  );
  return { timeline: normalized, clickSteps, objectClickSteps };
}

/** Minimal CSS — hidden state only; motion via WAAPI in viewer. */
function buildAnimationCss() {
  return `
.sp-anim-hidden{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
.sp-anim-visible{visibility:visible!important;pointer-events:auto!important}
`;
}

function buildAnimationCss() {
  return `
.sp-anim-hidden{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
.sp-anim-visible{visibility:visible!important;pointer-events:auto!important}
`;
}

module.exports = {
  PRIMITIVES,
  EFFECT_DEFINITIONS,
  normalizeTimelineEntry,
  prepareSlideTimeline,
  getInitialHiddenIds,
  buildScheduledSteps,
  buildAnimationCss,
  clickStepDuration,
};
