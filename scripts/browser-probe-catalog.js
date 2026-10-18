const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'file:///Users/gowtham/Downloads/ppt-converter/output/catalog-audit/ispring-effect-catalog/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(OUT);
  await page.waitForFunction(() => typeof window.__pptPresentation !== 'undefined', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('slides:', await page.evaluate(() => window.__pptPresentation.slides.length));

  const manifest = JSON.parse(fs.readFileSync('/Users/gowtham/Downloads/ppt-converter/test-files/effect-manifest.json', 'utf8'));
  const picks = manifest.effects.filter((e) => e.category === 'entr').slice(0, 5)
    .concat(manifest.effects.filter((e) => e.category === 'emph').slice(0, 3))
    .concat(manifest.effects.filter((e) => e.category === 'exit').slice(0, 2))
    .concat(manifest.effects.filter((e) => e.category === 'motion').slice(0, 2));

  const result = [];
  for (const fx of picks) {
    await page.evaluate((idx) => {
      const items = [...document.querySelectorAll('.sidebar-item')];
      items[idx] && items[idx].click();
    }, fx.index - 1);
    await page.waitForTimeout(500);

    const meta = await page.evaluate(() => {
      const p = window.__pptPresentation;
      const s = p.slides[window.__pptSlideIndex()];
      const b = (s.clickSteps && s.clickSteps[0]) || [];
      const entry = b.find((e) => e.presetClass) || b[0];
      return { target: entry?.targetObject || s.hiddenOnLoad?.[0] || null, duration: entry?.duration || 500, clicks: s.clickSteps ? s.clickSteps.length : 0 };
    });

    const style = () => page.evaluate((tid) => {
      const el = document.querySelector('[data-sp-id="' + tid + '"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { opacity: cs.opacity, clip: cs.clipPath, transform: cs.transform, filter: cs.filter, color: cs.color };
    }, meta.target);

    const a = await style();
    await page.evaluate(() => window.__pptAdvance());
    await page.waitForTimeout(120);
    const b = await style();
    await page.waitForTimeout(700);
    const c = await style();
    const counts = [a, b, c].filter(Boolean).map((s) => JSON.stringify(s));
    const changed = counts.length > 1 && counts[0] !== counts[counts.length - 1];
    result.push({ idx: fx.index, name: fx.name, cat: fx.category, effect: fx.parsedEffect, clicks: meta.clicks, target: meta.target, animated: changed, from: a && { o: a.opacity, clip: a.clip && a.clip.slice(0, 40) }, mid: b && { o: b.opacity, clip: b.clip && b.clip.slice(0, 40) }, end: c && { o: c.opacity, clip: c.clip && c.clip.slice(0, 40) } });
  }
  for (const r of result) console.log(r.animated ? 'PASS' : 'FAIL', r.idx, r.name, JSON.stringify({ o: r.from.o + '->' + r.mid.o + '->' + r.end.o, clip: (r.from.clip || 'none') + ' -> ' + (r.end.clip || 'none'), clicks: r.clicks }));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });