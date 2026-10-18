/**
 * --debug-animation console report during render.
 */

const fs = require('fs');
const path = require('path');
const { buildScheduledSteps } = require('./animation-engine');

function verifySvgTarget(svgPath, objectId, svgSelector) {
  if (!fs.existsSync(svgPath)) {
    return { found: false, reason: 'SVG file missing' };
  }
  const svg = fs.readFileSync(svgPath, 'utf8');
  const sel = svgSelector || `[data-sp-id="${objectId}"]`;
  const idNeedle = `data-sp-id="${objectId}"`;
  if (!svg.includes(idNeedle)) {
    return { found: false, reason: `missing ${idNeedle} in SVG` };
  }
  return { found: true, svgSelector: sel, svgId: `sp-${objectId}` };
}

function printAnimationDebug(presentation, outputDir) {
  console.log('\n========== ANIMATION DEBUG ==========\n');

  for (const slide of presentation.slides || []) {
    const slideNum = slide.index;
    const svgPath = path.join(outputDir, (slide.svg || '').replace(/^\.\//, ''));
    const { timeline, clickSteps } = buildScheduledSteps(
      slide.timeline?.length ? slide.timeline : []
    );

    console.log(`[SLIDE ${slideNum}]`);
    console.log(`Objects: ${slide.objects?.length || 0}`);
    console.log(`Animations: ${timeline.length}`);
    console.log(
      `Transition: ${slide.transition?.rawType || slide.transition?.type || 'none'}${
        slide.transition?.morph?.detected ? ' (MORPH detected, not renderable)' : ''
      }`
    );

    if (slide.transition?.morph?.detected) {
      console.log(`  Morph: ${slide.transition.morph.reason || 'detected'}`);
    }

    timeline.forEach((anim, i) => {
      const mapEntry = (slide.objectMap || []).find(
        (m) => m.pptxId === String(anim.targetObject || anim.objectId)
      );
      const chk = verifySvgTarget(
        svgPath,
        anim.targetObject || anim.objectId,
        mapEntry?.svgSelector
      );
      console.log(`\n[ANIMATION ${i + 1}]`);
      console.log(`Target: ${anim.targetObject || anim.objectId}`);
      console.log(`Effect: ${anim.effect}`);
      console.log(`Trigger: ${anim.trigger}`);
      console.log(`Duration: ${anim.duration}ms`);
      console.log(`StartAt: ${anim.startAt ?? 'click-group'}`);
      console.log(`Mapped SVG: ${chk.found ? 'YES' : 'NO'}`);
      if (!chk.found) {
        console.log(`[ANIMATION ERROR]`);
        console.log(`Target: ${anim.targetObject || anim.objectId}`);
        console.log(`Reason: ${chk.reason}`);
      } else {
        console.log(`[ANIMATION MAP] slide=${slideNum} pptObject=${anim.targetObject} svgObject=${chk.svgId} found=true`);
      }
    });

    if (timeline.length === 0) console.log('  (no object animations)');
    console.log(`Click groups: ${clickSteps.length}`);
    console.log('');
  }
}

module.exports = { printAnimationDebug, verifySvgTarget };
