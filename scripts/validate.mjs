#!/usr/bin/env node
// Validate a draft file: {"poems": [...]} and/or {"ciphers": [...]}
// against registry duplicates + schema + quality gates.
// Usage: node scripts/validate.mjs --new /tmp/draft.json [--skip-dup]
// Exit 0 = pass, 1 = fail.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

const draftPath = arg("new", null);
const skipDup = process.argv.includes("--skip-dup");
if (!draftPath) {
  console.error("Usage: node scripts/validate.mjs --new <draft.json> [--skip-dup]");
  process.exit(2);
}

const poemsIndex = JSON.parse(
  readFileSync(join(root, "content/registry/poems_index.json"), "utf8")
);
const ciphersIndex = JSON.parse(
  readFileSync(join(root, "content/registry/ciphers_index.json"), "utf8")
);
const draft = JSON.parse(readFileSync(draftPath, "utf8"));

const errors = [];
const warnings = [];
const norm = (s) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");

const POEM_CATEGORIES = new Set([
  "Life & Destiny",
  "Love & Heartache",
  "Nature & Seasons",
  "Hope & Resilience",
  "Mind & Solitude",
  "War & Society",
  "Spirituality & Mystery",
  "Joy & Whimsy",
]);
const KNOWN_CIPHER_CATEGORIES = new Set(ciphersIndex.categories || []);
const FORBIDDEN_CIPHER = /letters?|characters?|what am i|who am i/i;

// ---------- poems ----------
const poems = draft.poems || [];
if (draft.poems !== undefined && !Array.isArray(draft.poems)) {
  errors.push("poems: must be an array");
}
{
  const usedIds = new Set(skipDup ? [] : poemsIndex.ids || []);
  const usedKeys = new Set(skipDup ? [] : poemsIndex.title_author_keys || []);
  const seenIds = new Set();
  const seenKeys = new Set();
  poems.forEach((p, i) => {
    const tag = `poems[${i}] (${p?.id || "no-id"})`;
    if (!p || typeof p !== "object") return errors.push(`${tag}: not an object`);
    if (!/^classic_\d{5}$/.test(p.id || "")) errors.push(`${tag}: bad id format (want classic_00001)`);
    else {
      if (usedIds.has(p.id)) errors.push(`${tag}: duplicate id already in registry`);
      if (seenIds.has(p.id)) errors.push(`${tag}: duplicate id within draft`);
      seenIds.add(p.id);
      const num = parseInt(p.id.slice(8), 10);
      if (!skipDup && num > (poemsIndex.max_numeric ?? 0) + poems.length + 5)
        warnings.push(`${tag}: id skips far ahead of registry max; reserve via next-id.mjs`);
    }
    const key = `${norm(p.title)}|${norm(p.author)}`;
    if (!p.title || !p.author) errors.push(`${tag}: title and author required`);
    else {
      if (usedKeys.has(key)) errors.push(`${tag}: duplicate title|author already in registry`);
      if (seenKeys.has(key)) errors.push(`${tag}: duplicate title|author within draft`);
      seenKeys.add(key);
    }
    if (!["easy", "medium", "hard"].includes(p.difficulty))
      errors.push(`${tag}: difficulty must be easy|medium|hard`);
    if (!p.theme || typeof p.theme !== "string") errors.push(`${tag}: theme required`);
    if (!POEM_CATEGORIES.has(p.category))
      errors.push(`${tag}: category must be one of the 8 fixed values`);
    if (!Array.isArray(p.poem_stanzas) || p.poem_stanzas.length === 0 || !p.poem_stanzas.every((s) => typeof s === "string" && s.trim()))
      errors.push(`${tag}: poem_stanzas must be a non-empty string array`);
    const mw = p.missing_words || [];
    if (!Array.isArray(mw) || mw.length !== 3) errors.push(`${tag}: need exactly 3 missing_words`);
    else {
      const pos = new Set(mw.map((m) => m.position));
      if (!(pos.has(1) && pos.has(2) && pos.has(3)))
        errors.push(`${tag}: missing_words positions must be exactly 1,2,3`);
      for (const m of mw) {
        if (!m.correct_word || typeof m.correct_word !== "string")
          errors.push(`${tag}: missing_word correct_word required`);
        if (!m.definition || m.definition.length < 10)
          errors.push(`${tag}: definition too short for "${m.correct_word}"`);
        if (!m.rhyme_hint || !m.rhyme_hint.trim())
          errors.push(`${tag}: rhyme_hint required for "${m.correct_word}"`);
      }
    }
    const dw = p.distractor_words || [];
    if (!Array.isArray(dw) || dw.length !== 6) errors.push(`${tag}: need exactly 6 distractor_words`);
    else {
      const correct = new Set(mw.map((m) => norm(m.correct_word)));
      for (const w of dw) {
        if (typeof w !== "string" || !w.trim()) errors.push(`${tag}: distractor must be a non-empty string`);
        else if (correct.has(norm(w))) errors.push(`${tag}: distractor "${w}" matches a correct word`);
      }
      if (new Set(dw.map(norm)).size !== dw.length)
        errors.push(`${tag}: distractor_words contain duplicates`);
    }
  });
}

