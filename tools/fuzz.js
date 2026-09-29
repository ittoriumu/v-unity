// Fuzz: random original cards (every block type, random params/nesting) played by the AI. Must never throw or hang.
//   node tools/fuzz.js [games=300]
const JD = require('./load');
const N = +process.argv[2] || 300;
let seed = 4242;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
function randParams(d) {
  const p = {};
  for (const s of d.params) {
    if (s.t === 'num') p[s.k] = s.min + Math.floor(rnd() * (s.max - s.min + 1));
    else if (s.t === 'sel') p[s.k] = pick(s.opts)[0];
    else if (s.t === 'color') p[s.k] = pick(JD.COLORS);
    else p[s.k] = pick(['ナイト', 'ドラゴン', 'ゴースト', '']);
  }
  return p;
}
function randBlock(type, isStatic, depth) {
  const list = Object.values(JD.BLOCKS).filter((b) => b.types.includes(type) && (b.kind === 'static') === isStatic && (depth < 2 || b.kind !== 'c'));
  const d = pick(list);
  const b = { t: d.id, p: randParams(d) };
  if (d.kind === 'c') { b.c = []; const n = 1 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) b.c.push(randBlock(type, false, depth + 1)); }
  return b;
}
function randCard(i) {
  const type = pick(['lumina', 'lumina', 'spell', 'stage']);
  const d = { id: 'f' + i, type, color: pick(JD.COLORS), name: 'F' + i, race: pick(['ナイト', 'ドラゴン', 'ゴースト']), power: Math.floor(rnd() * 3), toughness: 1 + Math.floor(rnd() * 3), scripts: [], flavor: '', art: null, custom: true, costMode: 'auto', lv: 1, cost: {} };
  const trigs = JD.TRIGGERS[type].filter((t) => t.id !== 'static');
  const used = new Set();
  const ns = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < ns; k++) {
    const t = pick(trigs); if (used.has(t.id)) continue; used.add(t.id);
    const body = []; const nb = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < nb; j++) body.push(randBlock(type, false, 1));
    d.scripts.push({ trigger: t.id, body });
  }
  if ((type === 'lumina' || type === 'stage') && rnd() < 0.5) d.scripts.push({ trigger: 'static', body: [randBlock(type, true, 1)] });
  JD.normalizeCard(d);
  const e = JD.autoCost(d);
  if (e.over) { d.costMode = 'manual'; d.lv = 4; d.cost = { [d.color]: 2 }; }
  JD.CARD_BY_ID[d.id] = d;
  return d;
}
(async () => {
  const cards = Array.from({ length: 160 }, (_, i) => randCard(i));
  // sanitiser round trip
  let bad = 0;
  for (const c of cards.slice(0, 60)) { const s = JD.sanitizeCard ? null : null; }
  const levels = ['easy', 'normal', 'hard'];
  let done = 0, byReason = {}, maxTurn = 0;
  for (let g = 0; g < N; g++) {
    const mk = () => { const pool = JD.shuffle(cards.slice(), rnd); const d = []; for (const c of pool.slice(0, 12)) for (let k = 0; k < 2; k++) d.push(c); const fill = JD.DEFAULT_CARDS; while (d.length < 30) d.push(pick(fill)); return d; };
    const G = new JD.Game({ decks: [mk(), mk()], ctrls: [JD.makeAI(pick(levels)), JD.makeAI(pick(levels))], first: g % 2, rnd });
    let to;
    const res = await Promise.race([G.run(), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('timeout/hang')), 15000); })]).catch((e) => { console.log('FAIL game', g, e.stack || e.message); console.log(G.logs.slice(-15).join('\n')); process.exit(1); });
    clearTimeout(to);
    done++; byReason[res.reason] = (byReason[res.reason] || 0) + 1; maxTurn = Math.max(maxTurn, G.turnNo);
  }
  console.log('OK games', done, byReason, 'maxTurn', maxTurn);
})();
