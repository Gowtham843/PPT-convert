/**
 * PPTX OOXML extraction: media, shapes, animations, transitions.
 * Isolated from LibreOffice PDF→PNG rendering.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const os = require('os');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.wmv', '.avi']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.wma', '.ogg', '.aac']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.emf', '.wmf', '.tiff', '.bmp']);

function emuToPct(emu, total) {
  if (!total && total !== 0) return null;
  return Number(((Number(emu) / Number(total)) * 100).toFixed(4));
}

function parseAttrs(tag, attr) {
  if (!tag) return null;
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function listSlideFiles(extractDir) {
  const slidesDir = path.join(extractDir, 'ppt', 'slides');
  if (!fs.existsSync(slidesDir)) return [];
  return fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide\d+\.xml$/i.test(f))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
}

function parsePresentationSize(extractDir) {
  const p = path.join(extractDir, 'ppt', 'presentation.xml');
  if (!fs.existsSync(p)) return { cx: 12192000, cy: 6858000 };
  const xml = fs.readFileSync(p, 'utf8');
  const m = xml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (m) return { cx: Number(m[1]), cy: Number(m[2]) };
  const m2 = xml.match(/<p:sldSz[^>]*cy="(\d+)"[^>]*cx="(\d+)"/);
  if (m2) return { cx: Number(m2[2]), cy: Number(m2[1]) };
  return { cx: 12192000, cy: 6858000 };
}

function parseRels(relsPath) {
  if (!fs.existsSync(relsPath)) return {};
  const xml = fs.readFileSync(relsPath, 'utf8');
  const map = {};
  const re = /<Relationship\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const id = parseAttrs(tag, 'Id');
    const type = parseAttrs(tag, 'Type') || '';
    const target = parseAttrs(tag, 'Target');
    if (id && target) map[id] = { type, target: target.replace(/\\/g, '/') };
  }
  return map;
}

function resolvePackagePath(target) {
  if (!target) return null;
  if (target.startsWith('ppt/')) return path.posix.normalize(target);
  if (target.startsWith('../')) return path.posix.normalize(`ppt/slides/${target}`);
  return path.posix.normalize(`ppt/slides/${target}`);
}

function classifyMedia(fileName, relType) {
  const ext = path.extname(fileName).toLowerCase();
  const t = (relType || '').toLowerCase();
  if (AUDIO_EXT.has(ext) || t.includes('/audio')) return 'audio';
  if (VIDEO_EXT.has(ext) || t.includes('/video')) return 'video';
  if (IMAGE_EXT.has(ext) || t.includes('/image')) return 'image';
  return 'other';
}

function parseXfrm(block) {
  // Prefer shape-level xfrm inside spPr / pic spPr (last off/ext pair often correct)
  const offs = [...block.matchAll(/<a:off\b[^>]*>/g)].map((x) => x[0]);
  const exts = [...block.matchAll(/<a:ext\b[^>]*>/g)].map((x) => x[0]);
  const off = offs[offs.length - 1];
  const ext = exts[exts.length - 1];
  return {
    x: off ? Number(parseAttrs(off, 'x')) : null,
    y: off ? Number(parseAttrs(off, 'y')) : null,
    cx: ext ? Number(parseAttrs(ext, 'cx')) : null,
    cy: ext ? Number(parseAttrs(ext, 'cy')) : null,
  };
}

function geomPct(xfrm, slideW, slideH) {
  return {
    leftPct: xfrm.x != null ? emuToPct(xfrm.x, slideW) : null,
    topPct: xfrm.y != null ? emuToPct(xfrm.y, slideH) : null,
    widthPct: xfrm.cx != null ? emuToPct(xfrm.cx, slideW) : null,
    heightPct: xfrm.cy != null ? emuToPct(xfrm.cy, slideH) : null,
  };
}

function extractTextFromBlock(block) {
  const parts = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let m;
  while ((m = re.exec(block))) {
    parts.push(
      m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
    );
  }
  return parts.join('\n').trim();
}

function extractFillColor(block) {
  const srgb = block.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);
  if (srgb) return `#${srgb[1]}`;
  const scheme = block.match(/<a:schemeClr\s+val="([^"]+)"/);
  if (scheme) return null; // unresolved theme
  return null;
}

function extractFontSizePt(block) {
  const m = block.match(/sz="(\d+)"/);
  if (!m) return null;
  return Number(m[1]) / 100; // hundredths of a point
}

function parseSlideBackground(slideXml) {
  const bg = slideXml.match(/<p:bg\b[\s\S]*?<\/p:bg>/);
  if (!bg) return '#FFFFFF';
  const srgb = bg[0].match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);
  if (srgb) return `#${srgb[1]}`;
  return '#FFFFFF';
}

/**
 * Extract shapes (sp + pic) with ids for animation targeting.
 */