// ---------- ciphers ----------
const ciphers = draft.ciphers || [];
if (draft.ciphers !== undefined && !Array.isArray(draft.ciphers)) {
  errors.push("ciphers: must be an array");
}
{
  const usedIds = new Set(skipDup ? [] : ciphersIndex.ids || []);
  const usedAnswers = new Set(
    skipDup ? [] : (ciphersIndex.answer_words || []).map((w) => norm(w))
  );
  const seenIds = new Set();
  const seenAnswers = new Set();
  ciphers.forEach((c, i) => {
    const tag = `ciphers[${i}] (${c?.id || "no-id"})`;
    if (!c || typeof c !== "object") return errors.push(`${tag}: not an object`);
    if (!/^cipher_\d{5}$/.test(c.id || "")) errors.push(`${tag}: bad id format (want cipher_00001)`);
    else {
      if (usedIds.has(c.id)) errors.push(`${tag}: duplicate id already in registry`);
      if (seenIds.has(c.id)) errors.push(`${tag}: duplicate id within draft`);
      seenIds.add(c.id);
    }
    if (!["easy", "medium", "hard"].includes(c.difficulty))
      errors.push(`${tag}: difficulty must be easy|medium|hard`);
    if (!c.categoryName || typeof c.categoryName !== "string")
      errors.push(`${tag}: categoryName required`);
    else if (!KNOWN_CIPHER_CATEGORIES.has(c.categoryName))
      warnings.push(`${tag}: off-list category "${c.categoryName}" (stored as TEXT; prefer reuse)`);
    const stanzas = c.poem_stanzas || [];
    if (!Array.isArray(stanzas) || stanzas.length !== 2 || !stanzas.every((s) => typeof s === "string" && s.trim()))
      errors.push(`${tag}: poem_stanzas must be exactly 2 non-empty strings`);
    else {
      const lines = stanzas.join("\n").split("\n").filter((l) => l.trim());
      if (lines.length !== 8)
        errors.push(`${tag}: want 8 clue lines total, found ${lines.length}`);
    }
    const answer = norm(c.answer_word);
    if (!/^[a-z]{3,10}$/.test(answer))
      errors.push(`${tag}: answer_word must match ^[a-z]{3,10}$`);
    else {
      if (usedAnswers.has(answer)) errors.push(`${tag}: duplicate answer_word already in registry`);
      if (seenAnswers.has(answer)) errors.push(`${tag}: duplicate answer_word within draft`);
      seenAnswers.add(answer);
    }
    const joined = norm(stanzas.join("\n"));
    const hint = norm(c.hint);
    if (!c.hint || typeof c.hint !== "string" || c.hint.trim().length < 10)
      errors.push(`${tag}: hint must be a useful 1-2 sentence clue`);
    else {
      const sentences = c.hint.trim().split(/[.!?]+/).filter((s) => s.trim());
      if (sentences.length < 1 || sentences.length > 2)
        errors.push(`${tag}: hint must be 1-2 sentences`);
    }
    if (answer && /^[a-z]{3,10}$/.test(answer)) {
      if (joined.includes(answer))
        errors.push(`${tag}: answer_word leaks inside poem_stanzas`);
      if (hint.includes(answer)) errors.push(`${tag}: answer_word leaks inside hint`);
    }
    if (FORBIDDEN_CIPHER.test(stanzas.join("\n")) || FORBIDDEN_CIPHER.test(c.hint || ""))
      errors.push(`${tag}: forbidden phrase (letter counts or What/Who am I)`);
  });
}

if (poems.length === 0 && ciphers.length === 0) {
  errors.push("draft is empty: provide poems[] and/or ciphers[]");
}

console.log(`validate ${draftPath}: ${poems.length} poem(s), ${ciphers.length} cipher(s)`);
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
if (errors.length > 0) {
  console.log(`FAIL: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS: ${warnings.length} warning(s)`);
