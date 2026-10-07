# AI Prompt: Generate Cipher Riddle Poems for `ciphers.ts`

Use this file as the single source of rules when an AI agent adds new entries to `src/data/ciphers.ts`. It mirrors `poem-prompt.md` but for cipher riddles.

## Cipher Interface

```typescript
export type CipherDifficulty = "easy" | "medium" | "hard";

// Denormalized: category is a plain TEXT column on ciphers (no cipherCategories table).
export type CipherCategoryName = string;

export interface Cipher {
  id: string; // cipher_00001
  difficulty: CipherDifficulty;
  categoryName: string; // preferably one of the 12 known values below
  poem_stanzas: string[]; // 2 stanzas, 8 lines total, riddle pointing to answer_word
  answer_word: string; // lowercased, 3-10, a-z only, length = blanks
  hint: string; // 1-2 sentences, cryptic clue, not giving away answer
}
```

```typescript
// Known categories (advisory allowlist, stored as TEXT in ciphers.category_name):
// "Anatomy" | "Nature" | "Astronomy" | "Food" | "Animals" | "Objects" |
// "Emotions" | "Geography" | "Science" | "Mythology" | "Music" | "Sports"
```

DB: `ciphers(id, difficulty, category_name TEXT, poem_stanzas, answer_word, hint)` — no `cipher_categories` table, no JOINs (`src/data/create-ciphers-db.ts`). No `theme`, no `slug` (use `id+name`), no `title/author`.

## 1. ID Format

- `cipher_00001`, `cipher_00002` ... zero-padded 5 digits, sequential, unique. Start fresh at `cipher_00001` when regenerating 100.

## 2. Category

- Must preferably be one of the 12 known values: `Anatomy, Nature, Astronomy, Food, Animals, Objects, Emotions, Geography, Science, Mythology, Music, Sports`. Free-form strings allowed (stored as TEXT) but prefer reuse. Category = answer domain: `heart → Anatomy`, `echo → Nature`, `moon → Astronomy`, `keyboard → Objects`, `river → Geography`.
- No `theme` column — category alone is the domain. Do not add `theme`.

## 3. Poem Structure — Clue-Rich Riddle (NO length, NO "What am I")

- **Original only**: all riddles must be original compositions, not public domain, free of licensing. No copyrighted text.
- **2 stanzas** per cipher: `poem_stanzas: [stanza1, stanza2]` where each stanza is one string with `\n` line breaks. Total **8 lines** (4+4). Each line is a self-contained clue image.
- **FORBIDDEN PHRASES** — do NOT include in any stanza:
  - Length mentions: `I am X letters`, `X letters long`, `how many characters`, `how many letters`, or any count of letters.
  - Question formula: `What am I`, `Who am I`, `What am I that...`, or any variant repeated. Poem must end as a descriptive image, not a question.
- **REQUIRED**: Every line must be a clue that helps guess the word, without naming it. Maximize clue density — use sensory, functional, contextual, and metaphorical hints. Avoid generic filler like `I hide in plain sight` without specificity. Each stanza should contain 3-4 distinct properties of the answer (material, use, location, behavior, origin, effect).
  - Bad (generic, length, question): `I am 5 letters, hidden in Nature lore\nWhat am I, that borrows every tone?`
  - Good (clue-rich, no length, no question): `I speak without a mouth, I hear without ears\nI move without legs, yet I travel far\nI am born in a whisper, I die in the wind\nNo body to hold me, yet I linger`
  - Second stanza example: `In canyons I answer, in halls I return\nI mimic your voice, but I have none of my own\nYou chase me where stone throws your voice back\nI am the shadow of sound on its track`
- **Must not contain** `answer_word` as a substring (case-insensitive, whole word or part). The riddle points to the word, must not reveal it. Check after writing: lowercased poem must not include lowercased answer.
- **Style**: poetic, loosely metered, each line ends with its own image. Use `\n` within stanza strings. Keep language accessible for `easy`, more layered for `hard`, but always clue-dense.

## 4. Answer Word

- `answer_word`: single word, `lowercased`, `3-10` characters, `a-z` only (no spaces, hyphens, apostrophes). Length = number of letter blanks in `cipher.tsx` (`guess` array). Verified at `create-ciphers-db.ts` with `^[a-z]+$` and `2-12` check — keep 3-10 for new entries.
- Must be a common English noun/verb that fits category. Avoid obscure or proper nouns. No duplicate `answer_word` across the 100 (ensure uniqueness, case-insensitive).
- Examples: `echo`, `heart`, `moon`, `keyboard`, `river`, `fire`, `footsteps`, `secret`, `flame`, `guitar`.

## 5. Hint

