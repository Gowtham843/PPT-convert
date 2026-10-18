const { chromium } = require('playwright');
const URL = 'file:///Users/gowtham/Downloads/ppt-converter/output/morph-demo/06-morph/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.__pptPresentation && window.__pptPresentation.slides.length === 7);
  await page.evaluate(() => { window.__morphLog = []; });
  await page.evaluate(() => document.querySelectorAll('.sidebar-item')[1].onclick());
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(90);
    samples.push(await page.evaluate(() => {
      const g = document.querySelector('#frame svg g[aria-label="hero"]');
      return { attr: (g && (g.getAttribute('transform') || '').slice(0, 80)) || 'none' };
    }));
  }
  samples.forEach((s, i) => console.log('s' + i, s.attr));
  console.log('LOG', JSON.stringify(await page.evaluate(() => window.__morphLog).then ? null : ''));
  const log = await page.evaluate(() => window.__morphLog);
  console.log('FROMS:', JSON.stringify(log && log[0]));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });