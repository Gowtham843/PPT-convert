/**
 * Phase 1 SVG HTML5 viewer — generates index.html + viewer.js (no CDN).
 */

const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeSvgViewer(outputDir, presentation, title) {
  fs.writeFileSync(path.join(outputDir, 'presentation.json'), JSON.stringify(presentation, null, 2));

  fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)} — Phase 1 SVG viewer</title>
  <style>
    :root{--bg:#111;--fg:#eee;--muted:#999;--bar:#0a0a0a}
    *{box-sizing:border-box}
    html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .app{display:flex;flex-direction:column;height:100%}
    .stage{flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0}
    .viewport{position:relative;max-width:100%;max-height:100%;overflow:hidden}
    .frame{position:relative;background:#fff;transform-origin:center center;line-height:0}
    .frame object.slide-svg,.frame img.slide-png{position:absolute;inset:0;width:100%;height:100%;display:block}
    .frame object.slide-svg{border:0}
    .frame img.slide-png{object-fit:contain;background:#000}
    .media-layer{position:absolute;inset:0;pointer-events:none}
    .media-ov{position:absolute;pointer-events:auto;z-index:4}
    .media-ov video,.media-ov audio{width:100%;height:100%;display:block;background:#000}
    .media-ov audio{height:36px;min-height:36px}
    .badge{position:absolute;left:8px;top:8px;z-index:5;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:4px 8px;border-radius:4px}
    .bar{display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;flex-wrap:wrap;background:var(--bar);border-top:1px solid #222}
    .bar button{padding:8px 14px;background:#222;color:#eee;border:1px solid #444;border-radius:4px;cursor:pointer}
    .bar button:disabled{opacity:.4;cursor:default}
    .counter{color:var(--muted);font-variant-numeric:tabular-nums}
    .note{font-size:12px;color:var(--muted);max-width:46em}
    .viewport.tx-out .frame{animation:fadeOut .4s forwards}
    .viewport.tx-in-fade .frame{animation:fadeIn .4s forwards}
    .viewport.tx-in-push .frame{animation:pushIn .45s forwards}
    .viewport.tx-in-wipe .frame{animation:wipeIn .45s forwards}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes fadeOut{from{opacity:1}to{opacity:0}}
    @keyframes pushIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
    @keyframes wipeIn{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
  </style>
</head>
<body>
<div class="app">
  <div class="stage">
    <div class="viewport" id="viewport">
      <div class="frame" id="frame">
        <span class="badge" id="badge">SVG</span>
        <div class="media-layer" id="mediaLayer"></div>
      </div>
    </div>
  </div>
  <div class="bar">
    <button id="prev">Previous</button>
    <span class="counter" id="counter">Slide 1 / 1</span>
    <button id="next">Next</button>
    <button id="replay">Replay anim</button>
    <button id="fs">Fullscreen</button>
    <span class="note">Phase 1: SVG (pptx-glimpse) + media overlays + PNG fallback. Not iSpring.</span>
  </div>
</div>
<script src="viewer.js"></script>
</body>
</html>`
  );

  fs.writeFileSync(path.join(outputDir, 'viewer.js'), buildViewerJs(presentation));
}

function buildViewerJs(presentation) {
  const embedded = JSON.stringify(presentation);
  return `'use strict';
(function(){
  var presentation = ${embedded};
  var index = 0, busy = false;
  var frame = document.getElementById('frame');
  var viewport = document.getElementById('viewport');
  var badge = document.getElementById('badge');
  var counter = document.getElementById('counter');
  var mediaLayer = document.getElementById('mediaLayer');

  function scaleFrame(){
    var slide = presentation.slides[index];
    var maxW = viewport.clientWidth - 8;
    var maxH = viewport.clientHeight - 8;
    var ratio = slide.width / slide.height;
    var w = maxW, h = w / ratio;
    if (h > maxH){ h = maxH; w = h * ratio; }
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
  }

  function clearSlide(){
    mediaLayer.innerHTML = '';
    frame.querySelectorAll('object.slide-svg,img.slide-png').forEach(function(n){ n.remove(); });
  }

  function place(el,o){
    el.style.left=(o.xPct||0)+'%';
    el.style.top=(o.yPct||0)+'%';
    el.style.width=(o.widthPct||10)+'%';
    el.style.height=(o.type==='audio'?Math.max(o.heightPct||6,5):o.heightPct||10)+'%';
  }

  function renderMedia(slide){
    (slide.media||[]).forEach(function(m){
      var wrap=document.createElement('div');
      wrap.className='media-ov';
      place(wrap,m);
      var el=document.createElement(m.type==='video'?'video':'audio');
      el.src=m.src; el.controls=true; el.preload='metadata';
      if(m.poster&&m.type==='video') el.poster=m.poster;
      if(m.loop) el.loop=true;
      if(m.volume!=null) el.volume=m.volume;
      if(m.autoplay){ el.autoplay=true; if(m.type==='video'){ el.muted=true; el.playsInline=true; } }
      wrap.appendChild(el);
      mediaLayer.appendChild(wrap);
    });
  }

  function svgRoot(){
    var obj=frame.querySelector('object.slide-svg');
    if(!obj) return null;
    try{ return obj.contentDocument && obj.contentDocument.documentElement; }catch(e){ return null; }
  }

  function runAnimations(slide){
    var list=(slide.animations||[]).filter(function(a){return a.supported;}).sort(function(a,b){return a.order-b.order;});
    list.forEach(function(a,i){
      setTimeout(function(){
        var node=svgRoot();
        var el=node?node.querySelector('[data-sp-id="'+a.objectId+'"]'):null;
        if(!el) return;
        el.style.transition='opacity '+(a.duration||500)+'ms ease, transform '+(a.duration||500)+'ms ease';
        if(a.effect==='fadeIn'||a.effect==='appear'){
          el.style.opacity='0';
          requestAnimationFrame(function(){ el.style.opacity='1'; });
        } else if(a.effect==='fadeOut'||a.effect==='disappear'){
          el.style.opacity='0';
        } else if(a.motion){
          el.style.opacity='0';
          el.style.transform='translateY(16px)';
          requestAnimationFrame(function(){ el.style.opacity='1'; el.style.transform='translateY(0)'; });
        }
      }, (a.delay||0)+i*30);
    });
  }

  function showSlide(i){
    clearSlide();
    var slide=presentation.slides[i];
    badge.textContent = slide.renderer==='svg' ? 'SVG' : 'PNG FALLBACK';
    if(slide.renderer==='png-fallback' && (slide.png||slide.fallback?.png)){
      var img=document.createElement('img');
      img.className='slide-png';
      img.src=slide.png||slide.fallback.png;
      frame.insertBefore(img, mediaLayer);
    } else if(slide.svg){
      var obj=document.createElement('object');
      obj.className='slide-svg';
      obj.type='image/svg+xml';
      obj.data=slide.svg;
      obj.onload=function(){ runAnimations(slide); };
      frame.insertBefore(obj, mediaLayer);
      setTimeout(function(){ runAnimations(slide); }, 150);
    }
    renderMedia(slide);
    counter.textContent='Slide '+(i+1)+' / '+presentation.slides.length;
    scaleFrame();
  }

  function txClass(type,dir){
    if(type==='push') return dir>0?'tx-in-push':'tx-out';
    if(type==='wipe') return 'tx-in-wipe';
    if(type==='fade') return dir>0?'tx-in-fade':'tx-out';
    return null;
  }

  function go(to,dir){
    if(busy||to<0||to>=presentation.slides.length||to===index) return;
    var tx=presentation.slides[index].transition?.type||'none';
    if(!tx||tx==='none'){ index=to; showSlide(index); return; }
    busy=true;
    viewport.classList.add('tx-out');
    setTimeout(function(){
      index=to; showSlide(index);
      viewport.className='viewport';
      var c=txClass(tx,dir);
      if(c) viewport.classList.add(c);
      setTimeout(function(){ viewport.className='viewport'; busy=false; },420);
    },350);
  }

  document.getElementById('prev').onclick=function(){ go(index-1,-1); };
  document.getElementById('next').onclick=function(){ go(index+1,1); };
  document.getElementById('replay').onclick=function(){ showSlide(index); };
  document.getElementById('fs').onclick=function(){
    var el=document.documentElement;
    if(!document.fullscreenElement) (el.requestFullscreen||el.webkitRequestFullscreen).call(el);
    else (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  };
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'){ e.preventDefault(); go(index-1,-1); }
    if(e.key==='ArrowRight'){ e.preventDefault(); go(index+1,1); }
  });
  window.addEventListener('resize', scaleFrame);
  showSlide(0);
})();
`;
}

module.exports = { writeSvgViewer };
