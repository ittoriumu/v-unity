// Scripted human playtest through the real UI.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/shots';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#nav [data-go=setup]');
  await page.click('#suSpeed [data-v=fast]');
  await page.click('#suFirst [data-v=me]');
  await page.click('#suStart');
  await page.waitForTimeout(600);
  const hand = () => page.$$('#handRow .hcard');
  // T1: flow 2 cards into lane 1, then play whatever is playable
  for (let i = 0; i < 2; i++) { const h = await hand(); await h[h.length - 1].click(); await page.click('[data-jarea="0:0"]'); await page.waitForTimeout(150); }
  await page.screenshot({ path: out + '/10-after-flow.png' });
  let h = await hand();
  for (const c of h) { await c.click(); const ok = await page.$('.slot.playok'); if (ok) { await ok.click(); await page.waitForTimeout(700); break; } await c.click(); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/11-after-play.png' });
  await page.click('[data-act=end]');
  await page.waitForTimeout(400);
  const pr = await page.$('#promptBar:not(.hidden)');
  if (pr) { console.log('prompt:', await pr.innerText()); }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + '/12-cpu-turn.png' });
  console.log('log tail:', (await page.$$eval('#log div', (d) => d.slice(-12).map((x) => x.textContent))).join(' | '));
  console.log('errors:', errors);
  await browser.close();
})();
