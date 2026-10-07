#!/usr/bin/env node
// Build a delta from a NEW full file vs the previous full file,
// then bump manifest.json + registry index.
// Usage:
//   node scripts/build-delta.mjs --type poems --to 11 --full content/full/poems_full_v11.json [--prev content/full/poems_full_v10.json] [--notes "…"]
//   node scripts/build-delta.mjs --type ciphers --to 7 --full content/full/ciphers_full_v7.json
// Run validate.mjs on the new entries BEFORE this.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

const type = arg("type", null);
const to = parseInt(arg("to", ""), 10);
const fullPath = arg("full", null);
const notes = arg("notes", null);
if ((type !== "poems" && type !== "ciphers") || !Number.isInteger(to) || !fullPath) {
  console.error(
    "Usage: node scripts/build-delta.mjs --type poems|ciphers --to <N> --full <newFull.json> [--prev <prevFull.json>] [--notes \"…\"]"
  );
  process.exit(2);
}

const base = type === "poems" ? "poems" : "ciphers";
const key = type === "poems" ? "poems" : "ciphers";
const versionKey = type === "poems" ? "poemsVersion" : "ciphersVersion";
const deltasKey = type === "poems" ? "poemsDeltas" : "ciphersDeltas";
const idRe = type === "poems" ? /^classic_\d{5}$/ : /^cipher_\d{5}$/;

const full = JSON.parse(readFileSync(join(root, fullPath), "utf8"));
if (!Array.isArray(full[key])) {
  console.error(`ERROR: ${fullPath} must contain {"${key}": [...]}`);
  process.exit(1);
}

const from = to - 1;
const prevDefault = join(root, `content/full/${base}_full_v${from}.json`);
const prevPath = arg("prev", prevDefault);
let prevIds = new Set();
if (existsSync(join(root, prevPath)) || existsSync(prevPath)) {
  const p = existsSync(join(root, prevPath)) ? join(root, prevPath) : prevPath;
  const prev = JSON.parse(readFileSync(p, "utf8"));
  prevIds = new Set((prev[key] || []).map((e) => e.id));
} else {
  console.error(`NOTE: no previous full found at ${prevPath}; treating every entry as new.`);
}

const seen = new Set();
const fresh = [];
for (const e of full[key]) {
  if (!e || !idRe.test(e.id || "")) {
    console.error(`ERROR: bad id "${e?.id}" in ${fullPath}`);
    process.exit(1);
  }
  if (seen.has(e.id)) {
    console.error(`ERROR: duplicate id "${e.id}" inside ${fullPath}`);
    process.exit(1);
  }
  seen.add(e.id);
  if (!prevIds.has(e.id)) fresh.push(e);
}
if (fresh.length === 0) {
  console.error("ERROR: no new entries vs previous full; nothing to publish.");
  process.exit(1);
}

const norm = (s) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");

// Write delta
const deltaName = `${base}_v${to}.json`;
const deltaRel = `content/deltas/${deltaName}`;
const deltaObj = { version: to, [key]: fresh };
const deltaBytes = JSON.stringify(deltaObj, null, 2) + "\n";
writeFileSync(join(root, deltaRel), deltaBytes);
const sha256 = createHash("sha256").update(deltaBytes).digest("hex");

// Update manifest
const manifestPath = join(root, "content/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest[versionKey] = to;
manifest[deltasKey] = (manifest[deltasKey] || []).filter((d) => d.to !== to);
manifest[deltasKey].push({
  from,
  to,
  url: `deltas/${deltaName}`,
  count: fresh.length,
  sha256,
});
manifest.updatedAt = new Date().toISOString();
if (notes) {
  manifest.notes = { ...(manifest.notes || {}), en: notes };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// Update registry
const regName = type === "poems" ? "poems_index.json" : "ciphers_index.json";
const regPath = join(root, "content/registry", regName);
const reg = JSON.parse(readFileSync(regPath, "utf8"));
const numOf = (id) => parseInt(id.slice(id.indexOf("_") + 1), 10);
let max = reg.max_numeric ?? 0;
for (const e of fresh) {
  if (!reg.ids.includes(e.id)) reg.ids.push(e.id);
  max = Math.max(max, numOf(e.id));
  if (type === "poems") {
    const k = `${norm(e.title)}|${norm(e.author)}`;
    if (!reg.title_author_keys.includes(k)) reg.title_author_keys.push(k);
  } else {
    const a = norm(e.answer_word);
    if (!reg.answer_words.includes(a)) reg.answer_words.push(a);
    const cat = e.categoryName;
    if (cat && !reg.categories.includes(cat)) reg.categories.push(cat);
  }
}
reg.ids.sort();
if (type === "poems") reg.title_author_keys.sort();
else reg.answer_words.sort();
reg.max_numeric = max;
reg.count = reg.ids.length;
reg.updatedToVersion = to;
const prefix = type === "poems" ? "classic" : "cipher";
reg.next_id = `${prefix}_${String(max + 1).padStart(5, "0")}`;
writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");

// Clear reservations that are now published
const reservedPath = join(root, "content/registry/.reserved.json");
if (existsSync(reservedPath)) {
  try {
    const r = JSON.parse(readFileSync(reservedPath, "utf8"));
    const published = new Set(reg.ids);
    r[type] = (r[type] || []).filter((id) => !published.has(id));
    writeFileSync(reservedPath, JSON.stringify(r, null, 2) + "\n");
  } catch { /* leave reservations alone if corrupt */ }
}

console.log(`Built ${deltaRel}: ${fresh.length} new entries, v${from} to v${to}`);
console.log(`sha256: ${sha256}`);
console.log(`manifest ${versionKey} = ${to}; registry next_id = ${reg.next_id}`);
console.log(`Next: git add content && git commit -m "content: ${base} v${to} (+${fresh.length})" && git tag content-v${to} && git push --tags`);
console.log(`Draft source was ${basename(fullPath)} — keep it; deltas/ and prior fulls are immutable from here.`);
