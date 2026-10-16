# AI Prompt: Generate Classic Poetry Game

## Core Structure Rules

### Poem Interface
Each poem must follow this exact structure:

```typescript
interface Poem {
  id: string;                    // Unique identifier (e.g., "classic_00001")
  title: string;                 // Full title of the poem
  author: string;                // Poet author name
  difficulty: "easy" | "medium" | "hard";
  theme: string;                 // Specific theme (e.g., "Choices & Life Paths")
  category: Category;            // Broad group from allowed categories
  poem_stanzas: string[];        // Stanzas with [BLANK_1], [BLANK_2], [BLANK_3] markers
  missing_words: MissingWord[];  // 3 words with position, correct_word, definition, rhyme_hint
  distractor_words: string[];    // 6 unrelated words for multiple choice
}
```

### Category Type
Must be one of these 8 values:
- "Life & Destiny" (choices, time, identity, growth, mortality)
- "Love & Heartache" (romance, devotion, loss, longing)
- "Nature & Seasons" (landscapes, weather, animals, solitude in nature)
- "Hope & Resilience" (courage, healing, faith, perseverance)
- "Mind & Solitude" (dreams, memory, reflection, inner thoughts)
- "War & Society" (conflict, justice, duty, freedom, patriotism)
- "Spirituality & Mystery" (faith, the unknown, cosmos, divine)
- "Joy & Whimsy" (celebration, humor, childhood, wonder)

**Default:** If a poem doesn't fit any category, assign "Life & Destiny".

### CategoryArray Type
```typescript
type CategoryArray = Category[];
```
Used for future expansion of broader categories.

### MissingWord Interface
```typescript
interface MissingWord {
  position: 1 | 2 | 3;          // Blank position in stanza
  correct_word: string;          // Word to fill in the blank
  definition: string;            // Definition of the correct word
  rhyme_hint: string;            // Hint about rhyming or word relationship
}
```

## Poem Generation Rules

### 1. Stanza Format
- Poems must be complete, publicly available works in the public domain
- Each poem includes its full stanzas as they appear in the original work
- Stanzas are separated by blank lines
- Number of stanzas varies by poem (sonnets count as 1 stanza, longer poems may have 5-7 stanzas, etc.)
- Each poem must contain its complete lyrical content without truncation

### 2. Missing Word Requirements
- 3 missing words total, positioned at positions 1, 2, and 3
- Each word must be a real word (or well-known coined word like "borogoves")
- Definitions must match the correct word accurately
- Rhyme hints must relate to how the word fits the poem's rhyme scheme
- Hints can reference rhyming words, word meaning, or thematic connection

### 3. Difficulty Mapping
- **easy**: Common words, obvious context, simple definitions
- **medium**: Less common but recognizable words, moderate context required
- **hard**: Obscure words, complex context, subtle definitions

### 4. Distractor Words
- Exactly 6 distractor words per poem
- Must be thematically related but not the correct answer
- Should not obviously match the correct word's definition
- Mix of synonyms, related concepts, and random words
- Examples from existing poems: "field", "hill", "grove" (for nature poems)

### 5. ID Format
- Format: "classic_00001", "classic_00002", etc.
- Sequential numbering starting from 00001
- Must be unique per poem

### 6. Theme-Category Guidelines
Each theme should generally map to its category, though some flexibility exists:

| Theme Examples | Expected Category |
|---|---|
| Choices & Life Paths | Life & Destiny |
| Desire & Destruction | Love & Heartache |
| Nature & Solitude | Nature & Seasons |
| Death & Immortality | Life & Destiny |
| Power & Impermanence | War & Society |
| Creation & Mystery | Spirituality & Mystery |
| Love & Eternity | Love & Heartache |
| Grief & Mourning | Life & Destiny |
| Nonsense & Adventure | Joy & Whimsy |
| Whimsy & Romance | Joy & Whimsy |

