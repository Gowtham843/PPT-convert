#!/usr/bin/env node
/**
 * End-to-end animation pipeline debugger.
 * Usage: node scripts/debug-animation-pipeline.js [pptx-or-output-dir ...]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const { parseSlideTimeline } = require('../lib/timeline-parser');
const { prepareSlideTimeline, getInitialHiddenIds } = require('../lib/animation-engine');
const { buildObjectMap } = require('../lib/object-mapper');

function triggerLabel(t) {
  if (t === 'on_click') return 'click';
  if (t === 'with_previous') return 'withPrevious';
  if (t === 'after_previous') return 'afterPrevious';
  return t || 'unknown';
}

function buildClickSteps(timeline) {
  const steps = [];
  let batch = [];
  for (const step of timeline) {
    batch.push(step);
    if (step.trigger === 'on_click' || step.trigger === 'after_previous') {
      steps.push(batch);
      batch = [];
    }
  }
  if (batch.length) steps.push(batch);
  return steps;
}

function shapeName(shapes, objectId) {
  const s = (shapes || []).find((x) => String(x.id) === String(objectId));
  return s?.name || '(unknown)';
}

function extractSlideXmls(pptxPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-debug-'));
  execFileSync('unzip', ['-qq', '-o', pptxPath, '-d', dir], { stdio: 'pipe' });
  const slidesDir = path.join(dir, 'ppt', 'slides');
  const files = fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  return { dir, slides: files.map((f) => ({ file: f, xml: fs.readFileSync(path.join(slidesDir, f), 'utf8') })) };
}

function loadPresentationFromOutput(outputDir) {
  const presPath = path.join(outputDir, 'presentation.json');
  if (!fs.existsSync(presPath)) return null;
  return JSON.parse(fs.readFileSync(presPath, 'utf8'));
}

function checkSvgMapping(svgPath, objectId, svgSelector) {
  if (!fs.existsSync(svgPath)) return { ok: false, reason: 'SVG file missing' };
  const svg = fs.readFileSync(svgPath, 'utf8');
  const sel = svgSelector || `[data-sp-id="${objectId}"]`;
  const idAttr = `data-sp-id="${objectId}"`;
  if (!svg.includes(idAttr)) return { ok: false, reason: `missing ${idAttr} in SVG` };
  if (sel.includes('data-sp-idx') && !svg.includes(sel.replace(/[\[\]"]/g, '').split('=')[0])) {
    return { ok: true, warn: 'selector uses data-sp-idx — verify index' };
  }
  return { ok: true };
}

function checkViewer(outputDir, slideIndex) {
  const viewerPath = path.join(outputDir, 'viewer.js');
  if (!fs.existsSync(viewerPath)) return { ok: false, reason: 'viewer.js missing' };
  const src = fs.readFileSync(viewerPath, 'utf8');
  const issues = [];
  if (!src.includes('slideHasAnimations')) issues.push('missing slideHasAnimations (uses img — findEl always null)');
  if (!src.includes('insertSlideAsset')) issues.push('missing insertSlideAsset (showSlide uses img only)');
  if (!src.includes('ensureSvgAnimStyles') && !src.includes('inlineSvg'))
    issues.push('missing SVG anim CSS injection / inlineSvg embed');
  if (src.includes("img.className='slide-img'") && !src.includes('object.slide-svg'))
    issues.push('viewer loads SVG as img only — object animations cannot run');
  const pres = loadPresentationFromOutput(outputDir);
  const slide = pres?.slides?.[slideIndex - 1];
  if (src.includes('s.inlineSvg') || src.includes('slide-svg-inline'))
    return { ok: issues.length === 0, mode: 'inlineSvg', issues };
  if (slide?.inlineSvg) return { ok: true, mode: 'inlineSvg', issues };
  if (src.includes('object.slide-svg')) return { ok: issues.length === 0, mode: 'object', issues };
  return { ok: false, mode: 'img', issues };
}

function printObjectMapping(objectId, objectMap, svgPath) {
  console.log(`Animation object: ${objectId}`);
  const entry = (objectMap || []).find((m) => m.pptxId === String(objectId));
  if (!entry) {
    console.log('  PPTX object ID → glimpse: MISSING');
    console.log('  Mapped SVG element: (none)');
    console.log('  FOUND: NO');
    return false;
  }
  console.log(`  PPTX object ID: ${objectId}`);
  console.log(`  Glimpse object: id=${entry.pptxId} name="${entry.name}" kind=${entry.kind || '?'}`);
  console.log(`  SVG selector: ${entry.svgSelector}`);
  const chk = checkSvgMapping(svgPath, objectId, entry.svgSelector);
  console.log(`  Mapped SVG element: ${entry.svgId || 'sp-' + objectId} (${entry.svgSelector})`);
  console.log(`  FOUND: ${chk.ok ? 'YES' : 'NO'}${chk.reason ? ' — ' + chk.reason : ''}`);
  return chk.ok;
}

function printSlideReport(slideNum, rawTimeline, shapes, objectMap, svgPath, clickSteps, hiddenOnLoad, viewerCheck) {
  console.log(`\nSlide ${slideNum}`);
  console.log('─'.repeat(60));

  if (!rawTimeline.length) {
    console.log('  (no OOXML animations on this slide)');
    return;
  }

  const prepared = prepareSlideTimeline(rawTimeline);
  prepared.forEach((a) => {
    console.log(`Object: ${a.objectId}`);
    console.log(`Name: ${shapeName(shapes, a.objectId)}`);
    console.log(`Effect: ${a.effect}`);
    console.log(`Preset: ${a.presetClass}/${a.presetID ?? '?'}`);
    console.log(`Duration: ${a.duration}ms`);
    console.log(`Delay: ${a.delay}ms`);
    console.log(`Trigger: ${triggerLabel(a.trigger)}`);
    console.log(`Order: ${a.order}`);
    console.log(`CSS: ${a.cssClass || 'none'}`);
    console.log(`Renderable: ${a.renderable}`);
    console.log(`Viewer supported: ${a.viewerSupported !== false}`);
    console.log('  --- object mapping ---');
    printObjectMapping(a.objectId, objectMap, svgPath);
    console.log('');
  });

  console.log(`Click steps: ${clickSteps.length}`);
  console.log(`Hidden on load: [${hiddenOnLoad.join(', ')}]`);

  if (viewerCheck) {
    console.log(`Viewer runtime: ${viewerCheck.ok ? 'OK' : 'BROKEN'} (mode=${viewerCheck.mode || '?'})`);
    if (viewerCheck.issues?.length) {
      viewerCheck.issues.forEach((i) => console.log(`  ⚠ ${i}`));
    }
  }
}

function analyzePptx(pptxPath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PPTX: ${pptxPath}`);
  console.log('='.repeat(60));

  const base = path.basename(pptxPath, '.pptx');
  const outputDir = path.join(ROOT, 'output', base);
  const pres = loadPresentationFromOutput(outputDir);

  let extracted;
  try {
    extracted = extractSlideXmls(pptxPath);
  } catch (e) {
    console.error('Failed to unzip PPTX:', e.message);
    return;
  }

  try {
    extracted.slides.forEach((slide, i) => {
      const slideNum = i + 1;
      const rawTimeline = parseSlideTimeline(slide.xml);
      if (!rawTimeline.length && !pres) return;

      const featSlide = pres?.slides?.[i];
      const shapes = featSlide?.objects || [];
      const objectMap = featSlide?.objectMap || [];
      const timeline = prepareSlideTimeline(featSlide?.timeline || rawTimeline);
      const clickSteps = featSlide?.clickSteps || buildClickSteps(timeline);
      const hiddenOnLoad = featSlide?.hiddenOnLoad || getInitialHiddenIds(timeline);
      const svgRel = featSlide?.svg || `svg/slide-${String(slideNum).padStart(3, '0')}.svg`;
      const svgPath = path.join(outputDir, svgRel.replace(/^\.\//, ''));
      const viewerCheck = rawTimeline.length ? checkViewer(outputDir, slideNum) : null;

      if (rawTimeline.length || timeline.length) {
        printSlideReport(slideNum, rawTimeline, shapes, objectMap, svgPath, clickSteps, hiddenOnLoad, viewerCheck);
      }
    });

    const animSlides = extracted.slides.filter((s) => parseSlideTimeline(s.xml).length);
    console.log(`\nSummary: ${animSlides.length}/${extracted.slides.length} slides with OOXML animations`);
    if (animSlides.length && fs.existsSync(path.join(outputDir, 'viewer.js'))) {
      const v = checkViewer(outputDir, 1);
      if (!v.ok) {
        console.log('\n*** PIPELINE BREAK: viewer.js is stale or cannot drive SVG object animations.');
        console.log('    Fix: re-run render.js to regenerate viewer with insertSlideAsset + inlineSvg/object mode.');
      }
    } else if (animSlides.length && !fs.existsSync(path.join(outputDir, 'viewer.js'))) {
      console.log('\n*** PIPELINE BREAK: no viewer.js — run render.js first.');
    }
  } finally {
    try {
      fs.rmSync(extracted.dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const targets =
    args.length > 0
      ? args.map((a) => path.resolve(a))
      : [
          path.join(ROOT, 'test-files', 'phase2', '02-animation.pptx'),
          path.join(ROOT, 'test-files', 'phase2', '07-combined.pptx'),
          path.join('/Users/gowtham/Downloads', 'Untitled design1.pptx'),
        ].filter((p) => fs.existsSync(p));

  if (!targets.length) {
    console.error('No PPTX files found. Pass paths or generate test-files/phase2 fixtures.');
    process.exit(1);
  }

  for (const t of targets) {
    if (fs.statSync(t).isDirectory()) {
      const pres = loadPresentationFromOutput(t);
      if (pres?.source) {
        const pptx = path.join(path.dirname(t), pres.source);
        if (fs.existsSync(pptx)) analyzePptx(pptx);
        else console.error('Cannot find source PPTX for', t);
      }
    } else {
      analyzePptx(t);
    }
  }
}

main();
