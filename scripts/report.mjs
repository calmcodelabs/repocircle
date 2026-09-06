/**
 * Report generator v0 (TESTING.md §5).
 *
 * Reads the raw vitest JSON in reports/raw/, converts it to CTRF — the open
 * test-report schema everything downstream reads — joins it against the feature
 * registry, and writes the layered, indexed report tree.
 *
 * The point of the layering is retrieval: INDEX.md names the run and the state
 * of every feature; one hop reaches a feature or layer summary; one more reaches
 * the failing assertion. Paths and anchors are stable, so an agent can jump
 * straight to reports/latest/features/asks.md#e2e without a discovery pass.
 *
 *   npm run report                    # regenerate from whatever is in reports/raw
 *   node scripts/report.mjs --label "after the T0 spine"
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_LAYERS, FEATURES, KNOWN_GAPS } from '../test/registry/features.ts';
import { renderDashboard } from './dashboard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPORTS = join(ROOT, 'reports');
const RAW = join(REPORTS, 'raw');

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const LAYER_OF_PATH = [
  ['test/static/', 'static'],
  ['test/unit/', 'unit'],
  ['test/rules/', 'rules'],
  ['test/integration/', 'integration'],
  ['test/component/', 'component'],
  ['test/e2e/', 'e2e'],
  ['test/visual/', 'visual'],
];

const layerOfFile = (file) => {
  const rel = file.replace(/\\/g, '/');
  for (const [prefix, layer] of LAYER_OF_PATH) if (rel.includes(prefix)) return layer;
  return 'unknown';
};

const TAG = /\[([a-z][a-z0-9-]*)\]/g;
const tagsOf = (titles) => {
  const out = new Set();
  for (const t of titles) for (const m of t.matchAll(TAG)) out.add(m[1]);
  return [...out];
};

// ------------------------------------------------------------ read + convert

function readRaw() {
  if (!existsSync(RAW)) return [];
  return readdirSync(RAW)
    .filter((f) => f.endsWith('.json'))
    // Written by scripts/coverage.mjs, read separately below — it describes the
    // source, not a run of tests.
    .filter((f) => f !== 'coverage-summary.json')
    .map((f) => {
      try {
        return { file: f, json: JSON.parse(readFileSync(join(RAW, f), 'utf8')) };
      } catch {
        console.warn(`  skipping unreadable ${f}`);
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Playwright JSON -> CTRF. Its shape is nested suites rather than vitest's flat
 * file list, and its layer comes from the spec extension (.spec = e2e,
 * .visual = visual) rather than the directory.
 */
