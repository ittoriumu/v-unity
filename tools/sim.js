// Balance simulator: round-robin CPU vs CPU with preset decks.
//   node tools/sim.js [gamesPerPairing=40] [level=normal]
const JD = require('./load');
const N = +process.argv[2] || 40;
const level = process.argv[3] || 'normal';

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const deckDefs = (p) => [].concat(...p.list.map(([id, n]) => Array(n).fill(JD.CARD_BY_ID[id])));

async function play(a, b, first, seed) {
  const rnd = seeded(seed);
  const G = new JD.Game({ decks: [deckDefs(a), deckDefs(b)], ctrls: [JD.makeAI(level), JD.makeAI(level)], first, names: [a.name, b.name], rnd });
  const w = await G.run();
  return { w: w.idx, turns: G.turnNo, reason: w.reason, first };
}

(async () => {
  for (const p of JD.PRESETS) {
    const n = JD.deckSize(p.list);
    if (n !== 30) console.log('!! deck size', p.name, n);
    for (const [id, c] of p.list) { if (c > 3) console.log('!! copies', p.name, id); if (!JD.CARD_BY_ID[id]) console.log('!! missing', id); }
  }
  const P = JD.PRESETS, k = P.length;
  const win = P.map(() => P.map(() => 0)), tot = P.map(() => P.map(() => 0));
  let firstWins = 0, games = 0, turnsSum = 0; const reasons = {};
  let seed = 9001;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    for (let g = 0; g < N; g++) {
      const first = g % 2;
      const r = await play(P[i], P[j], first, seed++);
      games++; turnsSum += r.turns; reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      tot[i][j]++; tot[j][i]++;
      if (r.w === 0) win[i][j]++; else if (r.w === 1) win[j][i]++;
      if (r.w === first) firstWins++;
    }
  }
  console.log(`games=${games} level=${level} avgTurns=${(turnsSum / games).toFixed(1)} firstPlayerWin=${(firstWins / games * 100).toFixed(1)}%`);
  console.log('endings', reasons);
  console.log('winrate matrix (row beats col)');
  console.log(''.padEnd(22) + P.map((p) => p.color.slice(0, 5).padStart(7)).join(''));
  P.forEach((p, i) => {
    let w = 0, t = 0;
    const row = P.map((q, j) => { if (i === j) return '   -   '; w += win[i][j]; t += tot[i][j]; return ((win[i][j] / tot[i][j]) * 100).toFixed(0).padStart(6) + '%'; });
    console.log(p.name.padEnd(22).slice(0, 22) + row.join('') + `  | total ${(w / t * 100).toFixed(1)}%`);
  });
})();
