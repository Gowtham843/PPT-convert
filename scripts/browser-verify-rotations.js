const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'file:///Users/gowtham/Downloads/ppt-converter/output/catalog-audit/ispring-effect-catalog/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(OUT);
  await page.waitForFunction(() => typeof window.__pptPresentation !== 'undefined', null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const picks = [21, 31, 33, 35, 36, 37, 38, 42];
  const rows = [];
  for (const idx of picks) {
    await page.evaluate((i) => {
      const items = [...document.querySelectorAll('.sidebar-item')];
      items[i] && items[i].click();
    }, idx - 1);
    await page.waitForTimeout(450);

    const meta = await page.evaluate(() => {
      const s = window.__pptPresentation.slides[window.__pptSlideIndex()];
      const b = (s.clickSteps && s.clickSteps[0]) || [];
      const entry = b.find((e) => e.presetClass) || b[0];
      return {
        target: entry?.targetObject || s.hiddenOnLoad?.[0] || null,
        effect: entry?.effect,
        duration: entry?.duration || 500,
      };
    });

    const sample = () => page.evaluate((tid) => {
      const el = document.querySelector('[data-sp-id="' + tid + '"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { o: cs.opacity, transform: cs.transform, box: cs.transformBox, origin: cs.transformOrigin };
    }, meta.target);

    const t0 = await sample();
    await page.evaluate(() => window.__pptAdvance());
    await page.waitForTimeout(120);
    const mid = await sample();
    await page.waitForTimeout(900);
    const end = await sample();

    const identity = !end.transform || end.transform === 'matrix(1, 0, 0, 1, 0, 0)';
    rows.push({ idx, name: 'slide' + idx, effect: meta.effect, t0: t0 && t0.transform || '(none)', mid: mid && mid.transform || '(none)', end: end && end.transform || '(none)', box: end && end.box, origin: end && end.origin, identity });
  }
  for (const r of rows) {
    console.log(`${r.effect.padEnd(14)} idx=${String(r.idx).padEnd(3)} ${r.box}/origin=${r.origin} moved=${!r.identity ? 'YES' : 'no'} | mid=${(r.mid || '').slice(0, 44)} | end=${(r.end || '').slice(0, 44)}`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });