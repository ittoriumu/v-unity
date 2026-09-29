/* Card rendering: procedural gem art + card DOM. Size is driven by the CSS var --cw on an ancestor. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const CI = JD.CI, esc = JD.esc;

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(h, t, w) { const a = hex2rgb(h), b = hex2rgb(t); return '#' + a.map((x, i) => Math.round(x * (1 - w) + b[i] * w).toString(16).padStart(2, '0')).join(''); }
  const shade = (h, w) => mix(h, '#000000', w), tint = (h, w) => mix(h, '#ffffff', w);

  const artCache = new Map();
  JD.procArt = function (def) {
    const key = def.type + def.color + def.name + def.race;
    if (artCache.has(key)) return artCache.get(key);
    const r = rng(hash(key));
    const base = CI[def.color].hex;
    const W = 200, H = 150, cx = 100, cy = 72;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
    s += `<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${shade(base, 0.45)}"/><stop offset="1" stop-color="${shade(base, 0.9)}"/></radialGradient>`;
    s += `<filter id="b"><feGaussianBlur stdDeviation="9"/></filter></defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#g)"/>`;
    // background sparkles
    for (let i = 0; i < 14; i++) s += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="${tint(base, 0.6)}" opacity="${(r() * 0.6 + 0.2).toFixed(2)}"/>`;
    const gem = (gx, gy, rad, rot, op) => {
      const n = 6 + Math.floor(r() * 3);
      const pts = [];
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; const rr = rad * (0.82 + r() * 0.3); pts.push([gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.92]); }
      let g = `<g opacity="${op}">`;
      g += `<circle cx="${gx}" cy="${gy}" r="${rad * 1.35}" fill="${base}" opacity="0.28" filter="url(#b)"/>`;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const f = 0.15 + r() * 0.7;
        g += `<polygon points="${gx},${gy} ${a[0].toFixed(1)},${a[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}" fill="${f > 0.5 ? tint(base, f - 0.35) : shade(base, 0.5 - f)}" stroke="${tint(base, 0.65)}" stroke-width="0.6" stroke-opacity="0.7"/>`;
      }
      g += `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1"/>`;
      g += `<ellipse cx="${(gx - rad * 0.3).toFixed(1)}" cy="${(gy - rad * 0.35).toFixed(1)}" rx="${rad * 0.18}" ry="${rad * 0.1}" fill="#fff" opacity="0.7" transform="rotate(-30 ${gx - rad * 0.3} ${gy - rad * 0.35})"/>`;
      return g + '</g>';
    };
    if (def.type === 'spell') {
      const rays = 10 + Math.floor(r() * 8);
      for (let i = 0; i < rays; i++) { const a = (i / rays) * Math.PI * 2 + r() * 0.3; const l = 45 + r() * 45; s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * l).toFixed(1)}" y2="${(cy + Math.sin(a) * l).toFixed(1)}" stroke="${tint(base, 0.4)}" stroke-width="${(r() * 2 + 0.5).toFixed(1)}" opacity="0.5" stroke-linecap="round"/>`; }
      s += gem(cx, cy, 22 + r() * 10, r() * 6, 1);
      s += `<circle cx="${cx}" cy="${cy}" r="${44 + r() * 10}" fill="none" stroke="${tint(base, 0.5)}" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.6"/>`;
    } else if (def.type === 'stage') {
      s += `<ellipse cx="${cx}" cy="112" rx="78" ry="16" fill="${shade(base, 0.55)}" stroke="${tint(base, 0.4)}" stroke-width="1.2"/>`;
      s += `<ellipse cx="${cx}" cy="108" rx="62" ry="11" fill="${shade(base, 0.25)}" opacity="0.9"/>`;
      s += `<polygon points="${cx - 60},108 ${cx - 46},40 ${cx - 38},40 ${cx - 48},108" fill="${shade(base, 0.4)}" opacity="0.8"/><polygon points="${cx + 60},108 ${cx + 46},40 ${cx + 38},40 ${cx + 48},108" fill="${shade(base, 0.4)}" opacity="0.8"/>`;
      s += gem(cx, 74, 24 + r() * 8, r() * 6, 1);
    } else {
      const big = 26 + r() * 14;
      s += gem(cx, cy, big, r() * 6, 1);
      const sat = 2 + Math.floor(r() * 3);
      for (let i = 0; i < sat; i++) { const a = r() * Math.PI * 2, d = big + 16 + r() * 22; s += gem(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 5 + r() * 7, r() * 6, 0.9); }
    }
    s += '</svg>';
    const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
    artCache.set(key, url);
    return url;
  };
  JD.artURL = (def) => def.art || JD.procArt(def);

  const pip = (c) => `<i class="pip c-${c}">${CI[c].k}</i>`;
  JD.costHTML = function (def) {
    let h = '';
    for (const c of JD.COLORS) for (let i = 0; i < ((def.cost && def.cost[c]) || 0); i++) h += pip(c);
    return h || '<span class="nocost">—</span>';
  };

  /* opts: {inst, stats:{p,t,dmg}, cls, text:true, down} */
  JD.cardHTML = function (def, opts) {
    opts = opts || {};
    const lines = JD.cardLines(def);
    const text = lines.map((l) => `<p><b>【${esc(l.trig)}】</b>${esc(l.text)}</p>`).join('');
    let pt = '';
    if (def.type === 'lumina') {
      const st = opts.stats || { p: def.power, t: def.toughness, dmg: 0, bp: def.power, bt: def.toughness };
      const pc = st.p > st.bp ? ' up' : st.p < st.bp ? ' dn' : '';
      const tc = st.dmg > 0 ? ' dmg' : st.t > st.bt ? ' up' : st.t < st.bt ? ' dn' : '';
      pt = `<div class="cd-pt"><b class="p${pc}">${st.p}</b><i>/</i><b class="t${tc}">${st.t - (st.dmg || 0)}</b></div>`;
    }
    const kind = JD.TYPE_NAME[def.type] + (def.race ? '／' + esc(def.race) : '');
    const mark = def.custom ? '<span class="cd-mark" title="オリジナルカード">★</span>' : '';
    return `<div class="card ct-${def.type} c-${def.color} ${opts.cls || ''}" ${opts.attr || ''}>
      <div class="cd-top"><span class="cd-lv">${def.lv}</span><span class="cd-name">${esc(def.name)}</span>${mark}</div>
      <div class="cd-cost">${JD.costHTML(def)}</div>
      <div class="cd-art" style="background-image:url('${JD.artURL(def).replace(/'/g, '%27')}')"></div>
      <div class="cd-kind">${kind}</div>
      <div class="cd-text">${text || '<p class="dim">（効果なし）</p>'}${def.flavor ? `<p class="fl">${esc(def.flavor)}</p>` : ''}</div>
      ${pt}
    </div>`;
  };
  JD.cardBackHTML = (cls) => `<div class="card back ${cls || ''}"><div class="back-gem"></div></div>`;

  // Plain-language description used in the detail panel / editor
  JD.detailHTML = function (def, inst, G) {
    let h = `<div class="dt-card" style="--cw:210px">${JD.cardHTML(def, { cls: 'big' })}</div>`;
    h += `<div class="dt-info"><h3>${esc(def.name)}</h3>`;
    h += `<div class="dt-meta">${JD.TYPE_NAME[def.type]}${def.race ? '／' + esc(def.race) : ''}・${CI[def.color].n}・LV${def.lv}・コスト ${JD.costHTML(def)}</div>`;
    const lines = JD.cardLines(def);
    h += lines.length ? '<ul class="dt-fx">' + lines.map((l) => `<li><b>【${esc(l.trig)}】</b>${esc(l.text)}</li>`).join('') + '</ul>' : '<p class="dim">効果はありません</p>';
    if (inst && G && def.type === 'lumina' && G.locate(inst)) {
      const loc = G.locate(inst), sc = G.inShowcase(inst);
      h += `<div class="dt-state">パワー ${G.effP(inst)} / タフネス ${G.effT(inst)}（残り${G.remainT(inst)}）・${inst.up ? 'アップ' : 'ダウン'}${sc ? '・ショーケース(×2)' : ''}${inst.enterTurn === G.turnNo ? '・ステージフリーズ' : ''}</div>`;
    }
    return h + '</div>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
