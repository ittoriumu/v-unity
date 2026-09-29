/* Jewels×Duel core: constants, effect-block registry, text generation, cost estimator.
   DOM-free so it can also run under Node for balance simulation. */
(function (root) {
  'use strict';
  const JD = (root.JD = root.JD || {});

  JD.LANES = 5;
  JD.SHOWCASE = 2;
  JD.DECK_SIZE = 30;
  JD.MAX_COPIES = 3;
  JD.TRASH_LOSE = 10;
  JD.START_HAND = 5;
  JD.MAX_LV = 8;
  JD.MAX_SHOWCASE = 3;

  JD.COLORS = ['cyan', 'magenta', 'yellow', 'green', 'black', 'white'];
  JD.CI = {
    cyan: { n: 'シアン', k: 'C', hex: '#22c7e6', kw: '山札・手札' },
    magenta: { n: 'マゼンタ', k: 'M', hex: '#ea3f9d', kw: '場・アタック・ダメージ' },
    yellow: { n: 'イエロー', k: 'Y', hex: '#f0bf2a', kw: 'パワー・タフネス・バフ' },
    green: { n: 'グリーン', k: 'G', hex: '#43c266', kw: 'ジュエルゾーン' },
    black: { n: 'ブラック', k: 'B', hex: '#7a6a9a', kw: 'トラッシュ・ライフ' },
    white: { n: 'ホワイト', k: 'W', hex: '#eceef5', kw: '染色・移動' },
  };
  JD.TYPE_NAME = { lumina: 'ルミナ', spell: 'スペル', stage: 'ステージ' };

  JD.rand = Math.random;
  JD.shuffle = (a, rnd) => {
    rnd = rnd || JD.rand;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  JD.clone = (o) => JSON.parse(JSON.stringify(o));
  JD.uid = (() => { let n = 0; return () => ++n; })();
  JD.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------------ *
   * Conditions (used by "if" block and conditional static buffs)        *
   * ------------------------------------------------------------------ */
  const CONDS = (JD.CONDS = {
    showcase: { name: 'このルミナがショーケースにいる', uses: [], pf: () => 0.55, fmt: () => 'このルミナがショーケースにいる', f: (c) => !!(c.lumina && c.G.inShowcase(c.lumina)) },
    handGE: { name: '自分の手札が', uses: ['n'], unit: '枚以上', pf: (p) => clamp(1.0 - 0.1 * p.n, 0.35, 0.9), fmt: (p) => `自分の手札が${p.n}枚以上`, f: (c, p) => c.G.pl(c.pi).hand.length >= p.n },
    trashGE: { name: '自分のトラッシュが', uses: ['n'], unit: '枚以上', pf: (p) => clamp(1.0 - 0.08 * p.n, 0.3, 0.9), fmt: (p) => `自分のトラッシュが${p.n}枚以上`, f: (c, p) => c.G.pl(c.pi).trash.length >= p.n },
    oppTrashGE: { name: '相手のトラッシュが', uses: ['n'], unit: '枚以上', pf: (p) => clamp(1.0 - 0.07 * p.n, 0.3, 0.9), fmt: (p) => `相手のトラッシュが${p.n}枚以上`, f: (c, p) => c.G.pl(1 - c.pi).trash.length >= p.n },
    lumGE: { name: '自分の場のルミナが', uses: ['n'], unit: '体以上', pf: (p) => clamp(1.0 - 0.15 * p.n, 0.3, 0.9), fmt: (p) => `自分の場のルミナが${p.n}体以上`, f: (c, p) => c.G.luminas(c.pi).length >= p.n },
    oppLumGE: { name: '相手の場のルミナが', uses: ['n'], unit: '体以上', pf: (p) => clamp(1.0 - 0.12 * p.n, 0.3, 0.9), fmt: (p) => `相手の場のルミナが${p.n}体以上`, f: (c, p) => c.G.luminas(1 - c.pi).length >= p.n },
    race: { name: '自分の場の種族「', uses: ['race', 'n'], unit: '体以上', pf: (p) => clamp(1.0 - 0.2 * p.n, 0.3, 0.9), fmt: (p) => `自分の場に種族「${p.race || '?'}」のルミナが${p.n}体以上`, f: (c, p) => c.G.luminas(c.pi).filter((x) => x.def.race === p.race).length >= p.n },
    jewelColor: { name: '自分のジュエルエリア全体に', uses: ['color', 'n'], unit: '枚以上', pf: (p) => clamp(1.0 - 0.1 * p.n, 0.35, 0.9), fmt: (p) => `自分のジュエルエリア全体に${JD.CI[p.color].n}のジュエルが${p.n}枚以上`, f: (c, p) => c.G.jewelColorCount(c.pi, p.color) >= p.n },
    oppDown: { name: '相手にダウンしているルミナがいる', uses: [], pf: () => 0.7, fmt: () => '相手の場にダウンしているルミナがいる', f: (c) => c.G.luminas(1 - c.pi).some((x) => !x.up) },
  });

  /* ------------------------------------------------------------------ *
   * Block registry                                                     *
   * ------------------------------------------------------------------ */
  const TG = { self: 'このルミナ', ally: '自分のルミナ1体', allyAll: '自分のルミナ全て', enemy: '相手のルミナ1体', enemyRand: 'ランダムな相手のルミナ1体', enemyAll: '相手のルミナ全て' };
  const tsel = (keys, def) => ({ k: 'target', t: 'sel', opts: keys.map((k) => [k, TG[k]]), def: def || keys[0] });
  const num = (k, min, max, def, unit) => ({ k, t: 'num', min, max, def, unit });
  const DUR = { k: 'dur', t: 'sel', opts: [['perm', '永続的に'], ['turn', 'このターンの間']], def: 'perm' };
  const condParams = () => [
    { k: 'cond', t: 'sel', opts: Object.keys(CONDS).map((k) => [k, CONDS[k].name]), def: 'showcase', wide: true },
    { k: 'race', t: 'text', def: '', post: '」のルミナが', showIf: (p) => CONDS[p.cond].uses.includes('race') },
    { k: 'color', t: 'color', def: 'cyan', post: 'のジュエルが', showIf: (p) => CONDS[p.cond].uses.includes('color') },
    { k: 'n', t: 'num', min: 1, max: 10, def: 2, showIf: (p) => CONDS[p.cond].uses.includes('n'), unit: (p) => CONDS[p.cond].unit },
  ];
  // target value multiplier
  const tm = (m, all) => ({ self: 0.85, ally: 1, allyAll: all, enemy: 1, enemyRand: 0.78, enemyAll: all }[m] || 1);

  const BLOCKS = (JD.BLOCKS = {});
  const def = (id, o) => { o.id = id; o.params = o.params || []; o.kind = o.kind || 'stack'; BLOCKS[id] = o; };
  const ALL = ['lumina', 'stage', 'spell'];
  const LS = ['lumina', 'stage'];

  async function resolveT(mode, ctx, purpose, amount) {
    const G = ctx.G, me = ctx.pi, op = 1 - me;
    if (mode === 'self') return ctx.lumina && G.locate(ctx.lumina) ? [ctx.lumina] : [];
    if (mode === 'allyAll') return G.luminas(me);
    if (mode === 'enemyAll') return G.luminas(op);
    if (mode === 'enemyRand') { const c = G.luminas(op); return c.length ? [c[Math.floor(G.rnd() * c.length)]] : []; }
    const cands = G.luminas(mode === 'ally' ? me : op);
    if (!cands.length) return [];
    const pick = await G.choose(me, { kind: 'lumina', cands, purpose: purpose || (mode === 'ally' ? 'help' : 'harm'), amount, prompt: mode === 'ally' ? '対象の自分のルミナを選んでください' : '対象の相手のルミナを選んでください' });
    return pick ? [pick] : [];
  }
  const hasE = (G, pi) => G.luminas(1 - pi).length > 0;
  const hasA = (G, pi) => G.luminas(pi).length > 0;
  const laneChoose = (G, pi, where, side, purpose, cands) => G.choose(pi, { kind: 'lane', where, side, cands, purpose, prompt: where === 'jewel' ? 'ジュエルエリアを選んでください' : 'レーンを選んでください' });

  /* ---- Cyan : deck / hand ---- */
  def('draw', { cat: 'cyan', types: ALL, tpl: '自分はカードを{n}枚引く', params: [num('n', 1, 4, 1, '枚')], val: (p) => 1.0 * p.n, useful: (p, G, pi) => G.pl(pi).deck.length > p.n + 3, run: async (p, c) => { await c.G.draw(c.pi, p.n); } });
  def('loot', { cat: 'cyan', types: ALL, tpl: '自分は手札を{n}枚捨て、カードを{m}枚引く', params: [num('n', 1, 3, 1, '枚捨て'), num('m', 1, 4, 2, '枚引く')], val: (p) => Math.max(0.3, 1.0 * p.m - 0.5 * p.n), useful: (p, G, pi) => G.pl(pi).hand.length >= p.n && G.pl(pi).deck.length > p.m + 3, run: async (p, c) => {
    const G = c.G;
    for (let i = 0; i < p.n; i++) {
      const h = G.pl(c.pi).hand; if (!h.length) break;
      const x = await G.choose(c.pi, { kind: 'card', cands: h, purpose: 'discard', prompt: '捨てる手札を選んでください' });
      if (x) { G.removeFromZone(x); G.sendToTrash(x); G.log(`${G.pl(c.pi).name}は手札を1枚捨てた`); }
    }
    await G.draw(c.pi, p.m);
  } });
  def('dig', { cat: 'cyan', types: ALL, tpl: '自分の山札の上から{n}枚を見て、1枚を手札に加え、残りを山札の下に置く', params: [num('n', 2, 6, 3, '枚')], val: (p) => 0.5 + 0.25 * p.n, useful: (p, G, pi) => G.pl(pi).deck.length > p.n + 3, run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi);
    const top = P.deck.splice(0, Math.min(p.n, P.deck.length));
    if (!top.length) return;
    const x = await G.choose(c.pi, { kind: 'card', cands: top, purpose: 'take', prompt: '手札に加えるカードを選んでください' });
    for (const t of top) { if (t === x) P.hand.push(t); else P.deck.push(t); }
    G.log(`${P.name}は山札の上${top.length}枚から1枚を手札に加えた`);
  } });
  def('mill', { cat: 'cyan', types: ALL, tpl: '相手の山札の上から{n}枚をトラッシュする', params: [num('n', 1, 5, 1, '枚')], val: (p) => 3.2 * p.n, useful: (p, G, pi) => G.pl(1 - pi).deck.length > 0, run: async (p, c) => { c.G.log(`${c.G.pl(1 - c.pi).name}の山札が削られた`); c.G.mill(1 - c.pi, p.n); } });
  def('discard', { cat: 'cyan', types: ALL, tpl: '相手は手札をランダムに{n}枚捨てる', params: [num('n', 1, 3, 1, '枚')], val: (p) => 1.0 * p.n, useful: (p, G, pi) => G.pl(1 - pi).hand.length > 0, run: async (p, c) => {
    const G = c.G, O = G.pl(1 - c.pi);
    for (let i = 0; i < p.n && O.hand.length; i++) {
      const x = O.hand.splice(Math.floor(G.rnd() * O.hand.length), 1)[0];
      G.sendToTrash(x); G.log(`${O.name}は手札を1枚捨てさせられた`);
    }
  } });
  def('bounce', { cat: 'cyan', types: ALL, tpl: '{target}を持ち主の手札に戻す', params: [tsel(['enemy', 'enemyRand'])], val: (p) => 3.2 * tm(p.target, 2), useful: (p, G, pi) => hasE(G, pi), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'harm')) c.G.bounce(x);
  } });

  /* ---- Magenta : field / attack / damage ---- */
  def('pdamage', { cat: 'magenta', types: ALL, tpl: '相手プレイヤーに{n}ダメージを与える（山札の上から{n}枚トラッシュ）', params: [num('n', 1, 5, 1, 'ダメージ')], val: (p) => 3.2 * p.n, useful: (p, G, pi) => G.pl(1 - pi).deck.length > 0, run: async (p, c) => { c.G.playerDamage(1 - c.pi, p.n, c); } });
  def('damage', { cat: 'magenta', types: ALL, tpl: '{target}に{n}ダメージを与える', params: [tsel(['enemy', 'enemyRand', 'enemyAll']), num('n', 1, 5, 1, 'ダメージ')], val: (p) => 1.9 * p.n * tm(p.target, 2.2), useful: (p, G, pi) => hasE(G, pi), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'harm', p.n)) c.G.damageLumina(x, p.n, c);
  } });
  def('downE', { cat: 'magenta', types: ALL, tpl: '{target}をダウンさせる', params: [tsel(['enemy', 'enemyRand', 'enemyAll'])], val: (p) => 2.2 * tm(p.target, 2.0), useful: (p, G, pi) => G.luminas(1 - pi).some((x) => x.up), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'harm')) { x.up = false; c.G.log(`「${x.def.name}」はダウンした`); }
  } });
  def('upSelf', { cat: 'magenta', types: ALL, tpl: '{target}をアップする', params: [tsel(['self', 'ally', 'allyAll'])], val: (p) => 2.6 * tm(p.target, 2.0), useful: (p, G, pi) => G.luminas(pi).some((x) => !x.up), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'up')) { x.up = true; }
  } });
  def('haste', { cat: 'magenta', types: LS, tpl: '{target}のステージフリーズを解除する（このターンからアタック可能）', params: [tsel(['self', 'ally', 'allyAll'])], val: (p) => 1.6 * tm(p.target, 2.0), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'help')) x.enterTurn = -1;
  } });
  def('scAdd', { cat: 'magenta', types: ALL, tpl: '自分のレーン1つを、新たなショーケースにする', val: () => 4.6, useful: (p, G, pi) => G.pl(pi).lanes.filter((l) => l.showcase).length < JD.MAX_SHOWCASE, run: async (p, c) => {
    const G = c.G, cands = [0, 1, 2, 3, 4].filter((i) => !G.pl(c.pi).lanes[i].showcase);
    if (!cands.length || G.pl(c.pi).lanes.filter((l) => l.showcase).length >= JD.MAX_SHOWCASE) return;
    const l = await laneChoose(G, c.pi, 'field', c.pi, 'showcaseAdd', cands);
    if (l != null) G.addShowcase(c.pi, l);
  } });

  /* ---- Yellow : power / toughness / buff ---- */
  def('buff', { cat: 'yellow', types: LS, tpl: '{target}に{dur}「パワー+{p}、タフネス+{t}」を与える', params: [tsel(['self', 'ally', 'allyAll']), num('p', 0, 4, 1), num('t', 0, 4, 1), DUR], val: (p) => (4.2 * p.p + 2.1 * p.t) * (p.dur === 'turn' ? 0.4 : 1) * tm(p.target, 2.0), useful: (p, G, pi) => hasA(G, pi), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'help')) {
      if (p.dur === 'turn') { x.tP += p.p; x.tT += p.t; } else { x.pP += p.p; x.pT += p.t; }
    }
  } });
  def('debuff', { cat: 'yellow', types: ALL, tpl: '{target}に{dur}「パワー-{p}、タフネス-{t}」を与える', params: [tsel(['enemy', 'enemyRand', 'enemyAll']), num('p', 0, 4, 1), num('t', 0, 4, 0), DUR], val: (p) => (3.6 * p.p + 1.8 * p.t) * (p.dur === 'turn' ? 0.4 : 1) * tm(p.target, 2.2), useful: (p, G, pi) => hasE(G, pi), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'harm', p.t)) {
      if (p.dur === 'turn') { x.tP -= p.p; x.tT -= p.t; } else { x.pP -= p.p; x.pT -= p.t; }
    }
  } });
  def('heal', { cat: 'yellow', types: ALL, tpl: '{target}のダメージを{n}回復する', params: [tsel(['self', 'ally', 'allyAll']), num('n', 1, 5, 2, '回復')], val: (p) => 0.9 * p.n * tm(p.target, 2.0), useful: (p, G, pi) => G.luminas(pi).some((x) => x.damage > 0), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'heal')) x.damage = Math.max(0, x.damage - p.n);
  } });

  /* ---- Green : jewel zone ---- */
  def('extraFlow', { cat: 'green', types: ALL, tpl: 'このターン、ジュエルフローを{n}回追加で行える', params: [num('n', 1, 3, 1, '回')], val: (p) => 0.7 * p.n, useful: (p, G, pi) => G.turnPlayer === pi && G.pl(pi).hand.length > 0, run: async (p, c) => { if (c.G.turnPlayer === c.pi) c.G.t.flowLeft += p.n; } });
  def('jewelTop', { cat: 'green', types: ALL, tpl: '自分の山札の上から{n}枚を、自分のジュエルエリアに置く', params: [num('n', 1, 3, 1, '枚')], val: (p) => 0.9 * p.n, useful: (p, G, pi) => G.pl(pi).deck.length > p.n + 5, run: async (p, c) => {
    const G = c.G;
    for (let i = 0; i < p.n; i++) {
      const P = G.pl(c.pi);
      if (!P.deck.length) { G.lose(c.pi, '山札切れ'); return; }
      const l = await laneChoose(G, c.pi, 'jewel', c.pi, 'jewelPut', [0, 1, 2, 3, 4]);
      G.addJewel(c.pi, l == null ? 0 : l, P.deck.shift());
    }
  } });
  def('jewelBreak', { cat: 'green', types: ALL, tpl: '相手のジュエルエリア1つの上から{n}枚をトラッシュする', params: [num('n', 1, 3, 1, '枚')], val: (p) => 2.4 * p.n, useful: (p, G, pi) => G.pl(1 - pi).lanes.some((l) => l.jewels.length > 0), run: async (p, c) => {
    const G = c.G, O = G.pl(1 - c.pi), cands = [0, 1, 2, 3, 4].filter((i) => O.lanes[i].jewels.length);
    if (!cands.length) return;
    const l = await laneChoose(G, c.pi, 'jewel', 1 - c.pi, 'jewelBreak', cands);
    if (l == null) return;
    for (let i = 0; i < p.n && O.lanes[l].jewels.length; i++) { const x = O.lanes[l].jewels.pop(); G.sendToTrash(x); }
    G.log(`${O.name}のジュエルエリアが崩された`);
  } });
  def('jewelBack', { cat: 'green', types: ALL, tpl: '自分のジュエルエリア1つの一番上のカードを手札に戻す', val: () => 0.6, useful: (p, G, pi) => G.pl(pi).lanes.some((l) => l.jewels.length > 1), run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi), cands = [0, 1, 2, 3, 4].filter((i) => P.lanes[i].jewels.length);
    if (!cands.length) return;
    const l = await laneChoose(G, c.pi, 'jewel', c.pi, 'jewelBack', cands);
    if (l == null) return;
    const x = P.lanes[l].jewels.pop(); G.resetInst(x); P.hand.push(x);
  } });

  /* ---- Black : trash / life ---- */
  def('recover', { cat: 'black', types: ALL, tpl: '自分のトラッシュからカードをランダムに{n}枚手札に加える', params: [num('n', 1, 3, 1, '枚')], val: (p) => 1.6 * p.n, useful: (p, G, pi) => G.pl(pi).trash.length > 0, run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi);
    for (let i = 0; i < p.n && P.trash.length; i++) { const x = P.trash.splice(Math.floor(G.rnd() * P.trash.length), 1)[0]; G.resetInst(x); P.hand.push(x); }
    G.log(`${P.name}はトラッシュからカードを回収した`);
  } });
  def('revive', { cat: 'black', types: ALL, tpl: '自分のトラッシュのルミナ1枚を選び、手札に加える', val: () => 2.0, useful: (p, G, pi) => G.pl(pi).trash.some((x) => x.def.type === 'lumina'), run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi), cands = P.trash.filter((x) => x.def.type === 'lumina');
    if (!cands.length) return;
    const x = await G.choose(c.pi, { kind: 'card', cands, purpose: 'take', prompt: '手札に加えるルミナを選んでください' });
    if (x) { P.trash.splice(P.trash.indexOf(x), 1); G.resetInst(x); P.hand.push(x); G.log(`${P.name}は「${x.def.name}」を回収した`); }
  } });
  def('lifeGain', { cat: 'black', types: ALL, tpl: '自分のトラッシュの上から{n}枚を、山札の上に戻す', params: [num('n', 1, 4, 2, '枚')], val: (p) => 2.0 * p.n, useful: (p, G, pi) => G.pl(pi).trash.length >= 2, run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi);
    for (let i = 0; i < p.n && P.trash.length; i++) { const x = P.trash.pop(); G.resetInst(x); P.deck.unshift(x); }
    G.log(`${P.name}のライフが回復した`);
  } });
  def('selfMill', { cat: 'black', types: ALL, tpl: '自分の山札の上から{n}枚をトラッシュする', params: [num('n', 1, 4, 1, '枚')], val: (p) => -0.8 * p.n, useful: (p, G, pi) => G.pl(pi).trash.length + p.n < 7 && G.pl(pi).deck.length > p.n + 6, run: async (p, c) => { c.G.mill(c.pi, p.n); } });
  def('sac', { cat: 'black', types: ALL, tpl: '自分のルミナ1体を選んで破壊する', val: () => -3.0, useful: (p, G, pi) => G.luminas(pi).length > 1, run: async (p, c) => {
    const cands = c.G.luminas(c.pi); if (!cands.length) return;
    const x = await c.G.choose(c.pi, { kind: 'lumina', cands, purpose: 'sac', prompt: '破壊する自分のルミナを選んでください' });
    if (x) await c.G.destroy(x);
  } });
  def('destroy', { cat: 'black', types: ALL, tpl: '{target}を破壊する', params: [tsel(['enemy', 'enemyRand', 'enemyAll'])], val: (p) => 7.0 * ({ enemy: 1, enemyRand: 0.68, enemyAll: 2.1 }[p.target]), useful: (p, G, pi) => hasE(G, pi), run: async (p, c) => {
    for (const x of await resolveT(p.target, c, 'harm', 99)) await c.G.destroy(x);
  } });

  /* ---- White : dye / move ---- */
  def('dye', { cat: 'white', types: ALL, tpl: '自分のジュエルエリア1つの一番上のカードを、色{color}に染色する', params: [{ k: 'color', t: 'color', def: 'cyan' }], val: () => 1.0, useful: (p, G, pi) => G.pl(pi).lanes.some((l) => l.jewels.length), run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi), cands = [0, 1, 2, 3, 4].filter((i) => P.lanes[i].jewels.length);
    if (!cands.length) return;
    const l = await laneChoose(G, c.pi, 'jewel', c.pi, 'dye', cands);
    if (l == null) return;
    const x = P.lanes[l].jewels[P.lanes[l].jewels.length - 1]; x.dye = p.color;
    G.log(`ジュエルが${JD.CI[p.color].n}に染まった`);
  } });
  def('moveLumina', { cat: 'white', types: ALL, tpl: '自分のルミナ1体を、空いている別のレーンに移動する', val: () => 1.3, useful: (p, G, pi) => G.luminas(pi).length > 0 && G.pl(pi).lanes.some((l) => !l.lumina), run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi), cands = G.luminas(c.pi);
    if (!cands.length || !P.lanes.some((l) => !l.lumina)) return;
    const x = await G.choose(c.pi, { kind: 'lumina', cands, purpose: 'move', prompt: '移動する自分のルミナを選んでください' });
    if (!x) return;
    const to = await laneChoose(G, c.pi, 'field', c.pi, 'moveDest', [0, 1, 2, 3, 4].filter((i) => !P.lanes[i].lumina));
    if (to != null) G.moveLumina(x, to);
  } });
  def('pushE', { cat: 'white', types: ALL, tpl: '相手のルミナ1体を選び、相手の空いているレーンに移動する', val: () => 2.2, useful: (p, G, pi) => hasE(G, pi) && G.pl(1 - pi).lanes.some((l) => !l.lumina), run: async (p, c) => {
    const G = c.G, O = G.pl(1 - c.pi), cands = G.luminas(1 - c.pi);
    if (!cands.length || !O.lanes.some((l) => !l.lumina)) return;
    const x = await G.choose(c.pi, { kind: 'lumina', cands, purpose: 'harm', prompt: '移動させる相手のルミナを選んでください' });
    if (!x) return;
    const to = await laneChoose(G, c.pi, 'field', 1 - c.pi, 'pushDest', [0, 1, 2, 3, 4].filter((i) => !O.lanes[i].lumina));
    if (to != null) G.moveLumina(x, to);
  } });
  def('scMove', { cat: 'white', types: ALL, tpl: '自分のショーケース1つを、別のレーンに移動する', val: () => 1.8, useful: (p, G, pi) => G.luminas(pi).length > 0, run: async (p, c) => {
    const G = c.G, P = G.pl(c.pi), from = [0, 1, 2, 3, 4].filter((i) => P.lanes[i].showcase), dest = [0, 1, 2, 3, 4].filter((i) => !P.lanes[i].showcase);
    if (!from.length || !dest.length) return;
    let f = from[0];
    if (from.length > 1) { f = await laneChoose(G, c.pi, 'field', c.pi, 'scFrom', from); if (f == null) return; }
    const to = await laneChoose(G, c.pi, 'field', c.pi, 'showcaseMove', dest);
    if (to != null) G.moveShowcase(c.pi, f, to);
  } });

  /* ---- Control ---- */
  def('if', { cat: 'ctrl', kind: 'c', types: ALL, params: condParams(), cval: (p, kv) => kv * CONDS[p.cond].pf(p), text: (p, b) => `もし${CONDS[p.cond].fmt(p)}なら、${(b.c || []).map(JD.blockText).join('、') || '(何もしない)'}`, run: async (p, c, b) => {
    if (CONDS[p.cond].f(c, p)) await c.G.runBody(b.c, c);
  } });
  def('repeat', { cat: 'ctrl', kind: 'c', types: ALL, params: [num('n', 2, 3, 2, '回')], cval: (p, kv) => kv * p.n * 0.95, text: (p, b) => `次の効果を${p.n}回くり返す：${(b.c || []).map(JD.blockText).join('、') || '(何もしない)'}`, run: async (p, c, b) => {
    for (let i = 0; i < p.n; i++) await c.G.runBody(b.c, c);
  } });

  /* ---- Static (常時) ---- */
  def('sBuffIf', { cat: 'yellow', kind: 'static', types: ['lumina'], params: [...condParams(), num('p', 0, 4, 1), num('t', 0, 4, 1)], val: (p) => (2.8 * p.p + 1.4 * p.t) * CONDS[p.cond].pf(p), text: (p) => `${CONDS[p.cond].fmt(p)}間、このルミナはパワー+${p.p}、タフネス+${p.t}`, tpl: '' });
  def('sLord', { cat: 'yellow', kind: 'static', types: ['lumina'], params: [{ k: 'race', t: 'text', def: '' }, num('p', 0, 3, 1), num('t', 0, 3, 0)], val: (p) => (2.4 * p.p + 1.2 * p.t) * 2.8, text: (p) => `自分の他の種族「${p.race || '?'}」のルミナ全てにパワー+${p.p}、タフネス+${p.t}`, tpl: '' });
  def('sDye', { cat: 'white', kind: 'static', types: ['lumina', 'stage', 'spell'], params: [{ k: 'color', t: 'color', def: 'cyan' }], val: () => 1.2, text: (p) => `ジュエルエリアにある間、${JD.CI[p.color].n}のジュエルとしても扱う`, tpl: '' });
  def('sStageBuff', { cat: 'yellow', kind: 'static', types: ['stage'], params: [num('p', 0, 3, 1), num('t', 0, 3, 1)], val: (p) => 4.6 * p.p + 2.2 * p.t, text: (p) => `このステージの上のルミナにパワー+${p.p}、タフネス+${p.t}`, tpl: '' });

  /* ------------------------------------------------------------------ *
   * Triggers                                                           *
   * ------------------------------------------------------------------ */
  JD.TRIGGERS = {
    lumina: [
      { id: 'onPlay', label: '登場時', mul: 1.0 },
      { id: 'onAttack', label: 'アタック時', mul: 1.5 },
      { id: 'onDirect', label: 'ダイレクトアタックした時', mul: 1.2 },
      { id: 'onHit', label: 'ルミナにダメージを与えた時', mul: 1.3 },
      { id: 'onDestroyed', label: '破壊された時', mul: 0.9 },
      { id: 'onTurn', label: '自分のターン開始時', mul: 1.7 },
      { id: 'static', label: '常時', mul: 1.0 },
    ],
    stage: [
      { id: 'onPlay', label: '登場時', mul: 1.0 },
      { id: 'lumEnter', label: '上にルミナが出た時', mul: 1.3 },
      { id: 'lumAttack', label: '上のルミナがアタックした時', mul: 1.6 },
      { id: 'lumDestroyed', label: '上のルミナが破壊された時', mul: 1.0 },
      { id: 'onTurn', label: '自分のターン開始時', mul: 1.8 },
      { id: 'static', label: '常時', mul: 1.0 },
    ],
    spell: [{ id: 'onCast', label: '使用時', mul: 1.0 }],
  };
  JD.trigInfo = (type, id) => (JD.TRIGGERS[type] || []).find((t) => t.id === id);

  /* ------------------------------------------------------------------ *
   * Text                                                               *
   * ------------------------------------------------------------------ */
  function fmtParam(spec, v) {
    if (!spec) return '';
    if (spec.t === 'num') return v == null ? spec.def : v;
    if (spec.t === 'sel') { const o = spec.opts.find((x) => x[0] === v); return o ? o[1] : v; }
    if (spec.t === 'color') return JD.CI[v] ? JD.CI[v].n : v;
    return v || '(未設定)';
  }
  JD.blockText = function (b) {
    const d = BLOCKS[b.t]; if (!d) return '';
    const p = b.p || {};
    if (d.text) return d.text(p, b);
    return d.tpl.replace(/\{(\w+)\}/g, (m, k) => fmtParam(d.params.find((x) => x.k === k), p[k]));
  };
  JD.cardLines = function (def) {
    const lines = [];
    for (const s of def.scripts || []) {
      const ti = JD.trigInfo(def.type, s.trigger); if (!ti) continue;
      const body = (s.body || []).map(JD.blockText).filter(Boolean);
      if (!body.length) continue;
      if (s.trigger === 'static') body.forEach((t) => lines.push({ trig: '常時', text: t + '。' }));
      else lines.push({ trig: ti.label, text: body.join('。') + '。' });
    }
    return lines;
  };
  JD.cardText = (def) => JD.cardLines(def).map((l) => `【${l.trig}】${l.text}`).join('\n');

  JD.newBlock = function (id) {
    const d = BLOCKS[id]; const p = {};
    d.params.forEach((s) => { p[s.k] = s.def; });
    const b = { t: id, p };
    if (d.kind === 'c') b.c = [];
    return b;
  };

  /* ------------------------------------------------------------------ *
   * Cost estimator                                                     *
   * ------------------------------------------------------------------ */
  const PV = [0, 3.0, 6.6, 10.4, 15, 20.5, 27, 34, 42, 50];
  const TV = [0.2, 1.2, 2.6, 4.4, 6.4, 8.6, 11, 13.6, 16.4, 19.4];
  JD.statValue = (P, T) => {
    const p = (PV[Math.max(0, Math.min(9, P))] + (P > 9 ? (P - 9) * 8 : 0)) * JD.TUNE.ps;
    const t = (TV[Math.max(0, Math.min(9, T))] + (T > 9 ? (T - 9) * 2.5 : 0)) * JD.TUNE.ts;
    return (p + t) * 1.1;
  };
  // Calibration constants (found by tools/calibrate.js: CPU self-play hill-climbing on colour win rates).
  JD.TUNE = { ps: 0.85, ts: 1, cat: { cyan: 1.4, magenta: 0.875, yellow: 1.08, green: 0.68, black: 1, white: 1 } };
  JD.EFFECT_SCALE = 0.8; // effects matter less than bodies in a ~6-turn game
  JD.BUDGET = {
    lumina: (lv) => 2.6 + 1.5 * lv,
    stage: (lv) => 0.6 + 1.6 * lv,
    spell: (lv) => -0.2 + 1.5 * lv,
  };
  JD.blocksValue = function (blocks) {
    let v = 0;
    for (const b of blocks || []) {
      const d = BLOCKS[b.t]; if (!d) continue;
      const p = b.p || {};
      v += (d.kind === 'c' ? d.cval(p, JD.blocksValue(b.c)) : d.val(p)) * (JD.TUNE.cat[d.cat] || 1);
    }
    return v;
  };
  function collectColors(blocks, set) {
    for (const b of blocks || []) {
      const d = BLOCKS[b.t]; if (!d) continue;
      if (JD.COLORS.includes(d.cat)) set.add(d.cat);
      if (b.c) collectColors(b.c, set);
    }
  }
  JD.estimate = function (def) {
    const parts = [];
    let stat = 0;
    if (def.type === 'lumina') { stat = JD.statValue(def.power | 0, def.toughness | 0); parts.push({ label: 'パワー / タフネス', value: stat }); }
    const cols = new Set();
    let eff = 0;
    for (const s of def.scripts || []) {
      const ti = JD.trigInfo(def.type, s.trigger); if (!ti) continue;
      const v = JD.blocksValue(s.body) * ti.mul * JD.EFFECT_SCALE;
      collectColors(s.body, cols);
      eff += v;
      parts.push({ label: ti.label, value: v });
    }
    const total = stat + eff;
    const budget = JD.BUDGET[def.type];
    let lv = 1, over = false;
    while (budget(lv) < total - 1e-6) { lv++; if (lv > JD.MAX_LV) { lv = JD.MAX_LV; over = true; break; } }
    const others = [...cols].filter((c) => c !== def.color);
    let N = Math.max(Math.ceil(lv / 3), 1 + others.length);
    const cost = {}; cost[def.color] = N - others.length;
    others.forEach((c) => { cost[c] = 1; });
    return { parts, stat, eff, total, lv, cost, over, N, others, budgetAt: (l) => budget(l) };
  };
  JD.autoCost = function (def) {
    const e = JD.estimate(def);
    def.lv = e.lv; def.cost = e.cost;
    return e;
  };
  JD.costTotal = (def) => JD.COLORS.reduce((s, c) => s + ((def.cost && def.cost[c]) || 0), 0);
  JD.costTag = (def) => {
    const parts = JD.COLORS.filter((c) => def.cost && def.cost[c]).map((c) => JD.CI[c].k + (def.cost[c] > 1 ? '×' + def.cost[c] : ''));
    return parts.join(' ');
  };
  // balance verdict for manual cost: ratio of value to what the LV can afford
  JD.balance = function (def) {
    const e = JD.estimate(def);
    const b = JD.BUDGET[def.type](def.lv);
    const ratio = b > 0 ? e.total / b : 9;
    let verdict = 'ok', text = '適正';
    if (ratio > 1.35) { verdict = 'broken'; text = '強すぎ（コスト不足）'; }
    else if (ratio > 1.12) { verdict = 'strong'; text = 'やや強い'; }
    else if (ratio < 0.5) { verdict = 'weak'; text = '割高（弱い）'; }
    else if (ratio < 0.75) { verdict = 'soft'; text = 'やや割高'; }
    return { ratio, verdict, text, est: e, budget: b };
  };

  /* ------------------------------------------------------------------ *
   * Validation                                                         *
   * ------------------------------------------------------------------ */
  function countBlocks(blocks, depth, acc) {
    for (const b of blocks || []) {
      acc.n++; acc.depth = Math.max(acc.depth, depth);
      if (b.c) countBlocks(b.c, depth + 1, acc);
    }
  }
  JD.validateCard = function (d) {
    const errs = [];
    if (!d.name || !d.name.trim()) errs.push('名前を入力してください');
    if (!JD.TYPE_NAME[d.type]) errs.push('種類が不正です');
    if (!JD.COLORS.includes(d.color)) errs.push('カラーが不正です');
    if (d.type === 'lumina') {
      if (!(d.toughness >= 1)) errs.push('タフネスは1以上にしてください');
      if (d.power < 0) errs.push('パワーは0以上にしてください');
    }
    const acc = { n: 0, depth: 0 };
    for (const s of d.scripts || []) countBlocks(s.body, 1, acc);
    if (acc.n > 16) errs.push('ブロックは合計16個までです');
    if (acc.depth > 3) errs.push('ブロックの入れ子は2段までです');
    if (d.type !== 'lumina' && d.type !== 'stage' && (d.scripts || []).every((s) => !(s.body || []).length)) errs.push('スペルには効果ブロックが1つ以上必要です');
    return errs;
  };
  // Ensure a def has every field the engine expects.
  JD.normalizeCard = function (d) {
    d.name = d.name || '名称未設定';
    d.race = d.race || '';
    d.scripts = d.scripts || [];
    d.cost = d.cost || {};
    d.lv = d.lv == null ? 1 : d.lv;
    if (d.type === 'lumina') { d.power = d.power | 0; d.toughness = Math.max(1, d.toughness | 0); }
    else { d.power = 0; d.toughness = 0; }
    return d;
  };
})(typeof window !== 'undefined' ? window : globalThis);
