#!/usr/bin/env node
// Build a delta + new full file + manifest + registry bump.
//
// Preferred mode (script owns the new full file; AI never hand-edits
// published data):
//   node scripts/build-delta.mjs --type poems --to 2 --new /tmp/draft.json [--notes "…"] [--min-app-version 1.0.0]
//   node scripts/build-delta.mjs --type ciphers --to 2 --new /tmp/draft.json
//
// Draft shape: {"poems": [...], "poem_corrections": [...]} or
// {"ciphers": [...], "cipher_corrections": [...]}. Run validate.mjs on the
// draft BEFORE this. Corrections are same-id typo fixes, shipped alongside
// new entries and applied to the new full file by replacement.
//
// Escape hatch (human only): pass a hand-built full file. Any modification,
// deletion, or reorder of previous entries is rejected — use corrections.
//   node scripts/build-delta.mjs --type poems --to 2 --full content/full/poems_full_v2.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const type = arg("type", null);
const to = parseInt(arg("to", ""), 10);
const newDraftPath = arg("new", null);
const fullPathArg = arg("full", null);
const notes = arg("notes", null);
const minAppVersionArg = arg("min-app-version", null);
if ((type !== "poems" && type !== "ciphers") || !Number.isInteger(to)) {
  console.error(
    "Usage: node scripts/build-delta.mjs --type poems|ciphers --to <N> (--new <draft.json> | --full <newFull.json>) [--prev <prevFull.json>] [--notes \"…\"] [--min-app-version <x.y.z>]"
  );
  process.exit(2);
}
if (!newDraftPath && !fullPathArg) {
  console.error("ERROR: pass --new <draft.json> (preferred) or --full <newFull.json> (human escape hatch).");
  process.exit(2);
}
if (newDraftPath && fullPathArg) fail("pass exactly one of --new or --full, not both.");

const base = type === "poems" ? "poems" : "ciphers";
const newKey = type === "poems" ? "poems" : "ciphers";
const correctionsKey = type === "poems" ? "poem_corrections" : "cipher_corrections";
const versionKey = type === "poems" ? "poemsVersion" : "ciphersVersion";
const deltasKey = type === "poems" ? "poemsDeltas" : "ciphersDeltas";
const tagName = type === "poems" ? `poems-v${to}` : `ciphers-v${to}`;
const idRe = type === "poems" ? /^classic_\d{5}$/ : /^cipher_\d{5}$/;

const from = to - 1;
const prevDefaultRel = `content/full/${base}_full_v${from}.json`;
const prevPath = arg("prev", prevDefaultRel);
const prevAbs = existsSync(join(root, prevPath)) ? join(root, prevPath) : prevPath;
if (!existsSync(prevAbs)) fail(`previous full not found at ${prevPath}; cannot build v${to} without v${from}.`);
const prev = JSON.parse(readFileSync(prevAbs, "utf8"));
if (!Array.isArray(prev[newKey])) fail(`${prevPath} must contain {"${newKey}": [...]}`);
const prevEntries = prev[newKey];
const prevById = new Map(prevEntries.map((e) => [e?.id, e]));
const prevIds = new Set(prevById.keys());

const norm = (s) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
const stable = (v) => JSON.stringify(v);

let newFullEntries;
let fresh;
let corrections;

