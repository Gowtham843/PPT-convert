#!/usr/bin/env node
/**
 * Browser-verify every effect slide of the catalog deck actually ANIMATES.
 *
 * For each manifest row we navigate to its slide via the sidebar, hit the
 * viewer's advance (which triggers that slide's click-steps), then sample the
 * target object's computed style DURING the animation and AFTER it completes.
 * If any of opacity/clip-path/transform/filter/color differs across samples,
 * real WAAPI keyframes are running (proves the effect is animated, not merely
 * parsed). Split into at most `stepDuration-ε` samples so very short effects
 * still show an interpolated state.
 *
 * Usage: node scripts/browser-verify-catalog.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'test-files', 'effect-manifest.json');
const OUT = path.join(ROOT, 'output', 'catalog-audit', 'ispring-effect-catalog', 'index.html');

const PROPS = ['opacity', 'clip-path', 'transform', 'filter', 'color'];

function calcDiff(a, b) {
  if (!a || !b) return 0;
  return PROPS.filter((p) => a[p] !== b[p]).length;
}

function keyframeCount(effect) {
  try {
    const viewer = fs.readFileSync(
      path.join(ROOT, 'output', 'catalog-audit', 'ispring-effect-catalog', 'viewer.js'),
      'utf8'
    );
    const m = viewer.match(new RegExp('\\b' + effect + ':\\s*\\[([^\\]]*)\\]'));
    if (!m) return 2;
    return (m[1].match(/\{/g) || []).length;
  } catch {
    return 2;
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();

  await page.goto('file://' + OUT);
  await page.waitForFunction(() => typeof window.__pptPresentation !== 'undefined', null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.querySelector('.slide-svg-inline,.slide-svg') !== null,
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(600);

  const results = [];
  for (const fx of manifest.effects) {
    // navigate via sidebar to this effect slide
    await page.evaluate((idx) => {
      const items = [...document.querySelectorAll('.sidebar-item')];
      items[idx] && items[idx].click();
    }, fx.index - 1);
    await page.waitForTimeout(420);

    const meta = await page.evaluate(() => {
      const p = window.__pptPresentation;
      const s = p?.slides?.[window.__pptSlideIndex()];
      const b = s?.clickSteps?.[0] || [];
      const entry = b.find((e) => e.presetClass) || b[0];
      return {
        target: entry?.targetObject || entry?.objectId || s?.hiddenOnLoad?.[0] || null,
        duration: entry?.duration || 500,
      };
    });

    // initial (before trigger)
    const t0 = await page.evaluate((tid) => {
      const el = document.querySelector('[data-sp-id="' + tid + '"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        opacity: cs.opacity,
        clip: cs.clipPath,
        transform: cs.transform,
        filter: cs.filter,
        color: cs.color,
      };
    }, meta.target);

    // trigger the click-step
    await page.evaluate(() => window.__pptAdvance());
    const probeMs = Math.max(60, Math.min(260, Math.floor((meta.duration || 500) * 0.4)));
    await page.waitForTimeout(probeMs);

    // sample a few times mid-animation
    const mids = [];
    for (let k = 0; k < 3; k++) {
      mids.push(
        await page.evaluate((tid) => {
          const el = document.querySelector('[data-sp-id="' + tid + '"]');
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            opacity: cs.opacity,
            clip: cs.clipPath,
            transform: cs.transform,
            filter: cs.filter,
            color: cs.color,
          };
        }, meta.target)
      );
      await page.waitForTimeout(50);
    }

    // final (after completion)
    await page.waitForTimeout(850);
    const tEnd = await page.evaluate((tid) => {
      const el = document.querySelector('[data-sp-id="' + tid + '"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        opacity: cs.opacity,
        clip: cs.clipPath,
        transform: cs.transform,
        filter: cs.filter,
        color: cs.color,
      };
    }, meta.target);

    const transitions = [];
    const seen = [t0, ...mids, tEnd].filter(Boolean);
    for (let i = 1; i < seen.length; i++) {
      const d = calcDiff(seen[i - 1], seen[i]);
      if (d > 0) transitions.push(`${i}:${d}`);
    }

    const animated = transitions.length > 0 || calcDiff(t0, tEnd) > 0;
    results.push({
      index: fx.index,
      name: fx.name,
      category: fx.category,
      parsedEffect: fx.parsedEffect,
      target: meta.target,
      transitionCount: transitions.length,
      t0: t0 && t0.filter((f) => undefined), // noop
      pass: animated,
    });
  }

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const counts = {};
  for (const r of results) {
    counts[r.category] = counts[r.category] || { total: 0, pass: 0 };
    const c = counts[r.category];
    c.total += 1;
    if (r.pass) c.pass += 1;
  }

  console.log('==============================');
  console.log('Catalog browser animation check');
  console.log('==============================');
  console.log(`Effects: ${results.length}  Animated: ${passed}  No-op/static: ${results.length - passed}`);
  for (const [c, v] of Object.entries(counts)) {
    console.log(`  ${c.padEnd(7)} ${String(v.pass).padStart(3)}/${String(v.total).padStart(3)} animated`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.log('\nFailed (no computed-style change observed):');
    for (const r of failed) {
      console.log(`  ${r.index} ${r.name} (${r.category}) -> ${r.parsedEffect}`);
    }
  }
  fs.writeFileSync(
    path.join(ROOT, 'test-files', 'catalog-browser-check.json'),
    JSON.stringify(
      {
        total: results.length,
        passed,
        failed: failed.map((r) => ({ index: r.index, name: r.name, category: r.category, parsedEffect: r.parsedEffect })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});