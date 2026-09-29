// UI test: card editor (drag & drop blocks, auto/manual cost), deck builder.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/shots';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#nav [data-go=editor]');
  await page.fill('#edName', 'テスト・ドラゴン');
  await page.click('#edColor [data-v=magenta]');
  await page.fill('#edRace', 'ドラゴン');
  await page.fill('#edP', '2'); await page.fill('#edT', '2');
  // drag palette block into the script (real pointer drag)
  await page.click('#edTabs [data-v=magenta]');
  const pal = await page.$('#edPalette .pal:has-text("ダメージを与える")');
  const dz = await page.$('#edScripts .dslot');
  const pb = await pal.boundingBox(), db = await dz.boundingBox();
  await page.mouse.move(pb.x + 20, pb.y + 10); await page.mouse.down();
  await page.mouse.move(pb.x + 60, pb.y + 40, { steps: 5 });
  await page.mouse.move(db.x + 40, db.y + db.height / 2, { steps: 10 });
  await page.mouse.up();
  console.log('blocks after drag:', await page.$$eval('#edScripts .blk-row', (r) => r.length));
  // click-add a control block and put a block inside via click (append to active) then drag into kids
  await page.click('#edTabs [data-v=ctrl]');
  await page.click('#edPalette .pal:has-text("もし")');
  await page.click('#edTabs [data-v=cyan]');
  await page.click('#edPalette .pal:has-text("カードを")');
  console.log('blocks now:', await page.$$eval('#edScripts .blk-row', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 60))));
  // drag the draw block into the "if" kids
  const draw = await page.$('#edScripts > .script > .stack > .blk:has-text("カードを")');
  const kidSlot = await page.$('#edScripts .kids .dslot');
  if (draw && kidSlot) {
    const g = await (await draw.$('.blk-row')).boundingBox(), k = await kidSlot.boundingBox();
    await page.mouse.move(g.x + 8, g.y + 8); await page.mouse.down(); await page.mouse.move(g.x + 30, g.y - 20, { steps: 4 }); await page.mouse.move(k.x + 30, k.y + k.height / 2, { steps: 10 }); await page.mouse.up();
  }
  console.log('kids blocks:', await page.$$eval('#edScripts .kids .blk-row', (r) => r.length));
  await page.screenshot({ path: out + '/20-editor-auto.png' });
  console.log('auto LV:', await page.$eval('#edLv', (e) => e.value), 'disabled:', await page.$eval('#edLv', (e) => e.disabled));
  await page.click('#edMode [data-v=manual]');
  await page.fill('#edLv', '1');
  await page.screenshot({ path: out + '/21-editor-manual.png' });
  console.log('verdict:', await page.$eval('#edEval .verdict', (e) => e.innerText));
  await page.click('#edMode [data-v=auto]');
  await page.click('#edSave');
  await page.waitForTimeout(300);
  console.log('saved cards:', await page.evaluate(() => JD.customList().map((c) => c.name + ' LV' + c.lv + ' ' + JD.costTag(c))));
  // deck builder
  await page.click('#nav [data-go=cards]');
  await page.waitForTimeout(300);
  await page.click('#dbCustom');
  const first = await page.$('#dbGrid .pt'); await first.click();
  console.log('deck count text:', await page.$eval('#dkCount', (e) => e.innerText));
  await page.click('#dbCustom');
  await page.screenshot({ path: out + '/22-deck.png' });
  console.log('errors:', errors);
  await browser.close();
})();
