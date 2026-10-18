/**
 * Phase 2: Parse PowerPoint p:timing tree into normalized animation timeline.
 */

const { parseAttrs } = require('./ooxml-utils');

/** PowerPoint presetID → normalized effect (entr/exit/emph). */
const PRESET_MAP = {
  entr: {
    1: 'appear',
    2: 'flyIn',
    3: 'blinds',
    4: 'box',
    5: 'checkerboard',
    6: 'circle',
    8: 'diamond',
    9: 'dissolve',
    10: 'fade',
    12: 'peek',
    13: 'plus',
    14: 'randombars',
    15: 'spiral',
    16: 'split',
    17: 'stretch',
    18: 'strips',
    19: 'swivel',
    20: 'wedge',
    21: 'wheel',
    22: 'wipe',
    23: 'zoom',
    25: 'diamond',
    26: 'plus',
    28: 'peek',
    30: 'float',
    32: 'boomerang',
    33: 'bounce',
    34: 'curveUp',
    35: 'flip',
    36: 'drop',
    37: 'growTurn',
    39: 'pinwheel',
    40: 'riseUp',
    42: 'floatDown',
    45: 'whip',
    47: 'centerRevolve',
    51: 'spinner',
    52: 'floatDown',
    53: 'zoom',
    54: 'swivel',
    56: 'compress',
  },
  exit: {
    1: 'disappear',
    2: 'flyOut',
    3: 'blinds',
    4: 'box',
    5: 'checkerboard',
    6: 'circle',
    8: 'diamond',
    9: 'dissolve',
    10: 'fade',
    12: 'peek',
    13: 'plus',
    14: 'randombars',
    15: 'spiral',
    16: 'split',
    17: 'stretch',
    18: 'strips',
    19: 'swivel',
    20: 'wedge',
    21: 'wheel',
    22: 'wipe',
    23: 'zoom',
    25: 'diamond',
    26: 'plus',
    28: 'peek',
    30: 'float',
    32: 'boomerang',
    33: 'bounce',
    34: 'curveDown',
    35: 'flip',
    36: 'drop',
    37: 'growTurn',
    39: 'pinwheel',
    43: 'sinkDown',
    45: 'whip',
    47: 'centerRevolve',
    51: 'spinner',
    52: 'floatDown',
    53: 'zoom',
    54: 'swivel',
    56: 'stretch',
  },
  emph: {
    1: 'fillColor',
    2: 'fontColor',
    6: 'growShrink',
    7: 'lineColor',
    8: 'spin',
    9: 'transparency',
    10: 'transparency',
    14: 'colorPulse',
    20: 'colorPulse',
    23: 'transparency',
    32: 'teeter',
    35: 'pulse',
    38: 'shimmer',
  },
};

const FILTER_MAP = {
  fade: 'fade',
  appear: 'appear',
  disappear: 'disappear',
  fly: 'flyIn',
  float: 'float',
  split: 'split',
  barn: 'split',
  wipe: 'wipe',
  zoom: 'zoom',
  grow: 'growShrink',
  shrink: 'growShrink',
  spin: 'spin',
  box: 'box',
  circle: 'circle',
  diamond: 'diamond',
  blinds: 'blinds',
  checkerboard: 'checkerboard',
  dissolve: 'dissolve',
  randombars: 'randombars',
  strips: 'strips',
  wedge: 'wedge',
  wheel: 'wheel',
  plus: 'plus',
  image: 'transparency',
};

function mapTrigger(nodeType, parentTrigger) {
  if (nodeType === 'withEffect') return 'with_previous';
  if (nodeType === 'afterEffect') return 'after_previous';
  if (nodeType === 'clickEffect' || nodeType === 'clickPar') return 'on_click';
  return parentTrigger || 'on_click';
}

