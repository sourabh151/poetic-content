# poetic-content — OTA content for the Poetic app

Static JSON content (poems + ciphers) consumed by the Poetic Expo app as
over-the-air deltas. No server, no database here — just versioned files
served via CDN (`git push` + tag = publish).

## Layout

```text
content/
  manifest.json              # versions + delta list + sha256 (app fetches this first)
  registry/
    poems_index.json         # every used poem id + title|author key (AI reads before writing)
    ciphers_index.json       # every used cipher id + answer_word (AI reads before writing)
  deltas/
    poems_v11.json           # ONLY new poems for version 11
    ciphers_v7.json          # ONLY new ciphers for version 7
  full/
    poems_full_v11.json      # complete list up to v11 (for diffing, not fetched by app)
    ciphers_full_v7.json
examples/                    # one valid delta entry each (CI smoke-tests these)
scripts/
  next-id.mjs                # reserve next classic_XXXXX / cipher_XXXXX ids
  validate.mjs               # schema + duplicate + quality gates (also runs in CI)
  build-delta.mjs            # full -> delta + manifest + registry bump
```

## Add new content (human or AI)

```bash
# 1. Reserve IDs (never invent them)
node scripts/next-id.mjs --type poems --count 5 --reserve
node scripts/next-id.mjs --type ciphers --count 5 --reserve

# 2. Draft entries following POEM_GENERATION.md / CIPHER_GENERATION.md
#    Save as /tmp/draft.json: {"poems": [...]} or {"ciphers": [...]}

# 3. Validate (must pass, CI re-runs this)
node scripts/validate.mjs --new /tmp/draft.json

# 4. Append draft to a NEW full file, then build the delta
#    e.g. copy content/full/poems_full_v10.json -> poems_full_v11.json, append, then:
node scripts/build-delta.mjs --type poems --to 11 --full content/full/poems_full_v11.json

# 5. Publish (CDN reads git tags, immutable)
git add content && git commit -m "content: poems v11 (+5)" && git tag content-v11 && git push --tags
```

App fetch URL pattern:

```text
https://cdn.jsdelivr.net/gh/<you>/poetic-content@<tag>/content/manifest.json
```

Use a tag (`@content-v11`), not `@main` — tags are cached immutably, branches lag ~12h.

## Rules

* **Append-only.** Never edit or delete published `deltas/` or `full/` files.
  Fix a typo via a new correction version, not a rewrite.
* **IDs sequential, zero-padded, never reused:**
  poems `classic_00001…`, ciphers `cipher_00001…`.
* **Poems:** public-domain English only, full stanzas, 3 `missing_words`
  (positions 1,2,3) + exactly 6 `distractor_words`.
* **Ciphers:** original riddles only, 2 stanzas × 4 lines, `answer_word`
  `^[a-z]{3,10}$` unique, `categoryName` preferably from the 12 known
  values (stored as plain TEXT in app DB — no categories table).
* **Duplicates rejected:** same `id`, same normalized `title|author`,
  same `answer_word` (case-insensitive) all fail validation.
