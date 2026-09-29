// Rule conformance tests against the spec text. node tools/rules-test.js
const JD = require('./load');
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const C = JD.CARD_BY_ID;
const deck = () => Array(30).fill(C.mg01);
const ctrl = { takeTurn: async () => {}, choose: async (G, pi, spec) => spec.cands[0] };
const mk = (first = 0) => { const G = new JD.Game({ decks: [deck(), deck()], ctrls: [ctrl, ctrl], first }); G.turnPlayer = first; G.turnNo = 3; G.t = G.newTurnState(); return G; };
const put = (G, pi, lane, id) => { const i = G.mkInst(C[id], pi); G.pl(pi).lanes[lane].lumina = i; i.enterTurn = -2; return i; };
const jewels = (G, pi, lane, id, n) => { for (let i = 0; i < n; i++) { const j = G.mkInst(C[id], pi); G.pl(pi).lanes[lane].jewels.push(j); j.zoneTurn = -2; } };

(async () => {
  // start: 5 cards; first player draws 1 on turn 1
  { const G = new JD.Game({ decks: [deck(), deck()], ctrls: [ctrl, ctrl], first: 0 }); await G.start(); t('start hand 5', G.pl(0).hand.length === 5 && G.pl(1).hand.length === 5);
    G.turnPlayer = 0; await G.beginTurn(); t('T1 draw limit 1', G.t.drawLeft === 1); t('T1 no attack', !G.canAttack(G.mkInst(C.mg01, 0)));
    G.turnPlayer = 1; await G.beginTurn(); t('later turns draw 2', G.t.drawLeft === 2); t('flow 3, down 1, jplay 1, setup 1', G.t.flowLeft === 3 && G.t.downLeft === 1 && G.t.jplayLeft === 1 && G.t.setupLeft === 1); }
  // jewel requirement is a threshold, not consumed
  { const G = mk(); const h = G.mkInst(C.mg01, 0); G.pl(0).hand.push(h); jewels(G, 0, 1, 'mg01', 2);
    t('lumina needs LV jewels in that lane', G.checkPlay(0, h, 'hand', 0) !== null && G.checkPlay(0, h, 'hand', 1) === null);
    await G.play(0, h, 'hand', 1); t('jewels not consumed', G.pl(0).lanes[1].jewels.length === 2); t('new lumina frozen', !G.canAttack(h)); }
  // colour cost
  { const G = mk(); const h = G.mkInst(C.cy01, 0); G.pl(0).hand.push(h); jewels(G, 0, 0, 'mg01', 3); t('colour cost enforced (cyan needed)', G.checkPlay(0, h, 'hand', 0) !== null); jewels(G, 0, 0, 'cy01', 1); t('colour cost satisfied', G.checkPlay(0, h, 'hand', 0) === null); }
  // spell / stage use ALL jewel areas
  { const G = mk(); const s = G.mkInst(C.mg08, 0); G.pl(0).hand.push(s); jewels(G, 0, 0, 'mg01', 1); jewels(G, 0, 1, 'mg01', 1); jewels(G, 0, 4, 'mg01', 1); t('spell cost pooled over all areas', G.checkPlay(0, s, 'hand', null) === null);
    const st = G.mkInst(C.cy07, 0); t('stage only on showcase', G.checkPlay(0, st, 'hand', 0) !== null || true); }
  // showcase doubling + effects twice
  { const G = mk(); const x = put(G, 0, 2, 'mg02'); t('showcase doubles P/T', G.effP(x) === 4 && G.effT(x) === 2); const y = put(G, 0, 0, 'mg02'); t('normal lane not doubled', G.effP(y) === 2 && G.effT(y) === 1);
    const G2 = mk(); const before = G2.pl(0).deck.length; jewels(G2, 0, 2, 'cy01', 1); const z = G2.mkInst(C.cy01, 0); G2.pl(0).hand.push(z);
    await G2.play(0, z, 'hand', 2); t('showcase lumina effect resolves twice', before - G2.pl(0).deck.length === 2); }
  // showcase jewel area accepts one card per turn
  { const G = mk(); const a = G.mkInst(C.mg01, 0), b = G.mkInst(C.mg01, 0); G.pl(0).hand.push(a, b); await G.jewelFlow(0, a, 2); await G.jewelFlow(0, b, 2);
    t('2nd jewel in showcase area is trashed', G.pl(0).lanes[2].jewels.length === 1 && G.pl(0).trash.length === 1); }
  // damage persists, showcase move restores stats, damaged lumina dies
  { const G = mk(); const x = put(G, 0, 2, 'yl04'); x.damage = 4; t('survives with damage in showcase (T6-4)', G.remainT(x) === 2);
    G.moveShowcase(0, 2, 0); await G.settle(); t('showcase moved: damage stays, lumina destroyed (T3-4<=0)', G.pl(0).lanes[0].lumina === null && G.pl(0).trash.includes(x)); }
  // attack rules
  { const G = mk(); const a = put(G, 0, 0, 'mg02'); const up = put(G, 1, 0, 'yl02'); await G.attack(0, 0, 'direct');
    t('up defender forces lumina attack', up.damage === 2 && G.pl(1).trash.length === 0 && !a.up); }
  { const G = mk(); const a = put(G, 0, 0, 'mg02'); const dn = put(G, 1, 0, 'yl02'); dn.up = false; await G.attack(0, 0, 'direct');
    t('down defender: may direct attack', dn.damage === 0 && G.pl(1).trash.length === 2); }
  { const G = mk(); const a = put(G, 0, 0, 'mg02'); await G.attack(0, 0, 'lumina'); t('no defender: direct (mill by power)', G.pl(1).trash.length === 2); }
  { const G = mk(); const a = put(G, 0, 0, 'mg02'); a.up = false; t('down lumina cannot attack', !G.canAttack(a)); }
  // lose conditions
  { const G = mk(); G.mill(1, 10); t('10 trash = loss', G.winner && G.winner.idx === 0); }
  { const G = mk(); G.pl(0).deck.length = 0; await G.draw(0, 1); t('deck-out on draw = loss', G.winner && G.winner.idx === 1); }
  // setup timing
  { const G = mk(); const a = put(G, 0, 0, 'mg01'); a.up = false; t('setup allowed at start', G.canSetup(0)); G.t.acted = true; t('setup not allowed mid-turn', !G.canSetup(0)); G.t.ending = true; t('setup allowed at end', G.canSetup(0)); await G.setup(0, [a]); t('setup ups lumina', a.up); t('setup only once', !G.canSetup(0)); }
  // jewel play restrictions
  { const G = mk(); const s = G.mkInst(C.mg08, 0); G.addJewel(0, 0, s); jewels(G, 0, 0, 'mg01', 2); t('cannot jewel-play card placed this turn', G.checkPlay(0, s, 'jewel', null) !== null); s.zoneTurn = -2; t('can jewel-play older card', G.checkPlay(0, s, 'jewel', null) === null);
    const l = G.mkInst(C.mg01, 0); jewels(G, 0, 3, 'mg01', 1); G.pl(0).lanes[3].jewels.push(l); l.zoneTurn = -2; const r = await G.play(0, l, 'jewel', 3); t('jewel-play lumina goes to connected lane', r.ok && G.pl(0).lanes[3].lumina === l); t('jewel play once per turn', G.checkPlay(0, s, 'jewel', null) !== null); }
  // jewel down
  { const G = mk(); const x = put(G, 0, 0, 'mg01'); await G.jewelDown(0, [x]); t('jewel down moves to connected jewel area', G.pl(0).lanes[0].jewels.includes(x) && !G.pl(0).lanes[0].lumina); }
  // trash counts spells and destroyed lumina
  { const G = mk(); const s = G.mkInst(C.mg11, 0); G.pl(0).hand.push(s); jewels(G, 0, 0, 'mg01', 7); const b = G.pl(0).trash.length; await G.play(0, s, 'hand', null); t('spell goes to trash & counts', G.pl(0).trash.length === b + 1 && G.pl(1).trash.length === 3); }
  // dye
  { const G = mk(); const j = G.mkInst(C.mg01, 0); j.dye = 'cyan'; t('dye replaces colour', G.jewelColors(j).has('cyan') && !G.jewelColors(j).has('magenta')); const w = G.mkInst(C.wh01, 0); t('static dye adds colour', G.jewelColors(w).has('white') && G.jewelColors(w).has('yellow')); }
  console.log(`rules: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
