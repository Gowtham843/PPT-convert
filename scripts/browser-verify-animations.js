#!/usr/bin/env node
/**
 * Browser-verify animation runtime using Playwright.
 * Tests actual DOM opacity/transform — not XML detection.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildAnimationFeatureReport } = require('../lib/animation-feature-report');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output');
const BROWSER_REPORT = path.join(ROOT, 'animation-browser-report.json');

const TESTS = [
  {
    deck: '01-fade-click',
    file: 'test-files/animation/01-fade-click.pptx',
    async run(page) {
      const targetId = await page.evaluate(() => {
        const s = window.__pptPresentation?.slides?.[0];
        return s?.hiddenOnLoad?.[0] || s?.clickSteps?.[0]?.[0]?.targetObject;
      });
      const before = await objectOpacity(page, targetId);
      await clickNext(page);
      await page.waitForTimeout(700);
      const after = await objectOpacity(page, targetId);
      return {
        targetId,
        before,
        after,
        pass: before < 0.5 && after > 0.5,
        reason: before >= 0.5 ? 'object visible before click' : after <= 0.5 ? 'object still hidden after click' : null,
      };
    },
  },
  {
    deck: '02-appear-sequence',
    file: 'test-files/animation/02-appear-sequence.pptx',
    async run(page) {
      const ids = await page.evaluate(() => window.__pptPresentation.slides[0].hiddenOnLoad);
      if (ids.length !== 3) return { pass: false, reason: `expected 3 hidden objects, got ${ids.length}` };
      for (let i = 0; i < 3; i++) {
        const id = ids[i];
        const before = await objectOpacity(page, id);
        if (before > 0.5) return { pass: false, reason: `object ${id} visible before click ${i + 1}` };
        await clickNext(page);
        await page.waitForTimeout(700);
        const after = await objectOpacity(page, id);
        if (after <= 0.5) return { pass: false, reason: `object ${id} still hidden after click ${i + 1}` };
      }
      let stepsLeft = await page.evaluate(() => window.__pptAnimStepLeft?.());
      let slideIdx = await page.evaluate(() => window.__pptSlideIndex?.());
      if (stepsLeft !== 0) return { pass: false, reason: 'animations remain after 3 clicks' };
      if (slideIdx !== 0) return { pass: false, reason: 'advanced slide before finishing animations' };
      await clickNext(page);
      await page.waitForTimeout(400);
      slideIdx = await page.evaluate(() => window.__pptSlideIndex?.());
      return {
        pass: slideIdx === 1,
        reason: slideIdx !== 1 ? '4th click did not advance to slide 2' : null,
      };
    },
  },
  {
    deck: '04-with-previous',
    file: 'test-files/animation/04-with-previous.pptx',
    async run(page) {
      const batch = await page.evaluate(() => window.__pptPresentation.slides[0].clickSteps[0]);
      const a = batch[0].targetObject;
      const b = batch[1].targetObject;
      await clickNext(page);
      await page.waitForTimeout(150);
      const earlyA = await objectOpacity(page, a);
      const earlyB = await objectOpacity(page, b);
      await page.waitForTimeout(700);
      const lateA = await objectOpacity(page, a);
      const lateB = await objectOpacity(page, b);
      const startDelta = Math.abs(earlyA - earlyB);
      return {
        pass: earlyA > 0.3 && earlyB > 0.3 && startDelta < 0.35 && lateA > 0.9 && lateB > 0.9,
        reason: earlyA <= 0.3 || earlyB <= 0.3 ? 'withPrevious did not start both early' : null,
        earlyA,
        earlyB,
        lateA,
        lateB,
      };
    },
  },
  {
    deck: '05-after-previous',
    file: 'test-files/animation/05-after-previous.pptx',
    async run(page) {
      const batch = await page.evaluate(() => window.__pptPresentation.slides[0].clickSteps[0]);
      const a = batch[0].targetObject;
      const b = batch[1].targetObject;
      await clickNext(page);
      await page.waitForTimeout(250);
      const midA = await objectOpacity(page, a);
      const midB = await objectOpacity(page, b);
      await page.waitForTimeout(500);
      const lateB = await objectOpacity(page, b);
      return {
        pass: midA > 0.5 && midB < 0.5 && lateB > 0.5,
        reason: midB > 0.5 ? 'second object started with first (not afterPrevious)' : midA <= 0.5 ? 'first object did not animate' : null,
        midA,
        midB,
        lateB,
      };
    },
  },
  {
    deck: '06-multiple-effects',
    file: 'test-files/animation/06-multiple-effects.pptx',
    async run(page) {
      const batch = await page.evaluate(() => window.__pptPresentation.slides[0].clickSteps[0]);
      const dur = batch.map((e) => e.endAt);
      const maxEnd = Math.max(...dur);
      await clickNext(page);
      await page.waitForTimeout(maxEnd + 200);
      const opacities = await page.evaluate((ids) => {
        return ids.map((id) => window.__objectOpacity?.(id) ?? 0);
      }, batch.map((e) => e.targetObject));
      return {
        pass: opacities.every((o) => o > 0.9) && maxEnd >= 1700,
        reason: maxEnd < 1700 ? 'scheduled endAt too short for chained durations' : null,
        maxEnd,
        opacities,
      };
    },
  },
  {
    deck: '07-object-click',
    file: 'test-files/animation/07-object-click.pptx',
    async run(page) {
      const data = await page.evaluate(() => {
        const s = window.__pptPresentation.slides[0];
        const batch = s.objectClickSteps[0][0];
        return {
          trigger: batch.triggerObject,
          target: batch.targetObject,
        };
      });
      const before = await objectOpacity(page, data.target);
      await clickSvgObject(page, data.trigger);
      await page.waitForTimeout(800);
      const after = await objectOpacity(page, data.target);
      return {
        pass: before < 0.5 && after > 0.5,
        reason: after <= 0.5 ? 'target did not animate on object click' : before >= 0.5 ? 'target visible before click' : null,
        before,
        after,
      };
    },
  },
  {
    deck: '08-motion-path',
    file: 'test-files/animation/08-motion-path.pptx',
    async run(page) {
      const targetId = await page.evaluate(() => window.__pptPresentation.slides[0].clickSteps[0][0].targetObject);
      const before = await objectTransform(page, targetId);
      await clickNext(page);
      await page.waitForTimeout(900);
      const after = await objectTransform(page, targetId);
      const moved = before !== after && !after.includes('matrix(1,0,0,1,0,0)');
      return { pass: moved, before, after, reason: moved ? null : 'transform unchanged after motion animation' };
    },
  },
];

async function objectOpacity(page, objectId) {
  return page.evaluate(
    (id) => {
      const el = document.querySelector('[data-sp-id="' + id + '"]');
      if (!el) return 0;
      return parseFloat(getComputedStyle(el).opacity || '0');
    },
    objectId
  );
}

async function objectTransform(page, objectId) {
  return page.evaluate(
    (id) => {
      const el = document.querySelector('[data-sp-id="' + id + '"]');
      if (!el) return '';
      return getComputedStyle(el).transform || '';
    },
    objectId
  );
}

async function preparePage(page) {
  await page.evaluate(() => {
    window.__pptHideOverlay?.();
  });
}

async function clickNext(page) {
  await preparePage(page);
  await page.evaluate(() => window.__pptAdvance?.());
  await page.waitForTimeout(50);
}

async function clickSvgObject(page, objectId) {
  await page.evaluate((id) => {
    const el = document.querySelector('[data-sp-id="' + id + '"]');
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, objectId);
}

function renderDeck(pptxPath) {
  execFileSync('node', [path.join(ROOT, 'render.js'), '--file', pptxPath], {
    cwd: ROOT,
    stdio: 'pipe',
  });
}

async function injectTestHooks(page) {
  await page.addInitScript(() => {
    window.__presentation = null;
    window.__slideIndex = () => (typeof slideIndex !== 'undefined' ? slideIndex : 0);
    window.__animStepLeft = () => {
      if (typeof slide !== 'function' || typeof animStep === 'undefined') return 0;
      return (slide().clickSteps || []).length - animStep;
    };
    window.__objectOpacity = (id) => {
      const el = document.querySelector('[data-sp-id="' + id + '"]');
      if (!el) return 0;
      return parseFloat(getComputedStyle(el).opacity || '0');
    };
  });
}

function mergeBrowserResults(report, browserSummary) {
  const map = {
    '01-fade-click': 'fade',
    '02-appear-sequence': 'appear',
    '04-with-previous': 'withPrevious',
    '05-after-previous': 'afterPrevious',
    '06-multiple-effects': 'afterPrevious',
    '07-object-click': 'objectClickTrigger',
    '08-motion-path': 'motionPath',
  };
  for (const [deck, key] of Object.entries(map)) {
    const r = browserSummary.results?.[deck];
    if (!r) continue;
    if (key === 'fade') report.summary.fade = r.status;
    if (key === 'appear') report.summary.appear = r.status;
    if (key === 'withPrevious') report.summary.withPrevious = r.status;
    if (key === 'afterPrevious') report.summary.afterPrevious = r.status;
    if (key === 'objectClickTrigger') report.summary.objectClickTrigger = r.status;
    if (key === 'motionPath') report.summary.motionPath = r.status;
  }
  if (browserSummary.results?.['01-fade-click']?.status === 'PASS') {
    report.summary.clickTrigger = 'PASS';
    report.summary.animationObjectMapping = 'PASS';
  }
  report.browserVerifiedAt = browserSummary.generatedAt;
  return report;
}

async function main() {
  const results = {};
  const browser = await chromium.launch({ headless: true });

  for (const test of TESTS) {
    const pptx = path.join(ROOT, test.file);
    if (!fs.existsSync(pptx)) {
      results[test.deck] = { status: 'FAIL', reason: 'fixture missing' };
      continue;
    }
    console.log(`\n=== ${test.deck} ===`);
    renderDeck(pptx);
    const html = path.join(OUTPUT, test.deck, 'index.html');
    const page = await browser.newPage();
    await injectTestHooks(page);
    await page.goto('file://' + html);
    await page.waitForFunction(() => typeof window.__pptPresentation !== 'undefined', null, {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => document.querySelector('.slide-svg-inline,.slide-svg') !== null,
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(500);
    await preparePage(page);

    try {
      const detail = await test.run(page);
      results[test.deck] = {
        status: detail.pass ? 'PASS' : 'FAIL',
        ...detail,
      };
      console.log(detail.pass ? 'PASS' : 'FAIL', detail.reason || '');
    } catch (err) {
      results[test.deck] = { status: 'FAIL', reason: err.message };
      console.log('FAIL', err.message);
    }
    await page.close();
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(path.join(ROOT, 'animation-browser-report.json'), JSON.stringify(summary, null, 2));

  // Update feature report with browser PASS/FAIL
  try {
    const outDir = path.join(OUTPUT, '01-fade-click');
    if (fs.existsSync(path.join(outDir, 'presentation.json'))) {
      const presentation = JSON.parse(
        fs.readFileSync(path.join(outDir, 'presentation.json'), 'utf8')
      );
      let report = buildAnimationFeatureReport(presentation, outDir);
      report = mergeBrowserResults(report, summary);
      fs.writeFileSync(
        path.join(ROOT, 'animation-feature-report.json'),
        JSON.stringify(report, null, 2)
      );
    }
  } catch {
    /* optional */
  }

  console.log('\nWrote animation-browser-report.json');
  return summary;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
