/* App shell: router, modal/toast helpers, title / setup / rules views. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const CI = JD.CI, esc = JD.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------- helpers ---------- */
  JD.toast = function (msg) {
    const t = $('#toast'), d = document.createElement('div');
    d.textContent = msg; t.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2600);
    setTimeout(() => d.remove(), 3100);
  };
  JD.modal = function (html, o) {
    o = o || {};
    const m = $('#modal');
    $('#modalBody').innerHTML = html;
    $('#modalBox').classList.toggle('wide', !!o.wide);
    $('#modalX').classList.toggle('hidden', o.closable === false);
    m.classList.remove('hidden');
    m._closable = o.closable !== false;
  };
  JD.closeModal = function () {
    $('#modal').classList.add('hidden'); $('#modalBody').innerHTML = '';
    if (JD.onModalClose) { const f = JD.onModalClose; JD.onModalClose = null; f(); }
  };
  JD.confirm = function (msg) {
    return new Promise((res) => {
      JD.modal(`<p class="cfm">${esc(msg)}</p><div class="btnrow"><button class="btn primary" id="cfY">はい</button><button class="btn" id="cfN">いいえ</button></div>`, { closable: false });
      $('#cfY').onclick = () => { JD.closeModal(); res(true); };
      $('#cfN').onclick = () => { JD.closeModal(); res(false); };
    });
  };
  JD.download = function (name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* ---------- router ---------- */
  let current = 'title';
  JD.views = {
    title: { enter() {} },
    setup: { enter() { setup.enter(); } },
    game: { enter() { JD.gameUI.fit(); } },
    cards: { enter(p) { JD.deckView.enter(p); } },
    editor: { enter(p) { JD.editor.enter(p); } },
    rules: { enter() {} },
  };
  JD.go = async function (name, params, force) {
    if (current === 'game' && name !== 'game' && !force) {
      const g = JD.gameUI;
      if (g.G && !g.dead && !g.G.winner) { if (!(await JD.confirm('対戦中です。メニューに戻りますか？（対戦は中断されます）'))) return; }
      g.stop();
    }
    if (current === 'editor' && name !== 'editor' && JD.editor.dirty && !(await JD.confirm('保存していない編集内容があります。移動しますか？'))) return;
    current = name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + name));
    $$('#nav [data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    document.body.dataset.view = name;
    window.scrollTo(0, 0);
    JD.views[name].enter(params);
  };

  /* ---------- CPU setup ---------- */
  const setup = {
    st: null,
    enter() {
      this.st = JD.store.settings();
      const decks = JD.allDecks();
      if (!decks.find((d) => d.id === this.st.myDeck)) this.st.myDeck = 'p_cyan';
      if (this.st.cpuDeck !== 'random' && !decks.find((d) => d.id === this.st.cpuDeck)) this.st.cpuDeck = 'random';
      this.render();
    },
    deckRow(d, key, sel) {
      const errs = JD.deckErrors(d.list), n = JD.deckCount(d.list);
      let lum = 0, sp = 0, st = 0;
      for (const [id, c] of d.list) { const x = JD.CARD_BY_ID[id]; if (!x) continue; if (x.type === 'lumina') lum += c; else if (x.type === 'spell') sp += c; else st += c; }
      return `<div class="dk ${sel ? 'sel' : ''} ${errs.length ? 'bad' : ''}" data-k="${key}" data-id="${d.id}"><i class="gem c-${d.color}"></i><div><b>${esc(d.name)}</b><small>${d.desc ? esc(d.desc) : `ルミナ${lum}・スペル${sp}・ステージ${st}`}</small>${errs.length ? `<small class="warn">未完成（${n}/${JD.DECK_SIZE}枚）</small>` : ''}</div><span class="tag2">${d.preset ? 'プリセット' : 'マイデッキ'}</span></div>`;
    },
    render() {
      const st = this.st, decks = JD.allDecks(), ok = decks.filter((d) => !JD.deckErrors(d.list).length);
      $('#suMine').innerHTML = decks.map((d) => this.deckRow(d, 'my', d.id === st.myDeck)).join('');
      $('#suCpu').innerHTML = `<div class="dk ${st.cpuDeck === 'random' ? 'sel' : ''}" data-k="cpu" data-id="random"><i class="gem rainbow"></i><div><b>ランダム</b><small>プリセットから毎回ランダムに選びます</small></div></div>` + decks.map((d) => this.deckRow(d, 'cpu', d.id === st.cpuDeck)).join('');
      const seg = (id, val) => $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === val));
      seg('suLevel', st.level); seg('suFirst', st.first); seg('suSpeed', st.speed);
      $('#suStart').disabled = !ok.find((d) => d.id === st.myDeck);
    },
    init() {
      $('#v-setup').addEventListener('click', (e) => {
        const dk = e.target.closest('.dk');
        if (dk && !dk.classList.contains('bad')) { this.st[dk.dataset.k === 'my' ? 'myDeck' : 'cpuDeck'] = dk.dataset.id; JD.store.saveSettings(this.st); this.render(); return; }
        if (dk) { JD.toast('未完成のデッキは使えません（デッキ構築で30枚にしてください）'); return; }
        const b = e.target.closest('.seg button');
        if (b) { const map = { suLevel: 'level', suFirst: 'first', suSpeed: 'speed' }; this.st[map[b.parentElement.id]] = b.dataset.v; JD.store.saveSettings(this.st); this.render(); }
      });
      $('#suStart').onclick = () => this.start();
      $('#suBuild').onclick = () => JD.go('cards');
    },
    start() {
      const st = this.st, decks = JD.allDecks();
      const mine = decks.find((d) => d.id === st.myDeck);
      let cpu = decks.find((d) => d.id === st.cpuDeck);
      if (!cpu) { const ps = decks.filter((d) => d.preset); cpu = ps[Math.floor(Math.random() * ps.length)]; }
      JD.store.saveSettings(st);
      JD.go('game', null, true);
      JD.gameUI.start({ myList: mine.list, cpuList: cpu.list, level: st.level, first: st.first, speed: st.speed, myName: mine.name, cpuName: cpu.name });
    },
  };

  /* ---------- boot ---------- */
  function boot() {
    JD.loadCustom();
    setup.init();
    $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) JD.go(b.dataset.go); });
    document.body.addEventListener('click', (e) => { const b = e.target.closest('[data-go]:not(#nav *)'); if (b) JD.go(b.dataset.go, b.dataset.params ? JSON.parse(b.dataset.params) : null); });
    $('#modal').addEventListener('click', (e) => { const m = $('#modal'); if ((e.target === m && m._closable) || e.target.id === 'modalX') JD.closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal')._closable && !$('#modal').classList.contains('hidden')) JD.closeModal(); });
    // decorative gems on the title screen
    $('#titleGems').innerHTML = JD.COLORS.map((c, i) => `<i class="tg c-${c}" style="--i:${i}">${CI[c].k}</i>`).join('');
    $('#titleColors').innerHTML = JD.COLORS.map((c) => `<div class="tc c-${c}"><i class="pip c-${c}">${CI[c].k}</i><b>${CI[c].n}</b><small>${CI[c].kw}</small></div>`).join('');
    JD.go('title');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
