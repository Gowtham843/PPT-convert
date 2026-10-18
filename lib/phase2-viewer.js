/**
 * Phase 2 HTML5 viewer — iSpring-style chrome: sidebar menu, arrow nav, fullscreen.
 */

const fs = require('fs');
const path = require('path');
const { buildAnimationCss } = require('./animation-engine');
const { buildTransitionCss } = require('./transition-engine');
const { getViewerAnimationRuntimeSource } = require('./viewer-animation-runtime');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toViewerPath(rel) {
  if (!rel || rel.startsWith('data:') || rel.startsWith('./')) return rel;
  return `./${rel}`;
}

function slideAssetCandidates(slide) {
  const pad = String(slide.index).padStart(3, '0');
  const defaults = {
    svg: `svg/slide-${pad}.svg`,
    png: `slides/slide-${pad}.png`,
  };
  const preferPng = slide.renderer === 'png-fallback';
  const ordered = preferPng
    ? [
        slide.png,
        slide.fallback && slide.fallback.png,
        slide.svg,
        slide.fallback && slide.fallback.svg,
        defaults.png,
        defaults.svg,
      ]
    : [
        slide.svg,
        slide.fallback && slide.fallback.svg,
        slide.png,
        slide.fallback && slide.fallback.png,
        defaults.svg,
        defaults.png,
      ];
  return [...new Set(ordered.filter(Boolean))];
}

const INLINE_SVG_MAX_BYTES = 512 * 1024;

function slideNeedsInlineSvg(slide, nextSlideIsMorph) {
  return (
    (slide.clickSteps && slide.clickSteps.length) ||
    (slide.hiddenOnLoad && slide.hiddenOnLoad.length) ||
    (slide.objectClickSteps && slide.objectClickSteps.length) ||
    Boolean(slide.transition && slide.transition.morph && slide.transition.morph.detected) ||
    Boolean(nextSlideIsMorph)
  );
}

function resolveSlideSources(outputDir, presentation) {
  const out = JSON.parse(JSON.stringify(presentation));
  for (const slide of out.slides) {
    for (const rel of slideAssetCandidates(slide)) {
      const abs = path.join(outputDir, rel);
      if (!fs.existsSync(abs)) continue;
      slide.displaySrc = toViewerPath(rel);
      slide.displayType = rel.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
      const nextMorph = out.slides[slide.index - (out.slides[0].index || 0) + 1];
      const nextIsMorph = Boolean(nextMorph && nextMorph.transition && nextMorph.transition.morph && nextMorph.transition.morph.detected);
      if (slideNeedsInlineSvg(slide, nextIsMorph) && slide.displayType === 'svg') {
        const size = fs.statSync(abs).size;
        if (size <= INLINE_SVG_MAX_BYTES) {
          slide.inlineSvg = fs.readFileSync(abs, 'utf8');
        }
      }
      break;
    }
    for (const m of slide.media || []) {
      if (m.src) m.src = toViewerPath(m.src);
      if (m.poster) m.poster = toViewerPath(m.poster);
    }
  }
  return out;
}

function writePhase2Viewer(outputDir, presentation, title) {
  fs.writeFileSync(path.join(outputDir, 'presentation.json'), JSON.stringify(presentation, null, 2));
  const viewerPresentation = resolveSlideSources(outputDir, presentation);

  const animCss = buildAnimationCss();
  const txCss = buildTransitionCss();

  fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    :root{--bg:#000;--bar:#000;--fg:#e8e8e8;--muted:#b0b0b0;--border:#2a2a2a}
    *{box-sizing:border-box}
    html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .app{display:flex;flex-direction:column;height:100%;overflow:hidden}
    .stage{flex:1;display:flex;align-items:stretch;justify-content:stretch;min-height:0;background:#000;cursor:default;position:relative;overflow:hidden}
    .nav-zone{
      position:absolute;top:0;bottom:0;width:20%;z-index:20;border:0;padding:0;
      display:flex;align-items:center;background:transparent;cursor:pointer;
      color:rgba(255,255,255,.9);opacity:0;transition:opacity .2s ease;pointer-events:auto
    }
    .nav-zone svg{display:block;filter:drop-shadow(0 1px 4px rgba(0,0,0,.6))}
    .nav-zone:hover,.nav-zone:focus-visible{opacity:1}
    .nav-zone-prev{left:0;justify-content:flex-start;padding-left:28px;background:linear-gradient(90deg,rgba(0,0,0,.45),transparent)}
    .nav-zone-next{right:0;justify-content:flex-end;padding-right:28px;background:linear-gradient(270deg,rgba(0,0,0,.45),transparent)}
    .nav-zone:disabled{opacity:0!important;pointer-events:none;cursor:default}
    .viewport{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .frame{position:relative;background:#000;transform-origin:center center;line-height:0;overflow:hidden;flex-shrink:0}
    .frame object.slide-svg,.frame .slide-svg-inline,.frame img.slide-png,.frame img.slide-svg,.frame img.slide-img{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1}
    .frame object.slide-svg{border:0}
    .frame .slide-svg-inline{line-height:0;overflow:hidden}
    .frame .slide-svg-inline svg{width:100%;height:100%;display:block}
    .frame img.slide-png,.frame img.slide-svg,.frame img.slide-img{object-fit:cover;background:#000}
    .media-layer{position:absolute;inset:0;pointer-events:none;z-index:3}
    .media-ov{position:absolute;pointer-events:auto;z-index:4;overflow:hidden}
    .media-ov video,.media-ov audio{width:100%;height:100%;display:block;background:#000;pointer-events:auto}
    .media-ov audio{height:36px;min-height:36px}
    .drawing-stack{
      position:absolute;inset:0;z-index:6;pointer-events:none;touch-action:none
    }
    .drawing-stack.active{pointer-events:auto}
    .drawing-layer{
      position:absolute;inset:0;width:100%;height:100%;pointer-events:none
    }
    .highlight-layer{z-index:1;mix-blend-mode:multiply}
    .ink-layer{z-index:2}
    .drawing-stack.active .ink-layer{cursor:crosshair}
    .drawing-stack.tool-eraser.active .ink-layer{cursor:cell}
    .stage.drawing-active .nav-zone{pointer-events:none;opacity:0!important}

    /* Slideshow play overlay */
    .play-overlay{
      position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;
      align-items:center;justify-content:center;background:rgba(0,0,0,.6);
      transition:opacity .25s,visibility .25s
    }
    .play-overlay.hidden{opacity:0;visibility:hidden;pointer-events:none}
    .play-start-btn{
      width:92px;height:92px;border-radius:50%;border:0;cursor:pointer;
      background:#fff;color:#111;display:flex;align-items:center;justify-content:center;
      box-shadow:0 6px 28px rgba(0,0,0,.45);transition:transform .15s ease
    }
    .play-start-btn:hover{transform:scale(1.06)}
    .play-start-btn svg{margin-left:4px}
    .play-overlay-hint{margin:18px 0 0;color:#eee;font-size:15px;user-select:none}
    .icon-btn.playing{color:#7ad08f}

    /* Drawing toolbar menu */
    .draw-wrap{position:relative;display:flex;align-items:center}
    .draw-btn{
      display:flex;align-items:center;gap:8px;width:auto;padding:0 10px;height:36px;
      border:0;background:transparent;color:var(--fg);cursor:pointer;border-radius:4px;font-size:14px
    }
    .draw-btn:hover,.draw-btn.open{background:rgba(255,255,255,.08)}
    .draw-btn.open{color:#fff}
    .draw-label{line-height:1}
    .draw-menu{
      position:absolute;bottom:calc(100% + 10px);right:0;min-width:200px;
      background:#fff;color:#222;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,.35);
      padding:6px 0;z-index:200;display:none
    }
    .draw-menu.open{display:block}
    .draw-menu-item{
      display:flex;align-items:center;gap:12px;width:100%;padding:10px 16px;
      border:0;background:transparent;color:#222;font-size:15px;text-align:left;cursor:pointer
    }
    .draw-menu-item:hover{background:#f0f0f0}
    .draw-menu-item.active{font-weight:600;background:#f5f5f5}
    .draw-menu-item svg{flex-shrink:0}
    .draw-menu-sep{height:1px;background:#e0e0e0;margin:6px 0}
    .draw-menu-action{color:#333;font-weight:500}

    .toolbar{
      display:flex;align-items:center;justify-content:space-between;
      height:52px;padding:0 20px;background:var(--bar);
      border-top:1px solid var(--border);
      border-radius:0 0 6px 6px;flex-shrink:0
    }
    .toolbar-left,.toolbar-right{display:flex;align-items:center;gap:16px}
    .toolbar-center{display:flex;align-items:center;gap:20px;margin-left:auto;margin-right:24px}
    .icon-btn{
      display:flex;align-items:center;justify-content:center;
      width:36px;height:36px;padding:0;border:0;background:transparent;
      color:var(--fg);cursor:pointer;border-radius:4px
    }
    .icon-btn:hover{background:rgba(255,255,255,.08)}
    .icon-btn:disabled{opacity:.35;cursor:default}
    .icon-btn svg{display:block}
    .slide-counter{
      font-size:15px;font-weight:400;color:var(--fg);
      font-variant-numeric:tabular-nums;min-width:56px;text-align:center;user-select:none
    }

    /* Slide sidebar */
    .sidebar-backdrop{
      position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;
      opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s
    }
    .sidebar-backdrop.open{opacity:1;visibility:visible}
    .sidebar{
      position:fixed;top:0;left:0;bottom:0;width:280px;max-width:85vw;
      background:#1a1a1a;border-right:1px solid var(--border);z-index:101;
      transform:translateX(-100%);transition:transform .25s ease;
      display:flex;flex-direction:column
    }
    .sidebar.open{transform:translateX(0)}
    .sidebar-head{padding:16px 18px;border-bottom:1px solid var(--border);font-size:14px;color:var(--muted)}
    .sidebar-list{flex:1;overflow-y:auto;padding:8px}
    .sidebar-item{
      display:flex;align-items:center;gap:12px;padding:10px 12px;
      border-radius:6px;cursor:pointer;color:var(--fg);font-size:14px
    }
    .sidebar-item:hover{background:rgba(255,255,255,.06)}
    .sidebar-item.active{background:rgba(255,255,255,.1)}
    .sidebar-num{
      width:28px;height:28px;border-radius:4px;background:#333;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-variant-numeric:tabular-nums;flex-shrink:0
    }
    .sidebar-item.active .sidebar-num{background:#555}

    ${animCss}
    ${txCss}
  </style>
</head>
<body>
<div class="app">
  <div class="stage" id="stage">
    <button type="button" class="nav-zone nav-zone-prev" id="navPrev" title="Previous slide" aria-label="Previous slide">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <div class="viewport" id="viewport">
      <div class="frame" id="frame">
        <div class="overlay-layer" id="overlayLayer"></div>
        <div class="media-layer" id="mediaLayer"></div>
        <div class="drawing-stack" id="drawingStack">
          <canvas class="drawing-layer highlight-layer" id="highlightCanvas" aria-hidden="true"></canvas>
          <canvas class="drawing-layer ink-layer" id="inkCanvas" aria-hidden="true"></canvas>
        </div>
      </div>
    </div>
    <button type="button" class="nav-zone nav-zone-next" id="navNext" title="Next slide" aria-label="Next slide">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    <div class="play-overlay" id="playOverlay">
      <button type="button" class="play-start-btn" id="playStartBtn" title="Play presentation" aria-label="Play presentation">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
      </button>
      <p class="play-overlay-hint">Play from beginning — animations then auto-advance each slide</p>
    </div>
  </div>
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="icon-btn" id="menuBtn" title="Slide outline" aria-label="Open slide menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none"/>
          <line x1="9" y1="6" x2="20" y2="6"/>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
          <line x1="9" y1="12" x2="20" y2="12"/>
          <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none"/>
          <line x1="9" y1="18" x2="20" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="toolbar-center">
      <button class="icon-btn" id="playBtn" title="Play slideshow" aria-label="Play slideshow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
      </button>
      <button class="icon-btn" id="prev" title="Previous" aria-label="Previous slide">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="slide-counter" id="counter">1 / 1</span>
      <button class="icon-btn" id="next" title="Next" aria-label="Next slide">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="toolbar-right">
      <div class="draw-wrap" id="drawWrap">
        <button type="button" class="draw-btn" id="drawBtn" title="Drawing" aria-haspopup="true" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
          <span class="draw-label" id="drawLabel">Drawing</span>
        </button>
        <div class="draw-menu" id="drawMenu" role="menu" aria-label="Drawing tools">
          <button type="button" class="draw-menu-item active" data-tool="pen" role="menuitem">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0392b" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Pen
          </button>
          <button type="button" class="draw-menu-item" data-tool="highlighter" role="menuitem">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f1c40f" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Highlighter
          </button>
          <button type="button" class="draw-menu-item" data-tool="eraser" role="menuitem">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M20 20H8L3 15l9-9 9 9-4 5Z"/><path d="m6.5 11.5 6 6"/></svg>
            Eraser
          </button>
          <div class="draw-menu-sep"></div>
          <button type="button" class="draw-menu-item draw-menu-action" data-action="erase-all" role="menuitem">Erase all</button>
          <button type="button" class="draw-menu-item draw-menu-action" data-action="finish" role="menuitem">Finish drawing</button>
        </div>
      </div>
      <button class="icon-btn" id="fs" title="Fullscreen" aria-label="Fullscreen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <polyline points="4 9 4 4 9 4"/><polyline points="15 4 20 4 20 9"/>
          <polyline points="20 15 20 20 15 20"/><polyline points="9 20 4 20 4 15"/>
        </svg>
      </button>
    </div>
  </div>
</div>
<div class="sidebar-backdrop" id="sidebarBackdrop"></div>
<aside class="sidebar" id="sidebar" aria-label="Slide outline">
  <div class="sidebar-head">${escapeHtml(title)}</div>
  <div class="sidebar-list" id="sidebarList"></div>
</aside>
<script src="viewer.js"></script>
</body>
</html>`
  );

  fs.writeFileSync(path.join(outputDir, 'viewer.js'), buildViewerJs(viewerPresentation, animCss));
}

function buildViewerJs(presentation, animCss) {
  const embedded = JSON.stringify(presentation);
  const animCssEmbedded = JSON.stringify(animCss || '');
  const animRuntime = getViewerAnimationRuntimeSource();
  return `'use strict';
(function(){
  var ANIM_DEBUG = /[?&]animDebug=1(?:&|$)/.test(location.search) || window.ANIM_DEBUG === true;
  function animLog(){
    if(!ANIM_DEBUG) return;
    var parts = Array.prototype.slice.call(arguments);
    console.log.apply(console, ['[ANIMATION]'].concat(parts));
  }

  ${animRuntime}

  var presentation = ${embedded};
  var slideIndex = 0, animStep = 0, busy = false, objectAnimBusy = false;
  var slideshowPlaying = false;
  var slideshowTimer = null;
  var slideAssetReady = false;
  var playBtn = document.getElementById('playBtn');
  var playOverlay = document.getElementById('playOverlay');
  var playStartBtn = document.getElementById('playStartBtn');
  var frame = document.getElementById('frame');
  var viewport = document.getElementById('viewport');
  var stage = document.getElementById('stage');
  var counter = document.getElementById('counter');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var navPrev = document.getElementById('navPrev');
  var navNext = document.getElementById('navNext');
  var mediaLayer = document.getElementById('mediaLayer');
  var overlayLayer = document.getElementById('overlayLayer');
  var sidebar = document.getElementById('sidebar');
  var sidebarBackdrop = document.getElementById('sidebarBackdrop');
  var sidebarList = document.getElementById('sidebarList');
  var drawingStack = document.getElementById('drawingStack');
  var highlightCanvas = document.getElementById('highlightCanvas');
  var inkCanvas = document.getElementById('inkCanvas');
  var drawBtn = document.getElementById('drawBtn');
  var drawLabel = document.getElementById('drawLabel');
  var drawMenu = document.getElementById('drawMenu');
  var drawWrap = document.getElementById('drawWrap');
  var drawToolLabels = { pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser' };
  var drawingStore = {};
  var drawingMode = false;
  var drawTool = 'pen';
  var drawing = false;
  var highlightCtx = highlightCanvas.getContext('2d');
  var inkCtx = inkCanvas.getContext('2d');
  var lastPoint = null;

  function updatePlayButton(){
    if(!playBtn) return;
    playBtn.classList.toggle('playing', slideshowPlaying);
    playBtn.title = slideshowPlaying ? 'Pause slideshow' : 'Play slideshow';
    playBtn.setAttribute('aria-label', playBtn.title);
    playBtn.innerHTML = slideshowPlaying
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>';
  }

  function hidePlayOverlay(){
    if(playOverlay) playOverlay.classList.add('hidden');
  }

  function stopSlideshow(){
    slideshowPlaying = false;
    if(slideshowTimer){ clearTimeout(slideshowTimer); slideshowTimer = null; }
    updatePlayButton();
  }

  function stopAllPlayback(){
    stopSlideshow();
  }

  function animBatchDuration(batch){
    return Math.max(batchDurationMs(batch), 100);
  }

  function runAnimStepAsync(steps){
    objectAnimBusy = true;
    return runAnimationBatch(steps, findEl).finally(function(){ objectAnimBusy = false; });
  }

  function runSlideshowTick(){
    if(!slideshowPlaying) return;
    if(busy || objectAnimBusy){
      slideshowTimer = setTimeout(runSlideshowTick, 200);
      return;
    }
    if(!slideAssetReady){
      slideshowTimer = setTimeout(runSlideshowTick, 80);
      return;
    }
    var steps = slide().clickSteps || [];
    if(animStep < steps.length){
      runAnimStepAsync(steps[animStep]).then(function(){
        if(!slideshowPlaying) return;
        animStep++;
        updateNav();
        slideshowTimer = setTimeout(runSlideshowTick, animBatchDuration(steps[animStep - 1]));
      });
      return;
    }
    if(slideIndex >= presentation.slides.length - 1){
      stopSlideshow();
      return;
    }
    var pauseMs = steps.length ? 900 : 1200;
    slideshowTimer = setTimeout(function(){
      if(!slideshowPlaying) return;
      goSlide(slideIndex + 1, 1, true);
      slideshowTimer = setTimeout(runSlideshowTick, 1000);
    }, pauseMs);
  }

  function startSlideshow(fromBeginning){
    stopSlideshow();
    if(drawingMode) finishDrawing();
    stopAllMedia();
    closeSidebar();
    hidePlayOverlay();
    if(fromBeginning !== false && (slideIndex !== 0 || animStep !== 0)){
      showSlide(0);
      slideshowTimer = setTimeout(function(){
        slideshowPlaying = true;
        updatePlayButton();
        runSlideshowTick();
      }, 500);
      return;
    }
    slideshowPlaying = true;
    updatePlayButton();
    slideshowTimer = setTimeout(runSlideshowTick, 700);
  }

  function toggleSlideshow(){
    if(slideshowPlaying) stopSlideshow();
    else startSlideshow(false);
  }

  function slide(){ return presentation.slides[slideIndex]; }

  function syncDrawingCanvases(){
    if(!frame.clientWidth || !frame.clientHeight) return;
    var w = frame.clientWidth;
    var h = frame.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    var saved = drawingStore[slideIndex];
    var layers = [
      { canvas: highlightCanvas, ctx: highlightCtx, key: 'highlight' },
      { canvas: inkCanvas, ctx: inkCtx, key: 'ink' }
    ];
    layers.forEach(function(layer){
      layer.canvas.width = Math.round(w * dpr);
      layer.canvas.height = Math.round(h * dpr);
      layer.canvas.style.width = w + 'px';
      layer.canvas.style.height = h + 'px';
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layer.ctx.clearRect(0, 0, w, h);
      if(!saved || !saved[layer.key]) return;
      try{
        if(saved[layer.key].width === layer.canvas.width && saved[layer.key].height === layer.canvas.height){
          layer.ctx.putImageData(saved[layer.key], 0, 0);
        }
      }catch(e){}
    });
    if(saved && saved.highlight && saved.highlight.width !== highlightCanvas.width){
      delete drawingStore[slideIndex];
    }
  }

  function saveDrawingForSlide(idx){
    if(!highlightCanvas.width || !highlightCanvas.height) return;
    try{
      drawingStore[idx] = {
        highlight: highlightCtx.getImageData(0, 0, highlightCanvas.width, highlightCanvas.height),
        ink: inkCtx.getImageData(0, 0, inkCanvas.width, inkCanvas.height)
      };
    }catch(e){}
  }

  function applyStrokeStyle(ctx){
    if(drawTool === 'pen'){
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if(drawTool === 'highlighter'){
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 12;
      ctx.globalAlpha = 0.55;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'bevel';
    } else if(drawTool === 'eraser'){
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = 22;
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }

  function applyDrawTool(){
    drawingStack.classList.toggle('tool-eraser', drawTool === 'eraser');
    drawingStack.classList.toggle('tool-highlighter', drawTool === 'highlighter');
  }

  function drawContexts(){
    if(drawTool === 'eraser') return [highlightCtx, inkCtx];
    if(drawTool === 'highlighter') return [highlightCtx];
    return [inkCtx];
  }

  function canvasPoint(evt){
    var rect = inkCanvas.getBoundingClientRect();
    var clientX = evt.clientX;
    var clientY = evt.clientY;
    if(evt.touches && evt.touches[0]){
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(evt){
    if(!drawingMode) return;
    evt.preventDefault();
    drawing = true;
    lastPoint = canvasPoint(evt);
    if(drawTool === 'highlighter'){
      applyStrokeStyle(highlightCtx);
      highlightCtx.beginPath();
      highlightCtx.moveTo(lastPoint.x, lastPoint.y);
    }
  }

  function moveDraw(evt){
    if(!drawingMode || !drawing || !lastPoint) return;
    evt.preventDefault();
    var p = canvasPoint(evt);
    applyDrawTool();
    if(drawTool === 'highlighter'){
      applyStrokeStyle(highlightCtx);
      highlightCtx.lineTo(p.x, p.y);
      highlightCtx.stroke();
      highlightCtx.beginPath();
      highlightCtx.moveTo(p.x, p.y);
    } else {
      drawContexts().forEach(function(ctx){
        applyStrokeStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
    }
    lastPoint = p;
  }

  function endDraw(evt){
    if(!drawing) return;
    if(evt) evt.preventDefault();
    drawing = false;
    lastPoint = null;
    saveDrawingForSlide(slideIndex);
  }

  function setDrawingMode(on){
    drawingMode = !!on;
    stage.classList.toggle('drawing-active', drawingMode);
    drawingStack.classList.toggle('active', drawingMode);
    drawBtn.classList.toggle('open', drawingMode);
    drawBtn.setAttribute('aria-expanded', drawingMode ? 'true' : 'false');
    if(drawingMode){
      applyDrawTool();
      syncDrawingCanvases();
    } else {
      endDraw();
    }
  }

  function openDrawMenu(){
    drawMenu.classList.add('open');
    drawBtn.classList.add('open');
    drawBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDrawMenu(){
    drawMenu.classList.remove('open');
    if(!drawingMode){
      drawBtn.classList.remove('open');
      drawBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function updateDrawLabel(){
    var label = drawingMode ? (drawToolLabels[drawTool] || 'Drawing') : 'Drawing';
    drawLabel.textContent = label;
    drawBtn.title = label;
  }

  function selectDrawTool(tool){
    drawTool = tool;
    drawMenu.querySelectorAll('[data-tool]').forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
    });
    setDrawingMode(true);
    updateDrawLabel();
    closeDrawMenu();
  }

  function eraseAllDrawings(){
    if(!highlightCanvas.width) syncDrawingCanvases();
    var w = frame.clientWidth;
    var h = frame.clientHeight;
    highlightCtx.clearRect(0, 0, w, h);
    inkCtx.clearRect(0, 0, w, h);
    delete drawingStore[slideIndex];
  }

  function finishDrawing(){
    saveDrawingForSlide(slideIndex);
    setDrawingMode(false);
    updateDrawLabel();
    closeDrawMenu();
  }

  drawingStack.addEventListener('mousedown', startDraw);
  drawingStack.addEventListener('mousemove', moveDraw);
  drawingStack.addEventListener('mouseup', endDraw);
  drawingStack.addEventListener('mouseleave', endDraw);
  drawingStack.addEventListener('touchstart', startDraw, { passive: false });
  drawingStack.addEventListener('touchmove', moveDraw, { passive: false });
  drawingStack.addEventListener('touchend', endDraw, { passive: false });
  drawingStack.addEventListener('touchcancel', endDraw, { passive: false });

  drawBtn.onclick = function(e){
    e.stopPropagation();
    if(drawMenu.classList.contains('open')) closeDrawMenu();
    else openDrawMenu();
  };
  drawMenu.querySelectorAll('[data-tool]').forEach(function(btn){
    btn.onclick = function(e){
      e.stopPropagation();
      selectDrawTool(btn.getAttribute('data-tool'));
    };
  });
  drawMenu.querySelector('[data-action="erase-all"]').onclick = function(e){
    e.stopPropagation();
    eraseAllDrawings();
  };
  drawMenu.querySelector('[data-action="finish"]').onclick = function(e){
    e.stopPropagation();
    finishDrawing();
  };
  document.addEventListener('click', function(e){
    if(!drawWrap.contains(e.target)) closeDrawMenu();
  });

  function scaleFrame(){
    var s = slide();
    var maxW = stage.clientWidth || window.innerWidth;
    var maxH = stage.clientHeight || (window.innerHeight - 52);
    if (maxW <= 0 || maxH <= 0) return;
    var sw = s.width || 960;
    var sh = s.height || 540;
    var scale = Math.max(maxW / sw, maxH / sh);
    var w = Math.round(sw * scale);
    var h = Math.round(sh * scale);
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    frame.style.transform = 'none';
    if(highlightCanvas.width) saveDrawingForSlide(slideIndex);
    syncDrawingCanvases();
  }

  function txDurationMs(incoming){
    var spd = incoming && incoming.transition && incoming.transition.speed;
    if(spd === 'slow') return 900;
    if(spd === 'fast') return 280;
    return 480;
  }

  function stopAllMedia(){
    mediaLayer.querySelectorAll('video,audio').forEach(function(el){
      try{
        el.pause();
        el.currentTime = 0;
      }catch(e){}
    });
  }

  function clearSlide(){
    stopAllMedia();
    mediaLayer.innerHTML = ''; overlayLayer.innerHTML = '';
    frame.querySelectorAll('img.slide-png,img.slide-svg,img.slide-img,object.slide-svg,.slide-svg-inline').forEach(function(n){ n.remove(); });
  }

  function isMediaTarget(el){
    return !!(el && (el.closest('.media-ov') || el.tagName==='VIDEO' || el.tagName==='AUDIO'));
  }

  function blockMediaNav(wrap, el){
    var stop=function(e){ e.stopPropagation(); };
    wrap.addEventListener('click', stop);
    wrap.addEventListener('mousedown', stop);
    wrap.addEventListener('mouseup', stop);
    wrap.addEventListener('dblclick', stop);
    el.addEventListener('click', stop);
    el.addEventListener('mousedown', stop);
  }

  function place(el,o){
    el.style.left=(o.xPct||0)+'%'; el.style.top=(o.yPct||0)+'%';
    el.style.width=(o.widthPct||10)+'%';
    el.style.height=(o.type==='audio'?Math.max(o.heightPct||6,5):o.heightPct||10)+'%';
  }

  function svgRoot(){
    var inline=frame.querySelector('.slide-svg-inline svg');
    if(inline) return inline;
    var obj=frame.querySelector('object.slide-svg');
    if(!obj) return null;
    try{ return obj.contentDocument && obj.contentDocument.documentElement; }catch(e){ return null; }
  }

  function whenSvgRootReady(cb, attempt){
    var root=svgRoot();
    if(root){ cb(root); return; }
    if((attempt||0)>=50){ cb(null); return; }
    setTimeout(function(){ whenSvgRootReady(cb, (attempt||0)+1); }, 40);
  }

  function findEl(objectId){
    var root = svgRoot(); if(!root) return null;
    var map = slide().objectMap || [];
    var entry = map.find(function(m){ return m.pptxId === String(objectId); });
    if(entry && entry.svgSelector){
      var el = root.querySelector(entry.svgSelector);
      if(el) return el;
    }
    return root.querySelector('[data-sp-id="'+objectId+'"]');
  }

  function slideHasAnimations(s){
    return (s.clickSteps && s.clickSteps.length) || (s.hiddenOnLoad && s.hiddenOnLoad.length);
  }

  function normalizeAssetSrc(src){
    if(!src) return src;
    if(src.startsWith('data:') || src.startsWith('./')) return src;
    return './'+src;
  }

  function ensureSvgAnimStyles(root){
    if(!root) return;
    var doc = root.ownerDocument;
    if(doc.getElementById('sp-anim-styles')) return;
    var style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.id = 'sp-anim-styles';
    style.textContent = '.sp-anim-hidden{opacity:0!important;visibility:hidden!important}';
    if(root.firstChild) root.insertBefore(style, root.firstChild);
    else root.appendChild(style);
  }

  function runAutomaticTimelineSteps(){
    var steps = slide().clickSteps || [];
    var chain = Promise.resolve();
    var idx = animStep;
    while(idx < steps.length){
      var batch = steps[idx];
      var tr = batch && batch[0] && batch[0].trigger;
      if(tr !== 'automatic' && tr !== 'onBegin') break;
      (function(stepIdx, stepBatch){
        chain = chain.then(function(){
          return runAnimStepAsync(stepBatch).then(function(){
            animStep = stepIdx + 1;
            updateNav();
          });
        });
      })(idx, batch);
      idx++;
    }
    return chain;
  }

  function onSlideAssetReady(){
    whenSvgRootReady(function(root){
      animLog('svg-ready','slide='+(slideIndex+1),'mode='+(frame.querySelector('.slide-svg-inline')?'inlineSvg':(frame.querySelector('object.slide-svg')?'object':'unknown')),'root='+(root?'OK':'MISSING'));
      if(root) ensureSvgAnimStyles(root);
      applyInitialHidden(slide().hiddenOnLoad, findEl);
      attachObjectClickTriggers(findEl);
      runAutomaticTimelineSteps().finally(function(){
        scaleFrame();
        updateNav();
        slideAssetReady = true;
      });
    });
  }

  function insertSlideAsset(s, i){
    slideAssetReady = false;
    if(s.inlineSvg){
      var wrap = document.createElement('div');
      wrap.className = 'slide-svg-inline';
      wrap.innerHTML = s.inlineSvg;
      var svgEl = wrap.querySelector('svg');
      if(svgEl){
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        svgEl.style.display = 'block';
      }
      frame.insertBefore(wrap, overlayLayer);
      onSlideAssetReady();
      return;
    }
    var src = s.displaySrc || s.svg || s.png || (s.fallback && s.fallback.png);
    if(!src){ slideAssetReady = true; return; }
    var isSvg = s.displayType === 'svg' || (src && src.split('?')[0].toLowerCase().slice(-4) === '.svg');
    var srcUrl = normalizeAssetSrc(src);
    if(isSvg && slideHasAnimations(s)){
      var obj = document.createElement('object');
      obj.className = 'slide-svg';
      obj.type = 'image/svg+xml';
      obj.data = srcUrl;
      obj.addEventListener('load', onSlideAssetReady);
      frame.insertBefore(obj, overlayLayer);
      setTimeout(function(){
        if(!slideAssetReady && frame.contains(obj)) onSlideAssetReady();
      }, 400);
      return;
    }
    var img = document.createElement('img');
    img.className = isSvg ? 'slide-svg slide-img' : 'slide-img';
    img.alt = 'Slide ' + (i + 1);
    img.src = srcUrl;
    img.onload = onSlideAssetReady;
    img.onerror = function(){
      if(img.src.indexOf('./') !== 0 && !src.startsWith('data:')){
        img.src = normalizeAssetSrc(src);
      }
    };
    frame.insertBefore(img, overlayLayer);
  }

  function renderOverlays(s){
    (s.tables||[]).forEach(function(t){
      var d=document.createElement('div'); d.className='overlay-ov';
      place(d,t); d.innerHTML=t.html; overlayLayer.appendChild(d);
    });
    (s.charts||[]).forEach(function(c){
      if(!c.svg) return;
      var d=document.createElement('div'); d.className='overlay-ov';
      place(d,c); d.innerHTML=c.svg; overlayLayer.appendChild(d);
    });
  }

  function renderMedia(s){
    (s.media||[]).forEach(function(m){
      var wrap=document.createElement('div');
      wrap.className='media-ov media-ov-'+(m.type||'video');
      place(wrap,m);
      var el=document.createElement(m.type==='video'?'video':'audio');
      el.src=m.src; el.controls=true; el.preload='metadata';
      el.setAttribute('controlsList','nodownload');
      if(m.poster&&m.type==='video') el.poster=m.poster;
      if(m.loop) el.loop=true;
      if(m.volume!=null) el.volume=m.volume;
      if(m.muted) el.muted=true;
      if(m.autoplay && !m.startOnClick){
        el.autoplay=true;
        if(m.type==='video'){ el.muted=true; el.playsInline=true; }
        el.play().catch(function(){});
      }
      blockMediaNav(wrap, el);
      wrap.appendChild(el);
      mediaLayer.appendChild(wrap);
    });
  }

  function updateNav(){
    var total = presentation.slides.length;
    var steps = slide().clickSteps || [];
    var atStart = slideIndex <= 0 && animStep <= 0;
    var atEnd = slideIndex >= total - 1 && animStep >= steps.length;
    counter.textContent = (slideIndex + 1) + ' / ' + total;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
    navPrev.disabled = atStart;
    navNext.disabled = atEnd;
    sidebarList.querySelectorAll('.sidebar-item').forEach(function(el, i){
      el.classList.toggle('active', i === slideIndex);
    });
  }

  function buildSidebar(){
    sidebarList.innerHTML = '';
    presentation.slides.forEach(function(s, i){
      var item = document.createElement('div');
      item.className = 'sidebar-item' + (i === slideIndex ? ' active' : '');
      item.innerHTML = '<span class="sidebar-num">' + (i+1) + '</span><span>Slide ' + (i+1) + '</span>';
      item.onclick = function(){
        closeSidebar();
        if(i !== slideIndex) goSlide(i, i > slideIndex ? 1 : -1);
      };
      sidebarList.appendChild(item);
    });
  }

  function openSidebar(){
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('open');
    updateNav();
  }

  function closeSidebar(){
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('open');
  }

  function showSlide(i, resetAnim){
    saveDrawingForSlide(slideIndex);
    slideIndex = i; if(resetAnim!==false) animStep = 0;
    resetObjectClickState();
    clearSlide();
    frame.style.opacity = '1';
    frame.style.animation = 'none';
    var s = slide();
    insertSlideAsset(s, i);
    renderOverlays(s); renderMedia(s);
    requestAnimationFrame(function(){
      scaleFrame();
      if(drawingMode) applyDrawTool();
    });
    setTimeout(function(){
      scaleFrame();
      if(!frame.querySelector('img.slide-img,object.slide-svg')){
        slideAssetReady = true;
        updateNav();
      }
    }, 50);
  }

  function advanceAnimOrSlide(dir){
    if(busy || objectAnimBusy) return;
    stopSlideshow();
    var steps = slide().clickSteps || [];
    if(dir>0 && animStep < steps.length){
      runAnimStepAsync(steps[animStep]).then(function(){
        animStep++;
        updateNav();
      });
      return;
    }
    if(dir>0 && slideIndex < presentation.slides.length-1) goSlide(slideIndex+1, 1);
    else if(dir<0 && slideIndex>0) goSlide(slideIndex-1, -1);
  }

  function txClass(type){
    if(!type||type==='none') return null;
    return 'tx-'+type;
  }

  // ---------------------------------------------------------------- morph engine
  function parseTransformTranslate(tr){
    var i = tr.indexOf('translate');
    if(i < 0) return null;
    var open = tr.indexOf('(', i + 9);
    var close = tr.indexOf(')', open);
    if(open < 0 || close < 0) return null;
    var inner = tr.slice(open + 1, close);
    var parts = inner.split(',');
    var nums = [];
    parts.forEach(function(p){
      var n = parseFloat(p);
      if(!isNaN(n)) nums.push(n);
    });
    if(nums.length < 2) return null;
    return [nums[0], nums[1]];
  }

  function parseTransformRotate(tr){
    var i = tr.indexOf('rotate');
    if(i < 0) return null;
    var open = tr.indexOf('(', i + 6);
    var close = tr.indexOf(')', open);
    if(open < 0 || close < 0) return null;
    var inner = tr.slice(open + 1, close);
    var parts = inner.split(',');
    var nums = [];
    parts.forEach(function(p){
      var n = parseFloat(p);
      if(!isNaN(n)) nums.push(n);
    });
    return [nums[0] || 0, nums[1] || 0, nums[2] || 0];
  }

  function readShapeGeom(root, name){
    var g = root && root.querySelector('g[aria-label="' + name + '"]');
    if(!g) return null;
    var geo = { name: name, el: g, tx: 0, ty: 0, rot: 0, cx: 0, cy: 0, w: 0, h: 0, fill: null, kind: 'rect' };
    var tr = g.getAttribute('transform') || '';
    var t = parseTransformTranslate(tr);
    if(t){ geo.tx = t[0]; geo.ty = t[1]; }
    var r = parseTransformRotate(tr);
    if(r){ geo.rot = r[0]; geo.cx = r[1]; geo.cy = r[2]; }
    var rect = g.querySelector('rect');
    if(rect && rect.getAttribute('width')){
      var w = parseFloat(rect.getAttribute('width')) || 0;
      var h = parseFloat(rect.getAttribute('height')) || 0;
      if(w && h){
        geo.w = w; geo.h = h;
        geo.kind = 'rect';
        geo.rx = parseFloat(rect.getAttribute('rx')) || 0;
        geo.cx = geo.cx || w / 2; geo.cy = geo.cy || h / 2;
        geo.fill = rect.getAttribute('fill');
        return geo;
      }
    }
    var ell = g.querySelector('ellipse');
    if(ell){
      var rx = parseFloat(ell.getAttribute('rx')) || 0;
      var ry = parseFloat(ell.getAttribute('ry')) || 0;
      if(rx && ry){
        geo.w = rx * 2; geo.h = ry * 2;
        geo.kind = 'ellipse';
        geo.cx = geo.cx || rx; geo.cy = geo.cy || ry;
        geo.fill = ell.getAttribute('fill');
        return geo;
      }
    }
    return null;
  }

  function collectShapeGeoms(root){
    var out = [];
    if(!root) return out;
    var groups = root.querySelectorAll('g[aria-label]');
    for (var i = 0; i < groups.length; i++) {
      var geo = readShapeGeom(root, groups[i].getAttribute('aria-label'));
      if(geo && geo.fill && geo.fill !== 'none') out.push(geo);
    }
    return out;
  }

  function matrixToCss(m){
    if(!m) return 'none';
    return 'matrix(' + m.a + ',' + m.b + ',' + m.c + ',' + m.d + ',' + m.e + ',' + m.f + ')';
  }

  function sameName(f, t){
    return f.name === t.name;
  }

  function lerp(a, b, t){
    return a + (b - a) * t;
  }

  function easeInOut(t){
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function morphTransformAttr(el, fromGeo, toGeo, t){
    var sx0 = 1, sy0 = 1, sx1 = 1, sy1 = 1;
    if(toGeo.w && toGeo.w !== fromGeo.w) { sx0 = fromGeo.w / toGeo.w; sx1 = 1; }
    if(toGeo.h && toGeo.h !== fromGeo.h) { sy0 = fromGeo.h / toGeo.h; sy1 = 1; }
    var tx = lerp(fromGeo.tx, toGeo.tx, t);
    var ty = lerp(fromGeo.ty, toGeo.ty, t);
    var cx = lerp(fromGeo.cx, toGeo.cx, t);
    var cy = lerp(fromGeo.cy, toGeo.cy, t);
    var rot = lerp(fromGeo.rot, toGeo.rot, t);
    var sx = lerp(sx0, sx1, t);
    var sy = lerp(sy0, sy1, t);
    var m;
    try{
      m = new DOMMatrix()
        .translate(tx, ty)
        .translate(cx, cy)
        .rotate(rot)
        .scale(sx, sy)
        .translate(-cx, -cy);
    }catch(err){ return false; }
    el.setAttribute('transform', matrixToCss(m));
    return true;
  }

  function morphShape(tG, fG, durMs){
    var el = tG.el;
    var start, end;
    var fillFrom = fG.fill, fillTo = tG.fill;
    var shapeEl = el.querySelector('rect') || el.querySelector('ellipse');
    var fromShapeEl = fG.el && (fG.el.querySelector('rect') || fG.el.querySelector('ellipse'));

    function frame(t){
      morphTransformAttr(el, fG, tG, t);
      if(shapeEl && fillFrom && fillTo && fillFrom !== fillTo){
        shapeEl.setAttribute('fill', lerpColor(fillFrom, fillTo, t));
      }
      if(shapeEl && fromShapeEl && shapeEl.tagName !== fG.kind.toUpperCase()){
        morphPathGeometry(shapeEl, fromShapeEl, tG, fG, t);
      }
    }
    var started = false;
    function run(){
      if(!started){ started = true; start = performance.now(); end = start + durMs; }
      var t = Math.min(1, (performance.now() - start) / durMs);
      frame(easeInOut(t));
      if(t < 1){ requestAnimationFrame(run); }
      else{
        el.setAttribute('transform', matrixToCss(
          new DOMMatrix()
            .translate(tG.tx, tG.ty)
            .translate(tG.cx, tG.cy)
            .rotate(tG.rot)
            .scale(1, 1)
            .translate(-tG.cx, -tG.cy)
        ));
      }
    }
    run();
  }

  function lerpColor(a, b, t){
    var ca = parseHex(a), cb = parseHex(b);
    if(!ca || !cb) return t < 0.5 ? a : b;
    var r = Math.round(lerp(ca[0], cb[0], t));
    var g = Math.round(lerp(ca[1], cb[1], t));
    var bl = Math.round(lerp(ca[2], cb[2], t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function parseHex(c){
    if(!c || c[0] !== '#') return null;
    var s = c.slice(1);
    if(s.length === 3) s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
    var n = parseInt(s, 16);
    if(isNaN(n) || s.length !== 6) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function morphPathGeometry(dest, src, tG, fG, t){
    var srcTag = src.tagName;
    var destTag = dest.tagName;
    if(srcTag === 'rect' && destTag === 'ELLIPSE'){
      var cw = tG.w, ch = tG.h;
      var fW = fG.w, fH = fG.h;
      dest.setAttribute('cx', cw / 2);
      dest.setAttribute('cy', ch / 2);
      dest.setAttribute('rx', cw / 2);
      dest.setAttribute('ry', ch / 2);
    } else if(srcTag === 'ELLIPSE' && destTag === 'rect'){
      var rx = parseFloat(src.getAttribute('rx')) || 1;
      var ry = parseFloat(src.getAttribute('ry')) || 1;
      dest.setAttribute('width', rx * 2);
      dest.setAttribute('height', ry * 2);
      dest.removeAttribute('cx'); dest.removeAttribute('cy');
      dest.removeAttribute('rx'); dest.removeAttribute('ry');
    }
  }

  function collectShapeGeomsFromSvgString(svgString){
    if(!svgString) return [];
    try{
      var doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      return collectShapeGeoms(doc.documentElement);
    }catch(err){ return []; }
  }

  function morphIntoSlide(to, dir, incoming){
    var fromGeoms = [];
    var fromSlide = presentation.slides[slideIndex];
    if(fromSlide && fromSlide.inlineSvg) fromGeoms = collectShapeGeomsFromSvgString(fromSlide.inlineSvg);
    busy = true;
    showSlide(to);
    scaleFrame();
    var durMs = Math.max(400, Math.min(1200, (incoming.transition && incoming.transition.durationMs) || 700));
    whenSvgRootReady(function(root){
      try{
        fromGeoms.forEach(function(f){
          var tG = readShapeGeom(root, f.name);
          if(tG && tG.fill && tG.fill !== 'none') morphShape(tG, f, durMs);
        });
      }catch(err){ animLog('morph-error', err && err.message); }
      setTimeout(function(){
        busy = false;
        updateNav();
      }, durMs + 80);
    });
  }

  function goSlide(to, dir, fromSlideshow){
    if(busy||to<0||to>=presentation.slides.length||to===slideIndex) return;
    if(!fromSlideshow) stopAllPlayback();
    stopAllMedia();
    var incoming = presentation.slides[to];
    var tx = incoming.transition?.type || 'none';
    if(incoming.transition?.morph?.detected){
      morphIntoSlide(to, dir, incoming);
      return;
    }
    if(!tx||tx==='none'||incoming.transition?.supported===false||!incoming.transition?.renderable){
      showSlide(to);
      scaleFrame();
      return;
    }
    busy=true;
    var txMs = txDurationMs(incoming);
    viewport.classList.add('tx-fade-out');
    viewport.style.setProperty('--tx-ms', txMs + 'ms');
    setTimeout(function(){
      showSlide(to);
      viewport.className='viewport';
      viewport.style.setProperty('--tx-ms', txMs + 'ms');
      var c=txClass(tx);
      if(c){
        viewport.classList.add(c);
        var d = incoming.transition?.direction;
        if(d) viewport.classList.add('tx-dir-'+d);
      }
      scaleFrame();
      setTimeout(function(){ viewport.className='viewport'; viewport.style.removeProperty('--tx-ms'); busy=false; }, txMs);
    }, Math.round(txMs * 0.85));
  }

  document.getElementById('menuBtn').onclick=function(e){ e.stopPropagation(); stopAllPlayback(); openSidebar(); };
  sidebarBackdrop.onclick=closeSidebar;
  prevBtn.onclick=function(e){ e.stopPropagation(); stopAllPlayback(); stopAllMedia(); if(animStep>0){ animStep=0; showSlide(slideIndex); return; } goSlide(slideIndex-1,-1); };
  nextBtn.onclick=function(e){ e.stopPropagation(); stopSlideshow(); advanceAnimOrSlide(1); };
  navPrev.onclick=function(e){
    e.stopPropagation();
    if(navPrev.disabled) return;
    stopAllPlayback();
    stopAllMedia();
    if(animStep>0){ animStep=0; showSlide(slideIndex); return; }
    goSlide(slideIndex-1,-1);
  };
  navNext.onclick=function(e){
    e.stopPropagation();
    if(navNext.disabled) return;
    stopSlideshow();
    advanceAnimOrSlide(1);
  };
  playBtn.onclick=function(e){ e.stopPropagation(); toggleSlideshow(); };
  playStartBtn.onclick=function(e){ e.stopPropagation(); startSlideshow(true); };
  document.getElementById('fs').onclick=function(e){
    e.stopPropagation();
    var el=document.documentElement;
    if(!document.fullscreenElement) (el.requestFullscreen||el.webkitRequestFullscreen).call(el);
    else (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  };
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      if(slideshowPlaying){ stopSlideshow(); return; }
      if(drawingMode){ finishDrawing(); return; }
      if(drawMenu.classList.contains('open')){ closeDrawMenu(); return; }
      closeSidebar();
    }
    if(drawingMode) return;
    if(e.key===' '){
      e.preventDefault();
      toggleSlideshow();
      return;
    }
    if(e.key==='ArrowRight'){ e.preventDefault(); stopSlideshow(); advanceAnimOrSlide(1); }
    if(e.key==='ArrowLeft'){ e.preventDefault(); stopSlideshow(); prevBtn.click(); }
  });
  window.addEventListener('resize', scaleFrame);
  buildSidebar();
  updatePlayButton();
  showSlide(0);
  window.__pptPresentation = presentation;
  window.__pptSlideIndex = function(){ return slideIndex; };
  window.__pptAnimStepLeft = function(){ return (slide().clickSteps||[]).length - animStep; };
  window.__pptObjectOpacity = function(id){ var el = findEl(id); return el ? objectOpacity(el) : 0; };
  window.__pptAdvance = function(){ advanceAnimOrSlide(1); };
  window.__pptHideOverlay = function(){ hidePlayOverlay(); };
})();
`;
}

module.exports = { writePhase2Viewer };
