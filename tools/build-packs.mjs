// Builds the full dictionary packs: curated core (with examples) first, then
// tens of thousands of real dictionary entries from open lexicographic data.
//
// Sources (download once into SRC dir, see tools/README):
//   WikDict sqlite exports (Wiktionary-derived, CC-BY-SA): <l>-en / <l>-fr pairs
//   CC-CEDICT (CC-BY-SA): Chinese with pinyin
//   hermitdave/FrequencyWords (OpenSubtitles): 50k frequency lists
//   Kaikki.org wiktextract JSONL (CC-BY-SA): Ancient Greek (en + fr wiktionaries)
//
// Languages whose sources are absent from SRC are left untouched, so the
// script can rebuild a single pack from a partial source directory.
//
// Usage: node tools/build-packs.mjs <path-to-source-dir>
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) {
  console.error('usage: node tools/build-packs.mjs <source-dir>');
  process.exit(1);
}

const OUT = 'public/data/packs';
const WORD_CAP = 32000;
const GLOSS_MAX = 90;

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const sanitize = (s) =>
  s.replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();

// keep glosses short and readable
function clipGloss(parts, max = GLOSS_MAX) {
  const out = [];
  let len = 0;
  for (const p of parts) {
    const t = sanitize(p);
    if (!t || out.includes(t)) continue;
    if (len + t.length > max && out.length) break;
    out.push(t);
    len += t.length + 2;
  }
  return out.join(', ');
}

// POS tag mapping per source vocabulary; null = skip entry (proper nouns etc.)
const SKIP = null;
const POS_MAPS = {
  es: {
    sustantivo_masculino: ['noun', 'm.'], sustantivo_femenino: ['noun', 'f.'],
    sustantivo_masculino_y_femenino: ['noun', 'm./f.'], sustantivo: ['noun', ''],
    sustantivo_propio: SKIP, adjetivo: ['adjective', ''], adverbio: ['adverb', ''],
    verbo_transitivo: ['verb', ''], verbo_intransitivo: ['verb', ''],
    verbo_pronominal: ['verb', 'pron.'], verbo: ['verb', ''], verbo_impersonal: ['verb', ''],
    interjección: ['interjection', ''], preposición: ['preposition', ''],
    conjunción: ['conjunction', ''], pronombre: ['pronoun', ''],
    adjetivo_numeral: ['numeral', ''], numeral: ['numeral', ''],
  },
  fr: {
    nom: ['noun', ''], adj: ['adjective', ''], verb: ['verb', ''], adv: ['adverb', ''],
    interjection: ['interjection', ''], 'préposition': ['preposition', ''],
    conjonction: ['conjunction', ''], pronom: ['pronoun', ''],
    'adjectif_numéral': ['numeral', ''], nompr: SKIP, 'prénom': SKIP, nom_de_famille: SKIP,
  },
  en: {
    Noun: ['noun', ''], Adjective: ['adjective', ''], Verb: ['verb', ''], Adverb: ['adverb', ''],
    Interjection: ['interjection', ''], Preposition: ['preposition', ''],
    Conjunction: ['conjunction', ''], Pronoun: ['pronoun', ''], Numeral: ['numeral', ''],
    Proper_noun: SKIP, Prefix: SKIP, Suffix: SKIP,
  },
  it: {
    sost: ['noun', ''], nome: ['noun', ''], agg: ['adjective', ''], verb: ['verb', ''],
    avv: ['adverb', ''], pronome: ['pronoun', ''], cong: ['conjunction', ''],
    prep: ['preposition', ''], agg_num: ['numeral', ''], interiezione: ['interjection', ''],
    acron: SKIP,
  },
  ru: {
    'сущ': ['noun', ''], 'прил': ['adjective', ''], 'гл': ['verb', ''], adv: ['adverb', ''],
    'числ': ['numeral', ''], 'мест': ['pronoun', ''], interj: ['interjection', ''],
    prep: ['preposition', ''], part: ['particle', ''], 'Фам': SKIP, 'прич': SKIP,
  },
  zh: {
    '名詞': ['noun', ''], '名词': ['noun', ''], '副詞': ['adverb', ''], '副词': ['adverb', ''],
    '形容詞': ['adjective', ''], '形容词': ['adjective', ''],
    '感嘆詞': ['interjection', ''], '感叹词': ['interjection', ''],
    '成語': ['phrase', ''], '成语': ['phrase', ''], '谚语': ['phrase', ''],
    '專有名詞': SKIP, '专有名词': SKIP,
  },
  la: {
    substantivum: ['noun', ''], nomensubst: ['noun', ''], nomen: ['noun', ''],
    adiectivum: ['adjective', ''], nomenadj: ['adjective', ''],
    verbum: ['verb', ''], intransitivum: ['verb', ''], transitivum: ['verb', ''],
    adverbium: ['adverb', ''], proprium: SKIP, nomenprop: SKIP, participium: SKIP,
  },
};

