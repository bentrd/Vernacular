# Pack build pipeline

`build-packs.mjs` assembles the dictionary packs in `public/data/packs/` from:

1. `tools/core/<code>.json`: the hand-curated teaching cores (with example sentences), always first in each pack.
2. Open dictionary data, downloaded into a source directory:

```bash
BASE=https://download.wikdict.com/dictionaries/sqlite/2
for p in es-en es-fr en-fr fr-en it-en it-fr ru-en ru-fr zh-fr la-en la-fr; do
  curl -o "$p.sqlite3" "$BASE/$p.sqlite3"
done
for l in es en fr it ru; do
  curl -o "freq-$l.txt" "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/$l/${l}_50k.txt"
done
curl -o freq-zh.txt "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/zh_cn/zh_cn_50k.txt"
curl -o cedict.txt.gz "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz" && gunzip cedict.txt.gz
curl -o kaikki-grc-en.jsonl "https://kaikki.org/dictionary/Ancient%20Greek/kaikki.org-dictionary-AncientGreek.jsonl"
curl -o kaikki-grc-fr.jsonl "https://kaikki.org/frwiktionary/Grec%20ancien/kaikki.org-dictionary-Grecancien.jsonl"
```

Ancient Greek (grc) is built from the kaikki.org wiktextract JSONL files
instead of WikDict (which has no Ancient Greek pair): English glosses, POS,
genders and genitives come from the en extract, French glosses from the fr
extract. The EN file is ~390 MB because it includes every inflected form;
the builder streams it and keeps lemmas only. Languages whose sources are
missing from the source dir are skipped and their packs left untouched.

Then:

```bash
node tools/build-packs.mjs <source-dir>
```

Licenses: WikDict and CC-CEDICT data are CC BY-SA (Wiktionary contributors);
frequency lists derive from the OpenSubtitles corpus. Attribution is embedded
in each pack's `attribution` field and shown in the app's About section.