function parseAnimationsInClickBlock(block) {
  const parts = block.body.match(/<p:par>[\s\S]*?<\/p:par>/g) || [];
  const entries = [];
  for (const part of parts) {
    if (!/<p:animEffect|<p:set|<p:animMotion|<p:animRot|<p:animScale/.test(part)) continue;
    const ctnMatch = part.match(/<p:cTn\b([^>]*)>/);
    if (!ctnMatch) continue;
    const attrs = ctnMatch[1];
    const nodeType = parseAttrs(`<x ${attrs}>`, 'nodeType') || 'clickEffect';
    const presetClass =
      parseAttrs(`<x ${attrs}>`, 'presetClass') || block.presetClass || 'entr';
    entries.push({ attrs, presetClass, body: part, nodeType });
  }
  if (!entries.length) {
    entries.push({
      attrs: block.attrs,
      presetClass: block.presetClass,
      body: block.body,
      nodeType: parseAttrs(`<x ${block.attrs}>`, 'nodeType') || 'clickEffect',
    });
  }
  return entries;
}

function parseInteractiveSeqBlocks(slideXml) {
  const blocks = [];
  const seqRe = /<p:seq\b[^>]*>[\s\S]*?<\/p:seq>/g;
  let sm;
  while ((sm = seqRe.exec(slideXml))) {
    const seq = sm[0];
    if (!/nodeType="interactiveSeq"/.test(seq)) continue;
    const triggerMatch = seq.match(/<p:stCondLst>[\s\S]*?<p:spTgt\b[^>]*spid="(\d+)"/);
    const triggerObject = triggerMatch ? triggerMatch[1] : null;
    const presetMatch = seq.match(/presetClass="(entr|exit|emph)"/);
    const presetClass = presetMatch ? presetMatch[1] : 'entr';
    blocks.push({ triggerObject, presetClass, body: seq });
  }
  return blocks;
}

function mapEffectFromNode(presetClass, presetID, filter, setHidden, body) {
  const pid = presetID != null ? Number(presetID) : null;
  if (setHidden === '1' || setHidden === 'true') {
    return presetClass === 'exit' ? 'disappear' : 'appear';
  }
  if (pid != null && PRESET_MAP[presetClass]?.[pid]) {
    const e = PRESET_MAP[presetClass][pid];
    if (presetClass === 'exit' && e === 'flyIn') return 'flyOut';
    return e;
  }
  if (/<p:animRot\b/.test(body)) return 'spin';
  if (/<p:animScale\b/.test(body)) return 'growShrink';
  if (/<p:animMotion\b/.test(body)) return 'motion';
  if (/<p:animClr\b/.test(body)) {
    if (/style\.color/.test(body)) return 'fontColor';
    if (/strokeColor/.test(body)) return 'lineColor';
    return 'fillColor';
  }

  const f = (filter || '').toLowerCase();
  for (const [k, v] of Object.entries(FILTER_MAP)) {
    if (f.includes(k)) {
      if (presetClass === 'exit' && v === 'flyIn') return 'flyOut';
      if (presetClass === 'exit' && v === 'fade') return 'fade';
      return v;
    }
  }
  if (presetClass === 'entr') return 'fade';
  if (presetClass === 'exit') return 'fade';
  if (presetClass === 'emph') return 'growShrink';
  return 'fade';
}

function parseMotion(body) {
  const motionTag = body.match(/<p:animMotion\b([^>]*)>/);
  if (!motionTag) return null;
  const tag = motionTag[0];
  const path = parseAttrs(tag, 'path');
  const origin = parseAttrs(tag, 'origin');
  const byTag = body.match(/<p:by\b[^>]*>/);
  let dx = 0;
  let dy = 0;
  if (byTag) {
    const x = parseAttrs(byTag[0], 'x');
    const y = parseAttrs(byTag[0], 'y');
    if (x) dx = Number(x);
    if (y) dy = Number(y);
  }
  return { path: path || null, origin, dx, dy, type: path ? 'path' : dx || dy ? 'translate' : 'simple' };
}

function parseRotation(body) {
  const rot = body.match(/<p:animRot\b[^>]*>/);
  if (!rot) return null;
  const by = body.match(/<p:by\b[^>]*>/);
  return { by: by ? parseAttrs(by[0], 'val') : null };
}

function parseScale(body) {
  const sc = body.match(/<p:animScale\b[^>]*>/);
  if (!sc) return null;
  return { detected: true };
}

