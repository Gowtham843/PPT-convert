const { chromium } = require('playwright');

const URL = 'file:///Users/gowtham/Downloads/ppt-converter/output/morph-demo/06-morph/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__pptPresentation && window.__pptPresentation.slides.length === 7);

  async function nav(idx) {
    await page.evaluate((i) => document.querySelectorAll('.sidebar-item')[i].onclick(), idx);
    await page.waitForFunction(() => document.querySelector('#frame svg') !== null);
    await page.waitForFunction((o) => window.__pptSlideIndex() === o.i, { i: idx });
  }

  async function sample(attr, path) {
    return page.evaluate((o) => {
      const g = document.querySelector('#frame svg').querySelector(o.sel);
      const el = g && (g.querySelector('rect') || g.querySelector('ellipse'));
      return { attr: (g && (g.getAttribute(o.a || 'transform') || '').slice(0, 90)) || 'none', fill: el && el.getAttribute('fill'), tag: el && el.tagName };
    }, { sel: attr, a: path });
  }

  const shots = [];

  // slide 2 -> 3: hero rotates 90°
  await nav(2);
  await page.waitForTimeout(100);
  shots.push(['s2->3 start', await sample('g[aria-label="hero"]')]);
  await page.waitForTimeout(260);
  shots.push(['s2->3 mid', await sample('g[aria-label="hero"]')]);
  await page.waitForTimeout(500);
  shots.push(['s2->3 end', await sample('g[aria-label="hero"]')]);

  // slide 3 -> 4: hero color change
  await nav(3);
  await page.waitForTimeout(100);
  shots.push(['s3->4 start', await sample('g[aria-label="hero"]')]);
  await page.waitForTimeout(300);
  shots.push(['s3->4 mid', await sample('g[aria-label="hero"]')]);
  await page.waitForTimeout(500);
  shots.push(['s3->4 end', await sample('g[aria-label="hero"]')]);

  // slide 5 -> 6: circle rect -> ellipse
  await nav(4);
  await page.waitForTimeout(150);
  await nav(5);
  await page.waitForTimeout(100);
  shots.push(['s5->6 start', await sample('g[aria-label="circle"]')]);
  await page.waitForTimeout(300);
  shots.push(['s5->6 mid', await sample('g[aria-label="circle"]')]);
  await page.waitForTimeout(500);
  shots.push(['s5->6 end', await sample('g[aria-label="circle"]')]);

  for (const [label, v] of shots) console.log(label, JSON.stringify(v));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });