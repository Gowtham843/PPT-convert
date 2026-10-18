/**
 * Phase 2: Slide transition detection + CSS mapping (slide-level only).
 * Morph is detected separately — never aliased to fade.
 */

const { parseAttrs } = require('./ooxml-utils');

const SUPPORTED_CSS = new Set([
  'none',
  'fade',
  'push',
  'wipe',
  'split',
  'cover',
  'uncover',
  'dissolve',
  'randomBar',
  'checker',
  'strips',
]);

const TRANSITION_ALIASES = {
  fade: 'fade',
  push: 'push',
  wipe: 'wipe',
  split: 'split',
  cover: 'cover',
  uncover: 'uncover',
  dissolve: 'dissolve',
  randomBar: 'randomBar',
  blinds: 'strips',
  checker: 'checker',
  strips: 'strips',
  cut: 'none',
  comb: 'strips',
  pull: 'cover',
  zoom: 'fade',
};

const SPEED_MS = { fast: 280, med: 480, slow: 900 };

function detectTransition(slideXml) {
  const m = slideXml.match(/<p:transition\b([^>]*)(?:\/>|>([\s\S]*?)<\/p:transition>)/);
  if (!m) {
    return emptyTransition();
  }

  const attrs = m[1] || '';
  const inner = m[2] || '';
  const spd = parseAttrs(`<x ${attrs}>`, 'spd') || 'med';
  const advanceOnClick = /advClick="1"/.test(attrs);
  const advanceAfterMs = parseAdvanceAfter(attrs);

  let rawType = 'none';
  let direction = null;
  let morphDetected = false;

  const tagMatch = inner.match(/<p:(\w+)\b([^>]*)>/);
  if (tagMatch) {
    rawType = tagMatch[1];
    direction = parseAttrs(tagMatch[0], 'dir') || parseAttrs(tagMatch[0], 'orient');
    if (rawType === 'morph') morphDetected = true;
  }

  if (morphDetected) {
    return {
      detected: true,
      type: 'morph',
      rawType: 'morph',
      speed: spd,
      durationMs: SPEED_MS[spd] || 480,
      direction,
      supported: false,
      renderable: false,
      cssClass: null,
      morph: {
        detected: true,
        supported: false,
        prototype: false,
        reason: 'Morph transition detected in OOXML; interpolation engine not yet implemented',
      },
      advanceOnClick,
      advanceAfterMs,
      ooxml: { attrs, inner: inner.slice(0, 500) },
    };
  }

  const type = TRANSITION_ALIASES[rawType] || rawType;
  const supported = SUPPORTED_CSS.has(type);
  const cssClass = supported && type !== 'none' ? `tx-${type}` : null;

  return {
    detected: type !== 'none',
    type: supported ? type : rawType,
    rawType,
    speed: spd,
    durationMs: SPEED_MS[spd] || 480,
    direction,
    supported,
    cssClass,
    renderable: supported && type !== 'none',
    morph: { detected: false, supported: false, prototype: false, reason: null },
    advanceOnClick,
    advanceAfterMs,
    ooxml: { attrs, inner: inner.slice(0, 500) },
  };
}

function parseAdvanceAfter(attrs) {
  const adv = parseAttrs(`<x ${attrs}>`, 'advTm');
  if (!adv) return null;
  const n = Number(adv);
  return Number.isFinite(n) ? n : null;
}

function emptyTransition() {
  return {
    detected: false,
    type: 'none',
    rawType: 'none',
    speed: 'med',
    durationMs: 480,
    direction: null,
    supported: true,
    cssClass: null,
    renderable: false,
    morph: { detected: false, supported: false, prototype: false, reason: null },
    advanceOnClick: false,
    advanceAfterMs: null,
    ooxml: null,
  };
}

function buildTransitionCss() {
  return `
.viewport.tx-fade-out .frame{animation:txFadeOut var(--tx-ms,480ms) forwards}
.viewport.tx-fade .frame,.viewport.tx-in-fade .frame{animation:txFadeIn var(--tx-ms,480ms) forwards}
.viewport.tx-push .frame{animation:txPushIn .5s forwards}
.viewport.tx-push.tx-dir-u .frame{animation:txPushInUp .5s forwards}
.viewport.tx-push.tx-dir-d .frame{animation:txPushInDown .5s forwards}
.viewport.tx-push.tx-dir-l .frame{animation:txPushInLeft .5s forwards}
.viewport.tx-push.tx-dir-r .frame{animation:txPushInRight .5s forwards}
.viewport.tx-wipe .frame{animation:txWipeIn .5s forwards}
.viewport.tx-split .frame{animation:txSplitIn .5s forwards}
.viewport.tx-cover .frame{animation:txCoverIn .5s forwards}
.viewport.tx-uncover .frame{animation:txUncoverIn .5s forwards}
.viewport.tx-dissolve .frame{animation:txDissolveIn .55s forwards}
.viewport.tx-randomBar .frame{animation:txRandomBarIn .55s forwards}
.viewport.tx-checker .frame{animation:txCheckerIn .55s forwards}
.viewport.tx-strips .frame{animation:txStripsIn .5s forwards}
@keyframes txFadeIn{from{opacity:0}to{opacity:1}}
@keyframes txFadeOut{from{opacity:1}to{opacity:0}}
@keyframes txPushIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes txPushInUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes txPushInDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}
@keyframes txPushInLeft{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes txPushInRight{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes txWipeIn{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes txSplitIn{from{clip-path:inset(0 50% 0 50%)}to{clip-path:inset(0 0 0 0)}}
@keyframes txCoverIn{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes txUncoverIn{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes txDissolveIn{0%{opacity:0;filter:blur(4px)}100%{opacity:1;filter:blur(0)}}
@keyframes txRandomBarIn{0%{clip-path:inset(0 100% 0 0)}50%{clip-path:inset(0 60% 0 0)}100%{clip-path:inset(0 0 0 0)}}
@keyframes txCheckerIn{0%{opacity:0}100%{opacity:1}}
@keyframes txStripsIn{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
`;
}

module.exports = { detectTransition, buildTransitionCss, SUPPORTED_CSS, SPEED_MS };