function extractSpid(body) {
  return (
    parseAttrs(body.match(/<p:spTgt\b[^>]*>/)?.[0] || '', 'spid') ||
    parseAttrs(body.match(/<p:tgtEl>[\s\S]*?<p:spTgt\b[^>]*>/)?.[0] || '', 'spid')
  );
}

function parseDuration(body) {
  const animEffect = body.match(/<p:animEffect[\s\S]*?<p:cTn\b[^>]*\bdur="(\d+)"/);
  if (animEffect) return Number(animEffect[1]) || 500;
  const anim = body.match(/<p:anim\b[\s\S]*?<p:cTn\b[^>]*\bdur="(\d+)"/);
  if (anim) return Number(anim[1]) || 500;
  const durTag = body.match(/<p:cTn\b[^>]*\bdur="(\d+|indefinite)"[^>]*>/);
  if (durTag && durTag[1] !== 'indefinite') {
    const v = Number(durTag[1]);
    return v <= 10 ? 500 : v;
  }
  return 500;
}

function parseDelay(body) {
  const cond = body.match(/<p:stCondLst>[\s\S]*?<p:cond\b[^>]*>/);
  const delay = parseAttrs(cond?.[0] || '', 'delay');
  if (delay && delay !== 'indefinite') return Number(delay) || 0;
  return 0;
}

function parseRepeat(body) {
  const rep = body.match(/<p:cTn\b[^>]*repeatCount="([^"]+)"/);
  if (!rep) return 1;
  if (rep[1] === 'indefinite') return -1;
  return Number(rep[1]) || 1;
}

function isRenderableEffect(effect, type) {
  const supported = new Set([
    'appear',
    'disappear',
    'fade',
    'flyIn',
    'flyOut',
    'float',
    'split',
    'wipe',
    'zoom',
    'growShrink',
    'spin',
    'transparency',
    'motion',
    'box',
    'circle',
    'diamond',
    'blinds',
    'checkerboard',
    'dissolve',
    'randombars',
    'strips',
    'wedge',
    'wheel',
    'plus',
    'peek',
    'colorPulse',
    'fillColor',
    'fontColor',
    'lineColor',
    'spiral',
    'swivel',
    'boomerang',
    'bounce',
    'curveUp',
    'curveDown',
    'drop',
    'riseUp',
    'floatDown',
    'whip',
    'centerRevolve',
    'sinkDown',
    'teeter',
    'pulse',
    'shimmer',
  ]);
  return supported.has(effect);
}

/**
 * Extract clickEffect animation blocks without breaking on nested cTn nodes.
 */
function parseClickEffectBlocks(slideXml) {
  const blocks = [];
  const interactiveRanges = [];
  const seqRe = /<p:seq\b[^>]*>[\s\S]*?<\/p:seq>/g;
  let seqM;
  while ((seqM = seqRe.exec(slideXml))) {
    if (/nodeType="interactiveSeq"/.test(seqM[0])) {
      interactiveRanges.push({ start: seqM.index, end: seqM.index + seqM[0].length });
    }
  }

  const openRe = /<p:cTn\b([^>]*)>/g;
  let m;
  while ((m = openRe.exec(slideXml))) {
    const attrs = m[1];
    if (!/nodeType="clickEffect"/.test(attrs)) continue;
    const presetMatch = attrs.match(/presetClass="(entr|exit|emph|path)"/);
    if (!presetMatch) continue;
    const start = m.index;
    if (interactiveRanges.some((r) => start >= r.start && start < r.end)) continue;
    let depth = 1;
    let i = slideXml.indexOf('>', start) + 1;
    while (i < slideXml.length && depth > 0) {
      const nextOpen = slideXml.indexOf('<p:cTn', i);
      const nextClose = slideXml.indexOf('</p:cTn>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const openEnd = slideXml.indexOf('>', nextOpen);
        const openTag = slideXml.slice(nextOpen, openEnd + 1);
        if (!/\/>\s*$/.test(openTag)) depth += 1;
        i = openEnd + 1;
      } else {
        depth -= 1;
        i = nextClose + 8;
      }
    }
    blocks.push({
      attrs,
      presetClass: presetMatch[1],
      body: slideXml.slice(slideXml.indexOf('>', start) + 1, i - 8),
      start,
      end: i,
    });
  }
  return blocks;
}

