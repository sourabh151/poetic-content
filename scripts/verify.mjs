#!/usr/bin/env node
// Repo-wide consistency check for CI and pre-publish.
// Verifies: registry <-> latest full files, manifest versions, delta files
// (existence, sha256, size, count, chain continuity), and delta replay
// (applying deltas to the earliest referenced full yields the latest full).
// Usage: node scripts/verify.mjs
// Exit 0 = pass, 1 = fail.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const norm = (s) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
const stable = (v) => JSON.stringify(v);

function load(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function fullVersions(base) {
  const dir = join(root, "content/full");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => f.match(new RegExp(`^${base}_full_v(\\d+)\\.json$`)))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10))
    .sort((a, b) => a - b);
}

const manifest = load("content/manifest.json");

const STREAMS = [
  {
    type: "poems",
    base: "poems",
    key: "poems",
    correctionsKey: "poem_corrections",
    versionKey: "poemsVersion",
    deltasKey: "poemsDeltas",
    regRel: "content/registry/poems_index.json",
    prefix: "classic",
    deriveKeys: (entries) => entries.map((e) => `${norm(e.title)}|${norm(e.author)}`).sort(),
    regKeys: (reg) => [...(reg.title_author_keys || [])].sort(),
    keysName: "title_author_keys",
  },
  {
    type: "ciphers",
    base: "ciphers",
    key: "ciphers",
    correctionsKey: "cipher_corrections",
    versionKey: "ciphersVersion",
    deltasKey: "ciphersDeltas",
    regRel: "content/registry/ciphers_index.json",
    prefix: "cipher",
    deriveKeys: (entries) => entries.map((e) => norm(e.answer_word)).sort(),
    regKeys: (reg) => [...(reg.answer_words || [])].map(norm).sort(),
    keysName: "answer_words",
  },
];

