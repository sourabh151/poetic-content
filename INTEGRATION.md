# INTEGRATION.md — app-side OTA contract

How the Poetic Expo app consumes this repo. Companion to `README.md`
(publishing) — this file is the fetch/apply spec.

## Endpoints

Primary CDN (immutable tags — always pin a tag, never `@main`):

```text
https://cdn.jsdelivr.net/gh/sourabh151/poetic-content@<tag>/content/manifest.json
https://cdn.jsdelivr.net/gh/sourabh151/poetic-content@<tag>/content/<delta url>
```

Fallback when jsDelivr lags (branch/tag propagation can take hours):

```text
https://raw.githubusercontent.com/sourabh151/poetic-content/<tag>/content/manifest.json
```

Tags are per stream: `poems-vN` (e.g. `poems-v2`), `ciphers-vN`
(e.g. `ciphers-v2`). A tag moves the whole repo snapshot, so fetching the
manifest at either tag sees both streams' versions.

## Seed versions (bundled DBs)

The app ships with SQLite DBs built from `content/full/poems_full_v1.json`
(10 poems) and `content/full/ciphers_full_v1.json` (100 ciphers). Treat these
as the floor:

```ts
const SEED = { poemsVersion: 1, ciphersVersion: 1 };
```

Persist applied versions in the app (SQLite `_content_meta` table or MMKV —
SQLite is preferred so versions travel with the user DB copy):

```sql
CREATE TABLE IF NOT EXISTS _content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: poems_version, ciphers_version
```

## Update flow

1. `GET manifest.json` (see `schemas/manifest.schema.json`). Respect
   `minAppVersion`: if greater than the running app, stop and prompt upgrade.
2. Diff `manifest.poemsVersion/ciphersVersion` against stored versions.
3. For each missing delta in `to` order (arrays are oldest → newest):
   - Skip entries whose per-delta `minAppVersion` exceeds the running app.
   - Skip deltas larger than a budget if desired (`size` is bytes).
   - `GET content/<url>`, verify `sha256` over raw bytes before parsing.
     On mismatch: retry once via fallback base, then abort (never apply).
   - Parse and apply inside one SQLite transaction (see below).
   - Record the new version only after commit.
4. Deltas are idempotent-safe: new entries use `INSERT OR IGNORE`,
   corrections use `INSERT OR REPLACE` (see SQL). Re-applying is harmless.

## Apply SQL

Poems (tables `poems`, `missing_words`, `distractor_words`):

```sql
-- new poems (from delta "poems")
INSERT OR IGNORE INTO poems (id, title, author, difficulty, theme, category, poem_stanzas)
VALUES (?, ?, ?, ?, ?, ?, json(?));
INSERT OR IGNORE INTO missing_words (poem_id, position, correct_word, definition, rhyme_hint)
VALUES (?, ?, ?, ?, ?);      -- one row per missing_words entry
INSERT OR IGNORE INTO distractor_words (poem_id, word)
VALUES (?, ?);               -- one row per distractor_words entry

-- corrections (from delta "poem_corrections"): replace whole poem graph
INSERT OR REPLACE INTO poems (id, title, author, difficulty, theme, category, poem_stanzas)
VALUES (?, ?, ?, ?, ?, ?, json(?));
DELETE FROM missing_words WHERE poem_id = ?;
DELETE FROM distractor_words WHERE poem_id = ?;
-- then re-insert missing/distractor rows as above
```

Ciphers (table `ciphers`, denormalized — `category_name` is plain TEXT):

```sql
-- new ciphers (from delta "ciphers")
INSERT OR IGNORE INTO ciphers (id, difficulty, category_name, poem_stanzas, answer_word, hint)
VALUES (?, ?, ?, json(?), lower(?), ?);

-- corrections (from delta "cipher_corrections")
INSERT OR REPLACE INTO ciphers (id, difficulty, category_name, poem_stanzas, answer_word, hint)
VALUES (?, ?, ?, json(?), lower(?), ?);
```

Never `DELETE` user tables (`bookmarks`, progress, `ink_ledger`) during OTA.
`poem_stanzas` columns store JSON text — bind `JSON.stringify(stanzas)`.

## Rules the app can rely on

- Deltas are append-only and immutable once tagged. Same URL + same `sha256`
  forever — safe to cache aggressively.
- `count` = new entries; `corrections` = same-id fixes. Either may be zero,
  never both (publish fails otherwise).
- New ids never reuse old ones (`classic_%05d`, `cipher_%05d`); corrections
  reuse the published id with fixed body.
- Chain continuity: each delta's `from` is the previous `to`. `verify.mjs`
  enforces this in CI, and `verify.mjs` also replays deltas onto the base
  full to prove they reproduce the latest full.
- Entry shapes: `schemas/poem.schema.json`, `schemas/cipher.schema.json`.
  Leak/forbidden-phrase rules live in `validate.mjs` (not expressible in
  JSON Schema) — the app does not need to re-check them.

## Testing OTA without touching prod

Use a dev base URL pointing at a branch or a `next` tag and a fixture
manifest; run the same flow against a throwaway DB copy and assert row
counts plus unchanged user tables.
