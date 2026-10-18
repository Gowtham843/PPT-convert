#!/usr/bin/env node
/**
 * Build output/animation-debug — minimal single-slide Fade In test for file:// manual QA.
 * Source: test-files/phase2/02-animation.pptx (object 3, fade 500ms, on click)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PPTX = path.join(ROOT, 'test-files', 'phase2', '02-animation.pptx');
const SRC_OUT = path.join(ROOT, 'output', '02-animation');
const DEST = path.join(ROOT, 'output', 'animation-debug');

function ensureRendered() {
  if (!fs.existsSync(PPTX)) {
    console.error('Missing', PPTX, '— run: python3 scripts/create_phase2_fixtures.py');
    process.exit(1);
  }
  const presPath = path.join(SRC_OUT, 'presentation.json');
  if (!fs.existsSync(presPath)) {
    console.log('Rendering 02-animation.pptx…');
    execFileSync('node', [path.join(ROOT, 'render.js'), '--file', PPTX], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
}

function build() {
  ensureRendered();

  const pres = JSON.parse(fs.readFileSync(path.join(SRC_OUT, 'presentation.json'), 'utf8'));
  const slide = pres.slides[0];
  const svgPath = path.join(SRC_OUT, slide.svg);
  const inlineSvg = fs.readFileSync(svgPath, 'utf8');
  const anim = slide.clickSteps?.[0]?.[0];
  const hiddenId = slide.hiddenOnLoad?.[0] || anim?.objectId;

  if (!anim || !hiddenId) {
    console.error('02-animation slide 1 has no click animation — check timeline parser');
    process.exit(1);
  }

  const hasTarget = inlineSvg.includes(`data-sp-id="${hiddenId}"`);
  if (!hasTarget) {
    console.error(`SVG missing data-sp-id="${hiddenId}" — object-mapper break`);
    process.exit(1);
  }

  fs.mkdirSync(DEST, { recursive: true });

  const animCss = fs.readFileSync(path.join(SRC_OUT, 'index.html'), 'utf8').match(
    /@keyframes sp-fade-in[\s\S]*?\.sp-anim-running\{animation-fill-mode:both\}/
  )?.[0] || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Animation Debug — Fade In (object ${hiddenId})</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;flex-direction:column;height:100vh}
    header{padding:12px 16px;background:#1a1a1a;border-bottom:1px solid #333}
    header h1{margin:0 0 6px;font-size:16px;font-weight:600}
    header p{margin:0;font-size:13px;color:#aaa}
    .stage{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-height:0}
    .frame-wrap{width:min(960px,100%);aspect-ratio:4/3;background:#fff;position:relative;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.5)}
    .slide-svg-inline{position:absolute;inset:0;line-height:0}
    .slide-svg-inline svg{width:100%;height:100%;display:block}
    .toolbar{display:flex;gap:10px;padding:12px 16px;background:#1a1a1a;border-top:1px solid #333;align-items:center}
    button{padding:10px 18px;font-size:14px;cursor:pointer;border:0;border-radius:6px;background:#2563eb;color:#fff}
    button.secondary{background:#333;color:#eee}
    .log{flex:0 0 180px;overflow:auto;padding:10px 16px;background:#0d0d0d;font:12px/1.5 ui-monospace,monospace;color:#8f8;border-top:1px solid #333}
    .log .line{margin:0 0 2px}
    ${animCss}
  </style>
</head>
<body>
  <header>
    <h1>Animation debug — Fade In</h1>
    <p>Object ${hiddenId} (${anim.effect}, ${anim.duration}ms, on click). Blue box hidden until Next/Replay. Works on file:// with inline SVG.</p>
  </header>
  <div class="stage">
    <div class="frame-wrap" id="frameWrap">
      <div class="slide-svg-inline" id="svgHost"></div>
    </div>
  </div>
  <div class="toolbar">
    <button type="button" id="nextBtn">Next (run animation)</button>
    <button type="button" id="replayBtn" class="secondary">Replay</button>
    <span id="status" style="margin-left:8px;color:#aaa;font-size:13px">BEFORE CLICK: object hidden</span>
  </div>
  <div class="log" id="log" aria-live="polite"></div>
  <script>
  (function(){
    var INLINE_SVG = ${JSON.stringify(inlineSvg)};
    var HIDDEN_ID = ${JSON.stringify(String(hiddenId))};
    var ANIM = ${JSON.stringify(anim)};
    var animStep = 0;
    var played = false;
    var logEl = document.getElementById('log');
    var statusEl = document.getElementById('status');

    function log(msg){
      console.log('[ANIMATION]', msg);
      var p = document.createElement('div');
      p.className = 'line';
      p.textContent = msg;
      logEl.appendChild(p);
      logEl.scrollTop = logEl.scrollHeight;
    }

    var host = document.getElementById('svgHost');
    host.innerHTML = INLINE_SVG;
    var svgRoot = host.querySelector('svg');

    function findEl(id){
      return svgRoot && svgRoot.querySelector('[data-sp-id="'+id+'"]');
    }

    function hideObject(id){
      var el = findEl(id);
      log('hide-on-load object='+id+' target='+(el?'FOUND':'NOT_FOUND'));
      if(!el) return;
      el.classList.add('sp-anim-hidden');
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
    }

    function runFadeIn(a){
      var el = findEl(a.objectId);
      log('[ANIMATION START] slide=1 object='+a.objectId+' effect='+a.effect+' target='+(el?'data-sp-id='+a.objectId:'NOT_FOUND')+' duration='+a.duration);
      if(!el){ statusEl.textContent='FAIL: target not found'; return; }
      el.classList.remove('sp-anim-hidden');
      el.style.visibility = 'visible';
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.opacity = '';
      el.style.animation = (a.cssClass||'sp-fade-in')+' '+(a.duration||500)+'ms ease both';
      statusEl.textContent='AFTER CLICK: fading in…';
      setTimeout(function(){
        log('[ANIMATION END] object='+a.objectId);
        statusEl.textContent='AFTER CLICK: object visible (fade complete)';
      }, a.duration||500);
    }

    function resetSlide(){
      animStep = 0;
      played = false;
      host.innerHTML = INLINE_SVG;
      svgRoot = host.querySelector('svg');
      hideObject(HIDDEN_ID);
      statusEl.textContent='BEFORE CLICK: object hidden';
      log('--- replay / reset ---');
    }

    hideObject(HIDDEN_ID);
    log('slide=1 loaded; hiddenOnLoad=['+HIDDEN_ID+']');

    document.getElementById('nextBtn').onclick = function(){
      if(animStep >= 1){ log('no more steps on this slide'); return; }
      runFadeIn(ANIM);
      animStep++;
      played = true;
    };
    document.getElementById('replayBtn').onclick = resetSlide;
  })();
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(DEST, 'index.html'), html);
  fs.writeFileSync(
    path.join(DEST, 'README.txt'),
    `Animation debug page — Fade In on object ${hiddenId}\n\nOpen:\n  file://${path.join(DEST, 'index.html')}\n\nExpected:\n  1. Blue rounded rectangle is HIDDEN on load\n  2. Click Next → fades in over ${anim.duration}ms\n  3. Click Replay → resets\n\nSource PPTX: test-files/phase2/02-animation.pptx\n`
  );

  console.log('\nBuilt:', path.join(DEST, 'index.html'));
  console.log('Open: file://' + path.join(DEST, 'index.html'));
  console.log('Object:', hiddenId, '| Effect:', anim.effect, '| FOUND in SVG: YES');
}

build();
