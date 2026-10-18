#!/usr/bin/env node

/**
 * Local POC: PPT/PPTX → LibreOffice PDF → PNG → HTML viewer
 * + PPTX OOXML: video/audio overlays, basic animations, basic transitions
 *
 * Usage:
 *   node convert.js --file "/absolute/path/to/presentation.pptx"
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const os = require('os');
const { extractPptxFeatures, buildFeatureReport } = require('./lib/extract-pptx');

const LIBREOFFICE_PATHS = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/libreoffice',
  'soffice',
];

const PDFTOPPM_PATHS = [
  '/opt/homebrew/bin/pdftoppm',
  '/usr/local/bin/pdftoppm',
  '/usr/bin/pdftoppm',
  'pdftoppm',
];

const RENDER_DPI = 144;
const OUTPUT_BASE = path.join(__dirname, 'output');
const TMP_BASE = path.join(__dirname, 'tmp');

function ok(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
  }
  return args;
}

function commandExists(cmdPath) {
  try {
    if (cmdPath.includes('/') || cmdPath.includes('\\')) return fs.existsSync(cmdPath);
    execSync(`command -v ${cmdPath}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function findLibreOffice() {
  for (const p of LIBREOFFICE_PATHS) {
    if (!commandExists(p)) continue;
    try {
      execFileSync(p, ['--version'], { stdio: 'pipe' });
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

function findPdftoppm() {
  for (const p of PDFTOPPM_PATHS) {
    if (!commandExists(p)) continue;
    if (p.includes('/') || p.includes('\\')) return p;
    try {
      execSync('command -v pdftoppm', { stdio: 'pipe' });
      return 'pdftoppm';
    } catch {
      /* next */
    }
  }
  return null;
}

function validateInput(filePath) {
  if (!filePath) {
    fail(
      'Missing --file\n\nUsage:\n  node convert.js --file "/absolute/path/to/file.pptx" [--output "./output"]'
    );
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) fail(`Input file does not exist: ${resolved}`);
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.ppt' && ext !== '.pptx') {
    fail(`Only .ppt and .pptx are supported (got ${ext || 'no extension'})`);
  }
  return resolved;
}

function resolveOutputDir(inputPath, outputArg) {
  const base = path.basename(inputPath, path.extname(inputPath));
  if (outputArg) {
    const resolved = path.resolve(outputArg);
    if (path.basename(resolved) === base) return resolved;
    return path.join(resolved, base);
  }
  return path.join(OUTPUT_BASE, base);
}