function pushTimelineEntry(timeline, seen, orderRef, attrs, presetClass, body, nodeTypeOverride, meta = {}) {
  const presetID = parseAttrs(`<x ${attrs}>`, 'presetID');
  const nodeType = nodeTypeOverride || parseAttrs(`<x ${attrs}>`, 'nodeType');
  const spid = extractSpid(body);
  if (!spid) return orderRef.order;

  const animEffect = body.match(/<p:animEffect\b([^>]*)>/);
  const filter = animEffect ? parseAttrs(animEffect[0], 'filter') : null;

  let setHidden = null;
  const setTag = body.match(/<p:set\b[\s\S]*?<\/p:set>/);
  if (setTag) {
    const to = setTag[0].match(/<p:to>[\s\S]*?<a:strVal\s+val="([^"]+)"/);
    setHidden = to ? to[1] : null;
  }

  const effect = mapEffectFromNode(presetClass, presetID, filter, setHidden, body);
  const type =
    presetClass === 'entr' ? 'entrance'
    : presetClass === 'exit' ? 'exit'
    : presetClass === 'path' ? 'motion'
    : 'emphasis';
  const trigger = meta.objectClick ? 'object_click' : mapTrigger(nodeType, null);
  const duration = parseDuration(body);
  const delay = parseDelay(body);
  const repeat = parseRepeat(body);
  const motion = parseMotion(body);
  const rotation = parseRotation(body);
  const scale = parseScale(body);
  const order = orderRef.order;

  const key = `${spid}:${type}:${effect}:${order}:${trigger}:${meta.triggerObject || ''}`;
  if (seen.has(key)) return orderRef.order;
  seen.add(key);

  timeline.push({
    id: `animation-${order + 1}`,
    objectId: String(spid),
    targetObject: String(spid),
    type,
    effect,
    delay,
    duration,
    trigger,
    triggerObject: meta.triggerObject || null,
    triggerDetail: meta.objectClick
      ? { type: 'objectClick', object: String(meta.triggerObject) }
      : null,
    repeat,
    order,
    presetClass,
    presetID: presetID ? Number(presetID) : null,
    filter,
    motion,
    rotation,
    scale,
    renderable: isRenderableEffect(effect, type),
    nodeType,
    ooxml: {
      presetClass,
      presetID: presetID ? Number(presetID) : null,
      filter,
      nodeType,
      setHidden,
      triggerObject: meta.triggerObject || null,
    },
  });
  orderRef.order++;
  return orderRef.order;
}

/**
 * PowerPoint native p:set style.opacity animations (no animEffect preset).
 */
function parseSetOpacityAnimations(slideXml, timeline, seen, orderRef) {
  const mainMatch = slideXml.match(/nodeType="mainSeq"[\s\S]*?<\/p:seq>/);
  if (!mainMatch) return;
  const parRe = /<p:par>[\s\S]*?<\/p:par>/g;
  let pm;
  while ((pm = parRe.exec(mainMatch[0]))) {
    const part = pm[0];
    if (!/<p:set\b/.test(part) || !/style\.opacity/.test(part)) continue;
    const spid = extractSpid(part);
    if (!spid) continue;

    const toVal = part.match(/<p:strVal val="([^"]+)"/)?.[1];
    const cond = part.match(/<p:cond\b([^>]*)>/);
    const evt = cond ? parseAttrs(`<x ${cond[1]}>`, 'evt') : 'onBegin';
    let trigger = 'automatic';
    if (evt === 'onClick') trigger = 'on_click';

    const entrance = toVal === '1' || toVal === '1.0';
    const effect = entrance ? 'fade' : 'fadeOut';
    const type = entrance ? 'entrance' : 'exit';
    const duration = parseDuration(part);
    const key = `set:${spid}:${type}:${trigger}:${orderRef.order}`;
    if (seen.has(key)) continue;
    seen.add(key);

    timeline.push({
      id: `animation-${orderRef.order + 1}`,
      objectId: String(spid),
      targetObject: String(spid),
      type,
      effect,
      delay: parseDelay(part),
      duration,
      trigger,
      repeat: 1,
      order: orderRef.order++,
      presetClass: entrance ? 'entr' : 'exit',
      presetID: 10,
      filter: 'fade',
      motion: null,
      rotation: null,
      scale: null,
      renderable: true,
      nodeType: parseAttrs(part.match(/<p:cTn\b([^>]*)>/)?.[0] || '', 'nodeType'),
      ooxml: { setOpacity: true, toVal, evt, source: 'p:set' },
    });
  }
}

