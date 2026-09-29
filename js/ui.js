/* Game screen: board rendering, human input, effects. Talks to JD.Game through the `ui` hooks. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const CI = JD.CI, esc = JD.esc;
  const $ = (s, r) => (r || document).querySelector(s);

  class GameUI {
    constructor() {
      this.el = $('#v-game');
      this.G = null; this.dead = true;
      this.sel = null; this.mode = null; this.multi = new Set(); this.pending = null; this.busy = false;
      this.attackMenu = null; this.endAfter = false; this.lw = 120; this.speed = 1;
      this.bound = false;
    }

    /* ---------------- lifecycle ---------------- */
    bind() {
      if (this.bound) return; this.bound = true;
      const board = $('#board'), hand = $('#handRow');
      board.addEventListener('click', (e) => this.onBoardClick(e));
      hand.addEventListener('click', (e) => this.onHandClick(e));
      $('#turnBar').addEventListener('click', (e) => this.onBarClick(e));
      $('#promptBar').addEventListener('click', (e) => { const b = e.target.closest('[data-pi]'); if (b && this.prompt && this.prompt.btns[+b.dataset.pi]) this.prompt.btns[+b.dataset.pi].fn(); });
      this.el.addEventListener('mouseover', (e) => this.onHover(e));
      this.el.addEventListener('touchstart', (e) => this.onHover(e), { passive: true });
      $('#btnSurrender').addEventListener('click', async () => { if (this.G && !this.G.winner && await JD.confirm('投了しますか？')) { this.G.lose(0, '投了'); this.finish(); } });
      $('#btnLeave').addEventListener('click', async () => { if (await JD.confirm('対戦を終了してメニューに戻りますか？')) { this.stop(); JD.go('title'); } });
      window.addEventListener('resize', () => this.fit());
    }
    stop() {
      this.dead = true;
      if (this.G && !this.G.winner) this.G.winner = { idx: -1, reason: '中断' };
      if (this.turnResolve) this.turnResolve();
      if (this.pending) { this.pending.res(null); this.pending = null; }
      if (this.pickerRes) this.pickerRes(null);
    }
    async start(cfg) {
      this.bind();
      this.stop();
      this.cfg = cfg;
      this.dead = false;
      this.speed = cfg.speed === 'fast' ? 0.3 : 1;
      this.sel = null; this.mode = null; this.multi = new Set(); this.pending = null; this.busy = true; this.attackMenu = null;
      $('#log').innerHTML = '';
      $('#detail').innerHTML = '<p class="dim">カードにカーソルを合わせると詳細が表示されます。</p>';
      const first = cfg.first === 'me' ? 0 : cfg.first === 'cpu' ? 1 : (Math.random() < 0.5 ? 0 : 1);
      const ai = JD.makeAI(cfg.level);
      const G = new JD.Game({ decks: [JD.deckDefs(cfg.myList), JD.deckDefs(cfg.cpuList)], ctrls: [this.humanCtrl(), ai], first, ui: this, names: ['あなた', 'CPU'] });
      this.G = G;
      this.fit();
      this.render(true);
      this.log(first === 0 ? 'あなたが先攻です' : 'CPUが先攻です');
      try { await G.run(); } catch (err) { console.error(err); JD.toast('エラーが発生しました: ' + err.message); }
      if (!this.dead) this.finish();
    }
    finish() {
      const G = this.G;
      if (this.turnResolve) this.turnResolve();
      this.busy = true; this.render(true);
      const w = G.winner;
      if (!w || this.dead) return;
      const win = w.idx === 0;
      JD.modal(`<div class="result ${win ? 'win' : 'lose'}"><h2>${win ? '勝利！' : w.idx === 1 ? '敗北…' : '引き分け'}</h2><p>${esc(w.reason)}</p>
        <p class="dim">ターン数：${G.turnNo}　あなたのトラッシュ：${G.pl(0).trash.length}／CPUのトラッシュ：${G.pl(1).trash.length}</p>
        <div class="btnrow"><button class="btn primary" id="rAgain">もう一度</button><button class="btn" id="rMenu">メニューへ</button></div></div>`, { closable: false });
      $('#rAgain').onclick = () => { JD.closeModal(); this.start(this.cfg); };
      $('#rMenu').onclick = () => { JD.closeModal(); this.stop(); JD.go('title'); };
    }
    humanCtrl() {
      return {
        takeTurn: (G) => new Promise((res) => { this.turnResolve = res; this.busy = false; this.sel = null; this.mode = null; this.render(true); }),
        choose: (G, pi, spec) => this.choose(spec),
      };
    }

    /* ---------------- hooks called by the engine ---------------- */
    render(now) {
      if (now) { this._draw(); return; }
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
    }
    log(msg) {
      const el = $('#log'); if (!el) return;
      const d = document.createElement('div'); d.textContent = msg;
      if (/^---/.test(msg)) d.className = 'turn';
      el.appendChild(d);
      while (el.childNodes.length > 300) el.removeChild(el.firstChild);
      el.scrollTop = el.scrollHeight;
    }
    wait(ms) { return new Promise((r) => { if (this.dead) return r(); setTimeout(r, ms * this.speed); }); }
    async announce(inst, pi) {
      if (this.dead) return;
      const L = $('#fxLayer'), el = document.createElement('div');
      el.className = 'announce ' + (pi === 0 ? 'mine' : 'opp');
      el.innerHTML = `<div style="--cw:160px">${JD.cardHTML(inst.def, { cls: 'big' })}</div>`;
      L.appendChild(el);
      await this.wait(pi === 0 ? 500 : 1000);
      el.classList.add('out');
      await this.wait(180);
      el.remove();
    }
    fx(kind, target, val) {
      if (this.dead) return;
      let node = null;
      if (typeof target === 'number') node = $(`.side[data-side="${target === 0 ? 'me' : 'opp'}"]`);
      else if (target && target.uid) node = $(`#board [data-uid="${target.uid}"]`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      const d = document.createElement('div');
      d.className = 'fx ' + kind;
      d.textContent = kind === 'destroy' ? '✦' : kind === 'attack' ? '⚔' : '-' + val;
      d.style.left = r.left + r.width / 2 + 'px'; d.style.top = r.top + r.height / 2 + 'px';
      $('#fxLayer').appendChild(d);
      setTimeout(() => d.remove(), 1000);
      if (kind === 'pdamage') { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 400); }
    }

    /* ---------------- choices ---------------- */
    choose(spec) {
      return new Promise((res) => {
        if (this.dead) return res(null);
        if (spec.kind === 'card') { this.openPicker(spec).then(res); return; }
        this.pending = { spec, res };
        this.sel = null; this.mode = null; this.attackMenu = null;
        this.render(true);
      });
    }
    openPicker(spec) {
      return new Promise((res) => {
        this.pickerRes = res;
        const html = `<h3>${esc(spec.prompt || 'カードを選択')}</h3><div class="picker">${spec.cands.map((c, i) => `<div class="pk" data-i="${i}" style="--cw:120px">${JD.cardHTML(c.def, { cls: 'pick' })}</div>`).join('')}</div>`;
        JD.modal(html, { closable: false, wide: true });
        $('#modalBody').querySelectorAll('.pk').forEach((n) => { n.onclick = () => { JD.closeModal(); this.pickerRes = null; res(spec.cands[+n.dataset.i]); }; });
      });
    }
    resolvePending(v) { const p = this.pending; this.pending = null; if (p) p.res(v); this.render(true); }

    /* ---------------- helpers ---------------- */
    findInst(uid) {
      const G = this.G; if (!G) return null;
      for (const P of G.players) {
        for (const c of P.hand.concat(P.trash, P.deck)) if (c.uid === uid) return c;
        for (const l of P.lanes) {
          if (l.lumina && l.lumina.uid === uid) return l.lumina;
          if (l.stage && l.stage.uid === uid) return l.stage;
          for (const j of l.jewels) if (j.uid === uid) return j;
        }
      }
      return null;
    }
    myTurn() { const G = this.G; return G && !G.winner && G.turnPlayer === 0 && !this.dead; }
    canAct() { return this.myTurn() && !this.busy && !this.pending; }
    selInst() { return this.sel ? this.findInst(this.sel) : null; }
    toast(m) { JD.toast(m); }

    fit() {
      const g = $('.g-wrap'); if (!g) return;
      const wide = window.innerWidth >= 1000;
      const availW = Math.min(window.innerWidth - (wide ? 320 : 10), 1500) - 12;
      const availH = window.innerHeight - 250;
      const byW = availW / 6.05;
      const byH = availH / 5.95;
      this.lw = Math.max(46, Math.min(byW, byH, 170));
      g.style.setProperty('--lw', this.lw + 'px');
    }

    /* ---------------- drawing ---------------- */
    _draw() {
      const G = this.G; if (!G) return;
      this.renderInfo();
      this.renderBoard();
      this.renderHand();
      this.renderBar();
      this.renderPrompt();
    }
    renderInfo() {
      const G = this.G;
      const opp = G.pl(1), me = G.pl(0);
      $('#oppInfo').innerHTML = `<span class="nm">CPU</span><span class="hb">手札 ${opp.hand.length}</span><span class="hb">山札 ${opp.deck.length}</span><span class="hb tr ${opp.trash.length >= 8 ? 'danger' : ''}">トラッシュ ${opp.trash.length}/${JD.TRASH_LOSE}</span><span class="cards">${'<i class="mini-back"></i>'.repeat(Math.min(opp.hand.length, 12))}</span><span class="turnflag ${G.turnPlayer === 1 && !G.winner ? 'on' : ''}">${G.turnPlayer === 1 && !G.winner ? 'CPUのターン' : ''}</span>`;
    }
    jchip(j, pi, n) {
      const cols = [...this.G.jewelColors(j)];
      const c1 = cols[0], c2 = cols[1];
      const h = Math.max(4, Math.min(this.lw * 0.15, (this.lw * 0.62) / Math.max(1, n)));
      return `<i class="jw c-${c1}" data-uid="${j.uid}" style="height:${h.toFixed(1)}px;${c2 ? `--c2:${CI[c2].hex}` : ''}" ${c2 ? 'data-dual="1"' : ''}>${CI[c1].k}</i>`;
    }
    renderBoard() {
      const G = this.G, sel = this.selInst(), pend = this.pending && this.pending.spec;
      const myFlowOk = this.canAct() && G.t.flowLeft > 0;
      const rows = { oJ: '', oL: '', mL: '', mJ: '' };
      for (let k = 0; k < JD.LANES; k++) {
        for (const pi of [1, 0]) {
          const P = G.pl(pi), L = P.lanes[k], side = pi === 0 ? 'me' : 'opp';
          // jewel area
          const n = L.jewels.length;
          const order = pi === 0 ? L.jewels.slice().reverse() : L.jewels.slice();
          const cc = G.colorCounts(L.jewels);
          const sum = JD.COLORS.filter((c) => cc[c]).map((c) => `<b class="c-${c}">${cc[c]}</b>`).join('');
          let jc = 'jarea ' + side + (L.showcase ? ' sc' : '');
          if (sel && sel.owner === 0 && G.pl(0).hand.includes(sel)) {
            if (pi === 0 && myFlowOk) jc += ' flowok';
            if (pi === 0 && sel.def.type === 'lumina' && !L.lumina && G.canAfford(sel.def, L.jewels)) jc += ' reach';
          }
          if (pend && pend.kind === 'lane' && pend.where === 'jewel' && pend.side === pi && pend.cands.includes(k)) jc += ' cand';
          const jhtml = `<div class="${jc}" data-jarea="${pi}:${k}"><div class="jsum">${sum}<em>${n || ''}</em></div><div class="jstack ${side}">${order.map((j) => this.jchip(j, pi, n)).join('')}</div></div>`;
          // lumina slot
          let sc = 'slot ' + side + (L.showcase ? ' sc' : '');
          const inst = L.lumina;
          if (sel && pi === 0 && this.canAct() && G.pl(0).hand.includes(sel)) {
            const d = sel.def;
            if ((d.type === 'lumina' || d.type === 'stage') && !G.checkPlay(0, sel, 'hand', k)) sc += ' playok';
          }
          if (pend && pend.kind === 'lumina' && inst && pend.cands.includes(inst)) sc += ' cand';
          if (pend && pend.kind === 'lane' && pend.where === 'field' && pend.side === pi && pend.cands.includes(k)) sc += ' cand';
          if (this.attackMenu && pi === 0 && this.attackMenu.lane === k) sc += ' atksel';
          if (this.mode === 'setup' && pi === 0 && inst && !inst.up) sc += ' pickable' + (this.multi.has(inst.uid) ? ' picked' : '');
          if (this.mode === 'down' && pi === 0 && (inst || L.stage)) sc += ' pickable';
          const st = L.stage;
          let band;
          if (st) band = `<div class="sband st ${this.mode === 'down' && pi === 0 && this.multi.has(st.uid) ? 'picked' : ''}" data-uid="${st.uid}" title="${esc(st.def.name)}"><span>${esc(st.def.name)}</span></div>`;
          else band = L.showcase ? '<div class="sband scl"><span>★ SHOWCASE</span></div>' : '<div class="sband none"></div>';
          let card;
          if (inst) {
            const m = L.showcase ? 2 : 1;
            const stats = { p: G.effP(inst), t: G.effT(inst), dmg: inst.damage, bp: inst.def.power * m, bt: inst.def.toughness * m };
            const frozen = inst.enterTurn === G.turnNo;
            const picked = (this.mode === 'setup' || this.mode === 'down') && this.multi.has(inst.uid);
            card = JD.cardHTML(inst.def, { cls: 'field' + (inst.up ? '' : ' down') + (frozen ? ' frozen' : '') + (picked ? ' picked' : '') + (pi === 0 && this.canAct() && G.canAttack(inst) ? ' ready' : ''), attr: `data-uid="${inst.uid}"`, stats });
          } else card = `<div class="empty-slot">${k + 1}</div>`;
          const shtml = `<div class="${sc}" data-slot="${pi}:${k}">${band}<div class="slotcard">${card}</div></div>`;
          if (pi === 1) { rows.oJ += jhtml; rows.oL += shtml; } else { rows.mL += shtml; rows.mJ += jhtml; }
        }
      }
      const sideCol = (pi) => {
        const P = G.pl(pi), tn = P.trash.length;
        return `<div class="side ${pi === 0 ? 'me' : 'opp'}" data-side="${pi === 0 ? 'me' : 'opp'}"><div class="pile deck"><b>${P.deck.length}</b><span>山札</span></div><div class="pile trash ${tn >= 8 ? 'danger' : ''}" data-trash="${pi}"><b>${tn}<small>/${JD.TRASH_LOSE}</small></b><span>トラッシュ</span><div class="tbar"><i style="width:${Math.min(100, tn * 10)}%"></i></div></div></div>`;
      };
      $('#board').innerHTML = rows.oJ + rows.oL + rows.mL + rows.mJ + `<div class="sidecell sideO">${sideCol(1)}</div><div class="sidecell sideM">${sideCol(0)}</div>`;
    }
    playableHand(c) {
      const G = this.G, d = c.def;
      if (!this.canAct()) return false;
      if (d.type === 'lumina') return [0, 1, 2, 3, 4].some((k) => !G.checkPlay(0, c, 'hand', k));
      if (d.type === 'stage') return [0, 1, 2, 3, 4].some((k) => G.pl(0).lanes[k].showcase && !G.checkPlay(0, c, 'hand', k));
      return !G.checkPlay(0, c, 'hand', null);
    }
    renderHand() {
      const G = this.G, P = G.pl(0);
      $('#handRow').innerHTML = P.hand.map((c) => `<div class="hcard ${this.sel === c.uid ? 'sel' : ''} ${this.playableHand(c) ? 'playable' : ''}" data-uid="${c.uid}" data-hand="1">${JD.cardHTML(c.def, { cls: 'inhand' })}</div>`).join('') || '<p class="dim pad">手札がありません</p>';
    }
    renderBar() {
      const G = this.G, t = G.t, mine = this.myTurn();
      const dim = (b) => (mine && !this.busy && !this.pending && b ? '' : 'disabled');
      const downs = G.luminas(0).some((x) => !x.up);
      const anyField = G.pl(0).lanes.some((l) => l.lumina || l.stage);
      $('#turnBar').innerHTML = `<div class="tb-info"><b>ターン${G.turnNo}</b> ${G.winner ? '終了' : G.turnPlayer === 0 ? 'あなたの番' : 'CPUの番'}</div>
        <div class="tb-cnt"><span title="ターンドロー">ドロー<b>${mine ? t.drawLeft : '-'}</b></span><span title="ジュエルフロー">フロー<b>${mine ? t.flowLeft : '-'}</b></span><span title="ジュエルダウン">ダウン<b>${mine ? t.downLeft : '-'}</b></span><span title="ジュエルプレイ">Jプレイ<b>${mine ? t.jplayLeft : '-'}</b></span><span title="セットアップ">セットアップ<b>${mine ? t.setupLeft : '-'}</b></span></div>
        <div class="tb-btns">
          <button class="btn sm" data-act="draw" ${dim(t.drawLeft > 0)}>ドロー</button>
          <button class="btn sm" data-act="setup" ${dim(G.canSetup(0))}>セットアップ</button>
          <button class="btn sm" data-act="down" ${dim(t.downLeft > 0 && anyField)}>ジュエルダウン</button>
          <button class="btn sm primary" data-act="end" ${dim(true)}>ターン終了</button>
        </div>`;
    }
    renderPrompt() {
      const G = this.G, el = $('#promptBar');
      let text = '', btns = [];
      const mk = (label, fn, cls) => btns.push({ label, fn, cls });
      if (this.pending) text = this.pending.spec.prompt || '対象を選んでください';
      else if (this.mode === 'setup') {
        text = `セットアップ：アップするルミナを選んでください（${this.multi.size}体選択）`;
        mk('全てアップ', () => { G.luminas(0).filter((x) => !x.up).forEach((x) => this.multi.add(x.uid)); this.render(true); });
        mk('決定', () => this.doSetup(), 'primary'); mk('キャンセル', () => { this.mode = null; this.multi.clear(); this.endAfter = false; this.render(true); });
      } else if (this.mode === 'down') {
        text = `ジュエルダウン：ジュエルエリアに戻すカードを選んでください（${this.multi.size}枚）`;
        mk('決定', () => this.doDown(), 'primary'); mk('キャンセル', () => { this.mode = null; this.multi.clear(); this.render(true); });
      } else if (this.mode === 'endConfirm') {
        text = 'ダウンしているルミナがいます。セットアップ（アップ）してからターンを終了しますか？（アップしたルミナは相手のダイレクトアタックを防ぎます）';
        mk('セットアップして終了', () => { G.t.ending = true; this.mode = 'setup'; this.endAfter = true; this.multi = new Set(G.luminas(0).filter((x) => !x.up).map((x) => x.uid)); this.render(true); }, 'primary');
        mk('そのまま終了', () => this.endTurn()); mk('戻る', () => { this.mode = null; this.render(true); });
      } else if (this.attackMenu) {
        const am = this.attackMenu;
        const inst = G.pl(0).lanes[am.lane].lumina;
        text = `「${inst ? inst.def.name : ''}」でアタック：`;
        for (const o of am.opts) mk(o === 'lumina' ? 'ルミナアタック' : 'ダイレクトアタック', () => this.doAttack(am.lane, o), 'primary');
        mk('キャンセル', () => { this.attackMenu = null; this.render(true); });
      } else if (this.sel && this.canAct()) {
        const c = this.selInst(); if (c) {
          const d = c.def, inHand = G.pl(0).hand.includes(c);
          text = `「${d.name}」（LV${d.lv}・${JD.costTag(d)}）を選択中。`;
          if (inHand) {
            if (d.type === 'lumina') text += '空いているレーン（緑枠）をクリックでプレイ／ジュエルエリアをクリックでジュエルフロー。';
            else if (d.type === 'stage') text += 'ショーケースのレーンをクリックでプレイ／ジュエルエリアをクリックでジュエルフロー。';
            else { text += 'ジュエルエリアをクリックでジュエルフロー。'; mk('スペルを使う', () => this.doPlay(c, 'hand', null), 'primary'); }
          }
          mk('選択解除', () => { this.sel = null; this.render(true); });
        }
      }
      this.prompt = { text, btns };
      el.classList.toggle('hidden', !text);
      el.innerHTML = text ? `<span class="pt">${esc(text)}</span>${btns.map((b, i) => `<button class="btn sm ${b.cls || ''}" data-pi="${i}">${esc(b.label)}</button>`).join('')}` : '';
    }

    /* ---------------- input ---------------- */
    onHover(e) {
      const n = e.target.closest && e.target.closest('[data-uid]');
      if (!n) return;
      const inst = this.findInst(+n.dataset.uid);
      if (inst) { $('#detail').innerHTML = JD.detailHTML(inst.def, inst, this.G); this._detailUid = inst.uid; }
    }
    onHandClick(e) {
      const n = e.target.closest('[data-hand]'); if (!n || !this.canAct()) return;
      const uid = +n.dataset.uid;
      this.mode = null; this.multi.clear(); this.attackMenu = null;
      this.sel = this.sel === uid ? null : uid;
      const inst = this.findInst(uid); if (inst) $('#detail').innerHTML = JD.detailHTML(inst.def, inst, this.G);
      this.render(true);
    }
    async onBarClick(e) {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled || !this.canAct()) return;
      const G = this.G, a = b.dataset.act;
      this.sel = null; this.attackMenu = null;
      if (a === 'draw') await this.act(() => G.turnDraw(0));
      else if (a === 'setup') {
        if (!G.luminas(0).some((x) => !x.up)) { this.toast('ダウンしているルミナがいません'); return; }
        this.mode = 'setup'; this.multi = new Set(); this.render(true);
      } else if (a === 'down') { this.mode = 'down'; this.multi = new Set(); this.render(true); }
      else if (a === 'end') {
        if (G.t.setupLeft > 0 && G.luminas(0).some((x) => !x.up)) { this.mode = 'endConfirm'; this.render(true); }
        else this.endTurn();
      }
    }
    endTurn() {
      this.mode = null; this.sel = null; this.multi.clear(); this.attackMenu = null; this.endAfter = false;
      this.busy = true; this.render(true);
      if (this.turnResolve) { const r = this.turnResolve; this.turnResolve = null; r(); }
    }
    async doSetup() {
      const G = this.G, list = [...this.multi].map((u) => this.findInst(u)).filter(Boolean);
      const end = this.endAfter;
      if (!list.length && !end) { this.toast('ルミナを選んでください'); return; }
      this.mode = null; this.multi.clear(); this.endAfter = false;
      await this.act(() => G.setup(0, list));
      if (end) this.endTurn();
    }
    async doDown() {
      const G = this.G, list = [...this.multi].map((u) => this.findInst(u)).filter(Boolean);
      if (!list.length) { this.toast('カードを選んでください'); return; }
      this.mode = null; this.multi.clear();
      await this.act(() => G.jewelDown(0, list));
    }
    async doAttack(lane, mode) {
      this.attackMenu = null;
      await this.act(() => this.G.attack(0, lane, mode));
    }
    async doPlay(inst, from, lane) {
      const G = this.G;
      const err = G.checkPlay(0, inst, from, lane);
      if (err) { this.toast(err); return; }
      await this.act(async () => { const r = await G.play(0, inst, from, lane); if (!r.ok) this.toast(r.msg); });
    }
    async act(fn) {
      if (this.busy) return;
      this.busy = true; this.sel = null; this.attackMenu = null;
      this.render(true);
      try { await fn(); } catch (err) { console.error(err); this.toast('エラー: ' + err.message); }
      this.busy = false;
      if (this.G.winner) { if (this.turnResolve) { const r = this.turnResolve; this.turnResolve = null; r(); } }
      this.render(true);
    }
    async onBoardClick(e) {
      const G = this.G; if (!G) return;
      const slotEl = e.target.closest('[data-slot]'), jEl = e.target.closest('[data-jarea]'), trEl = e.target.closest('[data-trash]');
      const bandEl = e.target.closest('.sband.st');
      if (trEl) { this.showTrash(+trEl.dataset.trash); return; }
      const parse = (el, k) => el.dataset[k].split(':').map(Number);
      // --- pending target choice ---
      if (this.pending) {
        const sp = this.pending.spec;
        if (sp.kind === 'lumina' && slotEl) {
          const [pi, k] = parse(slotEl, 'slot'); const inst = G.pl(pi).lanes[k].lumina;
          if (inst && sp.cands.includes(inst)) this.resolvePending(inst);
        } else if (sp.kind === 'lane') {
          const el = sp.where === 'jewel' ? jEl : slotEl;
          if (el) { const [pi, k] = parse(el, sp.where === 'jewel' ? 'jarea' : 'slot'); if (pi === sp.side && sp.cands.includes(k)) this.resolvePending(k); }
        }
        return;
      }
      if (!this.canAct()) return;
      // --- jewel area ---
      if (jEl) {
        const [pi, k] = parse(jEl, 'jarea');
        if (this.mode) return;
        const sel = this.selInst();
        if (pi === 0 && sel && G.pl(0).hand.includes(sel)) {
          if (G.t.flowLeft <= 0) { this.toast('ジュエルフローはもうできません'); return; }
          if (!G.canFlowTo(0, k) && !(await JD.confirm('ショーケースのジュエルエリアには1ターンに1枚までです。置くとそのカードはトラッシュされます。実行しますか？'))) return;
          await this.act(() => G.jewelFlow(0, sel, k));
          return;
        }
        this.openJewelModal(pi, k);
        return;
      }
      if (!slotEl) return;
      const [pi, k] = parse(slotEl, 'slot');
      const L = G.pl(pi).lanes[k];
      if (pi === 1) return;
      // --- own slot ---
      if (this.mode === 'setup') {
        const x = L.lumina; if (x && !x.up) { if (this.multi.has(x.uid)) this.multi.delete(x.uid); else this.multi.add(x.uid); this.render(true); }
        return;
      }
      if (this.mode === 'down') {
        const x = bandEl && L.stage ? L.stage : (L.lumina || L.stage);
        if (x) { if (this.multi.has(x.uid)) this.multi.delete(x.uid); else this.multi.add(x.uid); this.render(true); }
        return;
      }
      if (this.mode) return;
      const sel = this.selInst();
      if (sel && G.pl(0).hand.includes(sel)) {
        if (sel.def.type === 'spell') { this.toast('スペルは「スペルを使う」ボタンで使用します'); return; }
        await this.doPlay(sel, 'hand', k);
        return;
      }
      const x = L.lumina;
      if (x) this.beginAttack(k);
    }
    beginAttack(k) {
      const G = this.G, x = G.pl(0).lanes[k].lumina, o = G.pl(1).lanes[k].lumina;
      if (G.turnNo <= 1) { this.toast('先攻の最初のターンはアタックできません'); return; }
      if (x.enterTurn === G.turnNo) { this.toast('登場したターンはアタックできません（ステージフリーズ）'); return; }
      if (!x.up) { this.toast('ダウンしているルミナはアタックできません'); return; }
      const opts = !o ? ['direct'] : o.up ? ['lumina'] : ['lumina', 'direct'];
      this.attackMenu = { lane: k, opts };
      this.render(true);
    }
    openJewelModal(pi, k) {
      const G = this.G, L = G.pl(pi).lanes[k];
      if (!L.jewels.length) { this.toast('ジュエルがありません'); return; }
      const mine = pi === 0;
      const cards = L.jewels.slice().reverse();
      const items = cards.map((c, i) => {
        let can = '';
        if (mine) {
          const from = 'jewel';
          const err = c.def.type === 'lumina' || c.def.type === 'stage' ? G.checkPlay(0, c, from, k) : G.checkPlay(0, c, from, null);
          can = err ? `<div class="pk-note">${esc(err)}</div>` : '<button class="btn sm primary pk-go">ジュエルプレイ</button>';
        }
        const cols = [...G.jewelColors(c)].map((x) => CI[x].n).join('/');
        return `<div class="pk" data-i="${i}"><div style="--cw:110px">${JD.cardHTML(c.def, { cls: 'pick' })}</div><div class="pk-col">ジュエル色：${cols}</div>${can}</div>`;
      });
      JD.modal(`<h3>${mine ? 'あなた' : 'CPU'}のジュエルエリア（レーン${k + 1}）　${L.jewels.length}枚${L.showcase ? '・ショーケース' : ''}</h3><p class="dim">上のカードほど新しく置かれたものです。${mine ? 'ジュエルプレイは1ターンに1回、このターンに置いたカードは使えません。' : ''}</p><div class="picker">${items.join('')}</div>`, { wide: true });
      $('#modalBody').querySelectorAll('.pk').forEach((n) => {
        const c = cards[+n.dataset.i];
        n.addEventListener('mouseover', () => { $('#detail').innerHTML = JD.detailHTML(c.def, c, G); });
        const go = n.querySelector('.pk-go');
        if (go) go.onclick = () => { JD.closeModal(); const d = c.def; this.doPlay(c, 'jewel', d.type === 'spell' ? null : k); };
      });
    }
    showTrash(pi) {
      const G = this.G, P = G.pl(pi);
      const cards = P.trash.slice().reverse();
      JD.modal(`<h3>${pi === 0 ? 'あなた' : 'CPU'}のトラッシュ　${cards.length}／${JD.TRASH_LOSE}</h3><div class="picker">${cards.map((c) => `<div class="pk" style="--cw:90px">${JD.cardHTML(c.def, { cls: 'pick' })}</div>`).join('') || '<p class="dim">空です</p>'}</div>`, { wide: true });
    }
  }

  JD.gameUI = new GameUI();
})(typeof window !== 'undefined' ? window : globalThis);
