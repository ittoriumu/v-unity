// Per-card diagnostic: win rate of games in which a card was played at least once, per deck.
//   node tools/diag.js [gamesPerPairing=40]
const JD = require('./load');
const N = +process.argv[2] || 40;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const deckDefs = (p) => [].concat(...p.list.map(([id, n]) => Array(n).fill(JD.CARD_BY_ID[id])));
(async () => {
  const P = JD.PRESETS, stat = {};
  let seed = 1000;
  for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) {
    if (i === j) continue;
    for (let g = 0; g < N; g++) {
      const G = new JD.Game({ decks: [deckDefs(P[i]), deckDefs(P[j])], ctrls: [JD.makeAI('normal'), JD.makeAI('normal')], first: g % 2, rnd: seeded(seed++) });
      const played = [new Set(), new Set()];
      const op = G.play.bind(G);
      G.play = async (pi, inst, from, lane) => { const r = await op(pi, inst, from, lane); if (r.ok) played[pi].add(inst.def.id); return r; };
      const w = await G.run();
      [[0, i], [1, j]].forEach(([pi, di]) => {
        for (const id of played[pi]) {
          const k = P[di].id + ':' + id; stat[k] = stat[k] || { w: 0, n: 0 };
          stat[k].n++; if (w.idx === pi) stat[k].w++;
        }
      });
    }
  }
  for (const p of P) {
    console.log('== ' + p.name);
    const rows = p.list.map(([id]) => { const s = stat[p.id + ':' + id] || { w: 0, n: 1 }; const d = JD.CARD_BY_ID[id]; return { id, name: d.name, lv: d.lv, wr: s.w / s.n * 100, n: s.n }; }).sort((a, b) => b.wr - a.wr);
    console.log(rows.map((r) => `${r.id} ${r.name.slice(0, 8).padEnd(8, '　')} LV${r.lv} ${r.wr.toFixed(0)}%`).join('\n'));
  }
})();