/**
 * Walk presetClass cTn nodes and build ordered timeline entries.
 */
function parseSlideTimeline(slideXml) {
  if (!/<p:timing[\s>]/.test(slideXml)) return [];

  const timeline = [];
  const seen = new Set();
  const orderRef = { order: 0 };

  const clickBlocks = parseClickEffectBlocks(slideXml);

  for (const block of clickBlocks) {
    for (const inner of parseAnimationsInClickBlock(block)) {
      pushTimelineEntry(
        timeline,
        seen,
        orderRef,
        inner.attrs,
        inner.presetClass,
        inner.body,
        inner.nodeType
      );
    }
  }

  for (const block of parseInteractiveSeqBlocks(slideXml)) {
    const innerParts = block.body.match(/<p:par>[\s\S]*?<\/p:par>/g) || [block.body];
    for (const part of innerParts) {
      if (!/<p:animEffect|<p:animMotion|<p:set/.test(part)) continue;
      const ctnMatch = part.match(/<p:cTn\b([^>]*)>/);
      const attrs = ctnMatch ? ctnMatch[1] : '';
      pushTimelineEntry(
        timeline,
        seen,
        orderRef,
        attrs,
        block.presetClass,
        part,
        parseAttrs(`<x ${attrs}>`, 'nodeType') || 'clickEffect',
        { objectClick: true, triggerObject: block.triggerObject }
      );
    }
  }

  const effectRe = /<p:cTn\b([^>]*presetClass="(entr|exit|emph|path)"[^>]*)>([\s\S]*?)<\/p:cTn>/g;
  let m;
  while ((m = effectRe.exec(slideXml))) {
    const nodeType = parseAttrs(`<x ${m[1]}>`, 'nodeType');
    if (nodeType === 'clickEffect') continue;
    if (clickBlocks.some((b) => m.index >= b.start && m.index < b.end)) continue;
    orderRef.order = pushTimelineEntry(
      timeline,
      seen,
      orderRef,
      m[1],
      m[2],
      m[3],
      nodeType
    );
  }

  parseSetOpacityAnimations(slideXml, timeline, seen, orderRef);

  // Fallback: standalone animEffect blocks
  if (timeline.length === 0) {
    const aeRe =
      /<p:animEffect\b([^>]*)>[\s\S]*?<p:spTgt\b[^>]*spid="(\d+)"[^>]*>[\s\S]*?<p:cTn\b[^>]*dur="(\d+)"/g;
    while ((m = aeRe.exec(slideXml))) {
      const filter = parseAttrs(`<x ${m[1]}>`, 'filter');
      const dir = parseAttrs(`<x ${m[1]}>`, 'transition');
      const presetClass = dir === 'out' ? 'exit' : 'entr';
      const effect = mapEffectFromNode(presetClass, 10, filter, null, m[0]);
      timeline.push({
        objectId: String(m[2]),
        type: presetClass === 'exit' ? 'exit' : 'entrance',
        effect,
        delay: 0,
        duration: Number(m[3]) || 500,
        trigger: 'on_click',
        repeat: 1,
        order: orderRef.order++,
        presetClass,
        presetID: 10,
        filter,
        motion: null,
        rotation: null,
        scale: null,
        renderable: isRenderableEffect(effect, presetClass === 'exit' ? 'exit' : 'entrance'),
      });
    }
  }

  return timeline;
}

function buildClickGroups(timeline) {
  const groups = [];
  let current = [];
  for (const step of timeline) {
    if (step.trigger === 'on_click' && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(step);
    if (step.trigger === 'on_click') {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

module.exports = {
  PRESET_MAP,
  parseSlideTimeline,
  buildClickGroups,
  isRenderableEffect,
};