// Russian practical transliteration
const RU_MAP = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
  'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
  'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':"'",'э':'e','ю':'yu','я':'ya',
};
const ruTranslit = (s) => [...s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()].map((c) => RU_MAP[c] ?? c).join('');

// numbered pinyin (CC-CEDICT) to tone marks
const PY_TONES = {
  a: 'a\u0101\u00e1\u01ce\u00e0', e: 'e\u0113\u00e9\u011b\u00e8', i: 'i\u012b\u00ed\u01d0\u00ec',
  o: 'o\u014d\u00f3\u01d2\u00f2', u: 'u\u016b\u00fa\u01d4\u00f9', v: '\u00fc\u01d6\u01d8\u01da\u01dc',
};
function pinyinPretty(numbered) {
  return numbered
    .toLowerCase()
    .split(/\s+/)
    .map((syl) => {
      const m = syl.match(/^([a-z:]+)([1-5])$/);
      if (!m) return syl.replace(/u:/g, '\u00fc');
      let body = m[1].replace(/u:/g, 'v');
      const tone = Number(m[2]);
      if (tone === 5) return body.replace(/v/g, '\u00fc');
      let idx = -1;
      if (body.includes('a')) idx = body.indexOf('a');
      else if (body.includes('e')) idx = body.indexOf('e');
      else if (body.includes('ou')) idx = body.indexOf('o');
      else {
        for (let i = body.length - 1; i >= 0; i--) {
          if ('iouv'.includes(body[i])) { idx = i; break; }
        }
      }
      if (idx === -1) return body.replace(/v/g, '\u00fc');
      const ch = body[idx];
      const marked = PY_TONES[ch] ? PY_TONES[ch][tone] : ch;
      return (body.slice(0, idx) + marked + body.slice(idx + 1)).replace(/v/g, '\u00fc');
    })
    .join(' ');
}

const slugCounts = new Map();
function makeId(base, used) {
  let s = fold(base).replace(/[^a-z0-9]+/g, '') || 'w';
  if (s.length > 24) s = s.slice(0, 24);
  let id = s;
  let n = 1;
  while (used.has(id)) { n += 1; id = `${s}${n}`; }
  used.add(id);
  return id;
}

