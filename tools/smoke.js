// Browser smoke test (Playwright). Usage: NODE_PATH=$(npm root -g) node tools/smoke.js <outdir>
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/shots';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.screenshot({ path: out + '/01-title.png' });
  await page.click('#nav [data-go=setup]');
  await page.screenshot({ path: out + '/02-setup.png' });
  await page.click('#suSpeed [data-v=fast]');
  await page.click('#suStart');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/03-game.png' });
  console.log('errors:', errors);
  await browser.close();
})();