function convertToPdf(libreOfficePath, inputFile, workDir) {
  fse.ensureDirSync(workDir);
  try {
    execFileSync(
      libreOfficePath,
      ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', workDir, inputFile],
      { timeout: 180000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    fail(`LibreOffice conversion failed:\n${[err.stderr, err.stdout, err.message].filter(Boolean).join('\n')}`);
  }
  const base = path.basename(inputFile, path.extname(inputFile));
  const pdfPath = path.join(workDir, `${base}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    const pdfs = fs.readdirSync(workDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 1) return path.join(workDir, pdfs[0]);
    fail(`PDF generation failed — no PDF found in ${workDir}`);
  }
  return pdfPath;
}

function rasterizePdfToPngs(pdftoppmPath, pdfPath, slidesDir) {
  fse.ensureDirSync(slidesDir);
  fse.emptyDirSync(slidesDir);
  const prefix = path.join(slidesDir, 'slide');
  try {
    execFileSync(pdftoppmPath, ['-png', '-r', String(RENDER_DPI), pdfPath, prefix], {
      timeout: 300000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    fail(`PDF → PNG conversion failed:\n${[err.stderr, err.stdout, err.message].filter(Boolean).join('\n')}`);
  }
  const raw = fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide-?\d+\.png$/i.test(f))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  if (!raw.length) fail(`PDF → PNG conversion failed — no PNG files in ${slidesDir}`);
  const slides = [];
  raw.forEach((name, i) => {
    const dest = `slide-${String(i + 1).padStart(3, '0')}.png`;
    const from = path.join(slidesDir, name);
    const to = path.join(slidesDir, dest);
    if (from !== to) {
      if (fs.existsSync(to)) fs.unlinkSync(to);
      fs.renameSync(from, to);
    }
    slides.push(dest);
  });
  let width = null;
  let height = null;
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path.join(slidesDir, slides[0])], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const wm = out.match(/pixelWidth:\s*(\d+)/);
    const hm = out.match(/pixelHeight:\s*(\d+)/);
    if (wm) width = parseInt(wm[1], 10);
    if (hm) height = parseInt(hm[1], 10);
  } catch {
    /* optional */
  }
  return { slides, width, height };
}

function buildSlideModel(slideFiles, features) {
  return slideFiles.map((file, i) => {
    const feat = features.slides?.[i] || {};
    const mediaOverlays = (feat.media || [])
      .filter((m) => m.src && (m.type === 'video' || m.type === 'audio'))
      .map((m) => ({
        type: m.type,
        src: m.src,
        poster: m.poster || null,
        leftPct: m.leftPct ?? 0,
        topPct: m.topPct ?? 0,
        widthPct: m.widthPct ?? 20,
        heightPct: m.heightPct ?? 15,
        autoplay: !!m.autoplay,
        loop: !!m.loop,
        startOnClick: m.startOnClick !== false,
        volume: typeof m.volume === 'number' ? m.volume : 0.8,
      }));

    const animOverlays = (feat.animOverlays || []).map((o) => ({
      objectId: o.objectId,
      kind: o.kind,
      text: o.text,
      src: o.src,
      fill: o.fill || '#4472C4',
      fontSizePt: o.fontSizePt || 24,
      leftPct: o.leftPct ?? 0,
      topPct: o.topPct ?? 0,
      widthPct: o.widthPct ?? 10,
      heightPct: o.heightPct ?? 10,
    }));

    const animations = (feat.animations || [])
      .filter((a) => a.supported)
      .map((a) => ({
        objectId: a.objectId,
        effect: a.effect,
        start: a.start,
        duration: a.duration || 500,
        delay: a.delay || 0,
        order: a.order,
      }));

    const transition = feat.transition || { type: 'none', supported: true };
    const transitionType = transition.supported ? transition.type : 'fade';

    return {
      image: `slides/${file}`,
      background: feat.background || '#FFFFFF',
      mediaOverlays,
      animOverlays,
      animations,
      transition: transitionType || 'none',
      animationDetected: (feat.animations || []).length > 0,
      transitionDetected: !!transition.detected,
    };
  });
}

function buildViewerHtml(slideModel, title) {
  const slidesJson = JSON.stringify(slideModel);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#1a1a1a;--fg:#f2f2f2;--muted:#9a9a9a;--bar:#111;--btn:#2a2a2a}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.app{display:flex;flex-direction:column;height:100%}
.stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:12px;overflow:hidden}
.viewport{position:relative;max-width:100%;max-height:100%;overflow:hidden}
.frame{position:relative;max-width:100%;max-height:100%;line-height:0;transform-origin:center center}
.frame img.slide-img{max-width:100%;max-height:calc(100vh - 72px);width:auto;height:auto;object-fit:contain;display:block;background:#000;user-select:none;-webkit-user-drag:none}
.cover{position:absolute;z-index:1;pointer-events:none}
.anim-obj{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:1}
.anim-obj.hidden-init{opacity:0}
.anim-obj.text{color:#111;font-weight:600;text-align:center;padding:4px;white-space:pre-wrap;line-height:1.2}
.anim-obj.shape{border-radius:4px}
.anim-obj img{width:100%;height:100%;object-fit:contain;display:block}
.media-ov{position:absolute;z-index:4;background:rgba(0,0,0,.12)}
.media-ov video,.media-ov audio{width:100%;height:100%;display:block;background:#000}
.media-ov audio{height:36px;min-height:36px}
.flags{position:absolute;left:8px;bottom:8px;z-index:5;font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:4px 8px;border-radius:4px;line-height:1.3;pointer-events:none}
.bar{display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;background:var(--bar);border-top:1px solid #222;flex-shrink:0;flex-wrap:wrap}
.bar button{appearance:none;border:1px solid #444;background:var(--btn);color:var(--fg);padding:8px 14px;font-size:14px;cursor:pointer;border-radius:4px}
.bar button:disabled{opacity:.4;cursor:default}
.counter{min-width:7em;text-align:center;color:var(--muted);font-variant-numeric:tabular-nums;font-size:14px}
.note{font-size:12px;color:var(--muted);max-width:48em}
/* transitions on viewport */
.viewport.tx-fade-out .frame{animation:fadeOut .45s forwards}
.viewport.tx-fade-in .frame{animation:fadeIn .45s forwards}
.viewport.tx-push-left .frame{animation:pushLeft .45s forwards}
.viewport.tx-push-right .frame{animation:pushRight .45s forwards}
.viewport.tx-wipe .frame{animation:wipeIn .45s forwards}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes fadeOut{from{opacity:1}to{opacity:0}}
@keyframes pushLeft{from{transform:translateX(0)}to{transform:translateX(-110%)}}
@keyframes pushRight{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes wipeIn{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
</style>
</head>
<body>
<div class="app">
  <div class="stage">
    <div class="viewport" id="viewport">
      <div class="frame" id="frame">
        <img class="slide-img" id="slide" alt="Slide"/>
        <div id="covers"></div>
        <div id="animLayer"></div>
        <div id="mediaLayer"></div>
        <div class="flags" id="flags" hidden></div>
      </div>
    </div>
  </div>
  <div class="bar">
    <button type="button" id="prev">Previous</button>
    <span class="counter" id="counter">Slide 1 / 1</span>
    <button type="button" id="next">Next</button>
    <button type="button" id="replay">Replay anim</button>
    <button type="button" id="fs">Fullscreen</button>
    <span class="note">PNG base + media/anim overlays. Subset only — not iSpring.</span>
  </div>
</div>
<script>
(function(){
  var slides = ${slidesJson};
  var index = 0;
  var busy = false;
  var img = document.getElementById('slide');
  var covers = document.getElementById('covers');
  var animLayer = document.getElementById('animLayer');
  var mediaLayer = document.getElementById('mediaLayer');
  var flags = document.getElementById('flags');
  var counter = document.getElementById('counter');
  var viewport = document.getElementById('viewport');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');

  function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }

  function place(el, o){
    el.style.left = (o.leftPct||0)+'%';
    el.style.top = (o.topPct||0)+'%';
    el.style.width = (o.widthPct||10)+'%';
    el.style.height = (o.heightPct||10)+'%';
  }

  function buildAnimLayer(slide){
    clear(covers); clear(animLayer);
    var bg = slide.background || '#FFFFFF';
    var byId = {};
    (slide.animOverlays||[]).forEach(function(o){
      // Cover flattened PNG pixels so we can animate HTML instead
      var cover = document.createElement('div');
      cover.className = 'cover';
      cover.style.background = bg;
      place(cover, o);
      covers.appendChild(cover);

      var node = document.createElement('div');
      node.className = 'anim-obj';
      node.dataset.objectId = o.objectId;
      place(node, o);
      if (o.kind === 'image' && o.src){
        var im = document.createElement('img');
        im.src = o.src;
        node.appendChild(im);
      } else if (o.kind === 'shape'){
        node.className += ' shape';
        node.style.background = o.fill || '#4472C4';
        if (o.text){
          node.textContent = o.text;
          node.style.color = '#fff';
          if (o.fontSizePt) node.style.fontSize = Math.max(12, Math.min(48, o.fontSizePt)) + 'px';
        }
      } else if (o.kind === 'text' && o.text){
        node.className += ' text';
        node.textContent = o.text;
        if (o.fontSizePt) node.style.fontSize = Math.max(12, Math.min(48, o.fontSizePt)) + 'px';
      } else {
        node.className += ' shape';
        node.style.background = o.fill || '#4472C4';
        if (o.text) node.textContent = o.text;
      }
      // Default: if any entrance targets this object, start hidden
      var hasEntrance = (slide.animations||[]).some(function(a){
        return a.objectId===o.objectId && (a.effect==='appear'||a.effect==='fadeIn');
      });
      var hasExitOnly = !hasEntrance && (slide.animations||[]).some(function(a){
        return a.objectId===o.objectId && (a.effect==='disappear'||a.effect==='fadeOut');
      });
      if (hasEntrance) node.classList.add('hidden-init');
      if (hasExitOnly) node.style.opacity = '1';
      byId[o.objectId] = node;
      animLayer.appendChild(node);
    });
    return byId;
  }

  function buildMedia(slide){
    clear(mediaLayer);
    (slide.mediaOverlays||[]).forEach(function(o){
      var wrap = document.createElement('div');
      wrap.className = 'media-ov';
      place(wrap, o);
      if (o.type==='audio') wrap.style.height = Math.max(o.heightPct||6, 5)+'%';
      var el;
      if (o.type==='video'){
        el = document.createElement('video');
        el.src = o.src;
        if (o.poster) el.poster = o.poster;
        el.controls = true;
        el.preload = 'metadata';
        el.loop = !!o.loop;
        el.volume = o.volume;
        if (o.autoplay){
          el.autoplay = true;
          el.muted = true; // browser autoplay policy
          el.playsInline = true;
        }
      } else {
        el = document.createElement('audio');
        el.src = o.src;
        el.controls = true;
        el.preload = 'metadata';
        el.loop = !!o.loop;
        el.volume = o.volume;
        if (o.autoplay){
          el.autoplay = true;
          // audio autoplay often blocked; still set attribute
        }
      }
      wrap.appendChild(el);
      mediaLayer.appendChild(wrap);
      if (o.autoplay){
        var p = el.play();
        if (p && p.catch) p.catch(function(){});
      }
    });
  }

  function runAnimations(slide, byId){
    var list = (slide.animations||[]).slice().sort(function(a,b){return a.order-b.order;});
    if (!list.length) return;
    var t = 0;
    list.forEach(function(a, i){
      var node = byId[a.objectId];
      if (!node) return;
      var startAt = t + (a.delay||0);
      if (a.start === 'withPrevious' && i>0){
        // overlap with previous start
        startAt = Math.max(0, t - (list[i-1].duration||500)) + (a.delay||0);
      }
      setTimeout(function(){
        node.style.transition = 'opacity '+(a.duration||500)+'ms ease';
        if (a.effect==='appear' || a.effect==='fadeIn'){
          node.classList.remove('hidden-init');
          node.style.opacity = '1';
        } else if (a.effect==='disappear' || a.effect==='fadeOut'){
          node.style.opacity = '0';
        }
        if (a.motion==='simple' || a.effect==='fadeIn'){
          // tiny optional slide-up for basic entrance feel
          if (a.effect==='fadeIn' || a.effect==='appear'){
            node.style.transform = 'translateY(12px)';
            requestAnimationFrame(function(){
              node.style.transition = 'opacity '+(a.duration||500)+'ms ease, transform '+(a.duration||500)+'ms ease';
              node.style.transform = 'translateY(0)';
            });
          }
        }
      }, startAt);
      if (a.start !== 'withPrevious') t = startAt + (a.duration||500) + 80;
    });
  }

  function paint(i){
    var slide = slides[i];
    img.src = slide.image;
    var byId = buildAnimLayer(slide);
    buildMedia(slide);
    runAnimations(slide, byId);
    counter.textContent = 'Slide '+(i+1)+' / '+slides.length;
    prevBtn.disabled = i===0;
    nextBtn.disabled = i===slides.length-1;
    var msgs=[];
    if (slide.animationDetected) msgs.push('Animations: subset playback');
    if (slide.transitionDetected) msgs.push('Transition: '+slide.transition);
    if (msgs.length){ flags.hidden=false; flags.textContent=msgs.join(' · '); }
    else { flags.hidden=true; }
  }

  function clearTx(){
    viewport.className = 'viewport';
  }

  function go(to, dir){
    if (busy || to<0 || to>=slides.length || to===index) return;
    busy = true;
    var fromSlide = slides[index];
    var tx = dir>0 ? (fromSlide.transition||'none') : (slides[to].transition||'none');
    if (tx==='none' || !tx){
      index = to;
      paint(index);
      busy = false;
      return;
    }
    var outClass = tx==='push' ? 'tx-push-left' : 'tx-fade-out';
    viewport.classList.add(outClass);
    setTimeout(function(){
      index = to;
      paint(index);
      clearTx();
      var inClass = tx==='push' ? 'tx-push-right' : (tx==='wipe' ? 'tx-wipe' : 'tx-fade-in');
      viewport.classList.add(inClass);
      setTimeout(function(){ clearTx(); busy=false; }, 480);
    }, 420);
  }

  document.getElementById('prev').addEventListener('click', function(){ go(index-1, -1); });
  document.getElementById('next').addEventListener('click', function(){ go(index+1, 1); });
  document.getElementById('replay').addEventListener('click', function(){ paint(index); });
  document.getElementById('fs').addEventListener('click', function(){
    var el=document.documentElement;
    if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen).call(el); }
    else { (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='ArrowLeft'){ e.preventDefault(); go(index-1,-1); }
    if(e.key==='ArrowRight'){ e.preventDefault(); go(index+1,1); }
  });

  paint(0);
})();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dirSizeBytes(dir) {
  let total = 0;
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

function printDetailReport(report) {
  console.log('\n==============================');
  console.log('FEATURE SUPPORT TEST');
  console.log('==============================\n');
  const d = report.detail;
  console.log('Video:');
  console.log(`  detected: ${d.Video.detected}`);
  console.log(`  extracted: ${d.Video.extracted}`);
  console.log(`  positioned: ${d.Video.positioned}`);
  console.log(`  playable: ${d.Video.playable}`);
  console.log(`  timing: ${d.Video.timing}`);
  console.log(`  result: ${d.Video.result}`);
  console.log('\nAudio:');
  console.log(`  detected: ${d.Audio.detected}`);
  console.log(`  extracted: ${d.Audio.extracted}`);
  console.log(`  playable: ${d.Audio.playable}`);
  console.log(`  timing: ${d.Audio.timing}`);
  console.log(`  result: ${d.Audio.result}`);
  console.log('\nAnimations:');
  console.log(`  detected: ${d.Animations.detected}`);
  console.log(`  parsed: ${d.Animations.parsed}`);
  console.log(`  rendered: ${d.Animations.rendered}`);
  console.log(`  result: ${d.Animations.result}`);
  console.log('\nTransitions:');
  console.log(`  detected: ${d.Transitions.detected}`);
  console.log(`  parsed: ${d.Transitions.parsed}`);
  console.log(`  rendered: ${d.Transitions.rendered}`);
  console.log(`  result: ${d.Transitions.result}`);
}

function main() {
  console.log('\nPPT/PPTX → PDF → PNG + OOXML overlays (media/anim/transition)\n');
  const args = parseArgs(process.argv.slice(2));
  const inputPath = validateInput(args.file);
  ok('Input found');

  const loPath = findLibreOffice();
  if (!loPath) fail('LibreOffice is not installed.\nInstall: brew install --cask libreoffice');
  ok(`LibreOffice found (${loPath})`);

  const pdftoppmPath = findPdftoppm();
  if (!pdftoppmPath) fail('Poppler pdftoppm not found.\nInstall: brew install poppler');
  ok(`Rasterizer found (${pdftoppmPath})`);

  const outputDir = resolveOutputDir(inputPath, args.output);
  const slidesDir = path.join(outputDir, 'slides');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-converter-'));
  fse.ensureDirSync(TMP_BASE);
  fse.ensureDirSync(outputDir);

  try {
    let features = { slides: [], summary: { detected: {}, animationStats: { parsed: 0, supportedSubset: 0 } } };
    if (path.extname(inputPath).toLowerCase() === '.pptx') {
      features = extractPptxFeatures(inputPath, outputDir);
      const d = features.summary.detected;
      ok(
        `PPTX scanned (video=${d.video}, audio=${d.audio}, anim=${d.animation}, transition=${d.transition})`
      );
    } else {
      console.log('ℹ .ppt — skipping OOXML extraction');
    }

    const pdfWorkPath = convertToPdf(loPath, inputPath, workDir);
    ok('Converted to PDF');
    const pdfOutPath = path.join(outputDir, 'presentation.pdf');
    fse.copySync(pdfWorkPath, pdfOutPath);

    console.log('\n── Fidelity gate ──');
    console.log(`PDF: ${pdfOutPath}`);
    console.log('If PDF looks wrong vs original PPT, stop — problem is upstream of PNG/overlays.\n');

    const { slides, width, height } = rasterizePdfToPngs(pdftoppmPath, pdfOutPath, slidesDir);
    ok(`${slides.length} slides rendered`);

    const slideModel = buildSlideModel(slides, features);
    const overlayVideoCount = slideModel.reduce(
      (n, s) => n + s.mediaOverlays.filter((o) => o.type === 'video').length,
      0
    );
    const overlayAudioCount = slideModel.reduce(
      (n, s) => n + s.mediaOverlays.filter((o) => o.type === 'audio').length,
      0
    );
    const animRenderedCount = slideModel.reduce(
      (n, s) => n + (s.animations.length && s.animOverlays.length ? s.animations.length : 0),
      0
    );
    const transitionRenderedCount = slideModel.filter((s) =>
      ['fade', 'push', 'wipe'].includes(s.transition)
    ).length;

    const htmlPath = path.join(outputDir, 'index.html');
    fs.writeFileSync(htmlPath, buildViewerHtml(slideModel, path.basename(inputPath)));
    ok('HTML viewer generated');

    const report = buildFeatureReport(features, {
      slideCount: slides.length,
      overlayVideoCount,
      overlayAudioCount,
      animRenderedCount,
      transitionRenderedCount,
    });
    fs.writeFileSync(path.join(outputDir, 'feature-report.json'), JSON.stringify(report, null, 2));
    printDetailReport(report);

    fs.writeFileSync(
      path.join(outputDir, 'metadata.json'),
      JSON.stringify(
        {
          originalFilename: path.basename(inputPath),
          originalPath: inputPath,
          slideCount: slides.length,
          slideWidthPx: width,
          slideHeightPx: height,
          aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
          renderDpi: RENDER_DPI,
          overlayVideoCount,
          overlayAudioCount,
          animRenderedCount,
          transitionRenderedCount,
          pdfPath: pdfOutPath,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const viewerUrl = `file://${htmlPath}`;
    console.log('\n' + '─'.repeat(48));
    console.log('Input:\n' + inputPath);
    console.log('\nPDF:\n' + pdfOutPath);
    console.log('\nSlides:\n' + slides.length);
    console.log('\nViewer:\n' + viewerUrl);
    console.log('\nOutput size:\n' + formatBytes(dirSizeBytes(outputDir)));
    console.log('─'.repeat(48));
    console.log('\nOpen:\n' + viewerUrl + '\n');
  } finally {
    try {
      fse.removeSync(workDir);
    } catch {
      /* ignore */
    }
  }
}

main();
