/* Card library + deck builder. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const CI = JD.CI, esc = JD.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  const view = (JD.deckView = {
    built: false, deck: null, dirty: false,
    filt: { colors: new Set(), type: '', q: '', custom: false }, sort: 'lv',

    newDeck() { return { id: 'dk_' + Date.now().toString(36), name: '新しいデッキ', list: {} }; },
    fromList(id, name, list) { const l = {}; for (const [c, n] of list) l[c] = n; return { id, name, list: l }; },
    toList() { return Object.entries(this.deck.list).filter((e) => e[1] > 0); },
    count() { return Object.entries(this.deck.list).reduce((s, [id, n]) => s + (JD.CARD_BY_ID[id] ? n : 0), 0); },

    enter(params) {
      if (!this.built) this.build();
      if (!this.deck) this.deck = this.newDeck();
      if (params && params.deck) { const d = JD.findDeck(params.deck); if (d) this.loadDeck(d); }
      this.refresh();
    },
    build() {
      this.built = true;
      $('#v-cards').innerHTML = `<div class="db-wrap">
        <section class="db-pool panel">
          <div class="db-filters">
            <div class="colors" id="dbColors">${JD.COLORS.map((c) => `<button class="colchip c-${c}" data-v="${c}" title="${CI[c].n}">${CI[c].k}</button>`).join('')}</div>
            <select id="dbType"><option value="">全ての種類</option>${Object.keys(JD.TYPE_NAME).map((t) => `<option value="${t}">${JD.TYPE_NAME[t]}</option>`).join('')}</select>
            <select id="dbSort"><option value="lv">LV順</option><option value="color">色順</option><option value="name">名前順</option></select>
            <input id="dbQ" placeholder="名前・種族・効果で検索">
            <label class="chk"><input type="checkbox" id="dbCustom"> オリジナルのみ</label>
            <span class="dim" id="dbTotal"></span>
          </div>
          <div id="dbGrid" class="pool-grid"></div>
        </section>
        <section class="db-deck panel">
          <div class="dk-head">
            <select id="dkSel"></select>
            <input id="dkName" maxlength="24" placeholder="デッキ名">
            <div class="btnrow wrap"><button class="btn sm primary" id="dkSave">保存</button><button class="btn sm" id="dkNew">新規</button><button class="btn sm" id="dkDel">削除</button><button class="btn sm" id="dkClear">空にする</button></div>
          </div>
          <div class="dk-count" id="dkCount"></div>
          <div class="curve" id="dkCurve"></div>
          <div class="dklist" id="dkList"></div>
        </section>
        <section class="db-detail panel"><div id="dbDetail"><p class="dim">カードにカーソルを合わせると詳細が表示されます。<br>カードをクリックするとデッキに追加、右クリック（長押し）で1枚減らします。</p></div></section>
      </div>`;
      $('#dbColors').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.v; if (this.filt.colors.has(c)) this.filt.colors.delete(c); else this.filt.colors.add(c); b.classList.toggle('on'); this.renderPool(); };
      $('#dbType').onchange = (e) => { this.filt.type = e.target.value; this.renderPool(); };
      $('#dbSort').onchange = (e) => { this.sort = e.target.value; this.renderPool(); };
      $('#dbQ').oninput = (e) => { this.filt.q = e.target.value.trim(); this.renderPool(); };
      $('#dbCustom').onchange = (e) => { this.filt.custom = e.target.checked; this.renderPool(); };
      $('#dkSel').onchange = async (e) => {
        if (this.dirty && !(await JD.confirm('編集中のデッキの変更は破棄されます。切り替えますか？'))) { this.renderDeckSel(); return; }
        const d = JD.findDeck(e.target.value);
        if (d) this.loadDeck(d); else { this.deck = this.newDeck(); this.dirty = false; }
        this.refresh();
      };
      $('#dkName').oninput = (e) => { this.deck.name = e.target.value; this.dirty = true; };
      $('#dkSave').onclick = () => this.save();
      $('#dkNew').onclick = async () => { if (this.dirty && !(await JD.confirm('編集中のデッキの変更は破棄されます。新規作成しますか？'))) return; this.deck = this.newDeck(); this.dirty = false; this.refresh(); };
      $('#dkClear').onclick = () => { this.deck.list = {}; this.dirty = true; this.refresh(); };
      $('#dkDel').onclick = async () => {
        const saved = JD.store.decks().find((d) => d.id === this.deck.id);
        if (!saved) { JD.toast('保存されていないデッキです'); return; }
        if (!(await JD.confirm(`「${saved.name}」を削除しますか？`))) return;
        JD.store.saveDecks(JD.store.decks().filter((d) => d.id !== saved.id));
        this.deck = this.newDeck(); this.dirty = false; this.refresh();
      };
      const grid = $('#dbGrid');
      grid.addEventListener('click', (e) => { const t = e.target.closest('.pt'); if (t) this.add(t.dataset.id, +1); });
      grid.addEventListener('contextmenu', (e) => { const t = e.target.closest('.pt'); if (t) { e.preventDefault(); this.add(t.dataset.id, -1); } });
      let lp = null;
      grid.addEventListener('touchstart', (e) => { const t = e.target.closest('.pt'); if (t) lp = setTimeout(() => { lp = 'done'; this.add(t.dataset.id, -1); }, 550); }, { passive: true });
      grid.addEventListener('touchend', (e) => { if (lp === 'done') e.preventDefault(); clearTimeout(lp); lp = null; });
      $('#v-cards').addEventListener('mouseover', (e) => { const t = e.target.closest('[data-id]'); if (t && JD.CARD_BY_ID[t.dataset.id]) this.showDetail(JD.CARD_BY_ID[t.dataset.id]); });
      $('#dkList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.add(b.dataset.id, b.dataset.a === '+' ? 1 : -1); });
    },
    showDetail(d) { $('#dbDetail').innerHTML = JD.detailHTML(d); },
    loadDeck(d) {
      const preset = d.preset;
      this.deck = this.fromList(preset ? 'dk_' + Date.now().toString(36) : d.id, preset ? d.name + '（コピー）' : d.name, d.list);
      this.dirty = preset;
    },
    add(id, delta) {
      const n = (this.deck.list[id] || 0) + delta;
      if (n < 0) return;
      if (delta > 0) {
        if (n > JD.MAX_COPIES) { JD.toast(`同じカードは${JD.MAX_COPIES}枚までです`); return; }
        if (this.count() >= JD.DECK_SIZE) { JD.toast(`デッキは${JD.DECK_SIZE}枚までです`); return; }
      }
      if (n === 0) delete this.deck.list[id]; else this.deck.list[id] = n;
      this.dirty = true;
      this.renderDeck(); this.renderPool(true);
    },
    save() {
      const name = (this.deck.name || '').trim();
      if (!name) { JD.toast('デッキ名を入力してください'); return; }
      const list = this.toList();
      const all = JD.store.decks().filter((d) => d.id !== this.deck.id);
      all.push({ id: this.deck.id, name, list });
      if (!JD.store.saveDecks(all)) { JD.toast('保存に失敗しました'); return; }
      this.dirty = false;
      const errs = JD.deckErrors(list);
      JD.toast(errs.length ? `保存しました（未完成：${errs[0]}）` : `「${name}」を保存しました`);
      this.refresh();
    },
    refresh() { this.renderDeckSel(); $('#dkName').value = this.deck.name; this.renderPool(); this.renderDeck(); },
    renderDeckSel() {
      const decks = JD.allDecks();
      const cur = decks.find((d) => d.id === this.deck.id);
      $('#dkSel').innerHTML = `<option value="">— 編集中：${esc(this.deck.name)}${cur ? '' : '（未保存）'} —</option>` + `<optgroup label="プリセット（コピーして編集）">${decks.filter((d) => d.preset).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</optgroup>` + `<optgroup label="マイデッキ">${decks.filter((d) => !d.preset).map((d) => `<option value="${d.id}" ${d.id === this.deck.id ? 'selected' : ''}>${esc(d.name)}${JD.deckErrors(d.list).length ? '（未完成）' : ''}</option>`).join('')}</optgroup>`;
    },
    poolList() {
      const f = this.filt, q = f.q.toLowerCase();
      let list = JD.allCards().filter((c) => (!f.colors.size || f.colors.has(c.color)) && (!f.type || c.type === f.type) && (!f.custom || c.custom) && (!q || (c.name + ' ' + c.race + ' ' + JD.cardText(c)).toLowerCase().includes(q)));
      const ci = (c) => JD.COLORS.indexOf(c.color);
      if (this.sort === 'lv') list.sort((a, b) => a.lv - b.lv || ci(a) - ci(b) || a.name.localeCompare(b.name, 'ja'));
      else if (this.sort === 'color') list.sort((a, b) => ci(a) - ci(b) || a.lv - b.lv);
      else list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      return list;
    },
    renderPool(keepScroll) {
      const list = this.poolList();
      $('#dbTotal').textContent = `${list.length}枚 / 全${JD.allCards().length}枚`;
      const g = $('#dbGrid'), st = g.scrollTop;
      g.innerHTML = list.map((c) => { const n = this.deck.list[c.id] || 0; return `<div class="pt ${n ? 'in' : ''}" data-id="${c.id}"><div style="--cw:88px">${JD.cardHTML(c, { cls: 'pool' })}</div>${n ? `<b class="cnt">×${n}</b>` : ''}</div>`; }).join('') || '<p class="dim pad">該当するカードがありません</p>';
      if (keepScroll) g.scrollTop = st;
    },
    renderDeck() {
      const n = this.count(), entries = this.toList().map(([id, c]) => [JD.CARD_BY_ID[id], c]).filter((e) => e[0]);
      entries.sort((a, b) => a[0].lv - b[0].lv || JD.COLORS.indexOf(a[0].color) - JD.COLORS.indexOf(b[0].color));
      const errs = JD.deckErrors(this.toList());
      $('#dkCount').innerHTML = `<b class="${n === JD.DECK_SIZE ? 'ok' : ''}">${n}</b> / ${JD.DECK_SIZE} 枚 ${errs.length ? `<span class="warn">${esc(errs[0])}</span>` : '<span class="okt">✔ 対戦で使えます</span>'}`;
      const curve = new Array(JD.MAX_LV + 1).fill(0);
      let types = { lumina: 0, spell: 0, stage: 0 };
      for (const [d, c] of entries) { curve[Math.min(JD.MAX_LV, d.lv)] += c; types[d.type] += c; }
      const mx = Math.max(4, ...curve);
      $('#dkCurve').innerHTML = `<div class="bars">${curve.map((v, i) => `<div class="bar"><i style="height:${(v / mx) * 100}%"></i><em>${v || ''}</em><span>${i}</span></div>`).join('')}</div><div class="dim">LV分布　ルミナ${types.lumina}・スペル${types.spell}・ステージ${types.stage}</div>`;
      $('#dkList').innerHTML = entries.map(([d, c]) => `<div class="dke" data-id="${d.id}"><i class="dot c-${d.color}"></i><span class="lv">${d.lv}</span><span class="nm">${esc(d.name)}${d.custom ? ' ★' : ''}</span><span class="cs">${JD.costHTML(d)}</span><button class="btn xs" data-a="-" data-id="${d.id}">−</button><b>${c}</b><button class="btn xs" data-a="+" data-id="${d.id}">＋</button></div>`).join('') || '<p class="dim pad">左のカードをクリックして追加しましょう。</p>';
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
