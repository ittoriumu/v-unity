/* CPU opponent. level: 'easy' | 'normal' | 'hard' */
(function (root) {
  'use strict';
  const JD = root.JD;
  const NL = JD.LANES;

  JD.makeAI = function (level) {
    level = level || 'normal';
    const skill = { easy: 0, normal: 1, hard: 2 }[level];
    const cache = new Map();
    const rate = (def) => {
      if (!cache.has(def)) cache.set(def, JD.estimate(def).total + (def.type === 'lumina' ? 0.5 : 0));
      return cache.get(def);
    };
    const maxBy = (a, f) => a.reduce((best, x) => (best === undefined || f(x) > f(best) ? x : best), undefined);
    const minBy = (a, f) => maxBy(a, (x) => -f(x));
    const rndPick = (G, a) => a[Math.floor(G.rnd() * a.length)];
    const threat = (G, x) => G.effP(x) * 2.2 + G.remainT(x) * 0.5 + rate(x.def) * 0.25;

    // best jewel area to drop a card into
    function bestFlowLane(G, pi, card) {
      const P = G.pl(pi);
      const targets = P.hand.filter((h) => h !== card).sort((a, c) => rate(c.def) - rate(a.def)).slice(0, 3);
      let best = null, bs = -1e9;
      for (let k = 0; k < NL; k++) {
        if (!G.canFlowTo(pi, k)) continue;
        const L = P.lanes[k];
        const jw = L.jewels.concat([card]);
        let s = 0;
        for (const t of targets) {
          const d = t.def;
          if (d.type !== 'lumina') continue;
          if (L.lumina) continue;
          let def_ = Math.max(0, d.lv - jw.length);
          const cc = G.colorCounts(jw);
          JD.COLORS.forEach((c) => { def_ += Math.max(0, (d.cost[c] || 0) - cc[c]); });
          s -= def_ * rate(d) / 6;
        }
        s += L.jewels.length * 0.15 + (L.lumina ? -0.2 : 0.2) + (L.showcase ? -0.6 : 0);
        s += G.rnd() * 0.05;
        if (s > bs) { bs = s; best = k; }
      }
      return best;
    }

    function spellWorth(G, pi, def) {
      const blocks = [];
      const walk = (bl) => { for (const x of bl || []) { blocks.push(x); if (x.c) walk(x.c); } };
      for (const s of def.scripts || []) walk(s.body);
      let good = 0, bad = 0;
      for (const x of blocks) {
        const d = JD.BLOCKS[x.t];
        if (d.kind === 'c') continue;
        const v = d.val(x.p || {});
        if (!d.useful || d.useful(x.p || {}, G, pi)) good += Math.max(0, v); else if (v > 0) bad += v;
      }
      return { good, bad };
    }

    function combos(arr, maxk) {
      const out = [[]];
      const rec = (start, cur) => {
        if (cur.length >= maxk) return;
        for (let i = start; i < arr.length; i++) { const n = cur.concat([arr[i]]); out.push(n); rec(i + 1, n); }
      };
      rec(0, []);
      return out;
    }

    function planBest(G, pi) {
      const P = G.pl(pi), t = G.t;
      let best = null;
      const consider = (score, plan) => { if (score > 0.6 && (!best || score > best.score)) best = Object.assign({ score }, plan); };
      const flows = Math.min(t.flowLeft, 3);
      const subsets = skill === 0 ? [[]] : combos(P.hand, flows);
      // 1. from hand (with optional jewel flows first)
      for (const c of P.hand) {
        const d = c.def;
        const lanes = d.type === 'lumina' ? [0, 1, 2, 3, 4].filter((i) => !P.lanes[i].lumina)
          : d.type === 'stage' ? [0, 1, 2, 3, 4].filter((i) => P.lanes[i].showcase) : [null];
        let worth = 1;
        if (d.type === 'spell') { const w = spellWorth(G, pi, d); if (w.good < 1.5) continue; worth = w.good / (w.good + w.bad + 0.01); }
        if (d.type === 'spell' && G.pl(pi).trash.length >= 8) continue;
        for (const lane of lanes) {
          for (const S of subsets) {
            if (S.includes(c)) continue;
            let hostLane = lane;
            if (d.type !== 'lumina') {
              if (S.length) { hostLane = bestFlowLane(G, pi, S[0]); if (hostLane == null) continue; }
            }
            if (S.length) {
              const HL = P.lanes[hostLane];
              if (HL.showcase && HL.added + S.length > 1) continue;
            }
            const jewels = d.type === 'lumina' ? P.lanes[lane].jewels.concat(S) : G.allJewels(pi).concat(S);
            if (!G.canAfford(d, jewels)) continue;
            let score = rate(d) * worth;
            if (d.type === 'lumina' && P.lanes[lane].showcase) score += JD.statValue(d.power, d.toughness) * 0.5;
            if (d.type === 'lumina') score += 0.8; // board presence
            score -= S.reduce((s, x) => s + rate(x.def) * 0.55 + 0.4, 0);
            if (d.type === 'lumina' && !S.length) score += 0.5;
            consider(score, { kind: 'hand', card: c, lane, S, hostLane });
          }
        }
      }
      // 2. jewel play
      if (t.jplayLeft > 0) {
        for (let k = 0; k < NL; k++) {
          for (const j of P.lanes[k].jewels) {
            if (j.zoneTurn === G.turnNo) continue;
            const d = j.def;
            if (d.type === 'lumina' && P.lanes[k].lumina) continue;
            if (d.type === 'stage' && !P.lanes[k].showcase) continue;
            let worth = 1;
            if (d.type === 'spell') { const w = spellWorth(G, pi, d); if (w.good < 1.5) continue; worth = w.good / (w.good + w.bad + 0.01); if (P.trash.length >= 8) continue; }
            const jewels = d.type === 'lumina' ? P.lanes[k].jewels : G.allJewels(pi);
            if (!G.canAfford(d, jewels)) continue;
            let score = rate(d) * worth - 0.9 + (d.type === 'lumina' ? 0.8 : 0);
            if (d.type === 'lumina' && P.lanes[k].showcase) score += JD.statValue(d.power, d.toughness) * 0.5;
            consider(score, { kind: 'jewel', card: j, lane: k, S: [] });
          }
        }
      }
      return best;
    }

    const ai = {
      isAI: true, level,
      choose(G, pi, spec) {
        const c = spec.cands;
        if (!c || !c.length) return null;
        if (c.length === 1) return c[0];
        if (skill === 0 && G.rnd() < 0.4) return rndPick(G, c);
        const P = G.pl(pi);
        switch (spec.kind) {
          case 'lumina':
            if (spec.purpose === 'harm') return maxBy(c, (x) => threat(G, x) + (spec.amount && spec.amount >= G.remainT(x) ? 4 : 0) + (x.up ? 0.3 : 0));
            if (spec.purpose === 'sac') return minBy(c, (x) => rate(x.def) + G.effP(x) * 0.3);
            if (spec.purpose === 'move') return maxBy(c, (x) => (x.up ? 0 : 0.5) + G.effP(x));
            if (spec.purpose === 'up') return maxBy(c, (x) => (x.up ? -9 : G.effP(x)));
            if (spec.purpose === 'heal') return maxBy(c, (x) => x.damage);
            return maxBy(c, (x) => G.effP(x) * 2 + G.remainT(x) * 0.3 + (x.up ? 0.2 : 0));
          case 'card':
            if (spec.purpose === 'discard') return minBy(c, (x) => rate(x.def) - (G.canAfford(x.def, G.allJewels(pi)) ? 0 : 0.5));
            return maxBy(c, (x) => rate(x.def));
          case 'lane': {
            const side = spec.side;
            switch (spec.purpose) {
              case 'jewelPut': {
                const dummy = { def: { type: 'x' } };
                let bl = null, bs = -1e9;
                for (const k of c) {
                  let s = -Math.abs(k - 1.5) * 0.01;
                  const L = P.lanes[k];
                  s += L.jewels.length * 0.2 + (L.lumina ? 0 : 0.4) - (L.showcase && L.added >= 1 ? 5 : 0) + G.rnd() * 0.1;
                  if (s > bs) { bs = s; bl = k; }
                }
                return bl;
              }
              case 'jewelBreak': { const O = G.pl(side); return maxBy(c, (k) => O.lanes[k].jewels.length + (O.lanes[k].lumina ? 1.5 : 0)); }
              case 'showcaseAdd': case 'showcaseMove': return maxBy(c, (k) => (P.lanes[k].lumina ? G.effP(P.lanes[k].lumina) * 2 + G.effT(P.lanes[k].lumina) * 0.4 + 1 : 0) + G.rnd() * 0.2);
              case 'scFrom': return minBy(c, (k) => (P.lanes[k].lumina ? 1 : 0));
              case 'moveDest': return maxBy(c, (k) => { const o = G.pl(1 - pi).lanes[k].lumina; return (!o ? 2 : !o.up ? 1.5 : 0) + G.rnd() * 0.1; });
              case 'pushDest': { const me = P.lanes; return maxBy(c, (k) => (me[k].lumina && me[k].lumina.up ? 1 : 0) + G.rnd() * 0.1); }
              case 'dye': case 'jewelBack': return maxBy(c, (k) => P.lanes[k].jewels.length + G.rnd() * 0.1);
              default: return rndPick(G, c);
            }
          }
          default: return rndPick(G, c);
        }
      },

      async takeTurn(G, pi) {
        const P = G.pl(pi);
        await G.pause(500);
        // draws are optional: stop before decking ourselves out
        while (G.t.drawLeft > 0 && !G.winner && P.deck.length > (P.hand.length >= 5 ? 9 : 5)) { await G.turnDraw(pi); await G.pause(250); }
        for (let guard = 0; guard < 24 && !G.winner; guard++) {
          const plan = planBest(G, pi);
          if (!plan) break;
          for (const x of plan.S) {
            await G.jewelFlow(pi, x, plan.hostLane);
            await G.pause(280);
          }
          if (G.winner) break;
          const r = await G.play(pi, plan.card, plan.kind, plan.lane);
          if (!r.ok) break;
          await G.pause(500);
        }
        // attacks
        if (!G.winner) await this.attackPhase(G, pi);
        // dump extra cards as jewels to grow the economy
        while (!G.winner && G.t.flowLeft > 0 && P.hand.length > 2) {
          const c = minBy(P.hand, (x) => rate(x.def));
          const lane = bestFlowLane(G, pi, c);
          if (lane == null) break;
          await G.jewelFlow(pi, c, lane);
          await G.pause(300);
          // a fresh jewel may unlock a play
          const plan = planBest(G, pi);
          if (plan && !plan.S.length) { const r = await G.play(pi, plan.card, plan.kind, plan.lane); if (r.ok) await G.pause(500); }
        }
        if (!G.winner && G.t.jplayLeft > 0) {
          const plan = planBest(G, pi);
          if (plan && !plan.S.length) await G.play(pi, plan.card, plan.kind, plan.lane);
        }
        if (!G.winner) await this.attackPhase(G, pi);
        // Setup at the END of the turn: every lumina stands up again and shields its lane on the opponent's turn.
        if (!G.winner) {
          G.t.ending = true;
          const downs = G.luminas(pi).filter((x) => !x.up);
          if (downs.length && G.canSetup(pi)) { await G.setup(pi, downs); await G.pause(300); }
        }
        await G.pause(300);
      },

      async attackPhase(G, pi) {
        const P = G.pl(pi), O = G.pl(1 - pi);
        for (let pass = 0; pass < 6 && !G.winner; pass++) {
          let did = false;
          const order = [0, 1, 2, 3, 4].filter((k) => P.lanes[k].lumina && G.canAttack(P.lanes[k].lumina));
          // kill attacks first, then face
          const scored = order.map((k) => {
            const atk = P.lanes[k].lumina, o = O.lanes[k].lumina, pw = G.effP(atk);
            let mode = 'direct', s = pw;
            if (o && o.up) { mode = 'lumina'; s = pw >= G.remainT(o) ? 100 + threat(G, o) : pw * 1.2; }
            else if (o && !o.up) {
              const lethal = O.trash.length + pw >= JD.TRASH_LOSE;
              if (lethal) { mode = 'direct'; s = 1000; }
              else if (pw >= G.remainT(o) && threat(G, o) > 2) { mode = 'lumina'; s = 100 + threat(G, o); }
              else { mode = 'direct'; s = pw * 1.6; }
            } else { if (O.trash.length + pw >= JD.TRASH_LOSE) s = 1000; else s = pw * 1.6; }
            const hasTrig = (atk.def.scripts || []).some((sc) => sc.trigger === 'onAttack') || (P.lanes[k].stage && P.lanes[k].stage.def.scripts.some((sc) => sc.trigger === 'lumAttack'));
            if (pw <= 0 && !hasTrig) s = -1;
            return { k, mode, s };
          }).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
          if (scored.length) {
            const a = scored[0];
            await G.attack(pi, a.k, a.mode);
            await G.pause(450);
            did = true;
          }
          if (!did) break;
        }
      },
    };
    return ai;
  };
})(typeof window !== 'undefined' ? window : globalThis);