### 7. Rhyme Hint Rules
- Must provide useful clue without giving away the answer
- Can reference: rhyming words in the stanza, word meaning, thematic role
- Should help the learner understand word choice
- Example patterns: "Rhymes with X", "Means to Y", "Near-rhymes with Z"

### 8. Definition Rules
- Must be accurate and concise (1-2 sentences)
- Should be educational but not overly verbose
- Must match the correct_word exactly
- Can define by category, function, or characteristic

### 9. Author Validation
- Must match historical poet for "classic" poems
- Use known authors from English literary canon
- Shakespeare, Frost, Dickinson, Blake, Wordsworth, Shelley, Whitman, Carroll, Lear

### 10. Content Restrictions
- No profanity or inappropriate content
- Themes must be appropriate for educational/game context
- Focus on classic poetry from public domain
- Maintain poetic dignity and artistic respect

### 11. Language & Copyright Rules
- Poems must be in English only
- All poems must be publicly available and free of copyright restrictions
- Must use works in the public domain or original compositions free of licensing
- Avoid modern copyrighted poetry; stick to poets who died before 1929 or release works under public domain/copyright-free licenses
- Ensure all text content can be freely distributed and used in the game

---

## JSON Delta Contract (this repo — OTA format, not `.ts`)

The app never imports `.ts`. New poems ship as JSON deltas fetched from CDN.
Field rules above still apply; only the envelope changes.

### ID sequencing

- Reserve first: `node scripts/next-id.mjs --type poems --count N --reserve`
- Format `classic_%05d`, sequential from `content/registry/poems_index.json → next_id`
  (currently `classic_00011`). Never reuse, never skip without reason.

### Delta file shape (`content/deltas/poems_v<to>.json`)

```json
{
  "version": 2,
  "poems": [
    {
      "id": "classic_00011",
      "title": "The Lamb",
      "author": "William Blake",
      "difficulty": "medium",
      "theme": "Innocence & Creation",
      "category": "Spirituality & Mystery",
      "poem_stanzas": ["stanza 1 with \n line breaks", "stanza 2..."],
      "missing_words": [
        {"position": 1, "correct_word": "mead", "definition": "...", "rhyme_hint": "..."},
        {"position": 2, "correct_word": "woolly", "definition": "...", "rhyme_hint": "..."},
        {"position": 3, "correct_word": "rejoice", "definition": "...", "rhyme_hint": "..."}
      ],
      "distractor_words": ["pasture", "shepherd", "gentle", "valley", "hymn", "cradle"]
    }
  ]
}
```

### Duplicate rules (enforced by `scripts/validate.mjs` + CI)

- `id` already in `poems_index.json → ids` → ERROR
- Normalized `lower(title)|lower(author)` (trimmed, collapsed whitespace)
  already in `title_author_keys` → ERROR
- Same checks apply within a single draft batch.

### Publish (script builds the new full file — never hand-edit `content/full/`)

```bash
node scripts/validate.mjs --new /tmp/draft.json
node scripts/build-delta.mjs --type poems --to 2 --new /tmp/draft.json
```

`build-delta.mjs --new` appends the draft to a new `content/full/poems_full_v<to>.json`
itself (prev entries carried byte-identical, corrections applied by replacement),
then writes the delta, updates `manifest.json` (`poemsVersion`, `poemsDeltas[]`
with `sha256` + `size` + per-delta `minAppVersion`) and bumps the registry.
See `examples/poem_delta_example.json` for a complete valid entry
(doc id `classic_09999` — never publish the example as-is; reserve real ids).

### Corrections (typo fixes, same id)

Ship as `{"poems": [...new...], "poem_corrections": [{...same id, fixed body...}]}`.
Correction ids must already be published; full schema still applies; a changed
`title|author` must not collide with a different published poem. The app applies
corrections with `REPLACE` (see `INTEGRATION.md`).

### Batch limits (keep deltas cheap on mobile)

- ≤ 50 new poems per draft, draft file ≤ 200KB (`validate.mjs` warns above this).
- Split larger batches; publish sequentially (`--to 2`, then `--to 3`).