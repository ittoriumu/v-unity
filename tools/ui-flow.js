// UI flow test with a prepared board: targeted spell, attack menu, jewel play modal, end-of-turn setup.
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
  await page.evaluate(() => {
    JD.go('game', null, true);
    const L = [['mg01', 3], ['mg08', 3], ['yl01', 3], ['mg03', 3], ['mg11', 3], ['mg02', 3], ['yl02', 3], ['mg04', 3], ['mg05', 3], ['mg10', 3]];
    JD.gameUI.start({ myList: L, cpuList: L, level: 'easy', first: 'me', speed: 'fast' });
  });
  await page.waitForTimeout(500);
  const ok = (name, v) => console.log((v ? 'PASS ' : 'FAIL ') + name);
  await page.evaluate(() => {
    const G = JD.gameUI.G, C = JD.CARD_BY_ID;
    G.turnNo = 3;
    for (let i = 0; i < 3; i++) G.addJewel(0, 0, G.mkInst(C.mg01, 0));
    for (let i = 0; i < 3; i++) G.addJewel(0, 1, G.mkInst(C.mg01, 0));
    G.pl(0).lanes[1].jewels.forEach((j) => { j.zoneTurn = -2; });
    G.pl(1).lanes[3].lumina = G.mkInst(C.yl02, 1);
    G.pl(1).lanes[1].lumina = G.mkInst(C.yl01, 1); G.pl(1).lanes[1].lumina.up = false;
    G.pl(0).lanes[0].lumina = G.mkInst(C.mg01, 0);
    G.pl(0).lanes[3].lumina = G.mkInst(C.mg02, 0);
    G.pl(0).lanes[1].jewels.push(G.mkInst(C.mg08, 0)); G.pl(0).lanes[1].jewels[3].zoneTurn = -2;
    G.pl(0).hand.push(G.mkInst(C.mg08, 0));
    G.pl(0).lanes[0].lumina.up = false; // down: candidate for setup
    JD.gameUI.render(true);
  });
  // 1. targeted spell from hand
  const hc = await page.$$('#handRow .hcard');
  await hc[hc.length - 1].click();
  await page.click('#promptBar button:has-text("スペルを使う")');
  await page.waitForTimeout(300);
  ok('target prompt shown', (await page.innerText('#promptBar')).includes('相手のルミナ'));
  await page.click('[data-slot="1:3"]');
  await page.waitForTimeout(600);
  const dmg = await page.evaluate(() => JD.gameUI.G.pl(1).lanes[3].lumina.damage);
  ok('spell dealt 2 damage to chosen lumina (dmg=' + dmg + ')', dmg === 2);
  // 2. attack menu: lane 3 has my mg02 vs enemy yl02 (up) -> lumina attack only
  await page.click('[data-slot="0:3"]');
  ok('attack menu (lumina only)', (await page.innerText('#promptBar')).includes('ルミナアタック') && !(await page.innerText('#promptBar')).includes('ダイレクト'));
  await page.click('#promptBar button:has-text("ルミナアタック")');
  await page.waitForTimeout(1200);
  const d2 = await page.evaluate(() => JD.gameUI.G.pl(1).lanes[3].lumina ? JD.gameUI.G.pl(1).lanes[3].lumina.damage : 'destroyed');
  ok('lumina attack applied (result=' + d2 + ')', d2 === 'destroyed' || d2 >= 4);
  // 3. jewel play via modal (lane 1 holds a spell)
  await page.click('[data-jarea="0:1"]');
  await page.waitForTimeout(200);
  const btn = await page.$('#modalBody .pk-go');
  ok('jewel modal offers ジュエルプレイ', !!btn);
  if (btn) { await btn.click(); await page.waitForTimeout(300); await page.click('[data-slot="1:1"]'); await page.waitForTimeout(600); }
  console.log(await page.evaluate(() => JSON.stringify({ busy: JD.gameUI.busy, pend: !!JD.gameUI.pending, jp: JD.gameUI.G.t.jplayLeft, log: JD.gameUI.G.logs.slice(-6), jw: JD.gameUI.G.pl(0).lanes[1].jewels.map((j) => j.def.id) })));
  ok('jewel-played spell resolved', await page.evaluate(() => JD.gameUI.G.pl(0).lanes[1].jewels.every((j) => j.def.id !== 'mg08')));
  // 4. end turn with a down lumina -> setup prompt
  await page.click('[data-act=end]');
  const t = await page.innerText('#promptBar');
  ok('end-of-turn setup prompt', t.includes('セットアップ'));
  await page.click('#promptBar button:has-text("セットアップして終了")');
  await page.waitForTimeout(200);
  ok('setup mode preselects down lumina', (await page.$$('.slot.picked')).length >= 1);
  await page.click('#promptBar button:has-text("決定")');
  await page.waitForTimeout(3500);
  const st = await page.evaluate(() => ({ up: JD.gameUI.G.pl(0).lanes[0].lumina && JD.gameUI.G.pl(0).lanes[0].lumina.up, tp: JD.gameUI.G.turnPlayer }));
  ok('setup applied & turn passed (' + JSON.stringify(st) + ')', st.up === true);
  await page.screenshot({ path: out + '/30-flow.png' });
  console.log('errors:', errors);
  await browser.close();
})();