- `hint`: 1-2 sentences, concise, gives a cryptic nudge without giving away the answer. Must not contain `answer_word` (case-insensitive). Must not mention length. Must complement, not duplicate, poem clues.
- Should be usable as powerup `Cryptic Hint` (cost 20) and side `HINT` vertical button. Differentiate from poem: hint is direct clue, poem is riddle.
- Examples: `"Repeats what you say in mountains and caves."` (echo), `"Central organ that beats for a lifetime."` (heart).

## 6. Difficulty Mapping

- **easy**: Everyday objects/words, 3-5 letters, poem uses 3-4 obvious sensory clues (what you see/hear/touch), hint direct. Example: `heart`, `river`, `echo`.
- **medium**: Less immediate, 5-7 letters, poem mixes functional + contextual clues, needs both stanzas to converge. Example: `moon`, `keyboard`, `sponge`.
- **hard**: Abstract, 6-10 letters, poem uses lateral/metaphorical clues, subtle wordplay, hint more oblique. Example: `footsteps`, `flame`, `galaxy`.

## 7. Content Restrictions

- English only, no profanity or inappropriate content, appropriate for educational/game context.
- No title/author fields — ciphers are anonymous riddles, unlike `poems.ts` which requires `title`/`author`.
- No `theme` field — do not add.
- No length or "What am I" phrases as above.

## 8. Generation Steps for Agent — One-by-One with Self-Check

For **each** cipher (repeat 100 times, do not batch without checking):

1. Pick `answer_word` (unique, 3-10, a-z), decide `difficulty` and `categoryName` (or add category first).
2. Write `hint` (1-2 sentences, not containing answer, not mentioning length).
3. Write `poem_stanzas` 2×4 lines, each line a distinct clue, no length, no "What am I", not containing answer.
4. **Self-check this cipher before next:**
   - Lowercased `poem_stanzas` joined does NOT contain lowercased `answer_word` substring.
   - Lowercased `hint` does NOT contain `answer_word`.
   - No line contains `letters`, `characters`, `What am I`, `Who am I` (case-insensitive).
   - `hint` is 1-2 sentences, poem is 8 lines total, 2 stanzas.
   - If any check fails, rewrite that cipher before proceeding to next `id`.
5. Collect the cipher objects into your draft file (`/tmp/draft.json` as
   `{"ciphers": [...]}`) in `id` order — do NOT edit any published file.
6. Run `node scripts/validate.mjs --new /tmp/draft.json` (must exit 0),
   then follow the publish steps in "JSON Delta Contract" below
   (`build-delta.mjs` → commit → tag `content-vN` → push).

## 9. Validation

- `npx tsc --noEmit --skipLibCheck` must pass (only `node:sqlite` asset errors expected).
- `sqlite3 src/data/ciphers.db "SELECT id, answer_word, json_array_length(poem_stanzas) FROM ciphers;"` → each new row `json_array_length = 2` and `length(answer_word) 3-10`.
- Ensure `answer_word` not in `poem_stanzas` or `hint` (case-insensitive), no length/`What am I` phrases.
- All 100 `answer_word` unique.

---

## JSON Delta Contract (this repo — OTA format, flat schema)

The app DB is denormalized: `ciphers(id, difficulty, category_name TEXT,
poem_stanzas, answer_word, hint)` — **no categories table, no JOINs**.
`categoryName` is a plain string; prefer the 12 known values in
`content/registry/ciphers_index.json → categories`, free-form allowed.

### ID sequencing

- Reserve first: `node scripts/next-id.mjs --type ciphers --count N --reserve`
- Format `cipher_%05d`, sequential from `ciphers_index.json → next_id`
  (currently `cipher_00101`). Never reuse.

### Delta file shape (`content/deltas/ciphers_v<to>.json`)

```json
{
  "version": 7,
  "ciphers": [
    {
      "id": "cipher_00101",
      "difficulty": "medium",
      "categoryName": "Geography",
      "poem_stanzas": ["4 lines\n...\n...\n...", "4 lines\n...\n...\n..."],
      "answer_word": "river",
      "hint": "The flowing road that seeks the sea."
    }
  ]
}
```

### Duplicate rules (enforced by `scripts/validate.mjs` + CI)

- `id` already in `ciphers_index.json → ids` → ERROR
- Lowercased `answer_word` already in `answer_words` → ERROR
- Same checks apply within a single draft batch.
- Off-list `categoryName` → WARNING (suggest closest known value), not error.

### Publish

Append draft entries to a new `content/full/ciphers_full_v<to>.json`
(copy previous full + append), then:

```bash
node scripts/validate.mjs --new /tmp/draft.json
node scripts/build-delta.mjs --type ciphers --to 7 --full content/full/ciphers_full_v7.json
```

See `examples/cipher_delta_example.json` for a complete valid entry.

