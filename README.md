# poetic-content — OTA content for the Poetic app

Static JSON content (poems + ciphers) consumed by the Poetic Expo app as
over-the-air deltas. No server, no database here — just versioned files
served via CDN (`git push` + tag = publish).

## Layout

```text
content/
  manifest.json              # versions + delta list + sha256/size (app fetches this first)
  registry/
    poems_index.json         # every used poem id + title|author key (AI reads before writing)
    ciphers_index.json       # every used cipher id + answer_word (AI reads before writing)
    .reserved.json           # next-id reservations for in-flight drafts (committed, cleared on publish)
  deltas/
    poems_v2.json            # ONLY new poems (+ optional poem_corrections) for version 2
    ciphers_v2.json          # ONLY new ciphers (+ optional cipher_corrections) for version 2
  full/
    poems_full_v2.json       # complete list up to v2 (script-built, never hand-edited)
    ciphers_full_v2.json
examples/                    # one valid delta entry each, doc ids *_09999 (CI validates these)
schemas/                     # JSON Schemas for app-side/editor use (validate.mjs is authoritative)
scripts/
  next-id.mjs                # reserve next classic_XXXXX / cipher_XXXXX ids
  validate.mjs               # schema + duplicate + quality gates (also runs in CI)
  build-delta.mjs            # draft -> new full + delta + manifest + registry bump
  verify.mjs                 # repo consistency: registry <-> fulls <-> manifest <-> deltas (CI)
INTEGRATION.md               # app-side fetch/apply contract (read this before wiring the app)
```

## Add new content (human or AI)

```bash
# 1. Reserve IDs (never invent them; commit .reserved.json with your draft PR)
node scripts/next-id.mjs --type poems --count 5 --reserve
node scripts/next-id.mjs --type ciphers --count 5 --reserve

# 2. Draft entries following POEM_GENERATION.md / CIPHER_GENERATION.md
#    Save as /tmp/draft.json:
#    {"poems": [...], "poem_corrections": [...]} and/or
#    {"ciphers": [...], "cipher_corrections": [...]}

# 3. Validate (must pass, CI re-runs this)
node scripts/validate.mjs --new /tmp/draft.json

# 4. Build (script writes the new full file + delta + manifest + registry).
#    NEVER copy/edit content/full/ by hand — build-delta rejects any
#    modification, deletion, or reorder of published entries.
node scripts/build-delta.mjs --type poems --to 2 --new /tmp/draft.json
node scripts/verify.mjs   # must pass

# 5. Publish (CDN reads git tags, immutable; tags are per stream)
git add content && git commit -m "content: poems v2 (+5)" && git tag poems-v2 && git push --tags
git tag ciphers-v2 && git push --tags   # when shipping ciphers
```

App fetch URL pattern (see `INTEGRATION.md` for the full contract):

```text
https://cdn.jsdelivr.net/gh/<you>/poetic-content@<tag>/content/manifest.json
```

Use a tag (`@poems-v2`), not `@main` — tags are cached immutably, branches lag ~12h.
Fallback: `https://raw.githubusercontent.com/<you>/poetic-content/<tag>/content/...`.

## Rules

* **Append-only.** Never edit or delete published `deltas/` or `full/` files.
  Fix a typo via `poem_corrections` / `cipher_corrections` in a new version
  (applied by the app with `REPLACE`), not by rewriting history.
* **IDs sequential, zero-padded, never reused:**
  poems `classic_00001…`, ciphers `cipher_00001…`.
  `classic_09999` / `cipher_09999` are reserved for docs + examples, never published.
* **Poems:** public-domain English only, full stanzas, 3 `missing_words`
  (positions 1,2,3) + exactly 6 `distractor_words`.
* **Ciphers:** original riddles only, 2 stanzas × 4 lines, `answer_word`
  `^[a-z]{3,10}$` unique, `categoryName` preferably from the 12 known
  values (stored as plain TEXT in app DB — no categories table).
* **Duplicates rejected:** same `id`, same normalized `title|author`,
  same `answer_word` (case-insensitive) all fail validation.
* **Batch limits:** ≤ 50 poems / ≤ 100 ciphers per draft, draft ≤ 200KB
  (warnings from `validate.mjs`; split larger batches).
