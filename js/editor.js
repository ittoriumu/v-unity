/* Original card editor: visual block programming, auto/free cost modes, illustration import. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const CI = JD.CI, esc = JD.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const MAX_BLOCKS = 16;

  /* ------------------------------------------------------------------ *
   * Sanitising untrusted card JSON (import)                             *
   * ------------------------------------------------------------------ */
  function sanitizeBlocks(list, depth) {
    const out = [];
    if (!Array.isArray(list) || depth > 3) return out;
    for (const b of list) {
      const d = b && JD.BLOCKS[b.t]; if (!d) continue;
      const nb = { t: b.t, p: {} };
      for (const s of d.params) {
        let v = b.p ? b.p[s.k] : undefined;
        if (s.t === 'num') { v = Math.round(Number(v)); if (!isFinite(v)) v = s.def; v = Math.max(s.min, Math.min(s.max, v)); }
        else if (s.t === 'sel') { if (!s.opts.some((o) => o[0] === v)) v = s.def; }
        else if (s.t === 'color') { if (!JD.COLORS.includes(v)) v = s.def; }
        else v = String(v == null ? '' : v).slice(0, 12);
        nb.p[s.k] = v;
      }
      if (d.kind === 'c') nb.c = sanitizeBlocks(b.c, depth + 1);
      out.push(nb);
    }
    return out;
  }
  JD.sanitizeCard = function (o) {
    if (!o || typeof o !== 'object' || !JD.TYPE_NAME[o.type] || !JD.COLORS.includes(o.color)) return null;
    const d = { id: JD.newCardId(), type: o.type, color: o.color, name: String(o.name || '名称未設定').slice(0, 24), race: String(o.race || '').slice(0, 12), flavor: String(o.flavor || '').slice(0, 60), custom: true };
    d.power = o.type === 'lumina' ? Math.max(0, Math.min(9, Math.round(+o.power) || 0)) : 0;
    d.toughness = o.type === 'lumina' ? Math.max(1, Math.min(12, Math.round(+o.toughness) || 1)) : 0;
    d.art = typeof o.art === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.art) && o.art.length < 400000 ? o.art : null;
    d.scripts = [];
    const seen = new Set();
    for (const s of Array.isArray(o.scripts) ? o.scripts : []) {
      if (!JD.trigInfo(d.type, s.trigger) || seen.has(s.trigger)) continue;
      seen.add(s.trigger);
      const body = sanitizeBlocks(s.body, 1).filter((b) => (JD.BLOCKS[b.t].kind === 'static') === (s.trigger === 'static') && JD.BLOCKS[b.t].types.includes(d.type));
      d.scripts.push({ trigger: s.trigger, body });
    }
    d.costMode = o.costMode === 'manual' ? 'manual' : 'auto';
    d.lv = Math.max(0, Math.min(12, Math.round(+o.lv) || 1));
    d.cost = {};
    JD.COLORS.forEach((c) => { const n = Math.max(0, Math.min(6, Math.round(+(o.cost || {})[c]) || 0)); if (n) d.cost[c] = n; });
    return d;
  };

  /* ------------------------------------------------------------------ *
   * Illustration import (file / drag&drop / paste) with crop            *
   * ------------------------------------------------------------------ */
  JD.artImport = function (onDone) {
    const CW = 330, CH = 220;
    JD.modal(`<h3>イラストの取り込み</h3>
      <div class="art-drop" id="artDrop"><p>ここに画像をドラッグ＆ドロップ<br>または <label class="btn sm">ファイルを選ぶ<input type="file" id="artFile" accept="image/*" hidden></label><br><span class="dim">クリップボードの画像は Ctrl+V で貼り付けできます</span></p></div>
      <div class="art-crop hidden" id="artCrop"><canvas id="artCv" width="${CW}" height="${CH}"></canvas>
        <div class="art-ctl"><label>ズーム <input type="range" id="artZoom" min="1" max="4" step="0.01" value="1"></label><p class="dim">ドラッグで位置を調整（カードのイラスト枠：3:2）</p>
        <div class="btnrow"><button class="btn primary" id="artOk">決定</button><button class="btn" id="artRe">選び直す</button></div></div></div>`, { wide: false });
    const drop = $('#artDrop'), crop = $('#artCrop'), cv = $('#artCv'), ctx = cv.getContext('2d');
    let img = null, zoom = 1, ox = 0, oy = 0, base = 1;
    const draw = () => {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, CW, CH);
      const s = base * zoom, w = img.width * s, h = img.height * s;
      ox = Math.min(0, Math.max(CW - w, ox)); oy = Math.min(0, Math.max(CH - h, oy));
      ctx.drawImage(img, ox, oy, w, h);
    };
    const load = (file) => {
      if (!file || !/^image\//.test(file.type)) { JD.toast('画像ファイルを選んでください'); return; }
      if (file.size > 12 * 1024 * 1024) { JD.toast('画像が大きすぎます（12MBまで）'); return; }
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => { img = im; base = Math.max(CW / im.width, CH / im.height); zoom = 1; $('#artZoom').value = 1; ox = (CW - im.width * base) / 2; oy = (CH - im.height * base) / 2; drop.classList.add('hidden'); crop.classList.remove('hidden'); draw(); };
        im.onerror = () => JD.toast('画像を読み込めませんでした');
        im.src = rd.result;
      };
      rd.readAsDataURL(file);
    };
    $('#artFile').onchange = (e) => load(e.target.files[0]);
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); load(e.dataTransfer.files[0]); });
    const onPaste = (e) => { const it = [...(e.clipboardData || {}).items || []].find((x) => x.type.startsWith('image/')); if (it) load(it.getAsFile()); };
    document.addEventListener('paste', onPaste);
    JD.onModalClose = () => document.removeEventListener('paste', onPaste);
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, ox, oy]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag || !img) return; ox = drag[2] + (e.clientX - drag[0]); oy = drag[3] + (e.clientY - drag[1]); draw(); });
    cv.addEventListener('pointerup', () => { drag = null; });
    $('#artZoom').oninput = (e) => {
      if (!img) return;
      const nz = +e.target.value, r = nz / zoom;
      ox = CW / 2 - (CW / 2 - ox) * r; oy = CH / 2 - (CH / 2 - oy) * r; zoom = nz; draw();
    };
    $('#artRe').onclick = () => { crop.classList.add('hidden'); drop.classList.remove('hidden'); };
    $('#artOk').onclick = () => {
      const out = document.createElement('canvas'); out.width = 360; out.height = 240;
      out.getContext('2d').drawImage(cv, 0, 0, CW, CH, 0, 0, 360, 240);
      const url = out.toDataURL('image/jpeg', 0.82);
      JD.closeModal(); onDone(url);
    };
  };

  /* ------------------------------------------------------------------ *
   * Editor                                                             *
   * ------------------------------------------------------------------ */
  const CUSTOM_ROWS = {
    if: ['もし', { k: 'cond' }, { k: 'race' }, { k: 'color' }, { k: 'n' }, 'なら'],
    repeat: [{ k: 'n' }, 'くり返す：'],
    sBuffIf: [{ k: 'cond' }, { k: 'race' }, { k: 'color' }, { k: 'n' }, '間、このルミナは パワー+', { k: 'p' }, ' タフネス+', { k: 't' }],
    sLord: ['自分の他の種族「', { k: 'race' }, '」のルミナ全てに パワー+', { k: 'p' }, ' タフネス+', { k: 't' }],
    sDye: ['ジュエルエリアにある間、', { k: 'color' }, 'のジュエルとしても扱う'],
    sStageBuff: ['このステージの上のルミナに パワー+', { k: 'p' }, ' タフネス+', { k: 't' }],
  };
  function rowItems(d) {
    if (d.tpl) {
      const items = [], seen = new Set();
      d.tpl.split(/(\{\w+\})/).forEach((part) => {
        const m = part.match(/^\{(\w+)\}$/);
        if (m) { items.push({ k: m[1], mirror: seen.has(m[1]) }); seen.add(m[1]); } else if (part) items.push(part);
      });
      return items;
    }
    return CUSTOM_ROWS[d.id] || [];
  }
  const CATS = [['all', '全て'], ...JD.COLORS.map((c) => [c, CI[c].n]), ['ctrl', '制御'], ['static', '常時']];
  const catName = (c) => (CI[c] ? CI[c].n : c === 'ctrl' ? '制御' : '常時');

  const editor = (JD.editor = {
    draft: null, active: 0, tab: 'all', dirty: false, built: false,

    newDraft(type) {
      type = type || 'lumina';
      return { id: JD.newCardId(), name: '', type, color: 'cyan', race: '', power: 1, toughness: 1, scripts: [{ trigger: type === 'spell' ? 'onCast' : 'onPlay', body: [] }], flavor: '', art: null, costMode: 'auto', lv: 1, cost: { cyan: 1 }, custom: true };
    },
    enter(params) {
      if (!this.built) this.build();
      const id = params && params.id;
      const src = id && JD.CARD_BY_ID[id];
      if (src) {
        this.draft = JD.clone(src);
        if (!src.custom) { this.draft.id = JD.newCardId(); this.draft.name += '（改）'; this.draft.custom = true; this.draft.costMode = 'auto'; }
      } else if (!this.draft) this.draft = this.newDraft();
      this.dirty = false; this.active = 0;
      this.refreshAll();
    },

    /* ---------- static skeleton ---------- */
    build() {
      this.built = true;
      const root_ = $('#v-editor');
      root_.innerHTML = `<div class="ed-wrap">
        <section class="ed-col ed-form panel">
          <h3>カード設定</h3>
          <label class="fld">名前<input id="edName" maxlength="20" placeholder="カード名"></label>
          <div class="fld">種類<div class="seg" id="edType">${Object.keys(JD.TYPE_NAME).map((t) => `<button data-v="${t}">${JD.TYPE_NAME[t]}</button>`).join('')}</div></div>
          <div class="fld">ジュエルカラー<div class="colors" id="edColor">${JD.COLORS.map((c) => `<button class="colchip c-${c}" data-v="${c}" title="${CI[c].n}：${CI[c].kw}">${CI[c].k}</button>`).join('')}</div><small class="dim" id="edColorKw"></small></div>
          <label class="fld">種族<input id="edRace" maxlength="10" list="raceList" placeholder="例：ナイト"><datalist id="raceList"></datalist></label>
          <div class="fld two" id="edPT"><label>パワー<input type="number" id="edP" min="0" max="9"></label><label>タフネス<input type="number" id="edT" min="1" max="12"></label></div>
          <div class="fld">コスト設定<div class="seg" id="edMode"><button data-v="auto">自動（バランス）</button><button data-v="manual">自由</button></div>
            <small class="dim" id="edModeNote"></small></div>
          <div class="fld costbox"><label>LV<input type="number" id="edLv" min="0" max="12"></label><div class="ccosts" id="edCosts">${JD.COLORS.map((c) => `<label class="cc c-${c}"><span>${CI[c].k}</span><input type="number" min="0" max="6" data-c="${c}"></label>`).join('')}</div></div>
          <div class="fld">イラスト<div class="art-row"><div class="art-thumb" id="edArt"></div><div><button class="btn sm" id="edArtBtn">画像を取り込む</button><br><button class="btn sm" id="edArtDel">削除</button></div></div></div>
          <label class="fld">フレーバーテキスト<input id="edFlavor" maxlength="50" placeholder="（任意）"></label>
        </section>
        <section class="ed-col ed-work panel">
          <h3>効果ブロック <small class="dim">パレットのブロックを、下のトリガーの中へドラッグ（クリックでも追加）。ブロックを外へドラッグ or ×で削除</small></h3>
          <div class="pal-tabs" id="edTabs">${CATS.map(([k, n]) => `<button data-v="${k}" class="ptab ${JD.COLORS.includes(k) ? 'c-' + k : ''}">${n}</button>`).join('')}</div>
          <div class="palette" id="edPalette"></div>
          <div id="edScripts" class="scripts"></div>
          <div class="addtrig"><select id="edTrigSel"></select><button class="btn sm" id="edTrigAdd">＋ トリガーを追加</button></div>
        </section>
        <section class="ed-col ed-side">
          <div class="panel"><h3>プレビュー</h3><div class="prev" id="edPrev"></div></div>
          <div class="panel"><h3>コスト・バランス評価</h3><div id="edEval"></div></div>
          <div class="panel"><div class="btnrow wrap"><button class="btn primary" id="edSave">保存</button><button class="btn" id="edNew">新規</button><button class="btn" id="edDup">複製</button></div></div>
          <div class="panel"><h3>マイカード <span id="edCount" class="dim"></span></h3><div class="btnrow wrap"><button class="btn sm" id="edExport">書き出し</button><button class="btn sm" id="edImport">読み込み<input type="file" id="edImpFile" accept="application/json,.json" hidden></button></div><div id="edList" class="mylist"></div></div>
        </section></div>`;
      const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
      on('#edName', 'input', (e) => { this.draft.name = e.target.value; this.touch(); });
      on('#edRace', 'input', (e) => { this.draft.race = e.target.value; this.touch(); });
      on('#edFlavor', 'input', (e) => { this.draft.flavor = e.target.value; this.touch(); });
      on('#edP', 'input', (e) => { this.draft.power = Math.max(0, Math.min(9, +e.target.value || 0)); this.touch(); });
      on('#edT', 'input', (e) => { this.draft.toughness = Math.max(1, Math.min(12, +e.target.value || 1)); this.touch(); });
      on('#edLv', 'input', (e) => { this.draft.lv = Math.max(0, Math.min(12, +e.target.value || 0)); this.touch(); });
      $$('#edCosts input').forEach((i) => i.addEventListener('input', () => { this.draft.cost = this.draft.cost || {}; const n = Math.max(0, Math.min(6, +i.value || 0)); if (n) this.draft.cost[i.dataset.c] = n; else delete this.draft.cost[i.dataset.c]; this.touch(); }));
      on('#edType', 'click', (e) => { const b = e.target.closest('button'); if (b) this.setType(b.dataset.v); });
      on('#edColor', 'click', (e) => { const b = e.target.closest('button'); if (b) { this.draft.color = b.dataset.v; this.touch(true); } });
      on('#edMode', 'click', (e) => { const b = e.target.closest('button'); if (b) { this.setMode(b.dataset.v); } });
      on('#edTabs', 'click', (e) => { const b = e.target.closest('button'); if (b) { this.tab = b.dataset.v; this.renderPalette(); } });
      on('#edArtBtn', 'click', () => JD.artImport((url) => { this.draft.art = url; this.touch(true); }));
      on('#edArtDel', 'click', () => { this.draft.art = null; this.touch(true); });
      on('#edTrigAdd', 'click', () => { const v = $('#edTrigSel').value; if (v) { this.draft.scripts.push({ trigger: v, body: [] }); this.active = this.draft.scripts.length - 1; this.touch(true); } });
      on('#edSave', 'click', () => this.save());
      on('#edNew', 'click', async () => { if (this.dirty && !(await JD.confirm('編集中の内容は破棄されます。新規作成しますか？'))) return; this.draft = this.newDraft(); this.dirty = false; this.refreshAll(); });
      on('#edDup', 'click', () => { this.draft = JD.clone(this.draft); this.draft.id = JD.newCardId(); this.draft.name += 'のコピー'; this.touch(true); JD.toast('複製しました（保存で別カードになります）'); });
      on('#edExport', 'click', () => { const list = JD.store.cards(); if (!list.length) { JD.toast('書き出すカードがありません'); return; } JD.download('jewels-duel-cards.json', JSON.stringify({ app: 'jewels-duel', v: 1, cards: list })); });
      on('#edImport', 'click', (e) => { if (e.target.tagName !== 'INPUT') $('#edImpFile').click(); });
      on('#edImpFile', 'change', (e) => this.importFile(e.target.files[0]));
      this.paletteTouched = false;
    },

    /* ---------- state helpers ---------- */
    touch(rerender) { this.dirty = true; if (rerender) this.refreshAll(true); else this.updateSide(); },
    setType(t) {
      const d = this.draft; if (d.type === t) return;
      d.type = t;
      const before = d.scripts.length;
      d.scripts = d.scripts.filter((s) => JD.trigInfo(t, s.trigger));
      d.scripts.forEach((s) => { s.body = s.body.filter((b) => JD.BLOCKS[b.t].types.includes(t)); });
      if (!d.scripts.length) d.scripts.push({ trigger: t === 'spell' ? 'onCast' : 'onPlay', body: [] });
      if (before !== d.scripts.length) JD.toast('種類に合わないトリガーを取り除きました');
      this.active = 0; this.touch(true);
    },
    setMode(m) {
      const d = this.draft; if (d.costMode === m) return;
      if (m === 'manual') { const e = JD.autoCost(d); d.lv = e.lv; d.cost = Object.assign({}, e.cost); }
      d.costMode = m; this.touch(true);
    },
    countBlocks() { let n = 0; const w = (a) => a.forEach((b) => { n++; if (b.c) w(b.c); }); this.draft.scripts.forEach((s) => w(s.body)); return n; },

    refreshAll(keepInputs) {
      const d = this.draft;
      $('#edName').value = d.name; $('#edRace').value = d.race; $('#edFlavor').value = d.flavor;
      $('#edP').value = d.power; $('#edT').value = d.toughness;
      $$('#edType button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.type));
      $$('#edColor button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.color));
      $$('#edMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.costMode));
      $('#edColorKw').textContent = `${CI[d.color].n}の得意分野：${CI[d.color].kw}（他色のブロックは、その色のコストが必要になります）`;
      $('#edPT').classList.toggle('hidden', d.type !== 'lumina');
      $('#edModeNote').textContent = d.costMode === 'auto' ? 'ステータスと効果から、LVとカラーコストを自動で決めます（上限を超える強さは作れません）。' : 'LVとカラーコストを自由に設定できます。バランス評価は参考表示です。';
      $('#edArt').style.backgroundImage = `url('${JD.artURL(d).replace(/'/g, '%27')}')`;
      const races = new Set(JD.allCards().map((c) => c.race).filter(Boolean));
      $('#raceList').innerHTML = [...races].map((r) => `<option value="${esc(r)}">`).join('');
      this.renderPalette();
      this.renderScripts();
      this.renderMyList();
      this.updateSide();
    },
    updateSide() {
      const d = this.draft;
      let est;
      if (d.costMode === 'auto') { est = JD.autoCost(d); } else est = JD.estimate(d);
      const auto = d.costMode === 'auto';
      $('#edLv').value = d.lv; $('#edLv').disabled = auto;
      $$('#edCosts input').forEach((i) => { i.value = (d.cost && d.cost[i.dataset.c]) || 0; i.disabled = auto; });
      $('#edPrev').innerHTML = `<div style="--cw:190px">${JD.cardHTML(d, { cls: 'big' })}</div>`;
      $('#edArt').style.backgroundImage = `url('${JD.artURL(d).replace(/'/g, '%27')}')`;
      // evaluation
      let h = `<table class="evt">${est.parts.map((p) => `<tr><td>${esc(p.label)}</td><td>${p.value.toFixed(1)}</td></tr>`).join('')}<tr class="tot"><td>合計の価値</td><td>${est.total.toFixed(1)}</td></tr></table>`;
      if (auto) {
        h += `<div class="verdict ${est.over ? 'broken' : 'ok'}">自動設定：<b>LV${d.lv}</b> ${JD.costHTML(d)}</div>`;
        if (est.over) h += `<p class="warn">効果が強すぎて、最大LV${JD.MAX_LV}でも賄えません。効果を減らしてください。</p>`;
        if (est.others.length) h += `<p class="dim">他色ブロックのため ${est.others.map((c) => `<span class="c-${c} tag">${CI[c].n}</span>`).join('')} のコストが加わっています。</p>`;
      } else {
        const bal = JD.balance(d);
        const pos = Math.max(0, Math.min(100, (bal.ratio / 1.6) * 100));
        h += `<div class="meter"><div class="mz z1"></div><div class="mz z2"></div><div class="mz z3"></div><div class="mk" style="left:${pos}%"></div></div><div class="verdict ${bal.verdict}">このコストでの評価：<b>${bal.text}</b>（価値 ${est.total.toFixed(1)} ／ LV${d.lv}の許容 ${bal.budget.toFixed(1)}）</div>`;
        h += `<p class="dim">自動なら：<b>LV${est.lv}</b> ${JD.costHTML(Object.assign({}, d, { cost: est.cost }))}${est.over ? '（上限超え）' : ''}</p>`;
      }
      h += `<p class="dim">ブロック数 ${this.countBlocks()}／${MAX_BLOCKS}</p>`;
      $('#edEval').innerHTML = h;
    },

    /* ---------- palette ---------- */
    renderPalette() {
      $$('#edTabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.tab));
      const t = this.draft.type;
      const list = Object.values(JD.BLOCKS).filter((b) => b.types.includes(t)).filter((b) => {
        if (this.tab === 'all') return true;
        if (this.tab === 'static') return b.kind === 'static';
        return b.cat === this.tab && b.kind !== 'static';
      });
      const host = $('#edPalette'); host.innerHTML = '';
      for (const b of list) {
        const it = el('div', 'pal blk cat-' + b.cat + (b.kind === 'static' ? ' isstatic' : ''), `<span class="pc">${catName(b.cat)}</span>${esc(JD.blockText(JD.newBlock(b.id)))}`);
        it.title = 'ドラッグして配置／クリックで追加';
        it.addEventListener('pointerdown', (e) => this.startDrag(e, { make: () => JD.newBlock(b.id), from: null, onClick: () => this.addToActive(b.id) }));
        host.appendChild(it);
      }
      if (!list.length) host.innerHTML = '<p class="dim">この種類のカードで使えるブロックがありません</p>';
    },

    /* ---------- script workspace ---------- */
    renderScripts() {
      const d = this.draft, host = $('#edScripts'); host.innerHTML = '';
      d.scripts.forEach((s, si) => {
        const ti = JD.trigInfo(d.type, s.trigger);
        const box = el('div', 'script' + (si === this.active ? ' active' : ''));
        const head = el('div', 'shead', `<span class="hat">${ti.id === 'static' ? '常　時' : 'トリガー'}</span><b>${esc(ti.label)}</b>${ti.id === 'static' ? '' : `<small class="dim">価値×${(ti.mul * JD.EFFECT_SCALE).toFixed(2)}</small>`}`);
        if (d.scripts.length > 1) { const x = el('button', 'x', '×'); x.title = 'このトリガーを削除'; x.onclick = () => { d.scripts.splice(si, 1); this.active = 0; this.touch(true); }; head.appendChild(x); }
        box.appendChild(head);
        box.appendChild(this.renderStack(s.body, { kind: ti.id === 'static' ? 'static' : 'effect', depth: 1 }));
        box.addEventListener('pointerdown', () => { if (this.active !== si) { this.active = si; $$('#edScripts .script').forEach((n, i) => n.classList.toggle('active', i === si)); } }, true);
        host.appendChild(box);
      });
      const used = new Set(d.scripts.map((s) => s.trigger));
      const rest = (JD.TRIGGERS[d.type] || []).filter((t) => !used.has(t.id));
      $('#edTrigSel').innerHTML = rest.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
      $('#edTrigSel').disabled = !rest.length; $('#edTrigAdd').disabled = !rest.length;
    },
    renderStack(arr, ctx) {
      const st = el('div', 'stack');
      const mkSlot = (i) => {
        const s = el('div', 'dslot' + (arr.length ? '' : ' empty'), arr.length ? '' : '<span>ここにブロックをドロップ</span>');
        s._arr = arr; s._idx = i; s._kind = ctx.kind; s._depth = ctx.depth;
        return s;
      };
      st.appendChild(mkSlot(0));
      arr.forEach((b, i) => { st.appendChild(this.renderBlock(b, arr, i, ctx)); st.appendChild(mkSlot(i + 1)); });
      return st;
    },
    renderBlock(b, arr, idx, ctx) {
      const d = JD.BLOCKS[b.t];
      const wrap = el('div', 'blk cat-' + d.cat + (d.kind === 'c' ? ' cblk' : ''));
      const row = el('div', 'blk-row');
      row.appendChild(el('span', 'grip', '⋮⋮'));
      const items = rowItems(d);
      for (const it of items) {
        if (typeof it === 'string') { row.appendChild(el('span', 'tx', esc(it))); continue; }
        const spec = d.params.find((p) => p.k === it.k); if (!spec) continue;
        if (spec.showIf && !spec.showIf(b.p)) continue;
        if (it.mirror) { const m = el('span', 'tx mirror', esc(String(b.p[spec.k]))); m.dataset.k = spec.k; row.appendChild(m); continue; }
        row.appendChild(this.mkInput(spec, b, wrap));
        const unit = d.tpl ? '' : typeof spec.unit === 'function' ? spec.unit(b.p) : spec.unit;
        if (unit) row.appendChild(el('span', 'tx', esc(unit)));
        if (spec.post) row.appendChild(el('span', 'tx', esc(spec.post)));
      }
      const x = el('button', 'x', '×'); x.title = '削除';
      x.onclick = (e) => { e.stopPropagation(); arr.splice(arr.indexOf(b), 1); this.touch(true); };
      row.appendChild(x);
      wrap.appendChild(row);
      row.addEventListener('pointerdown', (e) => {
        if (e.target.closest('input,select,button')) return;
        this.startDrag(e, { make: () => b, from: { arr, block: b }, srcEl: wrap });
      });
      if (d.kind === 'c') {
        const kids = el('div', 'kids');
        b.c = b.c || [];
        kids.appendChild(this.renderStack(b.c, { kind: ctx.kind, depth: ctx.depth + 1 }));
        wrap.appendChild(kids);
      }
      return wrap;
    },
    mkInput(spec, b, wrap) {
      let inp;
      const stop = (e) => e.stopPropagation();
      if (spec.t === 'num') {
        inp = el('input', 'in num'); inp.type = 'number'; inp.min = spec.min; inp.max = spec.max; inp.value = b.p[spec.k];
        inp.addEventListener('input', () => { let v = Math.round(+inp.value); if (!isFinite(v)) return; v = Math.max(spec.min, Math.min(spec.max, v)); b.p[spec.k] = v; $$('.mirror', wrap).forEach((m) => { if (m.dataset.k === spec.k) m.textContent = v; }); this.touch(false); });
        inp.addEventListener('change', () => { inp.value = b.p[spec.k]; });
      } else if (spec.t === 'sel') {
        inp = el('select', 'in sel' + (spec.wide ? ' wide' : ''));
        inp.innerHTML = spec.opts.map(([v, l]) => `<option value="${v}" ${v === b.p[spec.k] ? 'selected' : ''}>${esc(l)}</option>`).join('');
        inp.addEventListener('change', () => { b.p[spec.k] = inp.value; this.touch(spec.k === 'cond'); });
      } else if (spec.t === 'color') {
        inp = el('select', 'in sel col c-' + b.p[spec.k]);
        inp.innerHTML = JD.COLORS.map((c) => `<option value="${c}" ${c === b.p[spec.k] ? 'selected' : ''}>${CI[c].n}</option>`).join('');
        inp.addEventListener('change', () => { b.p[spec.k] = inp.value; inp.className = 'in sel col c-' + inp.value; this.touch(false); });
      } else {
        inp = el('input', 'in txt'); inp.type = 'text'; inp.maxLength = 10; inp.setAttribute('list', 'raceList'); inp.placeholder = '種族'; inp.value = b.p[spec.k] || '';
        inp.addEventListener('input', () => { b.p[spec.k] = inp.value; this.touch(false); });
      }
      inp.addEventListener('pointerdown', stop);
      return inp;
    },
    addToActive(id) {
      const d = this.draft, def_ = JD.BLOCKS[id];
      if (this.countBlocks() >= MAX_BLOCKS) { JD.toast(`ブロックは合計${MAX_BLOCKS}個までです`); return; }
      const wantStatic = def_.kind === 'static';
      let si = d.scripts.findIndex((s, i) => i === this.active && (s.trigger === 'static') === wantStatic);
      if (si < 0) si = d.scripts.findIndex((s) => (s.trigger === 'static') === wantStatic);
      if (si < 0) {
        if (wantStatic) d.scripts.push({ trigger: 'static', body: [] });
        else d.scripts.push({ trigger: d.type === 'spell' ? 'onCast' : 'onPlay', body: [] });
        si = d.scripts.length - 1;
      }
      d.scripts[si].body.push(JD.newBlock(id));
      this.active = si; this.touch(true);
    },

    /* ---------- drag & drop ---------- */
    startDrag(ev, spec) {
      if (ev.button > 0) return;
      const sx = ev.clientX, sy = ev.clientY;
      let started = false, ghost = null, hover = null;
      const blk0 = spec.make();
      const bd = JD.BLOCKS[blk0.t];
      const accepts = (slot) => {
        if ((bd.kind === 'static') !== (slot._kind === 'static')) return false;
        if (bd.kind === 'c' && slot._depth >= 3) return false;
        if (spec.srcEl && spec.srcEl.contains(slot)) return false;
        return true;
      };
      const near = (x, y) => {
        let best = null, bd_ = 34;
        for (const s of $$('#edScripts .dslot')) {
          if (!accepts(s)) continue;
          const r = s.getBoundingClientRect();
          const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
          const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
          const dist = Math.hypot(dx, dy * 1.3);
          if (dist < bd_) { bd_ = dist; best = s; }
        }
        return best;
      };
      const move = (e) => {
        if (!started) {
          if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
          started = true;
          ghost = el('div', 'blk ghost cat-' + bd.cat, esc(JD.blockText(blk0)));
          document.body.appendChild(ghost);
          document.body.classList.add('dragging');
          if (spec.srcEl) spec.srcEl.classList.add('lifted');
        }
        e.preventDefault();
        ghost.style.left = e.clientX + 12 + 'px'; ghost.style.top = e.clientY + 8 + 'px';
        const h = near(e.clientX, e.clientY);
        if (h !== hover) { if (hover) hover.classList.remove('hot'); hover = h; if (h) h.classList.add('hot'); }
        const pal = $('#edPalette').getBoundingClientRect();
        $('#edPalette').classList.toggle('trash', !!spec.from && e.clientX > pal.left && e.clientX < pal.right && e.clientY > pal.top && e.clientY < pal.bottom);
      };
      const up = (e) => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
        if (!started) { if (spec.onClick) spec.onClick(); return; }
        ghost.remove(); document.body.classList.remove('dragging');
        if (spec.srcEl) spec.srcEl.classList.remove('lifted');
        if (hover) hover.classList.remove('hot');
        const pal = $('#edPalette'); const trash = pal.classList.contains('trash'); pal.classList.remove('trash');
        if (trash && spec.from) { spec.from.arr.splice(spec.from.arr.indexOf(spec.from.block), 1); this.touch(true); return; }
        if (hover) {
          let arr = hover._arr, idx = hover._idx;
          if (spec.from) {
            const fi = spec.from.arr.indexOf(spec.from.block);
            spec.from.arr.splice(fi, 1);
            if (spec.from.arr === arr && fi < idx) idx--;
          } else if (this.countBlocks() >= MAX_BLOCKS) { JD.toast(`ブロックは合計${MAX_BLOCKS}個までです`); return; }
          arr.splice(idx, 0, blk0);
          this.touch(true);
        }
      };
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    },

    /* ---------- save / list ---------- */
    save() {
      const d = this.draft;
      JD.normalizeCard(d);
      if (d.costMode === 'auto') { const e = JD.autoCost(d); if (e.over) { JD.toast('効果が強すぎます。効果を減らしてください'); return; } }
      const errs = JD.validateCard(d);
      if (errs.length) { JD.toast(errs[0]); return; }
      if (!JD.saveCustomCard(d)) { JD.toast('保存に失敗しました（ブラウザの保存容量が不足している可能性があります。イラストを減らしてください）'); return; }
      this.dirty = false;
      JD.toast(`「${d.name}」を保存しました`);
      this.renderMyList();
    },
    renderMyList() {
      const list = JD.customList();
      $('#edCount').textContent = `(${list.length})`;
      $('#edList').innerHTML = list.length ? list.map((c) => `<div class="myc ${c.id === this.draft.id ? 'cur' : ''}" data-id="${c.id}"><i class="dot c-${c.color}"></i><div class="mn"><b>${esc(c.name)}</b><small>${JD.TYPE_NAME[c.type]} LV${c.lv} ${JD.costTag(c)}${c.costMode === 'manual' ? ' ・自由' : ''}</small></div><button class="btn sm" data-a="edit">編集</button><button class="btn sm" data-a="del">削除</button></div>`).join('') : '<p class="dim">まだありません。左のフォームで作って「保存」しましょう。</p>';
      $$('#edList .myc').forEach((n) => n.onclick = async (e) => {
        const b = e.target.closest('button'); const id = n.dataset.id;
        n.onmouseover = null;
        if (b && b.dataset.a === 'del') { if (await JD.confirm('このカードを削除しますか？（デッキからも取り除かれます）')) { JD.deleteCustomCard(id); if (this.draft.id === id) this.draft = this.newDraft(); this.refreshAll(); } }
        else if (b && b.dataset.a === 'edit') { if (this.dirty && !(await JD.confirm('編集中の内容は破棄されます。読み込みますか？'))) return; this.draft = JD.clone(JD.CARD_BY_ID[id]); this.dirty = false; this.active = 0; this.refreshAll(); }
      });
    },
    async importFile(f) {
      if (!f) return;
      try {
        const txt = await f.text();
        const obj = JSON.parse(txt);
        const cards = Array.isArray(obj) ? obj : obj.cards;
        if (!Array.isArray(cards)) throw new Error('形式が正しくありません');
        let n = 0; const list = JD.store.cards();
        for (const c of cards.slice(0, 100)) {
          const d = JD.sanitizeCard(c); if (!d) continue;
          if (c.id && !JD.CARD_BY_ID[c.id] && /^cu_[a-z0-9]+$/.test(c.id)) d.id = c.id;
          list.push(d); n++;
        }
        if (!JD.store.saveCards(list)) throw new Error('保存容量が不足しています');
        JD.loadCustom(); this.renderMyList();
        JD.toast(`${n}枚のカードを読み込みました`);
      } catch (err) { JD.toast('読み込み失敗：' + err.message); }
      $('#edImpFile').value = '';
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