for (const s of STREAMS) {
  const versions = fullVersions(s.base);
  if (versions.length === 0) {
    errors.push(`${s.base}: no full files in content/full/`);
    continue;
  }
  const latest = versions[versions.length - 1];
  const full = load(`content/full/${s.base}_full_v${latest}.json`);
  const entries = full[s.key] || [];
  const reg = load(s.regRel);

  // Manifest version tracks the latest full.
  if (manifest[s.versionKey] !== latest) {
    errors.push(
      `${s.base}: manifest ${s.versionKey}=${manifest[s.versionKey]} but latest full is v${latest}`
    );
  }
  if (reg.updatedToVersion !== latest) {
    errors.push(`${s.base}: registry updatedToVersion=${reg.updatedToVersion} but latest full is v${latest}`);
  }

  // Registry ids match the full file exactly.
  const fullIds = entries.map((e) => e?.id).sort();
  const regIds = [...(reg.ids || [])].sort();
  if (stable(fullIds) !== stable(regIds)) {
    errors.push(
      `${s.base}: registry ids (${regIds.length}) do not match full v${latest} ids (${fullIds.length})`
    );
  }
  if (reg.count !== fullIds.length) {
    errors.push(`${s.base}: registry count=${reg.count} but full has ${fullIds.length} entries`);
  }
  const nums = fullIds.map((id) => parseInt(String(id).slice(String(id).indexOf("_") + 1), 10));
  const maxNum = Math.max(...nums);
  if (reg.max_numeric !== maxNum) {
    errors.push(`${s.base}: registry max_numeric=${reg.max_numeric} but full max is ${maxNum}`);
  }
  const expectedNext = `${s.prefix}_${String(maxNum + 1).padStart(5, "0")}`;
  if (reg.next_id !== expectedNext) {
    errors.push(`${s.base}: registry next_id=${reg.next_id}, expected ${expectedNext}`);
  }

  // Secondary keys (title|author / answer_word) match derived values.
  if (stable(s.regKeys(reg)) !== stable(s.deriveKeys(entries))) {
    errors.push(`${s.base}: registry ${s.keysName} does not match full v${latest}`);
  }
  if (s.type === "ciphers") {
    const cats = new Set(reg.categories || []);
    for (const e of entries) {
      if (e?.categoryName && !cats.has(e.categoryName)) {
        errors.push(`${s.base}: entry ${e.id} category "${e.categoryName}" missing from registry categories`);
        break;
      }
    }
  }

  // Delta files: existence, hash, size, count, chain.
  const deltas = [...(manifest[s.deltasKey] || [])].sort((a, b) => a.to - b.to);
  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i];
    const tag = `${s.base} delta v${d.from}->v${d.to}`;
    if (d.to !== d.from + 1) errors.push(`${tag}: to must equal from+1`);
    if (i > 0 && d.from !== deltas[i - 1].to) {
      errors.push(`${tag}: chain break, previous delta ends at v${deltas[i - 1].to}`);
    }
    const rel = `content/deltas/${s.base}_v${d.to}.json`;
    if (!existsSync(join(root, rel))) {
      errors.push(`${tag}: missing file ${rel}`);
      continue;
    }
    const bytes = readFileSync(join(root, rel));
    const obj = JSON.parse(bytes.toString("utf8"));
    if (obj.version !== d.to) errors.push(`${tag}: file version=${obj.version}, manifest says ${d.to}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== d.sha256) errors.push(`${tag}: sha256 mismatch (file ${sha.slice(0, 12)}… vs manifest ${String(d.sha256).slice(0, 12)}…)`);
    if (bytes.length !== d.size) errors.push(`${tag}: size mismatch (file ${bytes.length} vs manifest ${d.size})`);
    const newEntries = obj[s.key] || [];
    const corrEntries = obj[s.correctionsKey] || [];
    if (newEntries.length !== d.count) {
      errors.push(`${tag}: count mismatch (file has ${newEntries.length}, manifest says ${d.count})`);
    }
    if (corrEntries.length !== (d.corrections ?? 0)) {
      errors.push(`${tag}: corrections mismatch (file has ${corrEntries.length}, manifest says ${d.corrections ?? 0})`);
    }
  }
  if (deltas.length > 0 && deltas[deltas.length - 1].to !== manifest[s.versionKey]) {
    errors.push(
      `${s.base}: manifest ${s.versionKey}=${manifest[s.versionKey]} but last delta ends at v${deltas[deltas.length - 1].to}`
    );
  }

  // Replay: earliest referenced full + deltas in order == latest full.
  if (deltas.length > 0) {
    const firstFrom = deltas[0].from;
    const baseRel = `content/full/${s.base}_full_v${firstFrom}.json`;
    if (!existsSync(join(root, baseRel))) {
      warnings.push(
        `${s.base}: cannot replay deltas (base full v${firstFrom} not in repo; seed history starts at v${versions[0]})`
      );
    } else {
      const baseFull = load(baseRel);
      const state = new Map((baseFull[s.key] || []).map((e) => [e.id, e]));
      for (const d of deltas) {
        const obj = load(`content/deltas/${s.base}_v${d.to}.json`);
        for (const e of obj[s.correctionsKey] || []) {
          if (!state.has(e.id)) errors.push(`${s.base} v${d.to}: correction ${e.id} has no base entry`);
          else state.set(e.id, e);
        }
        for (const e of obj[s.key] || []) {
          if (state.has(e.id)) errors.push(`${s.base} v${d.to}: new entry ${e.id} already applied`);
          else state.set(e.id, e);
        }
      }
      const replayed = [...state.values()];
      // Compare as id-ordered sets; full files preserve prev order + appends.
      const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (stable([...replayed].sort(byId)) !== stable([...entries].sort(byId))) {
        errors.push(`${s.base}: delta replay from v${firstFrom} does not reproduce full v${latest}`);
      }
    }
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
if (errors.length > 0) {
  console.log(`VERIFY FAIL: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`VERIFY PASS: ${warnings.length} warning(s)`);
