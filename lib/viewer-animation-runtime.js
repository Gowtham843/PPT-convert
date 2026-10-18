/**
 * Browser-side animation runtime (embedded in viewer.js).
 * Web Animations API on individual objects — never the whole slide.
 */

function getViewerAnimationRuntimeSource() {
  return `
  var EFFECT_KEYFRAMES = {
    appear: [{ opacity: 0 }, { opacity: 1 }],
    disappear: [{ opacity: 1 }, { opacity: 0 }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    fadeOut: [{ opacity: 1 }, { opacity: 0 }],
    flyIn: [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'translateY(0)' }],
    flyOut: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-40px)' }],
    float: [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }],
    zoom: [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1)' }],
    growShrink: [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }],
    spin: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    motion: [{ opacity: 1, transform: 'translate(0px, 0px)' }, { opacity: 1, transform: 'translate(0px, 0px)' }],
    transparency: [{ opacity: 1 }, { opacity: 0.4 }],
    box: [{ opacity: 0, clipPath: 'inset(50% 50% 50% 50%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    circle: [{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }, { opacity: 1, clipPath: 'circle(70% at 50% 50%)' }],
    diamond: [{ opacity: 0, clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }, { opacity: 1, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }],
    blinds: [{ opacity: 0, clipPath: 'inset(50% 0% 50% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    checkerboard: [{ opacity: 0, clipPath: 'inset(25% 25% 25% 25%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    dissolve: [{ opacity: 0 }, { opacity: 1 }],
    randombars: [{ opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    strips: [{ opacity: 0, clipPath: 'inset(0% 100% 0% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    wedge: [{ opacity: 0, clipPath: 'polygon(50% 50%, 50% 50%, 100% 100%)' }, { opacity: 1, clipPath: 'polygon(50% 50%, 100% 0%, 100% 100%)' }],
    wheel: [{ opacity: 0, clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 100% 100%)' }, { opacity: 1, clipPath: 'polygon(50% 50%, 100% 0%, 100% 100%, 0% 50%)' }],
    plus: [{ opacity: 0, clipPath: 'inset(45% 45% 45% 45%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    peek: [{ opacity: 0, transform: 'translateY(90%)' }, { opacity: 1, transform: 'translateY(0)' }],
    split: [{ opacity: 0, clipPath: 'inset(50% 0% 50% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    wipe: [{ opacity: 0, clipPath: 'inset(100% 0% 0% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
    colorPulse: [{ color: '#ffffff', filter: 'hue-rotate(0deg)' }, { color: '#C00000', filter: 'hue-rotate(120deg)' }, { color: '#ffffff', filter: 'hue-rotate(0deg)' }],
    fillColor: [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(-60deg)' }],
    fontColor: [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(60deg)' }],
    lineColor: [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(-120deg)' }],
    spiral: [{ opacity: 0, transform: 'scale(0.1) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(360deg)' }],
    swivel: [{ opacity: 0, transform: 'scale(0.3) rotate(-90deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }],
    boomerang: [{ opacity: 0, transform: 'translateX(-60px) rotate(-30deg)' }, { opacity: 1, transform: 'translateX(0) rotate(0deg)' }],
    bounce: [{ opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'translateY(0)' }],
    stretch: [{ opacity: 0, transform: 'scaleX(0.1)' }, { opacity: 1, transform: 'scaleX(1)' }],
    flip: [{ opacity: 0, transform: 'scaleX(0.2) rotate(90deg)' }, { opacity: 1, transform: 'scaleX(1) rotate(0deg)' }],
    pinwheel: [{ opacity: 0, transform: 'translateY(-60px) rotate(-180deg)' }, { opacity: 1, transform: 'translateY(0) rotate(0deg)' }],
    growTurn: [{ opacity: 0, transform: 'scale(0.1) rotate(-180deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }],
    spinner: [{ opacity: 0, transform: 'translateY(40px) rotate(0deg)' }, { opacity: 1, transform: 'translateY(0) rotate(360deg)' }],
    compress: [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(0.1)' }],
    curveUp: [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }],
    curveDown: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-40px)' }],
    drop: [{ opacity: 0, transform: 'translateY(-60px)' }, { opacity: 1, transform: 'translateY(0)' }],
    riseUp: [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }],
    floatDown: [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'translateY(0)' }],
    whip: [{ opacity: 0, transform: 'translateX(60px) rotate(90deg)' }, { opacity: 1, transform: 'translateX(0) rotate(0deg)' }],
    centerRevolve: [{ opacity: 0, transform: 'scale(0.5) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(360deg)' }],
    sinkDown: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(40px)' }],
    teeter: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(15deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(0deg)' }],
    pulse: [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }],
    shimmer: [{ opacity: 0.4, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'translateX(20px)' }, { opacity: 0.4, transform: 'translateX(-20px)' }],
  };

  var objectClickDone = {};

  function emuToPx(emu, axis){
    var ss = presentation.slideSize || {};
    var emuSize = axis === 'y' ? (ss.heightEmu || 6858000) : (ss.widthEmu || 9144000);
    var pxSize = axis === 'y' ? (presentation.slides[0]?.height || 720) : (presentation.slides[0]?.width || 960);
    return (Number(emu) / emuSize) * pxSize;
  }

  function parsePathDelta(pathStr){
    if(!pathStr) return { x: 120, y: 0 };
    var nums = pathStr.match(/-?\\d+/g);
    if(!nums || nums.length < 4) return { x: 120, y: 0 };
    return { x: Number(nums[2]) - Number(nums[0]), y: Number(nums[3]) - Number(nums[1]) };
  }

  function motionKeyframes(entry){
    var motion = entry.motion || {};
    if(motion.path){
      var d = parsePathDelta(motion.path);
      return [
        { opacity: 1, transform: 'translate(0px, 0px)' },
        { opacity: 1, transform: 'translate(' + d.x + 'px,' + d.y + 'px)' }
      ];
    }
    var dx = motion.dx ? emuToPx(motion.dx, 'x') : 0;
    var dy = motion.dy ? emuToPx(motion.dy, 'y') : 0;
    if(!dx && !dy) dx = 120;
    return [
      { opacity: 1, transform: 'translate(0px, 0px)' },
      { opacity: 1, transform: 'translate(' + dx + 'px,' + dy + 'px)' }
    ];
  }

  function buildKeyframes(entry){
    var effect = entry.effect || 'fade';
    if(effect === 'motion') return motionKeyframes(entry);
    var frames = EFFECT_KEYFRAMES[effect] || EFFECT_KEYFRAMES.fade;
    var exitOnly = ['disappear','fadeOut','flyOut','curveDown','sinkDown'];
    if(entry.exit && exitOnly.indexOf(effect) === -1) return frames.slice().reverse();
    return frames;
  }

  function objectOpacity(el){
    if(!el) return 0;
    var style = el.ownerDocument.defaultView.getComputedStyle(el);
    return parseFloat(style.opacity || '0');
  }

  function hideObject(el){
    if(!el) return;
    el.classList.add('sp-anim-hidden');
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
  }

  function revealObject(el){
    if(!el) return;
    el.classList.remove('sp-anim-hidden');
    el.style.visibility = 'visible';
    el.style.pointerEvents = '';
  }

  function runObjectAnimation(el, entry){
    if(!el){
      animLog('ERROR','target missing', entry.targetObject || entry.objectId);
      return Promise.resolve(null);
    }
    if(el.namespaceURI && el.namespaceURI.indexOf('svg') !== -1){
      el.style.transformBox = 'fill-box';
      el.style.transformOrigin = 'center center';
    }
    var effect = entry.effect || 'fade';
    var duration = entry.duration || 500;
    var delay = (entry.startAt || 0) + (entry.delay || 0);
    animLog('START','object='+(entry.targetObject||entry.objectId),'effect='+effect,'delay='+delay,'duration='+duration);
    revealObject(el);
    var anim = el.animate(buildKeyframes(entry), {
      duration: duration,
      delay: delay,
      fill: 'both',
      easing: 'ease'
    });
    return new Promise(function(resolve){
      anim.onfinish = function(){
        if(entry.exit || effect==='disappear' || effect==='fadeOut') hideObject(el);
        else { el.style.opacity = '1'; el.classList.add('sp-anim-visible'); }
        animLog('END','object='+(entry.targetObject||entry.objectId),'effect='+effect);
        resolve(anim);
      };
      anim.oncancel = function(){ resolve(null); };
    });
  }

  function runAnimationBatch(batch, findElFn){
    var promises = (batch||[]).map(function(entry){
      var el = findElFn(entry.targetObject || entry.objectId);
      animLog('MAP','slide='+(slideIndex+1),'pptObject='+(entry.targetObject||entry.objectId),'svgObject='+(el?(el.getAttribute('data-sp-id')||el.tagName):'NOT_FOUND'),'found='+!!el);
      if(!el) animLog('ERROR','Target: '+(entry.targetObject||entry.objectId),'Reason: SVG object not found');
      return runObjectAnimation(el, entry);
    });
    return Promise.all(promises);
  }

  function applyInitialHidden(hiddenIds, findElFn){
    (hiddenIds||[]).forEach(function(id){
      var el = findElFn(id);
      animLog('hide-on-load','object='+id,'found='+!!el);
      hideObject(el);
    });
  }

  function resetObjectClickState(){
    objectClickDone = {};
  }

  function attachObjectClickTriggers(findElFn){
    var batches = slide().objectClickSteps || [];
    batches.forEach(function(batch){
      var entry = batch[0];
      if(!entry) return;
      var triggerId = entry.triggerObject || (entry.triggerDetail && entry.triggerDetail.object);
      if(!triggerId) return;
      var triggerEl = findElFn(triggerId);
      animLog('object-click-trigger','trigger='+triggerId,'found='+!!triggerEl);
      if(!triggerEl) return;
      triggerEl.classList.add('sp-click-trigger');
      triggerEl.style.cursor = 'pointer';
      triggerEl.addEventListener('click', function(ev){
        ev.stopPropagation();
        var key = entry.id || ('oc-' + (entry.targetObject || entry.objectId));
        if(objectClickDone[key]) return;
        objectClickDone[key] = true;
        runAnimationBatch(batch, findElFn);
      });
    });
  }

  function batchDurationMs(batch){
    if(!batch||!batch.length) return 0;
    var max = 0;
    batch.forEach(function(e){
      max = Math.max(max, e.endAt != null ? e.endAt : (e.startAt||0)+(e.duration||500));
    });
    return max;
  }

  function pendingClickSteps(){
    return (slide().clickSteps || []).length - animStep;
  }
`;
}

module.exports = { getViewerAnimationRuntimeSource };
