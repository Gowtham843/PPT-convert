#!/usr/bin/env node
/** Browser-verify PowerPoint_Animation_Transition_Test.pptx output */

const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'output/PowerPoint_Animation_Transition_Test/index.html');

async function opacity(page, id) {
  return page.evaluate((oid) => {
    const el = document.querySelector('[data-sp-id="' + oid + '"]');
    if (!el) return -1;
    return parseFloat(getComputedStyle(el).opacity || '0');
  }, id);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file://' + HTML);
  await page.waitForFunction(() => window.__pptPresentation, null, { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelector('[data-sp-id="5"]') !== null,
    null,
    { timeout: 15000 }
  );
  await page.waitForTimeout(100);

  const report = {};

  // Slide 1: object 5 should start hidden then auto-fade in
  report.slide1 = {
    object5Initial: await opacity(page, '5'),
  };
  await page.waitForTimeout(650);
  report.slide1.object5AfterAuto = await opacity(page, '5');
  report.slide1.autoFadePass =
    report.slide1.object5Initial < 0.5 && report.slide1.object5AfterAuto > 0.9;

  // Slide 1 → 2: push transition
  await page.evaluate(() => window.__pptHideOverlay?.());
  await page.evaluate(() => window.__pptAdvance?.());
  await page.waitForTimeout(1200);
  report.slide2 = {
    slideIndex: await page.evaluate(() => window.__pptSlideIndex?.()),
    transitionPass: (await page.evaluate(() => window.__pptSlideIndex?.())) === 1,
  };

  await page.evaluate(() => window.__pptAdvance?.());
  await page.waitForTimeout(1200);
  report.slide3 = {
    slideIndex: await page.evaluate(() => window.__pptSlideIndex?.()),
    transitionPass: (await page.evaluate(() => window.__pptSlideIndex?.())) === 2,
  };

  await page.evaluate(() => window.__pptAdvance?.());
  await page.waitForTimeout(1200);
  report.slide4 = {
    slideIndex: await page.evaluate(() => window.__pptSlideIndex?.()),
    transitionPass: (await page.evaluate(() => window.__pptSlideIndex?.())) === 3,
  };

  report.summary = {
    slide1AutoFade: report.slide1.autoFadePass ? 'PASS' : 'FAIL',
    slide1ClickSequence: 'FAIL',
    slide2WithPrevious: 'FAIL',
    slide2AfterPrevious: 'FAIL',
    slide2MotionPath: 'FAIL',
    transitionsPushWipeFade: [
      report.slide2.transitionPass,
      report.slide3.transitionPass,
      report.slide4.transitionPass,
    ].every(Boolean)
      ? 'PASS'
      : 'PARTIAL',
    morph: 'NOT_PRESENT',
  };

  report.pptxOoxmlGaps = [
    'Slide 1: only 1 p:set opacity anim (object 5, onBegin) — no click sequence for objects 3,4,5',
    'Slide 2: NO p:timing block — withPrevious/afterPrevious/motion not in file',
    'Slide 3–4: transitions only, no object animations',
    'Slide 4: MorphBox shape but no p:morph transition',
  ];

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
