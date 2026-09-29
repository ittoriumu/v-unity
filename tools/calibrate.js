// Hill-climbing calibration of estimator constants so that the preset decks' win rates converge.
//   node tools/calibrate.js [iterations=30] [gamesPerPairing=24]
const JD = require('./load');
const ITER = +process.argv[2] || 30, N = +process.argv[3] || 24;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const deckDefs = (p) => [].concat(...p.list.map(([id, n]) => Array(n).fill(JD.CARD_BY_ID[id])));
function recost() { for (const d of JD.DEFAULT_CARDS) if (d.costMode === 'auto') JD.autoCost(d); }
async function evaluate() {
  recost();
  const P = JD.PRESETS, w = P.map(() => 0), t = P.map(() => 0);
  let seed = 77;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let g = 0; g < N; g++) {
    const G = new JD.Game({ decks: [deckDefs(P[i]), deckDefs(P[j])], ctrls: [JD.makeAI('normal'), JD.makeAI('normal')], first: g % 2, rnd: seeded(seed++) });
    const r = await G.run(); t[i]++; t[j]++;
    if (r.idx === 0) w[i]++; else if (r.idx === 1) w[j]++;
  }
  const wr = w.map((x, i) => x / t[i]);
  const mean = wr.reduce((a, b) => a + b, 0) / wr.length;
  const dev = Math.sqrt(wr.reduce((a, b) => a + (b - mean) ** 2, 0) / wr.length);
  return { dev, wr };
}
(async () => {
  let best = await evaluate();
  console.log('start dev', best.dev.toFixed(3), best.wr.map((x) => (x * 100).toFixed(0)).join(' '));
  const keys = [...JD.COLORS.map((c) => 'cat.' + c), 'ps', 'ts'];
  const get = (k) => (k.startsWith('cat.') ? JD.TUNE.cat[k.slice(4)] : JD.TUNE[k]);
  const set = (k, v) => { if (k.startsWith('cat.')) JD.TUNE.cat[k.slice(4)] = v; else JD.TUNE[k] = v; };
  for (let it = 0; it < ITER; it++) {
    // push the strongest deck's colour down / weakest up, plus random exploration
    const order = best.wr.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
    const cands = [];
    const hi = JD.PRESETS[order[0][1]].color, lo = JD.PRESETS[order[order.length - 1][1]].color;
    cands.push(['cat.' + hi, 0.9], ['cat.' + lo, 1.1]);
    cands.push([keys[Math.floor(Math.random() * keys.length)], Math.random() < 0.5 ? 0.92 : 1.08]);
    let improved = false;
    for (const [k, f] of cands) {
      const old = get(k), nv = Math.max(0.4, Math.min(2.2, old * f));
      set(k, nv);
      const r = await evaluate();
      if (r.dev < best.dev - 0.002) { best = r; improved = true; console.log(`it${it} ${k}=${nv.toFixed(3)} dev ${r.dev.toFixed(3)} ${r.wr.map((x) => (x * 100).toFixed(0)).join(' ')}`); }
      else set(k, old);
    }
    if (!improved) process.stdout.write('.');
  }
  recost();
  console.log('\nFINAL', JSON.stringify(JD.TUNE), 'dev', best.dev.toFixed(3));
})();