function extractShapes(slideXml, rels, slideW, slideH, mediaSrcMap) {
  const shapes = [];

  const spRe = /<p:sp\b[\s\S]*?<\/p:sp>/g;
  let m;
  while ((m = spRe.exec(slideXml))) {
    const block = m[0];
    const id = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'id');
    const name = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'name') || '';
    if (!id || id === '1') continue; // group root
    const xfrm = parseXfrm(block);
    const g = geomPct(xfrm, slideW, slideH);
    const text = extractTextFromBlock(block);
    const fill = extractFillColor(block);
    const prst = parseAttrs(block.match(/<a:prstGeom\b[^>]*>/)?.[0] || '', 'prst');
    const fontSizePt = extractFontSizePt(block);
    // Prefer 'shape' when geometry/fill exists so overlays can show colored boxes + text
    const kind = prst || fill ? 'shape' : text ? 'text' : 'shape';
    shapes.push({
      id: String(id),
      name,
      kind,
      text: text || null,
      fill: fill || (kind === 'shape' ? '#4472C4' : null),
      prstGeom: prst,
      fontSizePt,
      ...g,
      leftEmu: xfrm.x,
      topEmu: xfrm.y,
      widthEmu: xfrm.cx,
      heightEmu: xfrm.cy,
    });
  }

  const picRe = /<p:pic\b[\s\S]*?<\/p:pic>/g;
  while ((m = picRe.exec(slideXml))) {
    const block = m[0];
    const id = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'id');
    const name = parseAttrs(block.match(/<p:cNvPr\b[^>]*>/)?.[0] || '', 'name') || '';
    if (!id) continue;
    const xfrm = parseXfrm(block);
    const g = geomPct(xfrm, slideW, slideH);

    const videoTag = block.match(/<a:videoFile\b[^>]*>/)?.[0];
    const audioTag = block.match(/<a:audioFile\b[^>]*>/)?.[0];
    const blipTag = block.match(/<a:blip\b[^>]*>/)?.[0];
    const mediaExt = block.match(/<p14:media\b[^>]*>/)?.[0];

    const videoLink = videoTag && (parseAttrs(videoTag, 'r:link') || parseAttrs(videoTag, 'link'));
    const audioLink = audioTag && (parseAttrs(audioTag, 'r:link') || parseAttrs(audioTag, 'link'));
    const mediaEmbed = mediaExt && (parseAttrs(mediaExt, 'r:embed') || parseAttrs(mediaExt, 'embed'));
    const blipEmbed = blipTag && (parseAttrs(blipTag, 'r:embed') || parseAttrs(blipTag, 'embed'));

    let mediaRid = mediaEmbed || videoLink || audioLink;
    let posterRid = blipEmbed;
    let kind = 'image';
    let src = null;
    let poster = null;

    if (mediaRid && rels[mediaRid]) {
      const fileName = path.basename(rels[mediaRid].target);
      kind = classifyMedia(fileName, rels[mediaRid].type);
      if (videoTag && kind === 'other') kind = 'video';
      if (audioTag && kind === 'other') kind = 'audio';
      if (AUDIO_EXT.has(path.extname(fileName).toLowerCase())) kind = 'audio';
      if (VIDEO_EXT.has(path.extname(fileName).toLowerCase())) kind = 'video';
      const pkg = resolvePackagePath(rels[mediaRid].target);
      src = mediaSrcMap.get(pkg) || mediaSrcMap.get(`ppt/media/${fileName}`) || null;
    } else if (blipEmbed && rels[blipEmbed]) {
      kind = 'image';
      const fileName = path.basename(rels[blipEmbed].target);
      const pkg = resolvePackagePath(rels[blipEmbed].target);
      src = mediaSrcMap.get(pkg) || mediaSrcMap.get(`ppt/media/${fileName}`) || null;
    }

    if (posterRid && rels[posterRid] && kind !== 'image') {
      const fileName = path.basename(rels[posterRid].target);
      const pkg = resolvePackagePath(rels[posterRid].target);
      poster = mediaSrcMap.get(pkg) || mediaSrcMap.get(`ppt/media/${fileName}`) || null;
    }

    shapes.push({
      id: String(id),
      name,
      kind,
      src,
      poster,
      ...g,
      leftEmu: xfrm.x,
      topEmu: xfrm.y,
      widthEmu: xfrm.cx,
      heightEmu: xfrm.cy,
    });
  }

  return shapes;
}

/**
 * Parse media play settings from p:timing (video/audio nodes).
 */
function parseMediaTiming(slideXml) {
  const settings = {}; // spid -> { autoplay, loop, volume }

  const mediaNodeRe = /<p:(video|audio)\b[\s\S]*?<\/p:\1>/g;
  let m;
  while ((m = mediaNodeRe.exec(slideXml))) {
    const block = m[0];
    const spid = parseAttrs(block.match(/<p:spTgt\b[^>]*>/)?.[0] || '', 'spid');
    if (!spid) continue;
    const delay = parseAttrs(block.match(/<p:cond\b[^>]*>/)?.[0] || '', 'delay');
    const vol = parseAttrs(block.match(/<p:cMediaNode\b[^>]*>/)?.[0] || '', 'vol');
    const repeat = parseAttrs(block.match(/<p:cTn\b[^>]*repeatCount="[^"]+"[^>]*>/)?.[0] || '', 'repeatCount');
    const autoplay = delay != null && delay !== 'indefinite';
    settings[String(spid)] = {
      autoplay,
      startOnClick: !autoplay,
      loop: repeat === 'indefinite',
      volume: vol != null ? Number(vol) / 100000 : 0.8,
      delayRaw: delay,
    };
  }
  return settings;
}

/**
 * Map PowerPoint preset/effect to our subset.
 * presetClass: entr | exit | emph
 * presetID common: 1 appear, 10 fade, ...
 */
function mapEffect(presetClass, presetID, animEffectFilter, isSetHidden) {
  const pid = Number(presetID);
  if (isSetHidden === '1' || isSetHidden === 'true') {
    return presetClass === 'exit' || !presetClass ? 'disappear' : 'appear';
  }
  if (animEffectFilter === 'fade' || pid === 10) {
    if (presetClass === 'exit') return 'fadeOut';
    return 'fadeIn';
  }
  if (pid === 1 || animEffectFilter === 'appear') {
    if (presetClass === 'exit') return 'disappear';
    return 'appear';
  }
  // Basic entrance/exit fallbacks
  if (presetClass === 'entr') return 'fadeIn';
  if (presetClass === 'exit') return 'fadeOut';
  if (animEffectFilter) return 'fadeIn';
  return null;
}

/**
 * Parse a useful subset of the timing tree into ordered animation steps.
 */
function parseAnimations(slideXml) {
  const animations = [];
  if (!/<p:timing[\s>]/.test(slideXml)) return animations;

  // Walk clickEffect / withEffect nodes that contain animEffect or set
  const effectRe =
    /<p:cTn\b([^>]*presetClass="(entr|exit|emph)"[^>]*)>([\s\S]*?)<\/p:cTn>/g;
  let m;
  let order = 0;
  while ((m = effectRe.exec(slideXml))) {
    const attrs = m[1];
    const presetClass = m[2];
    const body = m[3];
    // Skip nested deep duplicates by requiring animEffect or set with spTgt in body
    // and not containing another presetClass child (heuristic: take leaf-ish)
    if (/presetClass="(entr|exit|emph)"/.test(body)) {
      // contains nested — skip parent shells; leaf will match separately if attrs on same tag
    }

    const presetID = parseAttrs(`<x ${attrs}>`, 'presetID');
    const nodeType = parseAttrs(`<x ${attrs}>`, 'nodeType');

    const animEffect = body.match(/<p:animEffect\b([^>]*)>/);
    const filter = animEffect ? parseAttrs(animEffect[0], 'filter') : null;
    const transitionDir = animEffect ? parseAttrs(animEffect[0], 'transition') : null;

    const setTag = body.match(/<p:set\b[\s\S]*?<\/p:set>/);
    let isSetHidden = null;
    if (setTag) {
      const to = setTag[0].match(/<p:to>[\s\S]*?<a:strVal\s+val="([^"]+)"/);
      isSetHidden = to ? to[1] : null;
    }

    const spid =
      parseAttrs(body.match(/<p:spTgt\b[^>]*>/)?.[0] || '', 'spid') ||
      parseAttrs(body.match(/<p:tgtEl>[\s\S]*?<p:spTgt\b[^>]*>/)?.[0] || '', 'spid');

    const durTag = body.match(/<p:cTn\b[^>]*dur="(\d+|indefinite)"[^>]*>/);
    let duration = 500;
    if (durTag && durTag[1] !== 'indefinite') duration = Number(durTag[1]);

    // delay from first stCond
    const condDelay = parseAttrs(body.match(/<p:stCondLst>[\s\S]*?<p:cond\b[^>]*>/)?.[0] || '', 'delay');
    let delay = 0;
    if (condDelay && condDelay !== 'indefinite') delay = Number(condDelay) || 0;

    // motion
    let motion = null;
    if (/<p:animMotion\b/.test(body)) {
      const path = parseAttrs(body.match(/<p:animMotion\b[^>]*>/)?.[0] || '', 'path');
      motion = path || true;
    }

    const effect = mapEffect(presetClass, presetID, filter, isSetHidden);
    if (!effect || !spid) continue;

    // Deduplicate identical consecutive
    const key = `${spid}:${effect}:${presetClass}:${duration}`;
    if (animations.some((a) => a._key === key && a.order === order)) continue;

    animations.push({
      _key: key,
      objectId: String(spid),
      effect,
      presetClass,
      presetID: presetID ? Number(presetID) : null,
      filter,
      transitionDir,
      start: nodeType === 'withEffect' ? 'withPrevious' : nodeType === 'afterEffect' ? 'afterPrevious' : 'onClick',
      duration,
      delay,
      order: order++,
      motion: motion ? 'simple' : null,
      supported: ['appear', 'disappear', 'fadeIn', 'fadeOut'].includes(effect) || effect === 'fadeIn',
    });
  }

  // Also catch standalone animEffect if presetClass walk missed
  if (animations.length === 0) {
    const aeRe = /<p:animEffect\b([^>]*)>[\s\S]*?<p:spTgt\b[^>]*spid="(\d+)"[^>]*>[\s\S]*?<p:cTn\b[^>]*dur="(\d+)"/g;
    while ((m = aeRe.exec(slideXml))) {
      const filter = parseAttrs(m[0].includes('filter') ? m[0] : `<x ${m[1]}>`, 'filter') || parseAttrs(`<x ${m[1]}>`, 'filter');
      const dir = parseAttrs(`<x ${m[1]}>`, 'transition');
      const effect = mapEffect(dir === 'out' ? 'exit' : 'entr', 10, filter, null);
      animations.push({
        objectId: String(m[2]),
        effect: effect || 'fadeIn',
        presetClass: dir === 'out' ? 'exit' : 'entr',
        presetID: 10,
        filter,
        start: 'onClick',
        duration: Number(m[3]) || 500,
        delay: 0,
        order: order++,
        motion: null,
        supported: true,
      });
    }
  }

  animations.forEach((a) => {
    delete a._key;
    a.supported = ['appear', 'disappear', 'fadeIn', 'fadeOut'].includes(a.effect);
  });

  return animations;
}

function detectTransition(slideXml) {
  const m = slideXml.match(/<p:transition\b([^>]*)(?:\/>|>([\s\S]*?)<\/p:transition>)/);
  if (!m) return { detected: false, type: 'none', speed: 'med', supported: true };
  const attrs = m[1] || '';
  const inner = m[2] || '';
  const spd = parseAttrs(`<x ${attrs}>`, 'spd') || 'med';
  let type = 'none';
  if (/<p:fade\b/.test(inner) || /<p:fade\b/.test(attrs)) type = 'fade';
  else if (/<p:push\b/.test(inner)) type = 'push';
  else if (/<p:wipe\b/.test(inner)) type = 'wipe';
  else if (/<p:([\w]+)/.test(inner)) {
    const t = inner.match(/<p:([\w]+)/);
    type = t ? t[1] : 'unknown';
  }
  const supported = ['none', 'fade', 'push', 'wipe'].includes(type);
  return { detected: type !== 'none', type, speed: spd, supported };
}

function copyMediaDir(extractDir, mediaOut) {
  const copied = new Map();
  const mediaDir = path.join(extractDir, 'ppt', 'media');
  fse.ensureDirSync(mediaOut);
  if (!fs.existsSync(mediaDir)) return copied;
  for (const f of fs.readdirSync(mediaDir)) {
    const src = path.join(mediaDir, f);
    if (!fs.statSync(src).isFile()) continue;
    fse.copySync(src, path.join(mediaOut, f));
    copied.set(`ppt/media/${f}`, `media/${f}`);
  }
  return copied;
}