function playwrightTests(json) {
  const out = [];
  const walk = (suite, ancestors) => {
    const titles = suite.title ? [...ancestors, suite.title] : ancestors;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = (t.results ?? []).at(-1) ?? {};
        const file = (suite.file ?? spec.file ?? '').replace(/\\/g, '/');
        const layer = file.includes('.visual') ? 'visual' : 'e2e';
        const status =
          last.status === 'passed' || last.status === 'expected'
            ? 'passed'
            : last.status === 'skipped'
              ? 'skipped'
              : 'failed';
        out.push({
          name: [...titles, spec.title].join(' > '),
          status,
          duration: Math.round(last.duration ?? 0),
          suite: titles.join(' > '),
          filePath: `test/e2e/${file}`,
          tags: tagsOf([...titles, spec.title]),
          ...(last.errors?.length
            ? { message: last.errors.map((e) => e.message ?? String(e)).join('\n\n') }
            : {}),
          extra: {
            layer,
            ...(last.attachments?.length
              ? { attachments: last.attachments.map((a) => a.path ?? a.name).filter(Boolean) }
              : {}),
          },
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const suite of json.suites ?? []) walk(suite, []);
  return out;
}

/** vitest JSON -> CTRF test objects, with layer and feature tags attached. */
function toCtrfTests(raw) {
  const tests = [];
  for (const { json } of raw) {
    // Playwright and vitest both write JSON here; they are told apart by shape.
    if (Array.isArray(json.suites) && json.stats) {
      tests.push(...playwrightTests(json));
      continue;
    }
    for (const suite of json.testResults ?? []) {
      const filePath = relative(ROOT, suite.name).replace(/\\/g, '/');
      const layer = layerOfFile(filePath);
      for (const a of suite.assertionResults ?? []) {
        const status =
          a.status === 'passed'
            ? 'passed'
            : a.status === 'failed'
              ? 'failed'
              : a.status === 'pending' || a.status === 'skipped'
                ? 'skipped'
                : 'other';
        tests.push({
          name: a.fullName || a.title,
          status,
          duration: Math.round(a.duration ?? 0),
          suite: (a.ancestorTitles ?? []).join(' > '),
          filePath,
          tags: tagsOf([...(a.ancestorTitles ?? []), a.title ?? '']),
          ...(a.failureMessages?.length ? { message: a.failureMessages.join('\n\n') } : {}),
          extra: { layer },
        });
      }
    }
  }
  return tests;
}

const summarize = (tests, start, stop) => ({
  tests: tests.length,
  passed: tests.filter((t) => t.status === 'passed').length,
  failed: tests.filter((t) => t.status === 'failed').length,
  pending: 0,
  skipped: tests.filter((t) => t.status === 'skipped').length,
  other: tests.filter((t) => t.status === 'other').length,
  start,
  stop,
});

const ctrfDoc = (tests, start, stop, env) => ({
  results: {
    tool: { name: 'repocircle-report', version: '0' },
    summary: summarize(tests, start, stop),
    tests,
    environment: env,
  },
});

// ------------------------------------------------------------------ analysis

/**
 * Per feature per layer: passed | failed | missing | exempt | n/a.
 * This is the feature matrix — the central artifact of the whole system.
 */
function featureMatrix(tests) {
  const knownGaps = new Set(KNOWN_GAPS.map(([id, l]) => `${id}:${l}`));
  const byFeature = new Map();
  for (const f of FEATURES) {
    const row = { feature: f, cells: {}, tests: [] };
    for (const layer of ALL_LAYERS) {
      if (!f.layers.includes(layer)) {
        row.cells[layer] = 'n/a';
        continue;
      }
      if (f.exemptions?.[layer]) {
        row.cells[layer] = 'exempt';
        continue;
      }
      row.cells[layer] = knownGaps.has(`${f.id}:${layer}`) ? 'planned' : 'missing';
    }
    byFeature.set(f.id, row);
  }
  for (const t of tests) {
    const layer = t.extra.layer;
    for (const tag of t.tags) {
      const row = byFeature.get(tag);
      if (!row) continue;
      row.tests.push(t);
      if (!ALL_LAYERS.includes(layer)) continue;
      const cur = row.cells[layer];
      if (t.status === 'failed') row.cells[layer] = 'failed';
      else if (cur !== 'failed') row.cells[layer] = 'passed';
    }
  }
  return byFeature;
}

const CELL = {
  passed: 'pass',
  failed: 'FAIL',
  missing: 'missing',
  planned: 'planned',
  exempt: 'exempt',
  'n/a': '—',
};

// -------------------------------------------------------------------- output

const md = (lines) => lines.join('\n') + '\n';

function failureSection(tests, depth = '##') {
  const failed = tests.filter((t) => t.status === 'failed');
  if (failed.length === 0) return [`${depth} Failures {#failures}`, '', 'None.', ''];
  const out = [`${depth} Failures {#failures}`, ''];
  for (const t of failed) {
    out.push(`### ${t.name}`, '', `- layer: \`${t.extra.layer}\``, `- file: \`${t.filePath}\``);
    if (t.tags.length) out.push(`- features: ${t.tags.map((x) => `\`${x}\``).join(', ')}`);
    out.push('', '```', (t.message ?? '').trim().slice(0, 4000), '```', '');
  }
  return out;
}

function main() {
  const raw = readRaw();
  const tests = toCtrfTests(raw);
  if (tests.length === 0) {
    console.error('No test results in reports/raw/. Run a test layer first.');
    process.exit(1);
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sha = git('rev-parse', 'HEAD').slice(0, 7) || 'nogit';
  const dirty = git('status', '--porcelain').length > 0;
  const runId = `${stamp}-${sha}`;
  const label = arg('--label') ?? '';

  const starts = raw.map((r) => r.json.startTime).filter(Boolean);
  const start = starts.length ? Math.min(...starts) : now.getTime();
  const stop = now.getTime();

  const env = {
    reportName: 'RepoCircle',
    appVersion: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version,
    branchName: git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', 'HEAD'),
    dirty,
    node: process.version,
    osPlatform: process.platform,
  };

  const coveragePath = join(RAW, 'coverage-summary.json');
  const coverage = existsSync(coveragePath)
    ? JSON.parse(readFileSync(coveragePath, 'utf8'))
    : null;

  const runDir = join(REPORTS, 'runs', runId);
  mkdirSync(join(runDir, 'layers'), { recursive: true });
  mkdirSync(join(runDir, 'features'), { recursive: true });
  mkdirSync(join(runDir, 'areas'), { recursive: true });
  mkdirSync(join(runDir, 'artifacts'), { recursive: true });

  // ---- whole-run CTRF + summary
  const doc = ctrfDoc(tests, start, stop, env);
  writeFileSync(join(runDir, 'ctrf.json'), JSON.stringify(doc, null, 2));

  const layersPresent = [...new Set(tests.map((t) => t.extra.layer))].sort();
  const s = doc.results.summary;
  const matrix = featureMatrix(tests);

  const perLayer = {};
  for (const layer of layersPresent) {
    const lt = tests.filter((t) => t.extra.layer === layer);
    perLayer[layer] = summarize(lt, start, stop);
    const dir = join(runDir, 'layers', layer);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ctrf.json'), JSON.stringify(ctrfDoc(lt, start, stop, env), null, 2));
    const byFile = new Map();
    for (const t of lt) byFile.set(t.filePath, [...(byFile.get(t.filePath) ?? []), t]);
    writeFileSync(
      join(dir, 'summary.md'),
      md([
        `# Layer: ${layer}`,
        '',
        `[Run summary](../../summary.md) · [Index](../../../../INDEX.md)`,
        '',
        `${perLayer[layer].passed}/${perLayer[layer].tests} passed` +
          (perLayer[layer].failed ? `, **${perLayer[layer].failed} failed**` : '') +
          '.',
        '',
        ...failureSection(lt),
        '## Files {#files}',
        '',
        '| File | Tests | Failed |',
        '|---|---:|---:|',
        ...[...byFile.entries()].map(
          ([f, ts]) =>
            `| \`${f}\` | ${ts.length} | ${ts.filter((t) => t.status === 'failed').length} |`,
        ),
        '',
      ]),
    );
  }

  // ---- per-feature pages
  for (const [id, row] of matrix) {
    const f = row.feature;
    writeFileSync(
      join(runDir, 'features', `${id}.md`),
      md([
        `# ${f.name}`,
        '',
        `\`${id}\`${f.ref ? ` · ${f.ref}` : ''} · area: ${f.area}`,
        '',
        `[Run summary](../summary.md) · [Index](../../../INDEX.md)`,
        '',
        '## Status by layer {#status}',
        '',
        '| Layer | State | Tests |',
        '|---|---|---:|',
        ...ALL_LAYERS.map((l) => {
          const n = row.tests.filter((t) => t.extra.layer === l).length;
          return `| <a id="${l}"></a>${l} | ${CELL[row.cells[l]]} | ${n} |`;
        }),
        '',
        ...(f.exemptions
          ? [
              '### Exemptions',
              '',
              ...Object.entries(f.exemptions).map(([l, why]) => `- \`${l}\`: ${why}`),
              '',
            ]
          : []),
        ...(coverage?.features?.[id]
          ? [
              '## Coverage {#coverage}',
              '',
              `${coverage.features[id].pct}% of statements across ${coverage.features[id].files} file(s) ` +
                `(${coverage.features[id].covered}/${coverage.features[id].total}), merged across layers.`,
              '',
            ]
          : []),
        '## Code {#code}',
        '',
        f.files.length ? f.files.map((x) => `- \`src/${x}\``).join('\n') : '_No files of its own._',
        '',
        ...(f.rulesBlocks?.length
          ? ['### Rules blocks', '', ...f.rulesBlocks.map((b) => `- \`${b}\``), '']
          : []),
        ...(f.emptyStates?.length
          ? [
              '## Empty states to cover (Class G) {#empty-states}',
              '',
              ...f.emptyStates.map((e) => `- ${e}`),
              '',
            ]
          : []),
        ...failureSection(row.tests),
        '## Tests {#tests}',
        '',
        row.tests.length
          ? md([
              '| Layer | Test | Status | ms |',
              '|---|---|---|---:|',
              ...row.tests.map(
                (t) =>
                  `| ${t.extra.layer} | ${t.name.replace(/\|/g, '\\|')} | ${t.status} | ${t.duration} |`,
              ),
            ])
          : '_No tests carry this feature tag yet._',
        '',
      ]),
    );
  }

  // ---- area rollups
  for (const area of ['backend', 'ui']) {
    const rows = [...matrix.values()].filter(
      (r) => r.feature.area === area || r.feature.area === 'both',
    );
    const layers =
      area === 'backend'
        ? ['static', 'unit', 'rules', 'integration']
        : ['component', 'e2e', 'visual'];
    writeFileSync(
      join(runDir, 'areas', `${area}.md`),
      md([
        `# Area: ${area}`,
        '',
        `[Run summary](../summary.md) · [Index](../../../INDEX.md)`,
        '',
        `${rows.length} features. Layers that define this area: ${layers.map((l) => `\`${l}\``).join(', ')}.`,
        '',
        `| Feature | ${layers.join(' | ')} |`,
        `|---|${layers.map(() => '---').join('|')}|`,
        ...rows.map(
          (r) =>
            `| [${r.feature.id}](../features/${r.feature.id}.md) | ` +
            layers.map((l) => CELL[r.cells[l]]).join(' | ') +
            ' |',
        ),
        '',
      ]),
    );
  }

  // ---- run summary
  const failing = tests.filter((t) => t.status === 'failed');
  const matrixRows = [...matrix.values()];
  const countCell = (state) =>
    matrixRows.reduce((n, r) => n + ALL_LAYERS.filter((l) => r.cells[l] === state).length, 0);

  const summaryJson = {
    runId,
    label,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(stop).toISOString(),
    durationMs: stop - start,
    env,
    totals: s,
    layers: perLayer,
    coverage: coverage
      ? { overall: coverage.overall, files: coverage.files, layers: coverage.generatedFrom }
      : null,
    matrix: {
      passed: countCell('passed'),
      failed: countCell('failed'),
      missing: countCell('missing'),
      planned: countCell('planned'),
      exempt: countCell('exempt'),
    },
  };
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summaryJson, null, 2));

  writeFileSync(
    join(runDir, 'summary.md'),
    md([
      `# Run ${runId}`,
      '',
      label ? `_${label}_` : '',
      '',
      `- verdict: **${s.failed === 0 ? 'pass' : 'FAIL'}** — ${s.passed}/${s.tests} passed` +
        (s.skipped ? `, ${s.skipped} skipped` : ''),
      `- commit: \`${env.commit.slice(0, 7)}\` on \`${env.branchName}\`${env.dirty ? ' (working tree dirty)' : ''}`,
      `- layers run: ${layersPresent.join(', ')}`,
      `- duration: ${(summaryJson.durationMs / 1000).toFixed(1)}s`,
      '',
      ...failureSection(tests),
      '## Layers {#layers}',
      '',
      '| Layer | Tests | Passed | Failed |',
      '|---|---:|---:|---:|',
      ...layersPresent.map(
        (l) =>
          `| [${l}](layers/${l}/summary.md) | ${perLayer[l].tests} | ${perLayer[l].passed} | ${perLayer[l].failed} |`,
      ),
      '',
      '## Feature matrix {#matrix}',
      '',
      `Cells: pass · FAIL · missing (declared, unbuilt, unplanned) · planned (in KNOWN_GAPS) · exempt · — (not declared).`,
      '',
      `| Feature | ${ALL_LAYERS.join(' | ')} |`,
      `|---|${ALL_LAYERS.map(() => '---').join('|')}|`,
      ...matrixRows.map(
        (r) =>
          `| [${r.feature.id}](features/${r.feature.id}.md) | ` +
          ALL_LAYERS.map((l) => CELL[r.cells[l]]).join(' | ') +
          ' |',
      ),
      '',
      ...(coverage
        ? [
            '## Coverage {#coverage}',
            '',
            `Merged from ${coverage.generatedFrom.join(', ')} over ${coverage.files} source files.`,
            '',
            '| Metric | Covered | Total | % |',
            '|---|---:|---:|---:|',
            ...Object.entries(coverage.totals).map(
              ([k, v]) => `| ${k} | ${v.covered} | ${v.total} | ${coverage.overall[k]}% |`,
            ),
            '',
            '### Least covered features',
            '',
            '| Feature | % statements |',
            '|---|---:|',
            ...Object.entries(coverage.features)
              .sort((a, b) => a[1].pct - b[1].pct)
              .slice(0, 12)
              .map(([fid, c]) => `| [${fid}](features/${fid}.md) | ${c.pct}% |`),
            '',
          ]
        : []),
      '## Areas {#areas}',
      '',
      '- [backend](areas/backend.md)',
      '- [ui](areas/ui.md)',
      '',
    ]),
  );

  // ---- dashboard (TESTING.md §6), inlined so it opens from file://
  const history = existsSync(join(REPORTS, 'history.jsonl'))
    ? readFileSync(join(REPORTS, 'history.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
  writeFileSync(
    join(runDir, 'dashboard.html'),
    renderDashboard({ summary: summaryJson, matrix, tests, history, layers: perLayer, coverage }),
  );

  // ---- latest mirror
  const latest = join(REPORTS, 'latest');
  rmSync(latest, { recursive: true, force: true });
  cpSync(runDir, latest, { recursive: true });

  // ---- history (the analysis substrate)
  appendFileSync(
    join(REPORTS, 'history.jsonl'),
    JSON.stringify({
      runId,
      at: new Date(stop).toISOString(),
      commit: env.commit,
      dirty: env.dirty,
      label,
      totals: s,
      layers: perLayer,
      matrix: summaryJson.matrix,
      coverage: summaryJson.coverage,
      failed: failing.map((t) => ({ name: t.name, file: t.filePath, layer: t.extra.layer })),
    }) + '\n',
  );

  // ---- index
  const runs = readdirSync(join(REPORTS, 'runs')).sort().reverse().slice(0, 20);
  writeFileSync(
    join(REPORTS, 'INDEX.md'),
    md([
      '# RepoCircle — test reports',
      '',
      'Generated by `npm run report`. Everything here is derived; nothing is hand-edited.',
      '',
      '## How to navigate this (three hops) {#navigation}',
      '',
      '1. **Here** — latest verdict, the feature matrix, the run catalog.',
      '2. **A summary** — [`latest/summary.md`](latest/summary.md) for the run,',
      '   [`latest/features/<slug>.md`](latest/features/) for one feature,',
      '   [`latest/layers/<layer>/summary.md`](latest/layers/) for one layer,',
      '   [`latest/areas/backend.md`](latest/areas/backend.md) · [`ui`](latest/areas/ui.md).',
      '3. **The detail** — the failing assertion in that page under `#failures`,',
      '   or the raw records in the sibling `ctrf.json`.',
      '',
      'Stable anchors on every feature page: `#status`, `#code`, `#empty-states`,',
      '`#failures`, `#tests`, plus one per layer (`#unit`, `#rules`, `#e2e`, …).',
      'Stable paths: `reports/latest/...` always points at the newest run.',
      '',
      '## Latest run {#latest}',
      '',
      `- **${runId}** — ${s.failed === 0 ? 'pass' : `**${s.failed} FAILED**`}, ${s.passed}/${s.tests} passed`,
      `- layers: ${layersPresent.join(', ')}`,
      `- [dashboard](latest/dashboard.html) · [full summary](latest/summary.md) · [backend](latest/areas/backend.md) · [ui](latest/areas/ui.md)`,
      '',
      '## Coverage of the registry {#coverage}',
      '',
      `- feature/layer cells passing: **${summaryJson.matrix.passed}**`,
      `- planned (KNOWN_GAPS, has an owning milestone): ${summaryJson.matrix.planned}`,
      `- missing (declared but unbuilt): ${summaryJson.matrix.missing}`,
      `- exempt: ${summaryJson.matrix.exempt}`,
      ...(coverage
        ? [
            `- merged statement coverage: **${coverage.overall.statements}%** ` +
              `(floor enforced by \`npm run coverage:check\`)`,
          ]
        : []),
      '',
      '## Recent runs {#runs}',
      '',
      '| Run | Verdict | Passed | Failed |',
      '|---|---|---:|---:|',
      ...runs.map((r) => {
        try {
          const j = JSON.parse(readFileSync(join(REPORTS, 'runs', r, 'summary.json'), 'utf8'));
          return `| [${r}](runs/${r}/summary.md) | ${j.totals.failed === 0 ? 'pass' : 'FAIL'} | ${j.totals.passed} | ${j.totals.failed} |`;
        } catch {
          return `| ${r} | ? | | |`;
        }
      }),
      '',
      'Machine-readable history: [`history.jsonl`](history.jsonl) — one line per run.',
      '',
    ]),
  );

  console.log(`Report written: reports/runs/${runId}`);
  console.log(`  ${s.passed}/${s.tests} passed across ${layersPresent.length} layer(s)`);
  console.log(
    `  matrix: ${summaryJson.matrix.passed} passing cells, ${summaryJson.matrix.planned} planned, ${summaryJson.matrix.missing} missing`,
  );
  console.log(`  reports/INDEX.md · reports/latest/summary.md · reports/latest/dashboard.html`);
  if (s.failed > 0)
    console.log(`  ${s.failed} FAILURE(S) — see reports/latest/summary.md#failures`);
}

main();