function sql(db, query) {
  const tmp = join(tmpdir(), `wk-${Math.random().toString(36).slice(2)}.tsv`);
  execSync(`sqlite3 -noheader -separator '\t' "${db}" ${JSON.stringify(query)} > ${JSON.stringify(tmp)}`, {
    maxBuffer: 1024 * 1024 * 512, shell: '/bin/bash',
  });
  const rows = readFileSync(tmp, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  execSync(`rm -f ${JSON.stringify(tmp)}`);
  return rows;
}

// aggregated glosses + importance from a WikDict pair; translations below
// MIN_SCORE are dropped (low-confidence rows are where the junk lives)
const MIN_SCORE = 2;
function loadWikdict(pair) {
  const db = join(SRC, `${pair}.sqlite3`);
  if (!existsSync(db)) return null;
  const glosses = new Map(); // fold(hw) -> {hw, parts:[], importance}
  for (const [hw, transList] of sql(db,
    `SELECT written_rep, trans_list FROM translation WHERE written_rep IS NOT NULL AND score >= ${MIN_SCORE} ORDER BY score DESC`)) {
    if (!hw) continue;
    const key = fold(hw);
    const parts = (transList || '').split(' | ');
    const cur = glosses.get(key);
    if (cur) cur.parts.push(...parts);
    else glosses.set(key, { hw, parts, importance: 0 });
  }
  for (const [hw, imp] of sql(db,
    `SELECT written_rep, COALESCE(rel_importance, 0) FROM simple_translation WHERE written_rep IS NOT NULL`)) {
    const cur = glosses.get(fold(hw));
    if (cur) cur.importance = Math.max(cur.importance, Number(imp) || 0);
  }
  return glosses;
}

// best POS per headword from the translation table lexentries
function loadPos(pair, posMap) {
  const db = join(SRC, `${pair}.sqlite3`);
  if (!existsSync(db)) return new Map();
  const best = new Map(); // fold(hw) -> {tag, score}
  for (const [hw, lexentry, score] of sql(db,
    `SELECT written_rep, lexentry, MAX(COALESCE(score,0)) FROM translation GROUP BY written_rep, lexentry`)) {
    if (!hw || !lexentry) continue;
    const m = lexentry.match(/__(.+?)__\d+$/) || lexentry.match(/__(.+?)$/);
    const tag = m ? m[1].replace(/__\d+$/, '') : '';
    if (!(tag in posMap)) continue; // unknown or empty tag: contributes nothing
    const key = fold(hw);
    const cur = best.get(key);
    const sc = Number(score) || 0;
    if (!cur || sc > cur.score) best.set(key, { tag, score: sc });
  }
  return best;
}

function loadFreq(code) {
  const f = join(SRC, `freq-${code}.txt`);
  if (!existsSync(f)) return [];
  const seen = new Set();
  const out = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const tok = line.split(' ')[0]?.trim();
    if (!tok) continue;
    const key = fold(tok);
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

const wordOk = (hw) =>
  hw && !hw.includes(' ') && hw.length <= 30 && !/\d/.test(hw) &&
  hw[0] === hw[0].toLowerCase() && !/[|/\\[\](){}<>"«»,;:!?.]/.test(hw);

function buildTier2(code, { enPair, frPair }) {
  const posMap = POS_MAPS[code] || {};
  const en = enPair ? loadWikdict(enPair) : null;
  const fr = frPair ? loadWikdict(frPair) : null;
  const pos = loadPos(enPair || frPair, posMap);
  const primary = en || fr;
  if (!primary) return [];

  const entries = new Map(); // fold -> entry
  for (const [key, g] of primary) {
    if (!wordOk(g.hw)) continue;
    const p = pos.get(key);
    let posName = '';
    let gline = '';
    if (p) {
      const mapped = posMap[p.tag];
      if (mapped === SKIP) continue;
      if (mapped) { posName = mapped[0]; gline = mapped[1]; }
    }
    const enGloss = en ? clipGloss(en.get(key)?.parts || []) : '';
    const frGloss = fr ? clipGloss(fr.get(key)?.parts || []) : '';
    if (!enGloss && !frGloss) continue;
    const e = { hw: g.hw, importance: g.importance };
    if (gline) e.g = gline;
    if (posName) e.pos = posName;
    if (enGloss) e.en = enGloss;
    if (frGloss) e.fr = frGloss;
    if (code === 'ru') e.rom = ruTranslit(g.hw);
    entries.set(key, e);
  }
  return entries;
}

function buildZhTier2() {
  // CC-CEDICT: en glosses + pinyin (+ traditional, measure words); WikDict zh-fr for French
  const fr = loadWikdict('zh-fr');
  const entries = new Map();
  for (const line of readFileSync(join(SRC, 'cedict.txt'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/\s*$/);
    if (!m) continue;
    const [, trad, simp, py, defs] = m;
    if (simp.length > 6 || /[a-zA-Z0-9\u3000-\u303f]/.test(simp)) continue;
    const senses = defs.split('/');
    let mw = '';
    const glossParts = [];
    for (const s of senses) {
      if (s.startsWith('CL:')) { if (!mw) mw = s.slice(3).split(',')[0].replace(/\[.*?\]/g, '').split('|').pop(); continue; }
      if (/^(variant of|old variant|surname |see |used in|abbr\. )/i.test(s)) continue;
      glossParts.push(s.replace(/\[.*?\]/g, '').trim());
    }
    const enGloss = clipGloss(glossParts);
    if (!enGloss) continue;
    const key = simp;
    if (entries.has(key)) continue;
    const e = { hw: simp, en: enGloss, rom: pinyinPretty(py), importance: 0 };
    const gBits = [];
    if (trad !== simp) gBits.push(`trad. ${trad}`);
    if (mw) gBits.push(`MW ${mw}`);
    if (gBits.length) e.g = gBits.join(' \u00b7 ');
    const frGloss = fr ? clipGloss(fr.get(fold(simp))?.parts || []) : '';
    if (frGloss) e.fr = frGloss;
    entries.set(key, e);
  }
  return entries;
}

// --- Ancient Greek (kaikki.org wiktextract JSONL) ---

const GRC_POS = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb',
  pron: 'pronoun', prep: 'preposition', conj: 'conjunction',
  particle: 'particle', intj: 'interjection', num: 'numeral',
};

// Wiktionary decorates headwords with metrical length marks (ᾱ̆); strip them,
// but keep breathings, accents and iota subscript, which are real orthography.
const grcClean = (s) =>
  s.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');

const grcScriptOk = (s) => /^(?:[Ͱ-Ͽἀ-῿]|[̀-ͯ])+$/u.test(s.normalize('NFD'));

// Scholarly transliteration: ē/ō for η/ω, th/ph/ch/ps, h for rough breathing,
// y for lone upsilon but u in diphthongs, ng for γγ/γκ/γξ/γχ, i for subscript.
const GRC_LETTERS = {
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e',
  'ζ': 'z', 'η': 'ē', 'θ': 'th', 'ι': 'i', 'κ': 'k',
  'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o',
  'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't',
  'υ': 'y', 'φ': 'ph', 'χ': 'ch', 'ψ': 'ps', 'ω': 'ō',
};
export function grcTranslit(word) {
  const chars = [...word.normalize('NFD').toLowerCase()];
  const bases = chars.filter((c) => !(c >= '̀' && c <= 'ͯ'));
  const out = [];
  let hAtStart = false;
  let baseIdx = -1;
  for (const c of chars) {
    if (c === '̔') {
      // rough breathing: ῥ becomes rh, otherwise an initial h
      if (out.length && out[out.length - 1] === 'r') out[out.length - 1] = 'rh';
      else hAtStart = true;
      continue;
    }
    if (c === 'ͅ') { out.push('i'); continue; } // iota subscript
    if (c >= '̀' && c <= 'ͯ') continue;
    baseIdx += 1;
    let t = GRC_LETTERS[c];
    if (t === undefined) { out.push(c); continue; }
    if (c === 'γ' && 'γκξχ'.includes(bases[baseIdx + 1])) t = 'n';
    if (c === 'υ') {
      const prev = bases[baseIdx - 1];
      const next = bases[baseIdx + 1];
      if ('αεοη'.includes(prev) || next === 'ι') t = 'u';
    }
    out.push(t);
  }
  return (hAtStart ? 'h' : '') + out.join('');
}

const GRC_ARTICLE = { m: 'ὁ', f: 'ἡ', n: 'τό', mf: 'ὁ/ἡ' };

function kaikkiGlosses(w) {
  const parts = [];
  for (const s of w.senses || []) {
    const tags = s.tags || [];
    if (tags.includes('form-of') || tags.includes('alt-of') || s.form_of || s.alt_of) continue;
    const g = s.glosses?.[s.glosses.length - 1];
    if (!g) continue;
    if (/^(form|inflection|alternative (form|spelling)|romanization|variant) of/i.test(g)) continue;
    parts.push(g.replace(/\s*\.$/, ''));
  }
  return parts;
}

async function loadKaikki(file, onEntry) {
  const rl = createInterface({ input: createReadStream(join(SRC, file)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try { onEntry(JSON.parse(line)); } catch { /* skip malformed line */ }
  }
}

// Dictionary line in the style of the curated core: genitive + article for
// nouns ("λόγος, λόγου, ὁ"), the three genders for adjectives.
function grcGline(w, hw, posName) {
  const heads = (w.forms || []).filter((f) => !f.source);
  const headForm = (tag) => {
    const f = heads.find((x) => (x.tags || []).includes(tag));
    return f ? grcClean(f.form) : '';
  };
  if (posName === 'noun') {
    const expansion = w.head_templates?.[0]?.expansion || '';
    const genderMatch = expansion.match(/\)\s+(m or f|f or m|m|f|n)\b/);
    let gender = genderMatch ? genderMatch[1] : '';
    if (!gender) {
      const tags = heads.find((x) => (x.tags || []).includes('canonical'))?.tags || [];
      gender = tags.includes('masculine') ? 'm' : tags.includes('feminine') ? 'f' : tags.includes('neuter') ? 'n' : '';
    }
    const art = GRC_ARTICLE[gender.includes('or') ? 'mf' : gender] || '';
    const gen = headForm('genitive');
    if (gen && art) return `${hw}, ${gen}, ${art}`;
    if (gen) return `${hw}, ${gen}`;
    if (art) return `${hw}, ${art}`;
    return '';
  }
  if (posName === 'adjective') {
    const fem = headForm('feminine');
    const neut = headForm('neuter');
    if (fem && neut) return `${hw}, ${fem}, ${neut}`;
    if (neut) return `${hw}, ${neut}`;
    return '';
  }
  return '';
}

async function buildGrcTier2() {
  if (!existsSync(join(SRC, 'kaikki-grc-en.jsonl'))) return null;

  // frwiktionary glosses are sentence-cased; the other packs gloss in
  // lowercase, so match them (proper capitals like "Zeus" stay).
  const decap = (s) => (/^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿœ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

  const fr = new Map(); // NFC hw -> gloss parts
  if (existsSync(join(SRC, 'kaikki-grc-fr.jsonl'))) {
    await loadKaikki('kaikki-grc-fr.jsonl', (w) => {
      if (!(w.pos in GRC_POS) || !w.word) return;
      const hw = grcClean(w.word);
      const parts = kaikkiGlosses(w).map(decap);
      if (!parts.length) return;
      const cur = fr.get(hw);
      if (cur) cur.push(...parts);
      else fr.set(hw, parts);
    });
  }

  const entries = new Map(); // NFC hw -> entry
  await loadKaikki('kaikki-grc-en.jsonl', (w) => {
    const posName = GRC_POS[w.pos];
    if (!posName || !w.word) return;
    const hw = grcClean(w.word);
    if (!grcScriptOk(hw) || !wordOk(hw)) return;
    const parts = kaikkiGlosses(w);
    if (!parts.length) return;
    const enGloss = clipGloss(parts);
    if (!enGloss) return;
    const frGloss = clipGloss(fr.get(hw) || []);
    const e = {
      hw,
      rom: grcTranslit(hw),
      pos: posName,
      en: enGloss,
      importance: parts.length + (frGloss ? 2 : 0),
    };
    const gline = grcGline(w, hw, posName);
    if (gline) e.g = gline;
    if (frGloss) e.fr = frGloss;
    const cur = entries.get(hw);
    if (!cur || e.importance > cur.importance) entries.set(hw, e);
  });
  return entries;
}

const CONFIGS = {
  la: { enPair: 'la-en', frPair: 'la-fr', freq: null },
  grc: { kaikki: true, freq: null },
  es: { enPair: 'es-en', frPair: 'es-fr', freq: 'es' },
  en: { enPair: null, frPair: 'en-fr', freq: 'en' },
  fr: { enPair: 'fr-en', frPair: null, freq: 'fr' },
  it: { enPair: 'it-en', frPair: 'it-fr', freq: 'it' },
  ru: { enPair: 'ru-en', frPair: 'ru-fr', freq: 'ru' },
  zh: { freq: 'zh' },
};

const ATTRIB = {
  la: 'Dictionary data: WikDict / Wiktionary (CC BY-SA)',
  grc: 'Dictionary data: Wiktionary via Kaikki.org (CC BY-SA)',
  zh: 'Dictionary data: CC-CEDICT and WikDict / Wiktionary (CC BY-SA)',
  default: 'Dictionary data: WikDict / Wiktionary (CC BY-SA); frequency: OpenSubtitles',
};

// A language is only rebuilt when its dictionary sources are present, so a
// partial SRC dir (say, just the Greek files) can't wipe the other packs.
const hasSources = (code, cfg) => {
  if (code === 'zh') return existsSync(join(SRC, 'cedict.txt'));
  if (cfg.kaikki) return existsSync(join(SRC, 'kaikki-grc-en.jsonl'));
  return [cfg.enPair, cfg.frPair].filter(Boolean).some((p) => existsSync(join(SRC, `${p}.sqlite3`)));
};

for (const [code, cfg] of Object.entries(CONFIGS)) {
  if (!hasSources(code, cfg)) {
    console.log(`${code}: sources not in SRC, pack left untouched`);
    continue;
  }
  const packPath = `${OUT}/${code}.json`;
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const core = JSON.parse(readFileSync(`tools/core/${code}.json`, 'utf8'));

  const tier2 =
    code === 'zh' ? buildZhTier2() : cfg.kaikki ? await buildGrcTier2() : buildTier2(code, cfg);

  // Greek folds breathings and accents away, which would collapse real minimal
  // pairs (εἷς/εἰς, πότε/ποτέ), so its dedupe key keeps the marks.
  const hwKey = code === 'grc' ? (s) => s.normalize('NFC') : fold;

  const usedIds = new Set(core.map((w) => w.id));
  const usedHws = new Set(core.map((w) => hwKey(w.hw)));
  const words = [...core];

  const take = (key) => {
    if (words.length >= WORD_CAP) return;
    const e = tier2.get(key);
    if (!e || usedHws.has(hwKey(e.hw))) return;
    usedHws.add(hwKey(e.hw));
    tier2.delete(key);
    const { importance, ...entry } = e;
    words.push({ id: makeId(e.rom || e.hw, usedIds), ...entry });
  };

  // frequency-ranked first, then the rest of the dictionary by importance
  if (cfg.freq) for (const key of loadFreq(cfg.freq)) take(key);
  const rest = [...tier2.entries()].sort((a, b) => (b[1].importance || 0) - (a[1].importance || 0));
  for (const [key] of rest) take(key);

  pack.words = words;
  if (code === 'ru') pack.marks = 'Stress marks';
  pack.attribution = ATTRIB[code] || ATTRIB.default;
  writeFileSync(packPath, JSON.stringify(pack, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
  console.log(`${code}: ${core.length} core + ${words.length - core.length} dictionary = ${words.length} words`);
}

// rebuild the index
const codes = ['la', 'grc', 'es', 'en', 'fr', 'it', 'ru', 'zh'];
const index = codes.map((c) => {
  const p = JSON.parse(readFileSync(`${OUT}/${c}.json`, 'utf8'));
  return { code: p.code, name: p.name, native: p.native, count: p.words.length, marks: p.marks || null };
});
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 2) + '\n');
console.log('index rebuilt');