if (newDraftPath) {
  // ---------- preferred mode: script builds the new full from draft ----------
  const draftAbs = existsSync(join(root, newDraftPath)) ? join(root, newDraftPath) : newDraftPath;
  if (!existsSync(draftAbs)) fail(`draft not found at ${newDraftPath} (run validate.mjs first).`);
  const draft = JSON.parse(readFileSync(draftAbs, "utf8"));
  const drafted = Array.isArray(draft[newKey]) ? draft[newKey] : [];
  const draftedCorrections = Array.isArray(draft[correctionsKey]) ? draft[correctionsKey] : [];

  const seen = new Set();
  for (const e of [...drafted, ...draftedCorrections]) {
    if (!e || !idRe.test(e.id || "")) fail(`bad id "${e?.id}" in draft (want ${type === "poems" ? "classic_00001" : "cipher_00001"} style)`);
    if (seen.has(e.id)) fail(`duplicate id "${e.id}" inside draft`);
    seen.add(e.id);
  }
  for (const e of drafted) {
    if (prevIds.has(e.id)) fail(`draft id "${e.id}" already published (move it to ${correctionsKey} for a typo fix)`);
  }
  for (const e of draftedCorrections) {
    if (!prevIds.has(e.id)) fail(`correction id "${e.id}" is not published (move it to ${newKey} for a new entry)`);
  }

  // New full = prev entries (untouched, order preserved) with corrections
  // applied by replacement, then new entries appended in draft order.
  const correctionById = new Map(draftedCorrections.map((e) => [e.id, e]));
  newFullEntries = prevEntries.map((e) => (correctionById.has(e.id) ? correctionById.get(e.id) : e));
  newFullEntries.push(...drafted);
  fresh = drafted;
  corrections = draftedCorrections;

  if (fresh.length === 0 && corrections.length === 0) {
    fail("draft has no new entries and no corrections; nothing to publish.");
  }

  const newFullRel = `content/full/${base}_full_v${to}.json`;
  if (existsSync(join(root, newFullRel))) {
    fail(`${newFullRel} already exists; published full files are immutable. Bump --to.`);
  }
  const newFullObj = { version: to, [newKey]: newFullEntries };
  writeFileSync(join(root, newFullRel), JSON.stringify(newFullObj, null, 2) + "\n");
  console.log(`Wrote ${newFullRel}: ${prevEntries.length} carried + ${fresh.length} new + ${corrections.length} corrected.`);
} else {
  // ---------- escape hatch: hand-built full, strictly guarded ----------
  const fullAbs = existsSync(join(root, fullPathArg)) ? join(root, fullPathArg) : fullPathArg;
  const full = JSON.parse(readFileSync(fullAbs, "utf8"));
  if (!Array.isArray(full[newKey])) fail(`${fullPathArg} must contain {"${newKey}": [...]}`);
  newFullEntries = full[newKey];

  const seen = new Set();
  for (const e of newFullEntries) {
    if (!e || !idRe.test(e.id || "")) fail(`bad id "${e?.id}" in ${fullPathArg}`);
    if (seen.has(e.id)) fail(`duplicate id "${e.id}" inside ${fullPathArg}`);
    seen.add(e.id);
  }
  // Immutability guard: every previously published entry must be present,
  // byte-identical, and in the same relative order.
  let prevCursor = 0;
  const order = [];
  for (const e of newFullEntries) {
    if (prevIds.has(e.id)) order.push(e.id);
  }
  for (const e of newFullEntries) {
    if (!prevIds.has(e.id)) continue;
    const old = prevById.get(e.id);
    if (stable(old) !== stable(e)) {
      fail(
        `published entry "${e.id}" was modified in ${fullPathArg}. ` +
        `Fix typos via "${correctionsKey}" in a --new draft, not by editing published files.`
      );
    }
  }
  const prevOrder = prevEntries.map((e) => e.id);
  if (stable(order) !== stable(prevOrder.filter((id) => order.includes(id))) || order.length !== prevOrder.length) {
    const missing = prevOrder.filter((id) => !order.includes(id));
    if (missing.length > 0) fail(`published entries deleted in ${fullPathArg}: ${missing.join(", ")}`);
    fail(`published entries reordered in ${fullPathArg}; keep v${from} order and append new entries at the end.`);
  }

  fresh = newFullEntries.filter((e) => !prevIds.has(e.id));
  corrections = [];
  if (fresh.length === 0) fail("no new entries vs previous full; nothing to publish.");
}

