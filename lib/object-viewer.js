/**
 * HTML5 object-model presentation viewer (no CDN).
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildObjectViewerHtml(presentation, title) {
  const slidesJson = JSON.stringify(presentation.slides);
  const sizeJson = JSON.stringify(presentation.slideSize);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — object viewer</title>
<style>
:root{--bg:#111;--fg:#eee;--muted:#999;--bar:#0a0a0a}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.app{display:flex;flex-direction:column;height:100%}
.stage{flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0}
.viewport{position:relative;max-width:100%;max-height:100%;overflow:hidden}
.canvas{position:relative;background:#fff;transform-origin:center center}
.canvas img.fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.obj{position:absolute;overflow:hidden}
.obj.text{display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;color:#111;font-weight:600;white-space:pre-wrap;line-height:1.2}
.obj.shape{border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600}
.obj img{width:100%;height:100%;object-fit:contain;display:block}
.obj video,.obj audio{width:100%;height:100%;display:block;background:#000}
.obj audio{height:36px}
.anim-hidden{opacity:0}
.bar{display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;flex-wrap:wrap;background:var(--bar);border-top:1px solid #222}
.bar button{padding:8px 14px;background:#222;color:#eee;border:1px solid #444;border-radius:4px;cursor:pointer}
.bar button:disabled{opacity:.4;cursor:default}
.counter{color:var(--muted);font-variant-numeric:tabular-nums}
.note{font-size:12px;color:var(--muted);max-width:42em}
.badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:4px 8px;border-radius:4px;z-index:5}
.viewport.tx-fade-out .canvas{animation:fadeOut .4s forwards}
.viewport.tx-fade-in .canvas{animation:fadeIn .4s forwards}
.viewport.tx-push .canvas{animation:pushIn .45s forwards}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes fadeOut{from{opacity:1}to{opacity:0}}
@keyframes pushIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
</style>
</head>
<body>
<div class="app">
  <div class="stage">
    <div class="viewport" id="viewport">
      <div class="canvas" id="canvas">
        <div class="badge" id="badge"></div>
      </div>
    </div>
  </div>
  <div class="bar">
    <button id="prev">Previous</button>
    <span class="counter" id="counter">Slide 1 / 1</span>
    <button id="next">Next</button>
    <button id="replay">Replay anim</button>
    <button id="fs">Fullscreen</button>
    <span class="note">Object-model viewer (prototype). PNG fallback when unsupported. Not iSpring.</span>
  </div>
</div>
<script>
(function(){
  var slides = ${slidesJson};
  var slideSize = ${sizeJson};
  var index = 0, busy = false;
  var canvas = document.getElementById('canvas');
  var viewport = document.getElementById('viewport');
  var badge = document.getElementById('badge');
  var counter = document.getElementById('counter');

  function scaleCanvas(){
    var maxW = viewport.clientWidth - 8;
    var maxH = viewport.clientHeight - 8;
    var ratio = slideSize.widthPx / slideSize.heightPx;
    var w = maxW;
    var h = w / ratio;
    if (h > maxH){ h = maxH; w = h * ratio; }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function clearCanvas(){
    while (canvas.children.length > 1) canvas.removeChild(canvas.lastChild);
  }

  function place(el, o){
    el.style.left = (o.xPct||0) + '%';
    el.style.top = (o.yPct||0) + '%';
    el.style.width = (o.widthPct||10) + '%';
    el.style.height = (o.heightPct||10) + '%';
  }

  function renderSlide(i){
    clearCanvas();
    var slide = slides[i];
    canvas.style.background = slide.background || '#fff';
    badge.textContent = slide.renderer === 'object' ? 'OBJECT' : 'PNG FALLBACK';

    if (slide.renderer !== 'object' && slide.fallback && slide.fallback.png){
      var img = document.createElement('img');
      img.className = 'fallback';
      img.src = slide.fallback.png;
      img.alt = 'Slide ' + (i+1);
      canvas.appendChild(img);
      counter.textContent = 'Slide ' + (i+1) + ' / ' + slides.length;
      return;
    }

    (slide.objects||[]).forEach(function(o){
      if (o.renderMode === 'fallback') return;
      var el = document.createElement('div');
      el.className = 'obj';
      el.dataset.id = o.id;
      place(el, o);
      if (o.type === 'text'){
        el.className += ' text';
        el.textContent = o.text || '';
        if (o.fontSize) el.style.fontSize = Math.min(48, Math.max(10, o.fontSize)) + 'px';
        if (o.color) el.style.color = o.color;
      } else if (o.type === 'image'){
        var im = document.createElement('img');
        im.src = o.src;
        im.alt = '';
        el.appendChild(im);
      } else if (o.type === 'shape'){
        el.className += ' shape';
        el.style.background = o.fill || '#4472C4';
        if (o.text) el.textContent = o.text;
      } else if (o.type === 'video'){
        var v = document.createElement('video');
        v.src = o.src; v.controls = true; v.preload = 'metadata';
        if (o.poster) v.poster = o.poster;
        if (o.loop) v.loop = true;
        if (o.autoplay){ v.autoplay = true; v.muted = true; v.playsInline = true; }
        el.appendChild(v);
      } else if (o.type === 'audio'){
        var a = document.createElement('audio');
        a.src = o.src; a.controls = true; a.preload = 'metadata';
        if (o.loop) a.loop = true;
        el.appendChild(a);
      }
      canvas.appendChild(el);
    });

    runAnimations(slide);
    counter.textContent = 'Slide ' + (i+1) + ' / ' + slides.length;
  }

  function runAnimations(slide){
    var byId = {};
    canvas.querySelectorAll('.obj').forEach(function(n){ byId[n.dataset.id] = n; });
    var list = (slide.animations||[]).filter(function(a){ return a.supported; }).sort(function(a,b){ return a.order-b.order; });
    list.forEach(function(a, idx){
      var node = byId[a.objectId];
      if (!node) return;
      if (a.effect === 'fadeIn' || a.effect === 'appear') node.classList.add('anim-hidden');
      var delay = (a.delay||0) + (idx * 50);
      setTimeout(function(){
        node.style.transition = 'opacity ' + (a.duration||500) + 'ms ease';
        if (a.effect === 'fadeOut' || a.effect === 'disappear') node.style.opacity = '0';
        else { node.classList.remove('anim-hidden'); node.style.opacity = '1'; }
      }, delay);
    });
  }

  function go(to, dir){
    if (busy || to < 0 || to >= slides.length || to === index) return;
    busy = true;
    var tx = slides[index].transition && slides[index].transition.type;
    if (!tx || tx === 'none'){
      index = to; renderSlide(index); busy = false; return;
    }
    viewport.classList.add('tx-fade-out');
    setTimeout(function(){
      index = to;
      renderSlide(index);
      viewport.className = 'viewport';
      viewport.classList.add(tx === 'push' ? 'tx-push' : 'tx-fade-in');
      setTimeout(function(){ viewport.className = 'viewport'; busy = false; }, 420);
    }, 350);
  }

  document.getElementById('prev').onclick = function(){ go(index-1,-1); };
  document.getElementById('next').onclick = function(){ go(index+1,1); };
  document.getElementById('replay').onclick = function(){ renderSlide(index); };
  document.getElementById('fs').onclick = function(){
    var el = document.documentElement;
    if (!document.fullscreenElement) (el.requestFullscreen||el.webkitRequestFullscreen).call(el);
    else (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  };
  window.addEventListener('resize', scaleCanvas);
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft'){ e.preventDefault(); go(index-1,-1); }
    if (e.key === 'ArrowRight'){ e.preventDefault(); go(index+1,1); }
  });
  scaleCanvas();
  renderSlide(0);
})();
</script>
</body>
</html>`;
}

module.exports = { buildObjectViewerHtml };
