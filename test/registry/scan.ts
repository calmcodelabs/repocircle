/**
 * Filesystem and source scanning behind the registry gates (TESTING.md §1).
 *
 * The gates in test/static/registry.test.ts and the report generator both read
 * from here, so "what the build enforces" and "what the report claims" can
 * never be two different answers.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, LAYER_DIRS, type Layer } from './features.ts';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const posix = (p: string) => p.split(sep).join('/');

/** Every source file the registry must account for, relative to src/. */
export function srcFiles(): string[] {
  const root = join(REPO_ROOT, 'src');
  return walk(root)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => posix(relative(root, f)))
    .sort();
}

/**
 * Every test file, repo-relative. Three suffixes, because the runners disagree:
 * vitest uses `.test.ts(x)`, Playwright journeys use `.spec.ts`, and the visual
 * project uses `.visual.ts` so it can be selected separately.
 */
export function testFiles(): string[] {
  const root = join(REPO_ROOT, 'test');
  return walk(root)
    .filter((f) => /\.(test|spec|visual)\.tsx?$/.test(f))
    .map((f) => posix(relative(REPO_ROOT, f)))
    .sort();
}

// ---------------------------------------------------------------- rules

const PATH_VAR = /\{[A-Za-z_][A-Za-z0-9_]*(=\*\*)?\}/g;
const LINE_COMMENT = /\/\/.*$/;
const STRING_LITERAL = /'[^']*'/g;

/**
 * Reconstruct every match-block path in firestore.rules, relative to the
 * documents root. Brace counting has to ignore path variables (`{uid}`),
 * comments and string literals, or the nesting comes out wrong.
 */
export function rulesMatchBlocks(rulesText?: string): string[] {
  const text = rulesText ?? readFileSync(join(REPO_ROOT, 'firestore.rules'), 'utf8');
  const ROOT = '/databases/{database}/documents';
  /** Each open match block, with the brace depth it was opened at. */
  const stack: Array<{ path: string; depth: number }> = [];
  const found: string[] = [];
  let depth = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(LINE_COMMENT, '');
    // Structural braces only: path variables, string literals and comments all
    // contain braces that say nothing about nesting.
    const structural = line.replace(STRING_LITERAL, "''").replace(PATH_VAR, '');
    const opens = (structural.match(/\{/g) ?? []).length;
    const closes = (structural.match(/\}/g) ?? []).length;

    const match = /^\s*match\s+(\S+)\s*\{\s*$/.exec(line);
    if (match?.[1]) {
      stack.push({ path: match[1], depth });
      const full = stack.map((e) => e.path).join('');
      found.push(full === ROOT ? ROOT : full.slice(ROOT.length));
    }

    depth += opens - closes;
    // A block ends when the brace depth falls back to where it was opened.
    // Counting net-negative lines instead would let `service {` and function
    // bodies pop match blocks that are still open.
    while (stack.length > 0 && depth <= stack[stack.length - 1]!.depth) stack.pop();
  }
  return found;
}

// ---------------------------------------------------------------- tags

const DESCRIBE_TITLE = /^(\s*)(?:test\.)?describe(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\2/gm;
const TAG = /\[([a-z][a-z0-9-]*)\]/g;

export type TaggedFile = {
  file: string;
  layer: Layer | null;
  /** Feature slugs found in any describe title in the file. */
  tags: string[];
  /**
   * Top-level describe titles carrying no tag. Nested describes inherit their
   * parent's feature, so only column-zero ones are required to declare it.
   */
  untaggedTopLevel: string[];
};

export function layerOf(file: string): Layer | null {
  // Visual specs live beside the journeys — they share the harness and the
  // served build — so the suffix decides, not the directory.
  if (/\.visual\.tsx?$/.test(file)) return 'visual';
  for (const [dir, layer] of Object.entries(LAYER_DIRS)) {
    if (file.startsWith(dir + '/')) return layer;
  }
  return null;
}

export function scanTestFile(file: string): TaggedFile {
  const text = readFileSync(join(REPO_ROOT, file), 'utf8');
  const tags = new Set<string>();
  const untagged: string[] = [];
  for (const m of text.matchAll(DESCRIBE_TITLE)) {
    const indent = m[1] ?? '';
    const title = m[3] ?? '';
    const found = [...title.matchAll(TAG)].map((t) => t[1]!);
    if (found.length === 0 && indent === '') untagged.push(title);
    for (const f of found) tags.add(f);
  }
  return {
    file,
    layer: layerOf(file),
    tags: [...tags].sort(),
    untaggedTopLevel: untagged,
  };
}

export function scanAllTests(): TaggedFile[] {
  return testFiles().map(scanTestFile);
}

/** feature id -> layers that currently have at least one test tagged for it. */
export function coverageByFeature(scanned = scanAllTests()): Map<string, Set<Layer>> {
  const out = new Map<string, Set<Layer>>();
  for (const f of FEATURES) out.set(f.id, new Set());
  for (const t of scanned) {
    if (!t.layer) continue;
    for (const tag of t.tags) {
      const set = out.get(tag);
      if (set) set.add(t.layer);
    }
  }
  return out;
}

/** Files claimed by at least one feature, relative to src/. */
export function claimedSrcFiles(): Set<string> {
  const claimed = new Set<string>();
  for (const f of FEATURES) for (const file of f.files) claimed.add(file);
  return claimed;
}

export function claimedRulesBlocks(): Set<string> {
  const claimed = new Set<string>();
  for (const f of FEATURES) for (const b of f.rulesBlocks ?? []) claimed.add(b);
  return claimed;
}
