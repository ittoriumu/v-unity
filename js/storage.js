/* Persistence (localStorage) for original cards and decks. */
(function (root) {
  'use strict';
  const JD = root.JD;
  const KC = 'jd.customCards.v1', KD = 'jd.decks.v1', KS = 'jd.settings.v1';

  function read(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  JD.store = {
    settings() { return Object.assign({ level: 'normal', first: 'random', speed: 'normal', myDeck: 'p_cyan', cpuDeck: 'random' }, read(KS, {})); },
    saveSettings(s) { write(KS, s); },
    cards() { return read(KC, []); },
    saveCards(list) { return write(KC, list); },
    decks() { return read(KD, []); },
    saveDecks(list) { return write(KD, list); },
  };

  // ---- custom cards live in the same registry as default cards ----
  JD.customIds = new Set();
  JD.registerCustom = function (d) {
    JD.normalizeCard(d);
    d.custom = true;
    if (d.costMode === 'auto') JD.autoCost(d);
    JD.CARD_BY_ID[d.id] = d;
    JD.customIds.add(d.id);
    return d;
  };
  JD.loadCustom = function () {
    for (const id of JD.customIds) delete JD.CARD_BY_ID[id];
    JD.customIds.clear();
    JD.store.cards().forEach((d) => JD.registerCustom(d));
  };
  JD.customList = () => [...JD.customIds].map((id) => JD.CARD_BY_ID[id]);
  JD.allCards = () => JD.DEFAULT_CARDS.concat(JD.customList());
  JD.saveCustomCard = function (d) {
    const list = JD.store.cards().filter((x) => x.id !== d.id);
    const copy = JD.clone(d); copy.custom = true;
    list.push(copy);
    if (!JD.store.saveCards(list)) return false;
    JD.loadCustom();
    return true;
  };
  JD.deleteCustomCard = function (id) {
    JD.store.saveCards(JD.store.cards().filter((x) => x.id !== id));
    // remove it from saved decks too
    const decks = JD.store.decks();
    decks.forEach((dk) => { dk.list = dk.list.filter((e) => e[0] !== id); });
    JD.store.saveDecks(decks);
    JD.loadCustom();
  };
  JD.newCardId = () => 'cu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---- decks ----
  JD.allDecks = function () {
    const presets = JD.PRESETS.map((p) => ({ id: p.id, name: p.name, desc: p.desc, color: p.color, list: p.list, preset: true }));
    const mine = JD.store.decks().map((d) => ({ id: d.id, name: d.name, list: d.list, color: deckColor(d.list), desc: '', preset: false }));
    return presets.concat(mine);
  };
  function deckColor(list) {
    const c = {};
    for (const [id, n] of list) { const d = JD.CARD_BY_ID[id]; if (d) c[d.color] = (c[d.color] || 0) + n; }
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'cyan';
  }
  JD.deckDefs = function (list) {
    const out = [];
    for (const [id, n] of list) { const d = JD.CARD_BY_ID[id]; if (d) for (let i = 0; i < n; i++) out.push(d); }
    return out;
  };
  JD.deckCount = (list) => list.reduce((s, e) => s + (JD.CARD_BY_ID[e[0]] ? e[1] : 0), 0);
  JD.deckErrors = function (list) {
    const errs = [];
    const n = JD.deckCount(list);
    if (n !== JD.DECK_SIZE) errs.push(`デッキは${JD.DECK_SIZE}枚ちょうどにしてください（現在${n}枚）`);
    for (const [id, c] of list) if (c > JD.MAX_COPIES) errs.push(`「${(JD.CARD_BY_ID[id] || {}).name}」は${JD.MAX_COPIES}枚までです`);
    return errs;
  };
  JD.findDeck = (id) => JD.allDecks().find((d) => d.id === id);
})(typeof window !== 'undefined' ? window : globalThis);