function extractPptxFeatures(pptxPath, outputDir) {
  const ext = path.extname(pptxPath).toLowerCase();
  if (ext !== '.pptx') {
    return {
      supported: false,
      reason: 'OOXML extraction only for .pptx',
      slides: [],
      summary: emptySummary(),
    };
  }

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-extract-'));
  const mediaOut = path.join(outputDir, 'media');

  try {
    execFileSync('unzip', ['-qq', '-o', pptxPath, '-d', extractDir], { stdio: 'pipe' });
    const { cx: slideW, cy: slideH } = parsePresentationSize(extractDir);
    const mediaSrcMap = copyMediaDir(extractDir, mediaOut);
    const slideFiles = listSlideFiles(extractDir);

    let anyText = false;
    let anyImage = false;
    let anyVideo = false;
    let anyAudio = false;
    let anyAnim = false;
    let anyTrans = false;
    let animParsed = 0;
    let animSupported = 0;

    const slides = slideFiles.map((file, idx) => {
      const slidePath = path.join(extractDir, 'ppt', 'slides', file);
      const relsPath = path.join(extractDir, 'ppt', 'slides', '_rels', `${file}.rels`);
      const xml = fs.readFileSync(slidePath, 'utf8');
      const rels = parseRels(relsPath);
      const bg = parseSlideBackground(xml);
      const shapes = extractShapes(xml, rels, slideW, slideH, mediaSrcMap);
      const mediaTiming = parseMediaTiming(xml);
      const animations = parseAnimations(xml);
      const transition = detectTransition(xml);

      // Enrich media shapes with timing
      const media = [];
      for (const sh of shapes) {
        if (sh.kind === 'video' || sh.kind === 'audio') {
          const timing = mediaTiming[sh.id] || {
            autoplay: false,
            startOnClick: true,
            loop: false,
            volume: 0.8,
          };
          media.push({
            type: sh.kind,
            objectId: sh.id,
            src: sh.src,
            poster: sh.poster || null,
            leftPct: sh.leftPct,
            topPct: sh.topPct,
            widthPct: sh.widthPct,
            heightPct: sh.heightPct,
            ...timing,
          });
          if (sh.kind === 'video') anyVideo = true;
          if (sh.kind === 'audio') anyAudio = true;
        }
        if (sh.kind === 'image' && sh.src) anyImage = true;
        if (sh.kind === 'text' && sh.text) anyText = true;
      }

      if (/<a:t>/.test(xml)) anyText = true;
      for (const rel of Object.values(rels)) {
        if (classifyMedia(rel.target, rel.type) === 'image') anyImage = true;
      }

      if (animations.length) {
        anyAnim = true;
        animParsed += animations.length;
        animSupported += animations.filter((a) => a.supported).length;
      }
      if (transition.detected) anyTrans = true;

      // Animated object overlays: shapes targeted by animations
      const animatedIds = new Set(animations.map((a) => a.objectId));
      const animOverlays = shapes
        .filter((s) => animatedIds.has(s.id))
        .map((s) => ({
          objectId: s.id,
          kind: s.kind,
          text: s.text || null,
          src: s.src || null,
          fill: s.fill || '#4472C4',
          fontSizePt: s.fontSizePt,
          leftPct: s.leftPct,
          topPct: s.topPct,
          widthPct: s.widthPct,
          heightPct: s.heightPct,
        }));

      return {
        index: idx + 1,
        file,
        background: bg,
        shapes,
        media,
        animations,
        animOverlays,
        transition,
        hasText: /<a:t>/.test(xml),
        hasTable: /<a:tbl[\s>]/.test(xml),
        hasChart: /<c:chart[\s>]/.test(xml) || Object.values(rels).some((r) => (r.type || '').includes('chart')),
      };
    });

    const features = {
      originalFile: path.basename(pptxPath),
      slideWidthEmu: slideW,
      slideHeightEmu: slideH,
      slideCount: slides.length,
      slides,
      summary: {
        detected: {
          text: anyText,
          images: anyImage,
          video: anyVideo,
          audio: anyAudio,
          animation: anyAnim,
          transition: anyTrans,
        },
        animationStats: {
          parsed: animParsed,
          supportedSubset: animSupported,
        },
        preservedByPngPipeline: {
          text: anyText,
          images: anyImage,
          video: false,
          audio: false,
          animation: false,
          transition: false,
        },
        limitations: [
          'PNG flattens objects; animations require HTML overlays + background covers',
          'Only appear/disappear/fadeIn/fadeOut (+ basic entrance/exit mapped to fade) are rendered',
          'Complex motion paths, emphasis, morph, triggers are NOT supported',
          'Theme/scheme colors may not resolve; shape fill may be approximate',
          'Video/audio timing is PARTIAL vs PowerPoint click-sequence',
          'Not equivalent to iSpringCloud',
        ],
      },
      extractedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(outputDir, 'features.json'), JSON.stringify(features, null, 2));
    fs.writeFileSync(
      path.join(outputDir, 'animations.json'),
      JSON.stringify(
        slides.map((s) => ({
          slide: s.index,
          animations: s.animations,
          overlays: s.animOverlays,
          transition: s.transition,
        })),
        null,
        2
      )
    );
    return features;
  } finally {
    try {
      fse.removeSync(extractDir);
    } catch {
      /* ignore */
    }
  }
}

