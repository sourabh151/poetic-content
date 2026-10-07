#!/usr/bin/env node
// Reserve the next classic_XXXXX / cipher_XXXXX ids from the registry.
// Usage:
//   node scripts/next-id.mjs --type poems --count 5 [--reserve]
//   node scripts/next-id.mjs --type ciphers --count 1 [--reserve]
// --reserve appends to content/registry/.reserved.json so parallel runs don't collide.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = {
  poems: join(root, "content/registry/poems_index.json"),
  ciphers: join(root, "content/registry/ciphers_index.json"),
};
const RESERVED_PATH = join(root, "content/registry/.reserved.json");
const PREFIX = { poems: "classic", ciphers: "cipher" };

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

const type = arg("type", null);
const count = Math.max(1, parseInt(arg("count", "1"), 10) || 1);
const reserve = process.argv.includes("--reserve");

if (type !== "poems" && type !== "ciphers") {
  console.error("Usage: node scripts/next-id.mjs --type poems|ciphers --count N [--reserve]");
  process.exit(2);
}

const index = JSON.parse(readFileSync(REGISTRY[type], "utf8"));
let reserved = { poems: [], ciphers: [] };
if (existsSync(RESERVED_PATH)) {
  try {
    reserved = JSON.parse(readFileSync(RESERVED_PATH, "utf8"));
  } catch {
    console.error(`ERROR: ${RESERVED_PATH} is corrupt; fix or delete it.`);
    process.exit(1);
  }
}

const used = new Set([...(index.ids || []), ...(reserved[type] || [])]);
// Advance past any reserved/used ids so output never collides.
let n = (index.max_numeric ?? 0) + 1;
const ids = [];
while (ids.length < count) {
  const id = `${PREFIX[type]}_${String(n).padStart(5, "0")}`;
  if (!used.has(id)) {
    ids.push(id);
    used.add(id);
  }
  n += 1;
}

if (reserve) {
  reserved[type] = [...(reserved[type] || []), ...ids];
  writeFileSync(RESERVED_PATH, JSON.stringify(reserved, null, 2) + "\n");
  console.error(`Reserved in content/registry/.reserved.json (commit it with your draft).`);
}

for (const id of ids) console.log(id);
