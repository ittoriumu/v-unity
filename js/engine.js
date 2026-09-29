/* Jewels×Duel rules engine. DOM-free; talks to the UI through an optional `ui` object. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const NL = JD.LANES;

  class Game {
    /**
     * @param {{decks:object[][], ctrls:object[], first:number, ui?:object, names?:string[], rnd?:()=>number}} o
     * ctrl = { takeTurn(G,pi):Promise, choose(G,pi,spec):Promise|any }
     */
    constructor(o) {
      this.ui = o.ui || null;
      this.ctrls = o.ctrls;
      this.first = o.first || 0;
      this.turnPlayer = this.first;
      this.turnNo = 0;
      this.winner = null;
      this.logs = [];
      this._rnd = o.rnd || Math.random;
      const names = o.names || ['プレイヤー', 'CPU'];
      this.players = [0, 1].map((i) => this.mkPlayer(i, o.decks[i], names[i]));
      this.t = this.newTurnState();
    }

    rnd() { return this._rnd(); }
    pl(i) { return this.players[i]; }
    mkPlayer(i, deck, name) {
      const P = { idx: i, name, deck: [], hand: [], trash: [], lanes: [] };
      P.deck = JD.shuffle(deck.map((d) => this.mkInst(d, i)), () => this.rnd());
      for (let k = 0; k < NL; k++) P.lanes.push({ lumina: null, stage: null, jewels: [], showcase: k === JD.SHOWCASE, added: 0 });
      return P;
    }
    mkInst(def, owner) {
      const inst = { uid: JD.uid(), def, owner };
      this.resetInst(inst);
      return inst;
    }
    resetInst(inst) {
      inst.dye = null; inst.damage = 0; inst.up = true; inst.pP = 0; inst.pT = 0; inst.tP = 0; inst.tT = 0;
      inst.enterTurn = -2; inst.zoneTurn = -2;
    }
    newTurnState() {
      return { drawLeft: this.turnNo === 1 ? 1 : 2, flowLeft: 3, downLeft: 1, jplayLeft: 1, setupLeft: 1, acted: false, ending: false };
    }
    log(msg) { this.logs.push(msg); if (this.ui && this.ui.log) this.ui.log(msg); }
    changed() { if (this.ui && this.ui.render) this.ui.render(); }
    async pause(ms) { if (this.ui && this.ui.wait) await this.ui.wait(ms); }
    fx(kind, inst, text) { if (this.ui && this.ui.fx) this.ui.fx(kind, inst, text); }

    /* ---------- queries ---------- */
    luminas(i) { return this.pl(i).lanes.map((l) => l.lumina).filter(Boolean); }
    locate(inst) {
      for (let i = 0; i < 2; i++) { const L = this.pl(i).lanes; for (let k = 0; k < NL; k++) if (L[k].lumina === inst) return { pi: i, idx: k }; }
      return null;
    }
    inShowcase(inst) { const l = this.locate(inst); return !!(l && this.pl(l.pi).lanes[l.idx].showcase); }
    allJewels(pi) { return [].concat(...this.pl(pi).lanes.map((l) => l.jewels)); }
    jewelColors(inst) {
      const s = new Set();
      s.add(inst.dye || inst.def.color);
      for (const sc of inst.def.scripts || []) if (sc.trigger === 'static') for (const b of sc.body || []) if (b.t === 'sDye') s.add(b.p.color);
      return s;
    }
    colorCounts(jewels) {
      const cc = {}; JD.COLORS.forEach((c) => { cc[c] = 0; });
      for (const j of jewels) for (const c of this.jewelColors(j)) cc[c]++;
      return cc;
    }
    jewelColorCount(pi, color) { return this.colorCounts(this.allJewels(pi))[color]; }
    canAfford(def, jewels) {
      if (jewels.length < def.lv) return false;
      const cc = this.colorCounts(jewels);
      for (const c of JD.COLORS) if ((def.cost[c] || 0) > cc[c]) return false;
      return true;
    }
    countRace(pi, race, except) { return this.luminas(pi).filter((x) => x !== except && x.def.race === race).length; }

    /* ---------- stats ---------- */
    staticBonus(inst) {
      const loc = this.locate(inst);
      const r = { p: 0, t: 0 };
      if (!loc) return r;
      const P = this.pl(loc.pi), lane = P.lanes[loc.idx];
      const ctx = { G: this, pi: loc.pi, lumina: inst };
      for (const s of inst.def.scripts || []) if (s.trigger === 'static') for (const b of s.body || []) {
        if (b.t === 'sBuffIf' && JD.CONDS[b.p.cond].f(ctx, b.p)) { r.p += b.p.p; r.t += b.p.t; }
      }
      for (const L of this.luminas(loc.pi)) {
        if (L === inst) continue;
        const m = this.inShowcase(L) ? 2 : 1;
        for (const s of L.def.scripts || []) if (s.trigger === 'static') for (const b of s.body || []) {
          if (b.t === 'sLord' && b.p.race && inst.def.race === b.p.race) { r.p += b.p.p * m; r.t += b.p.t * m; }
        }
      }
      if (lane.stage) for (const s of lane.stage.def.scripts || []) if (s.trigger === 'static') for (const b of s.body || []) {
        if (b.t === 'sStageBuff') { r.p += b.p.p; r.t += b.p.t; }
      }
      return r;
    }
    mult(inst) { return this.inShowcase(inst) ? 2 : 1; }
    effP(inst) { const sb = this.staticBonus(inst); return Math.max(0, (inst.def.power + inst.pP + inst.tP + sb.p) * this.mult(inst)); }
    effT(inst) { const sb = this.staticBonus(inst); return Math.max(0, (inst.def.toughness + inst.pT + inst.tT + sb.t) * this.mult(inst)); }
    remainT(inst) { return this.effT(inst) - inst.damage; }
    canAttack(inst) { return !!(inst.up && inst.enterTurn !== this.turnNo && this.turnNo > 1); }

    /* ---------- choice ---------- */
    async choose(pi, spec) {
      if (!spec.cands || !spec.cands.length) return null;
      if (spec.cands.length === 1 && !spec.confirm) return spec.cands[0];
      return await this.ctrls[pi].choose(this, pi, spec);
    }

    /* ---------- zones ---------- */
    removeFromZone(inst) {
      const P = this.pl(inst.owner);
      let i = P.hand.indexOf(inst); if (i >= 0) { P.hand.splice(i, 1); return; }
      i = P.deck.indexOf(inst); if (i >= 0) { P.deck.splice(i, 1); return; }
      i = P.trash.indexOf(inst); if (i >= 0) { P.trash.splice(i, 1); return; }
      for (const l of P.lanes) {
        i = l.jewels.indexOf(inst); if (i >= 0) { l.jewels.splice(i, 1); return; }
        if (l.lumina === inst) { l.lumina = null; return; }
        if (l.stage === inst) { l.stage = null; return; }
      }
    }
    sendToTrash(inst) {
      this.resetInst(inst);
      this.pl(inst.owner).trash.push(inst);
      this.checkWin();
    }
    checkWin() {
      if (this.winner) return;
      const a = this.pl(0).trash.length >= JD.TRASH_LOSE, b = this.pl(1).trash.length >= JD.TRASH_LOSE;
      if (a && b) this.lose(1 - this.turnPlayer, 'トラッシュが10枚に到達');
      else if (a) this.lose(0, 'トラッシュが10枚に到達');
      else if (b) this.lose(1, 'トラッシュが10枚に到達');
    }
    lose(i, reason) {
      if (this.winner) return;
      this.winner = { idx: 1 - i, loser: i, reason };
      this.log(`${this.pl(i).name}の敗北（${reason}）`);
    }
    async draw(i, n) {
      const P = this.pl(i);
      for (let k = 0; k < n; k++) {
        if (this.winner) return;
        if (!P.deck.length) { this.lose(i, '山札切れ'); return; }
        P.hand.push(P.deck.shift());
      }
      this.log(`${P.name}はカードを${n}枚引いた`);
      this.changed();
    }
    mill(i, n) {
      const P = this.pl(i);
      for (let k = 0; k < n; k++) {
        if (this.winner) return;
        if (!P.deck.length) { this.lose(i, '山札切れ'); return; }
        this.sendToTrash(P.deck.shift());
      }
    }
    playerDamage(i, n, src) {
      if (n <= 0) return;
      this.log(`${this.pl(i).name}に${n}ダメージ`);
      this.fx('pdamage', i, n);
      this.mill(i, n);
    }
    damageLumina(inst, n, src) {
      if (n <= 0) return;
      inst.damage += n;
      this.fx('damage', inst, n);
    }
    bounce(inst) {
      const loc = this.locate(inst); if (!loc) return;
      this.pl(loc.pi).lanes[loc.idx].lumina = null;
      this.resetInst(inst);
      this.pl(inst.owner).hand.push(inst);
      this.log(`「${inst.def.name}」は手札に戻った`);
    }
    moveLumina(inst, to) {
      const loc = this.locate(inst); if (!loc) return;
      const L = this.pl(loc.pi).lanes;
      if (L[to].lumina) return;
      L[loc.idx].lumina = null; L[to].lumina = inst;
      this.log(`「${inst.def.name}」がレーン${to + 1}に移動した`);
    }
    addShowcase(pi, lane) {
      const P = this.pl(pi);
      if (P.lanes[lane].showcase || P.lanes.filter((l) => l.showcase).length >= JD.MAX_SHOWCASE) return;
      P.lanes[lane].showcase = true;
      this.log(`${P.name}のレーン${lane + 1}がショーケースになった`);
    }
    moveShowcase(pi, from, to) {
      const P = this.pl(pi);
      if (!P.lanes[from].showcase || P.lanes[to].showcase) return;
      P.lanes[from].showcase = false; P.lanes[to].showcase = true;
      if (P.lanes[from].stage) { this.log(`ステージ「${P.lanes[from].stage.def.name}」は破壊された`); const s = P.lanes[from].stage; P.lanes[from].stage = null; this.sendToTrash(s); }
      this.log(`${P.name}のショーケースがレーン${to + 1}に移動した`);
    }
    // put a card on top of a jewel area (showcase areas accept only 1 per turn)
    addJewel(pi, lane, inst) {
      const L = this.pl(pi).lanes[lane];
      if (L.showcase && L.added >= 1) { this.log(`ショーケースのジュエルエリアに置けず「${inst.def.name}」はトラッシュ`); this.sendToTrash(inst); return false; }
      L.added++;
      this.resetInst(inst);
      inst.zoneTurn = this.turnNo;
      L.jewels.push(inst);
      return true;
    }
    async destroy(inst) {
      const loc = this.locate(inst); if (!loc) return;
      const P = this.pl(loc.pi), lane = P.lanes[loc.idx];
      const showcase = lane.showcase;
      lane.lumina = null;
      this.log(`「${inst.def.name}」は破壊された`);
      this.fx('destroy', inst);
      this.sendToTrash(inst);
      await this.fireOn(inst, 'onDestroyed', { pi: loc.pi, laneIdx: loc.idx, showcase, lumina: inst });
      await this.fireStage(loc.pi, loc.idx, 'lumDestroyed', { lumina: inst });
    }

    /* ---------- scripts ---------- */
    async runBody(body, ctx) {
      for (const b of body || []) {
        if (this.winner) return;
        const d = JD.BLOCKS[b.t]; if (!d) continue;
        await d.run(b.p || {}, ctx, b);
        await this.settle();
        this.changed();
      }
    }
    async fireOn(inst, trig, x) {
      for (const s of inst.def.scripts || []) {
        if (s.trigger !== trig) continue;
        const times = inst.def.type === 'lumina' && x.showcase ? 2 : 1;
        for (let k = 0; k < times; k++) {
          if (this.winner) return;
          await this.runBody(s.body, { G: this, pi: x.pi, inst, lumina: x.lumina === undefined ? inst : x.lumina, laneIdx: x.laneIdx, ev: x });
        }
      }
    }
    async fireStage(pi, idx, trig, x) {
      const lane = this.pl(pi).lanes[idx];
      const st = lane.stage; if (!st) return;
      for (const s of st.def.scripts || []) {
        if (s.trigger !== trig) continue;
        if (this.winner) return;
        await this.runBody(s.body, { G: this, pi, inst: st, lumina: (x && x.lumina) || lane.lumina, laneIdx: idx, ev: x || {} });
      }
    }
    async settle() {
      for (let guard = 0; guard < 60; guard++) {
        if (this.winner) return;
        let acted = false;
        for (const i of [this.turnPlayer, 1 - this.turnPlayer]) {
          for (const lane of this.pl(i).lanes) {
            if (lane.lumina && this.remainT(lane.lumina) <= 0) { await this.destroy(lane.lumina); acted = true; if (this.winner) return; }
          }
        }
        this.checkWin();
        if (!acted) return;
      }
    }

    /* ---------- turn flow ---------- */
    async start() {
      for (const i of [0, 1]) await this.draw(i, JD.START_HAND);
      this.log('ゲーム開始！');
    }
    async beginTurn() {
      this.turnNo++;
      this.t = this.newTurnState();
      for (const P of this.players) for (const l of P.lanes) l.added = 0;
      const pi = this.turnPlayer;
      this.log(`--- ターン${this.turnNo}：${this.pl(pi).name} ---`);
      this.changed();
      for (let k = 0; k < NL; k++) {
        const lane = this.pl(pi).lanes[k];
        if (lane.lumina) await this.fireOn(lane.lumina, 'onTurn', { pi, laneIdx: k, showcase: lane.showcase });
        await this.fireStage(pi, k, 'onTurn', {});
      }
      await this.settle();
    }
    finishTurn() {
      for (const P of this.players) for (const l of P.lanes) if (l.lumina) { l.lumina.tP = 0; l.lumina.tT = 0; }
    }
    async run() {
      await this.start();
      this.turnPlayer = this.first;
      while (!this.winner) {
        await this.beginTurn();
        if (this.winner) break;
        await this.ctrls[this.turnPlayer].takeTurn(this, this.turnPlayer);
        if (this.winner) break;
        this.finishTurn();
        await this.settle();
        this.turnPlayer = 1 - this.turnPlayer;
        if (this.turnNo > 200) { this.winner = { idx: -1, reason: '引き分け' }; }
      }
      this.changed();
      return this.winner;
    }

    /* ---------- player actions ---------- */
    own(pi) { return !this.winner && this.turnPlayer === pi; }
    canSetup(pi) { return this.own(pi) && this.t.setupLeft > 0 && (!this.t.acted || this.t.ending); }
    async setup(pi, insts) {
      if (!this.canSetup(pi)) return false;
      this.t.setupLeft--;
      for (const x of insts) if (!x.up && this.locate(x)) x.up = true;
      this.log(`${this.pl(pi).name}はセットアップした（${insts.length}体）`);
      this.changed();
      return true;
    }
    async turnDraw(pi) {
      if (!this.own(pi) || this.t.drawLeft <= 0) return false;
      this.t.drawLeft--;
      await this.draw(pi, 1);
      return true;
    }
    canFlowTo(pi, lane) { const L = this.pl(pi).lanes[lane]; return !(L.showcase && L.added >= 1); }
    async jewelFlow(pi, inst, lane) {
      if (!this.own(pi) || this.t.flowLeft <= 0) return false;
      const P = this.pl(pi);
      if (!P.hand.includes(inst)) return false;
      P.hand.splice(P.hand.indexOf(inst), 1);
      this.t.flowLeft--; this.t.acted = true;
      this.log(`${P.name}はジュエルフロー（レーン${lane + 1}）`);
      this.addJewel(pi, lane, inst);
      await this.settle();
      this.changed();
      return true;
    }
    async jewelDown(pi, insts) {
      if (!this.own(pi) || this.t.downLeft <= 0 || !insts.length) return false;
      this.t.downLeft--; this.t.acted = true;
      const P = this.pl(pi);
      for (const x of insts) {
        for (let k = 0; k < NL; k++) {
          const l = P.lanes[k];
          if (l.lumina === x) { l.lumina = null; this.addJewel(pi, k, x); break; }
          if (l.stage === x) { l.stage = null; this.addJewel(pi, k, x); break; }
        }
      }
      this.log(`${P.name}はジュエルダウン（${insts.length}枚）`);
      await this.settle();
      this.changed();
      return true;
    }
    // Returns null when playable, else a reason string.
    checkPlay(pi, inst, from, lane) {
      if (!this.own(pi)) return '自分のターンではありません';
      const P = this.pl(pi), d = inst.def;
      if (from === 'jewel') {
        const src = P.lanes.findIndex((l) => l.jewels.includes(inst));
        if (src < 0) return 'そのカードはジュエルエリアにありません';
        if (d.type !== 'spell') lane = src; // must be played onto the lane its jewel area connects to
        if (this.t.jplayLeft <= 0) return 'ジュエルプレイは1ターンに1回です';
        if (inst.zoneTurn === this.turnNo) return 'このターンにジュエルエリアに置かれたカードはプレイできません';
      }
      const jewelsAll = this.allJewels(pi);
      if (d.type === 'lumina') {
        if (lane == null) return 'レーンを選んでください';
        if (P.lanes[lane].lumina) return 'そのレーンには既にルミナがいます';
        if (!this.canAfford(d, P.lanes[lane].jewels)) return `そのレーンのジュエルが足りません（LV${d.lv} ${JD.costTag(d)}）`;
      } else {
        if (d.type === 'stage') {
          if (lane == null) return 'ショーケースのレーンを選んでください';
          if (!P.lanes[lane].showcase) return 'ステージはショーケースにのみ出せます';
        }
        if (!this.canAfford(d, jewelsAll)) return `ジュエルが足りません（LV${d.lv} ${JD.costTag(d)}）`;
      }
      return null;
    }
    // from: 'hand' | 'jewel' ; lane: target lane (for jewel: the jewel area lane which is also the target)
    async play(pi, inst, from, lane) {
      const err = this.checkPlay(pi, inst, from, lane);
      if (err) return { ok: false, msg: err };
      const P = this.pl(pi), d = inst.def;
      if (from === 'hand') P.hand.splice(P.hand.indexOf(inst), 1);
      else {
        const src = P.lanes.findIndex((l) => l.jewels.includes(inst));
        P.lanes[src].jewels.splice(P.lanes[src].jewels.indexOf(inst), 1); this.t.jplayLeft--;
        if (d.type !== 'spell') lane = src;
      }
      this.t.acted = true;
      this.log(`${P.name}は「${d.name}」を${from === 'jewel' ? 'ジュエルプレイ' : 'プレイ'}`);
      if (this.ui && this.ui.announce) await this.ui.announce(inst, pi);
      if (d.type === 'lumina') {
        this.resetInst(inst); inst.enterTurn = this.turnNo;
        P.lanes[lane].lumina = inst;
        this.changed();
        await this.fireOn(inst, 'onPlay', { pi, laneIdx: lane, showcase: P.lanes[lane].showcase, lumina: inst });
        await this.fireStage(pi, lane, 'lumEnter', { lumina: inst });
      } else if (d.type === 'stage') {
        this.resetInst(inst);
        const old = P.lanes[lane].stage;
        P.lanes[lane].stage = inst;
        if (old) { this.log(`ステージ「${old.def.name}」は置き換えられた`); this.sendToTrash(old); }
        this.changed();
        await this.fireStage(pi, lane, 'onPlay', {});
      } else {
        this.resetInst(inst);
        for (const s of d.scripts || []) {
          if (s.trigger !== 'onCast') continue;
          await this.runBody(s.body, { G: this, pi, inst, lumina: null, laneIdx: null, ev: {} });
        }
        this.sendToTrash(inst);
      }
      await this.settle();
      this.changed();
      return { ok: true };
    }
    // mode: 'lumina' | 'direct'
    async attack(pi, lane, mode) {
      if (!this.own(pi)) return false;
      const P = this.pl(pi), O = this.pl(1 - pi);
      const atk = P.lanes[lane].lumina;
      if (!atk || !this.canAttack(atk)) return false;
      this.t.acted = true;
      atk.up = false;
      const showcase = P.lanes[lane].showcase;
      this.log(`${P.name}の「${atk.def.name}」がアタック！`);
      this.fx('attack', atk);
      this.changed();
      await this.pause(350);
      await this.fireOn(atk, 'onAttack', { pi, laneIdx: lane, showcase, lumina: atk });
      await this.fireStage(pi, lane, 'lumAttack', { lumina: atk });
      await this.settle();
      if (this.winner || P.lanes[lane].lumina !== atk) return true;
      const dfn = O.lanes[lane].lumina;
      const power = this.effP(atk);
      if (dfn && (mode === 'lumina' || dfn.up)) {
        this.log(`「${atk.def.name}」→「${dfn.def.name}」に${power}ダメージ`);
        this.damageLumina(dfn, power, { inst: atk });
        this.changed();
        if (power > 0) await this.fireOn(atk, 'onHit', { pi, laneIdx: lane, showcase, lumina: atk, target: dfn });
        await this.settle();
      } else {
        this.log(`「${atk.def.name}」のダイレクトアタック！${power}ダメージ`);
        this.playerDamage(1 - pi, power, { inst: atk });
        this.changed();
        if (!this.winner) await this.fireOn(atk, 'onDirect', { pi, laneIdx: lane, showcase, lumina: atk });
        await this.settle();
      }
      this.changed();
      return true;
    }
  }

  JD.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