function emptySummary() {
  return {
    detected: {
      text: false,
      images: false,
      video: false,
      audio: false,
      animation: false,
      transition: false,
    },
    animationStats: { parsed: 0, supportedSubset: 0 },
    preservedByPngPipeline: {
      text: false,
      images: false,
      video: false,
      audio: false,
      animation: false,
      transition: false,
    },
    limitations: [],
  };
}

function buildFeatureReport(features, opts) {
  const d = features.summary?.detected || emptySummary().detected;
  const hasSlides = opts.slideCount > 0;
  const videoOk = opts.overlayVideoCount > 0;
  const audioOk = opts.overlayAudioCount > 0;
  const animRendered = opts.animRenderedCount > 0;
  const animParsed = (features.summary?.animationStats?.parsed || 0) > 0;
  const transRendered = opts.transitionRenderedCount > 0;
  const transParsed = !!d.transition;

  const classify = (detected, extracted, rendered, partial) => {
    if (!detected) return { detected: 'NO', extracted: 'NO', rendered: 'NO', result: 'N/A' };
    if (rendered && partial) return { detected: 'YES', extracted: extracted ? 'YES' : 'PARTIAL', rendered: 'PARTIAL', result: 'PARTIAL' };
    if (rendered) return { detected: 'YES', extracted: 'YES', rendered: 'YES', result: 'PASS' };
    if (extracted || animParsed) return { detected: 'YES', extracted: extracted ? 'YES' : 'YES', rendered: 'NO', result: 'FAIL' };
    return { detected: 'YES', extracted: 'NO', rendered: 'NO', result: 'FAIL' };
  };

  return {
    detail: {
      Video: {
        detected: d.video ? 'YES' : 'NO',
        extracted: videoOk ? 'YES' : d.video ? 'NO' : 'NO',
        positioned: videoOk ? 'YES' : 'NO',
        playable: videoOk ? 'YES' : 'NO',
        timing: videoOk ? 'PARTIAL' : 'NO',
        result: videoOk ? 'PARTIAL' : d.video ? 'FAIL' : 'N/A',
      },
      Audio: {
        detected: d.audio ? 'YES' : 'NO',
        extracted: audioOk ? 'YES' : 'NO',
        playable: audioOk ? 'YES' : 'NO',
        timing: audioOk ? 'PARTIAL' : 'NO',
        result: audioOk ? 'PARTIAL' : d.audio ? 'FAIL' : 'N/A',
      },
      Animations: {
        detected: d.animation ? 'YES' : 'NO',
        parsed: animParsed ? 'YES' : 'NO',
        rendered: animRendered ? 'PARTIAL' : 'NO',
        result: animRendered ? 'PARTIAL' : d.animation ? 'FAIL' : 'N/A',
      },
      Transitions: {
        detected: d.transition ? 'YES' : 'NO',
        parsed: transParsed ? 'YES' : 'NO',
        rendered: transRendered ? 'YES' : 'NO',
        result: transRendered ? 'PARTIAL' : d.transition ? 'FAIL' : 'N/A',
      },
      Static: {
        detected: 'YES',
        extracted: hasSlides ? 'YES' : 'NO',
        rendered: hasSlides ? 'YES' : 'NO',
        result: hasSlides ? 'PASS' : 'FAIL',
      },
    },
    matrix: {
      Text: {
        detected: d.text ? 'YES' : 'NO',
        preserved: hasSlides && d.text ? 'YES' : 'NO',
        viewerWorks: hasSlides ? 'YES' : 'NO',
      },
      Images: {
        detected: d.images ? 'YES' : 'NO',
        preserved: hasSlides && d.images ? 'YES' : 'NO',
        viewerWorks: hasSlides ? 'YES' : 'NO',
      },
      Video: {
        detected: d.video ? 'YES' : 'NO',
        preserved: 'NO',
        viewerWorks: videoOk ? 'YES' : 'NO',
      },
      Audio: {
        detected: d.audio ? 'YES' : 'NO',
        preserved: 'NO',
        viewerWorks: audioOk ? 'YES' : 'NO',
      },
      Animation: {
        detected: d.animation ? 'YES' : 'NO',
        preserved: 'NO',
        viewerWorks: animRendered ? 'PARTIAL' : 'NO',
      },
      Transition: {
        detected: d.transition ? 'YES' : 'NO',
        preserved: 'NO',
        viewerWorks: transRendered ? 'YES' : 'NO',
      },
    },
    notes: [
      'PASS/PARTIAL/FAIL reflect browser-renderable behavior, not mere XML detection.',
      'Video/Audio timing vs PowerPoint click-sequence is PARTIAL.',
      'Animations: subset only (appear/disappear/fade); PNG regions covered then overlaid.',
      'Transitions: fade/push/wipe only.',
      'Not equivalent to iSpringCloud.',
    ],
    unsupported: [
      'Full PowerPoint animation engine (motion paths, emphasis, morph, triggers)',
      'Theme-resolved colors for all shapes',
      'Editable HTML text matching PPT fonts exactly',
      'Transitions beyond fade/push/wipe',
    ],
  };
}

module.exports = {
  extractPptxFeatures,
  buildFeatureReport,
  emptySummary,
};
