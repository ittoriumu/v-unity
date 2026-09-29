// Illustration import + JSON export/import round trip.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#nav [data-go=editor]');
  await page.fill('#edName', '絵つきカード');
  // 64x64 PNG generated in-page to feed the file input
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 400, 300); g.addColorStop(0, '#f0f'); g.addColorStop(1, '#0ff'); x.fillStyle = g; x.fillRect(0, 0, 400, 300); x.fillStyle = '#fff'; x.beginPath(); x.arc(200, 150, 80, 0, 7); x.fill(); return c.toDataURL('image/png').split(',')[1]; });
  await page.click('#edArtBtn');
  await page.setInputFiles('#artFile', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('#artCrop:not(.hidden)');
  await page.fill('#artZoom', '1.5');
  await page.dispatchEvent('#artZoom', 'input');
  await page.click('#artOk');
  const art = await page.evaluate(() => JD.editor.draft.art);
  console.log('art imported:', !!art && art.startsWith('data:image/jpeg'), 'bytes', art && art.length);
  await page.click('#edSave');
  await page.waitForTimeout(200);
  await page.screenshot({ path: process.argv[2] + '/50-art.png' });
  // export -> import
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#edExport')]);
  const f = process.argv[2] + '/export.json'; await dl.saveAs(f);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('exported cards:', data.cards.length, 'has art:', !!data.cards[0].art);
  await page.evaluate(() => { localStorage.clear(); JD.loadCustom(); JD.editor.renderMyList(); });
  await page.setInputFiles('#edImpFile', f);
  await page.waitForTimeout(300);
  console.log('after import:', await page.evaluate(() => JD.customList().map((c) => c.name + ' art=' + !!c.art)));
  // malicious import is sanitised
  const evil = { cards: [{ type: 'spell', color: 'cyan', name: '<img src=x onerror=alert(1)>', art: 'javascript:alert(1)', scripts: [{ trigger: 'onCast', body: [{ t: 'draw', p: { n: 999 } }, { t: 'nope' }] }] }] };
  fs.writeFileSync(process.argv[2] + '/evil.json', JSON.stringify(evil));
  await page.setInputFiles('#edImpFile', process.argv[2] + '/evil.json');
  await page.waitForTimeout(300);
  console.log('sanitised:', await page.evaluate(() => { const c = JD.customList().find((x) => x.name.startsWith('<img')); return c && JSON.stringify({ art: c.art, n: c.scripts[0].body.map((b) => b.t + ':' + b.p.n) }); }));
  console.log('errors:', errors);
  await browser.close();
})();
