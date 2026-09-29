/* Default card set + preset decks. Costs are derived from the same estimator the card editor uses,
   so default cards and original cards live on one balance scale. */
(function (root) {
  'use strict';
  const JD = root.JD;

  const b = (t, p, c) => { const o = JD.newBlock(t); Object.assign(o.p, p || {}); if (c) o.c = c; return o; };
  const on = (trigger, ...body) => ({ trigger, body });

  JD.DEFAULT_CARDS = [];
  JD.CARD_BY_ID = {};

  function add(id, type, color, name, race, p, t, scripts, flavor, fixed) {
    const d = { id, type, color, name, race, power: p, toughness: t, scripts: scripts || [], flavor: flavor || '', art: null, custom: false, costMode: 'auto', lv: 1, cost: {} };
    JD.normalizeCard(d);
    JD.autoCost(d);
    if (fixed) { d.lv = fixed.lv; d.cost = fixed.cost; d.costMode = 'manual'; }
    JD.DEFAULT_CARDS.push(d);
    JD.CARD_BY_ID[id] = d;
  }
  const L = (id, color, name, race, p, t, scripts, flavor, fixed) => add(id, 'lumina', color, name, race, p, t, scripts, flavor, fixed);
  const S = (id, color, name, scripts, flavor) => add(id, 'spell', color, name, '', 0, 0, scripts, flavor);
  const T = (id, color, name, scripts, flavor) => add(id, 'stage', color, name, '', 0, 0, scripts, flavor);

  /* ============ CYAN : 思い出・記憶 (山札 / 手札) ============ */
  L('cy01', 'cyan', '記憶の欠片', 'メモリア', 0, 1, [on('onPlay', b('draw', { n: 1 }))], '誰かの、忘れたくない一瞬。');
  L('cy02', 'cyan', '蒼き司書', 'ライブラリ', 0, 2, [on('onPlay', b('dig', { n: 3 }))], '探し物なら、私の頁の中に。');
  L('cy03', 'cyan', '追憶の少女', 'メモリア', 1, 1, [on('onDestroyed', b('draw', { n: 1 }))], '消えても、想いは残る。');
  L('cy04', 'cyan', '幻影の剣士', 'ファントム', 1, 2, [on('onAttack', b('mill', { n: 1 }))], '斬られたのは、あなたの記憶。');
  L('cy05', 'cyan', '時読みの魔女', 'ライブラリ', 1, 2, [on('onTurn', b('draw', { n: 1 }))], '過去も未来も、頁をめくるだけ。');
  L('cy06', 'cyan', 'メモリア・クリスタ・クォーツ', 'メモリア', 1, 2, [on('onPlay', b('draw', { n: 2 })), on('onTurn', b('draw', { n: 1 })), on('onAttack', b('discard', { n: 1 }))], '結晶は忘れない。持ち主さえ忘れた約束も。', { lv: 6, cost: { cyan: 2 } });
  T('cy07', 'cyan', '夢見る図書館', [on('lumAttack', b('draw', { n: 1 }))], '頁が舞う舞台で、物語は続く。');
  S('cy08', 'cyan', '記憶の泉', [on('onCast', b('draw', { n: 2 }))], '汲めども尽きぬ想い出。');
  S('cy09', 'cyan', '忘却の霧', [on('onCast', b('discard', { n: 2 }), b('bounce', { target: 'enemy' }))], '霧が晴れたとき、あなたは何を忘れた？');
  S('cy10', 'cyan', '思い出の再演', [on('onCast', b('loot', { n: 2, m: 3 }))], 'もう一度、あの日を。');
  S('cy11', 'cyan', '蒼の預言', [on('onCast', b('dig', { n: 3 }), b('mill', { n: 2 }))], '未来は、記されている。あなたの分まで。');
  L('cy12', 'cyan', '過去の残響', 'ファントム', 2, 1, [on('onPlay', b('bounce', { target: 'enemy' }))], '呼び声は、時を超えて。');

  L('cy13', 'cyan', '忘却の使い魔', 'ファントム', 1, 1, [on('onDirect', b('mill', { n: 1 }))], '触れた記憶は、二度と戻らない。');
  S('cy14', 'cyan', '記憶の侵食', [on('onCast', b('mill', { n: 2 }), b('draw', { n: 1 }))], '静かに、確実に、消していく。');

  /* ============ MAGENTA : 仲間・栄光 (場 / アタック / ダメージ) ============ */
  L('mg01', 'magenta', '見習い騎士', 'ナイト', 1, 1, [], '剣はまだ重い。だが、背中は預けられる。');
  L('mg02', 'magenta', '突撃兵', 'ソルジャー', 2, 1, [], '止まるな、駆けろ！');
  L('mg03', 'magenta', '疾風の斥候', 'ソルジャー', 1, 1, [on('onPlay', b('haste', { target: 'self' }))], '風より先に、戦場へ。');
  L('mg04', 'magenta', '栄光の旗手', 'ナイト', 1, 2, [on('static', b('sLord', { race: 'ナイト', p: 1, t: 0 }))], '旗の下に集え、誇り高き者たち。');
  L('mg05', 'magenta', '戦友の盾', 'ナイト', 0, 3, [on('onPlay', b('buff', { target: 'allyAll', p: 0, t: 1, dur: 'perm' }))], '俺の後ろに立て。');
  L('mg06', 'magenta', '烈火の闘士', 'チャンピオン', 2, 2, [on('onAttack', b('pdamage', { n: 1 }))], '栄光は、拳で掴め。');
  T('mg07', 'magenta', '英雄の凱旋', [on('lumAttack', b('pdamage', { n: 1 }))], '歓声が、剣を研ぎ澄ます。');
  S('mg08', 'magenta', '爆炎の一撃', [on('onCast', b('damage', { target: 'enemy', n: 2 }))], '仲間の想いを、炎に乗せて。');
  S('mg09', 'magenta', '連携攻撃', [on('onCast', b('buff', { target: 'ally', p: 2, t: 0, dur: 'turn' }), b('upSelf', { target: 'ally' }))], '一人じゃない。何度でも立ち上がれる。');
  S('mg10', 'magenta', '十字砲火', [on('onCast', b('damage', { target: 'enemyAll', n: 1 }), b('pdamage', { n: 1 }))], '逃げ場はない。');
  S('mg11', 'magenta', '勝利の凱歌', [on('onCast', b('pdamage', { n: 3 }))], '高らかに、勝鬨を。');
  S('mg12', 'magenta', '決戦場', [on('onCast', b('scAdd'), b('downE', { target: 'enemy' }))], '舞台は整った。');

  /* ============ YELLOW : 貴金属・宝石 (パワー / タフネス / バフ) ============ */
  L('yl01', 'yellow', '琥珀の番兵', 'ジェム', 0, 2, [], '千年の眠りの中で、まだ護っている。');
  L('yl02', 'yellow', '黄金の像', 'ゴールド', 0, 3, [], '輝きは、重さに宿る。');
  L('yl03', 'yellow', '磨かれた原石', 'ジェム', 1, 1, [on('onTurn', b('buff', { target: 'self', p: 0, t: 1, dur: 'perm' }))], '磨くほどに、強くなる。');
  L('yl04', 'yellow', '白金の騎士', 'プラチナ', 2, 3, [], '折れず、錆びず、退かず。');
  L('yl05', 'yellow', 'ダイヤの守護者', 'ゴーレム', 1, 3, [on('static', b('sBuffIf', { cond: 'showcase', p: 1, t: 1 }))], '光を浴びるほど、硬くなる。');
  L('yl06', 'yellow', '輝石の拳', 'ゴーレム', 2, 2, [], '宝石は砕けない。砕くのは、こちら。');
  T('yl07', 'yellow', '宝石商の工房', [on('static', b('sStageBuff', { p: 0, t: 2 }))], '職人の手が、輝きを増す。');
  S('yl08', 'yellow', '強化の輝き', [on('onCast', b('buff', { target: 'ally', p: 1, t: 1, dur: 'perm' }))], '磨け。もっと。');
  S('yl09', 'yellow', '集う輝き', [on('onCast', b('buff', { target: 'allyAll', p: 1, t: 1, dur: 'perm' }))], '無数の光が、一つになる。');
  S('yl10', 'yellow', '宝石の呪縛', [on('onCast', b('debuff', { target: 'enemy', p: 2, t: 0, dur: 'perm' }))], '美しさは、時に鎖となる。');
  S('yl11', 'yellow', '金属疲労', [on('onCast', b('debuff', { target: 'enemyAll', p: 1, t: 1, dur: 'perm' }))], '最強の盾も、いつか軋む。');
  L('yl12', 'yellow', '輝石竜', 'ドラゴン', 3, 2, [], '眠れる宝石が目を覚ます。');

  /* ============ GREEN : 自然・豊穣 (ジュエルゾーン) ============ */
  L('gr01', 'green', '芽吹きの精', 'ドライアド', 0, 1, [on('onPlay', b('jewelTop', { n: 1 }))], '小さな種が、大きな森になる。');
  L('gr02', 'green', '森の番人', 'フォレスト', 1, 2, [], '森は、静かに怒る。');
  L('gr03', 'green', '豊穣の花', 'フラワー', 0, 2, [on('onTurn', b('extraFlow', { n: 1 }))], '咲くたびに、世界が広がる。');
  L('gr04', 'green', '大樹の獣', 'ビースト', 2, 2, [on('onPlay', b('extraFlow', { n: 1 }))], '踏みしめた大地が、応える。');
  L('gr05', 'green', '蔦の魔獣', 'ビースト', 1, 1, [on('onAttack', b('jewelBreak', { n: 1 }))], '根こそぎ、絡め取る。');
  L('gr06', 'green', '実りの女王', 'ドライアド', 1, 3, [on('onTurn', b('jewelTop', { n: 1 }))], '今年も、実りの季節。');
  T('gr07', 'green', '世界樹の根', [on('lumEnter', b('jewelTop', { n: 1 }), b('extraFlow', { n: 1 }))], '根は、大地の記憶を吸い上げる。');
  S('gr08', 'green', '恵みの雨', [on('onCast', b('jewelTop', { n: 2 }))], '雨上がりの土は、宝石のよう。');
  S('gr09', 'green', '大地の怒り', [on('onCast', b('jewelBreak', { n: 2 }))], '地が割れ、輝きが呑まれる。');
  S('gr10', 'green', '芽生えの祈り', [on('onCast', b('extraFlow', { n: 2 }), b('draw', { n: 1 }))], '祈りは、種となる。');
  S('gr11', 'green', '森の恵み', [on('onCast', b('heal', { target: 'allyAll', n: 2 }), b('buff', { target: 'allyAll', p: 0, t: 1, dur: 'perm' }))], '傷を癒し、根を強くする。');
  S('gr12', 'green', '還流の風', [on('onCast', b('jewelBack'), b('draw', { n: 2 }))], '巡る風が、贈り物を運ぶ。');

  /* ============ BLACK : 命・歴史 (トラッシュ / ライフ) ============ */
  L('bk01', 'black', '迷える亡霊', 'ゴースト', 1, 1, [on('onDestroyed', b('recover', { n: 1 }))], '終わりは、始まりの影。');
  L('bk02', 'black', '墓守', 'グレイヴ', 0, 3, [on('onPlay', b('lifeGain', { n: 2 }))], '眠る者に、安らぎを。');
  L('bk03', 'black', '歴史の語り部', 'ヒストリア', 1, 2, [on('onPlay', b('revive'))], '語られる限り、彼らは死なない。');
  L('bk04', 'black', '吸命の魔女', 'ヴァンパイア', 1, 1, [on('onHit', b('lifeGain', { n: 1 }))], 'あなたの命、少し分けて。');
  L('bk05', 'black', '死神の従者', 'ゴースト', 2, 1, [on('onPlay', b('selfMill', { n: 2 }))], '代償は、いつも先払い。');
  L('bk06', 'black', '血塗られた王', 'ヴァンパイア', 2, 2, [on('onAttack', b('lifeGain', { n: 1 }))], '玉座は、奪った命で温まる。');
  T('bk07', 'black', '忘れられた墓標', [on('lumDestroyed', b('recover', { n: 1 }))], '名前は消えても、石は覚えている。');
  S('bk08', 'black', '命の等価交換', [on('onCast', b('if', { cond: 'lumGE', n: 1 }, [b('sac'), b('destroy', { target: 'enemy' })]))], '差し出せ。さすれば奪える。');
  S('bk09', 'black', '死者の行進', [on('onCast', b('recover', { n: 2 }))], '墓が開く。彼らは終わっていない。');
  S('bk10', 'black', '命の輪廻', [on('onCast', b('lifeGain', { n: 3 }))], '巡る命は、尽きない。');
  S('bk11', 'black', '冥府の裁き', [on('onCast', b('destroy', { target: 'enemy' }))], '歴史は、審判を下す。');
  S('bk12', 'black', '深淵の記録', [on('onCast', b('selfMill', { n: 3 }), b('recover', { n: 3 }))], '深く潜るほど、多くを掬える。');

  /* ============ WHITE : 伝説・信じる心 (染色 / 移動) ============ */
  L('wh01', 'white', '虹色の欠片', 'レジェンド', 0, 1, [on('static', b('sDye', { color: 'yellow' }))], '光の当たり方で、色が変わる。');
  L('wh02', 'white', '白き羽根', 'エンジェル', 1, 1, [on('onPlay', b('moveLumina'))], '風に乗って、どこへでも。');
  L('wh03', 'white', '聖なる導き手', 'エンジェル', 0, 2, [on('onPlay', b('dye', { color: 'green' }))], '信じる者に、道は開く。');
  L('wh04', 'white', '伝承の白馬', 'ユニコーン', 2, 2, [on('static', b('sDye', { color: 'cyan' }))], '語り継がれた姿のまま、駆ける。');
  L('wh05', 'white', '純白の竜', 'ドラゴン', 2, 3, [on('static', b('sBuffIf', { cond: 'showcase', p: 1, t: 1 }))], '信仰が、鱗を輝かせる。');
  L('wh06', 'white', '信仰の騎士', 'レジェンド', 1, 2, [on('onPlay', b('scMove'))], '信じる場所こそ、聖域。');
  T('wh07', 'white', '聖域の祭壇', [on('static', b('sStageBuff', { p: 1, t: 1 }))], '祈りが力に変わる場所。');
  S('wh08', 'white', '星降る祈り', [on('onCast', b('scMove'), b('heal', { target: 'allyAll', n: 1 }))], '星の光が、舞台を照らす。');
  S('wh09', 'white', '奇跡の転移', [on('onCast', b('pushE'), b('moveLumina'))], '道は、信じる者が決める。');
  S('wh10', 'white', '虹の架け橋', [on('onCast', b('dye', { color: 'cyan' }), b('dye', { color: 'magenta' }), b('extraFlow', { n: 1 }))], '七つの色が、一つの橋になる。');
  S('wh11', 'white', '伝説の目覚め', [on('onCast', b('scAdd'))], '物語が、もう一つの舞台を望む。');
  L('wh12', 'white', 'レジェンド・ユニコーン', 'ユニコーン', 3, 2, [], '伝説は、ただそこにいるだけで伝説。');

  /* ============ 混色 (他色のブロックを含むカードは、その色も要求する) ============ */
  L('x01', 'cyan', '記憶の狙撃手', 'ファントム', 1, 1, [on('onPlay', b('damage', { target: 'enemy', n: 1 }))], '狙いは、覚えている。');
  L('x02', 'magenta', '黄金の突撃槍', 'ソルジャー', 1, 2, [on('onPlay', b('buff', { target: 'self', p: 1, t: 0, dur: 'perm' }))], '黄金の穂先が、戦場を貫く。');
  L('x03', 'yellow', '翠玉の守り手', 'ジェム', 1, 2, [on('onPlay', b('jewelTop', { n: 1 }))], '緑の石は、大地の恵みを覚えている。');
  L('x04', 'green', '腐葉土の蠢き', 'ビースト', 1, 1, [on('onPlay', b('recover', { n: 1 }))], '土に還ったものは、また芽吹く。');
  L('x05', 'black', '黄昏の聖女', 'エンジェル', 1, 2, [on('onPlay', b('pushE'))], '夕暮れは、生と死の境界。');
  L('x06', 'white', '白き司書', 'ライブラリ', 0, 2, [on('onPlay', b('draw', { n: 1 }))], '伝説は、頁の中で眠っている。');

  /* ============ Preset decks ============ */
  JD.PRESETS = [
    { id: 'p_cyan', name: 'シアン：記憶の図書館', color: 'cyan', desc: 'ドローと手札破壊で優位を築く。ルミナは毎ターン働くエンジン型。',
      list: [['cy01', 3], ['cy02', 2], ['cy03', 3], ['cy04', 2], ['cy05', 2], ['cy06', 1], ['cy12', 2], ['cy13', 3], ['cy07', 1], ['cy08', 2], ['cy09', 1], ['cy14', 2], ['cy11', 1], ['wh02', 2], ['wh04', 1], ['x06', 2]] },
    { id: 'p_magenta', name: 'マゼンタ：栄光の騎士団', color: 'magenta', desc: '種族「ナイト」で固めた速攻。旗手で全軍を底上げ。',
      list: [['mg01', 3], ['mg02', 2], ['mg03', 2], ['mg04', 2], ['mg05', 2], ['mg06', 2], ['mg07', 1], ['mg08', 2], ['mg09', 1], ['mg10', 1], ['mg11', 1], ['yl01', 2], ['yl04', 2], ['yl08', 2], ['x02', 3], ['yl06', 2]] },
    { id: 'p_yellow', name: 'イエロー：宝石の巨人', color: 'yellow', desc: '高いタフネスとバフで押し切る。ショーケースで真価を発揮。',
      list: [['yl01', 2], ['yl02', 2], ['yl03', 3], ['yl04', 2], ['yl05', 2], ['yl06', 2], ['yl07', 1], ['yl08', 2], ['yl09', 1], ['yl10', 1], ['yl12', 1], ['gr01', 2], ['gr02', 2], ['gr08', 1], ['x03', 3], ['gr04', 2], ['yl11', 1]] },
    { id: 'p_green', name: 'グリーン：森の恵み', color: 'green', desc: 'ジュエルを爆発的に増やし、重いカードを一気に展開。',
      list: [['gr01', 3], ['gr02', 3], ['gr03', 2], ['gr04', 3], ['gr05', 2], ['gr06', 2], ['gr07', 1], ['gr08', 2], ['gr09', 1], ['gr10', 1], ['gr11', 1], ['gr12', 1], ['bk01', 2], ['bk02', 2], ['bk09', 1], ['x04', 3]] },
    { id: 'p_black', name: 'ブラック：黄昏の墓所', color: 'black', desc: 'トラッシュを資源に変える循環型。自傷に注意しつつ戦う。',
      list: [['bk01', 3], ['bk02', 2], ['bk03', 2], ['bk04', 2], ['bk05', 2], ['bk06', 2], ['bk07', 1], ['bk08', 2], ['bk09', 1], ['bk10', 1], ['bk11', 1], ['wh01', 2], ['wh02', 2], ['wh03', 2], ['x05', 3], ['bk12', 1], ['wh04', 1]] },
    { id: 'p_white', name: 'ホワイト：伝説の証', color: 'white', desc: 'ショーケースを操り、少数の強力なルミナで戦う。',
      list: [['wh01', 3], ['wh02', 2], ['wh03', 2], ['wh04', 2], ['wh05', 2], ['wh06', 2], ['wh07', 1], ['wh08', 2], ['wh09', 1], ['wh10', 1], ['wh11', 1], ['mg01', 2], ['mg02', 2], ['mg08', 2], ['mg03', 2], ['wh12', 1], ['mg04', 1], ['mg09', 1]] },
  ];
  JD.deckSize = (list) => list.reduce((s, x) => s + x[1], 0);
})(typeof window !== 'undefined' ? window : globalThis);