// ---------- write delta ----------
const deltaName = `${base}_v${to}.json`;
const deltaRel = `content/deltas/${deltaName}`;
if (existsSync(join(root, deltaRel))) fail(`${deltaRel} already exists; published deltas are immutable.`);
const deltaObj = { version: to, [newKey]: fresh };
if (corrections.length > 0) deltaObj[correctionsKey] = corrections;
const deltaBytes = JSON.stringify(deltaObj, null, 2) + "\n";
writeFileSync(join(root, deltaRel), deltaBytes);
const sha256 = createHash("sha256").update(deltaBytes).digest("hex");
const size = Buffer.byteLength(deltaBytes, "utf8");

// ---------- update manifest ----------
const manifestPath = join(root, "content/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const effectiveMinApp = minAppVersionArg || manifest.minAppVersion || "1.0.0";
manifest[versionKey] = to;
manifest[deltasKey] = (manifest[deltasKey] || []).filter((d) => d.to !== to);
manifest[deltasKey].push({
  from,
  to,
  url: `deltas/${deltaName}`,
  count: fresh.length,
  corrections: corrections.length,
  size,
  sha256,
  minAppVersion: effectiveMinApp,
});
// Keep delta history ordered oldest -> newest so the app can replay it.
manifest[deltasKey].sort((a, b) => a.to - b.to);
manifest.updatedAt = new Date().toISOString();
if (notes) {
  manifest.notes = { ...(manifest.notes || {}), en: notes };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// ---------- update registry ----------
const regName = type === "poems" ? "poems_index.json" : "ciphers_index.json";
const regPath = join(root, "content/registry", regName);
const reg = JSON.parse(readFileSync(regPath, "utf8"));
const numOf = (id) => parseInt(id.slice(id.indexOf("_") + 1), 10);
let max = reg.max_numeric ?? 0;
const poemKeyOf = (e) => `${norm(e.title)}|${norm(e.author)}`;
for (const e of fresh) {
  if (!reg.ids.includes(e.id)) reg.ids.push(e.id);
  max = Math.max(max, numOf(e.id));
  if (type === "poems") {
    const k = poemKeyOf(e);
    if (!reg.title_author_keys.includes(k)) reg.title_author_keys.push(k);
  } else {
    const a = norm(e.answer_word);
    if (!reg.answer_words.includes(a)) reg.answer_words.push(a);
    const cat = e.categoryName;
    if (cat && !reg.categories.includes(cat)) reg.categories.push(cat);
  }
}
for (const e of corrections) {
  const old = prevById.get(e.id);
  if (type === "poems") {
    const oldK = poemKeyOf(old);
    const newK = poemKeyOf(e);
    if (oldK !== newK) {
      reg.title_author_keys = reg.title_author_keys.filter((k) => k !== oldK);
      if (!reg.title_author_keys.includes(newK)) reg.title_author_keys.push(newK);
    }
  } else {
    const oldA = norm(old.answer_word);
    const newA = norm(e.answer_word);
    if (oldA !== newA) {
      reg.answer_words = reg.answer_words.filter((a) => a !== oldA);
      if (!reg.answer_words.includes(newA)) reg.answer_words.push(newA);
    }
    const cat = e.categoryName;
    if (cat && !reg.categories.includes(cat)) reg.categories.push(cat);
  }
}
reg.ids.sort();
if (type === "poems") reg.title_author_keys.sort();
else {
  reg.answer_words.sort();
  reg.categories.sort();
}
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

console.log(`Built ${deltaRel}: ${fresh.length} new + ${corrections.length} corrected, v${from} to v${to}`);
console.log(`size: ${size} bytes; sha256: ${sha256}; minAppVersion: ${effectiveMinApp}`);
console.log(`manifest ${versionKey} = ${to}; registry next_id = ${reg.next_id}`);
console.log(`Next: git add content && git commit -m "content: ${base} v${to} (+${fresh.length})" && git tag ${tagName} && git push --tags`);
console.log(`Publish tags per stream (poems-vN / ciphers-vN); deltas/ and prior fulls are immutable from here.`);
