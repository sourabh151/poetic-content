# AGENTS.md — mandatory workflow for AI contributors in this repo

You are in the `poetic-content` repo (OTA content for the Poetic app).
Follow this order. Do not skip steps. If a step fails, fix and re-run —
never commit a failing draft.

## Before writing ANY poem or cipher

1. Read these three files (small, always current):
   - `content/registry/poems_index.json`
   - `content/registry/ciphers_index.json`
   - `content/manifest.json`
2. Read the full generation spec for this batch:
   - poems → `POEM_GENERATION.md` (entire file)
   - ciphers → `CIPHER_GENERATION.md` (entire file)
3. Reserve IDs — never invent them:
   ```bash
   node scripts/next-id.mjs --type poems --count 5 --reserve
   node scripts/next-id.mjs --type ciphers --count 5 --reserve
   ```
   Use exactly the IDs printed, in order. If you need more, re-run.

## While writing

* Generate entries **one by one**, self-checking each against its spec
  before starting the next (see "Generation Steps" in each spec file).
* Poems: public-domain English only, full stanzas, 3 missing words
  (positions 1,2,3, accurate definitions, useful rhyme hints) + exactly
  6 thematically-related distractor words.
* Ciphers: original riddles only, 2 stanzas × 4 lines = 8 clue-dense
  lines. FORBIDDEN: letter counts, "What/Who am I", the `answer_word`
  appearing as a standalone word in the riddle or hint (case-insensitive).
* Reuse existing categories where possible. Poems: the 8 fixed values.
  Ciphers: prefer the 12 values in `ciphers_index.json → categories`
  (free-form allowed, but reuse keeps the app tidy).

## After drafting

```bash
# draft shape: {"poems": [...], "poem_corrections": [...]} and/or
# {"ciphers": [...], "cipher_corrections": [...]}
node scripts/validate.mjs --new /tmp/draft.json
# script builds the new full file + delta + manifest + registry:
node scripts/build-delta.mjs --type poems --to 2 --new /tmp/draft.json
node scripts/verify.mjs
```

* Exit 0 = pass. Any `ERROR` = rewrite the offending entry, re-run.
  Warnings should also be resolved unless you can justify them.
* Then build (see README.md), never hand-edit `registry/`, `manifest.json`,
  `content/full/`, or `content/deltas/`. Typo fixes go in
  `poem_corrections` / `cipher_corrections` (same id, fixed body).
* Commit `content/registry/.reserved.json` with your draft PR so parallel
  runs don't collide; `build-delta.mjs` clears published ids from it.

## Forbidden

* Reusing an `id`, a normalized `title|author` pair, or an `answer_word`
  already in the registry (all fail validation + CI).
* Editing published `content/deltas/*`, `content/full/*`, or prior tags.
* Committing without a passing `validate.mjs` run.
