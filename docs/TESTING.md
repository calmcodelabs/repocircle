# RepoCircle — Testing

The plan and architecture for the testing overhaul. Authored 2026-09-06 (Fable,
planning session); implemented across milestones T0–T7 (§9). Once T0 lands this
document is binding the way POSITIONING.md is: changes to the testing system get
a dated note here, not silence.

Related: [REVIEW.md](REVIEW.md) (failure classes — this system executes them) ·
[PLAN.md](PLAN.md) §5d (milestone summary) · [SCALING.md](SCALING.md) ·
[SECURITY.md](SECURITY.md) §10 (the rules test suite this extends).

---

## 0. Goal and principles

**Goal.** Every feature the app has is covered by tests at every layer where it
has behavior, and every run leaves a structured, indexed report that a person or
an agent can navigate to any fact in three hops. Time spent testing is allowed
to exceed time spent building; the emulator makes test volume free.

Principles, each of which closed a real argument:

1. **One artifact.** The bundle users get is the bundle tested. Test affordances
   are compile-time flags eliminated by the existing define/tree-shake mechanism
   — never a second "testing build" of the app. Deploy speed is protected by
   splitting the *pipeline* (§8), not the artifact. (Discussed and closed
   2026-09-06; rebuilding per environment is the named CI/CD anti-pattern, and
   two builds would mean two sw.js BUILD_IDs — Class D already cost days.)
2. **The registry is the spine.** "Everything is tested" is a checkable
   proposition only if "everything" is enumerated. A type-checked feature
   registry (§1) maps features to code to tests; completeness is a failing
   check, not a claim.
3. **Real backends over mocks, except at one seam.** Rules, integration, and
   E2E layers run against the Firestore emulator — the real rules engine, the
   real SDK. The single mocked seam is the `watch*`/data-module boundary in
   component tests (§2, L4), because Class B/G coverage requires injecting
   error and empty states on demand. GitHub's API is never called: one shared
   fixture set (§4) serves unit tests and Playwright route interception alike.
4. **Reports are data first.** Every runner emits CTRF JSON (an open,
   framework-agnostic schema); everything human-readable is generated from it.
   Analysis — flakiness, duration trends, coverage trends — is a query over
   accumulated runs, which is the point of generating the data at all.
5. **The failure classes run in CI.** REVIEW.md A–G stop being a human sweep
   and become executable gates (§7). A class that bit once gets a check that
   would have caught it.

## 1. The feature registry

`test/registry/features.ts` — a plain, type-checked module, importable by tests
and by the report generator.

```ts
type FeatureArea = 'backend' | 'ui' | 'both';
type Layer = 'static' | 'unit' | 'rules' | 'integration' | 'component' | 'e2e' | 'visual';

type Feature = {
  id: string;              // kebab-case slug, stable forever: 'asks', 'home-gating'
  name: string;
  ref?: string;            // cross-ref: 'F-06', 'ADR-022', 'M17'
  area: FeatureArea;
  routes?: string[];       // router Route names touched
  files: string[];         // every src/ file this feature owns, relative to src/
  rulesBlocks?: string[];  // match-block paths in firestore.rules
  layers: Layer[];         // where this feature must have tests
  emptyStates?: string[];  // enumerated reasons-to-be-empty (Class G, §7)
  exemptions?: Partial<Record<Layer, string>>; // layer -> dated reason, when waived
};
```

**Completeness gates** (run in the fast gate from T0 on):

- Every file under `src/` is claimed by ≥1 feature (or a named `infrastructure`
  bucket: firebase init, router, styles, ui primitives).
- Every `match` block in firestore.rules is claimed by ≥1 feature.
- Every feature has ≥1 test in each declared layer, found by tag (below), or a
  dated exemption — enforced as a no-regression baseline against `KNOWN_GAPS`
  while T2–T5 are outstanding (see §9a).
- Every top-level `describe` carries a feature tag; untagged ones fail the gate,
  and a tag naming no registry feature fails it too.

**Tagging convention.** Top-level `describe` (and Playwright `test.describe`)
titles carry the slug in brackets: `describe('[asks] composer validation', …)`.
The report generator parses tags out of CTRF test names and joins against the
registry; a tag with no registry entry is an error in either direction.

The starter inventory is §12 — Opus completes it against PRD §7 and PLAN §5b/§5c
during T0, and it is reviewed once by Shashwat before it becomes load-bearing.

## 2. The layers

| # | Layer | Runner | Backing | What it proves |
|---|---|---|---|---|
| L0 | Static gates | vitest (node) | source text | failure-class invariants, registry completeness, query→index manifest, bundle budgets |
| L1 | Unit | vitest (node) | none | pure logic: normalizers, gates, formatters, ics, vault |
| L2 | Rules | vitest + emulator | Firestore emulator | the entire authz matrix (exists; grows) |
| L3 | Integration | vitest + emulator | Firestore + Auth emulators | data modules as the app calls them: flows, races, partial failure |
| L4 | Component | vitest browser mode (Chromium via Playwright provider) | mocked watch boundary | every view in every state: loading, empty (each reason), error, populated, interactive |
| L5 | E2E journeys | Playwright | emulator-mode build + emulators + GitHub fixtures | whole features through real navigation, multi-user |
| L6 | Visual · a11y · perf | Playwright + axe + budgets | same as L5 | pixels, WCAG, wallet |
| L7 | Artifact smoke | vitest (node) + Playwright | the true production bundle | the shipped bytes: CSP exact, sw.js stamped and *changing*, no emulator code, size budgets |

**Backend vs UI**, as requested: backend = L2 + L3 (with L0/L1 support); UI =
L4 + L5 + L6. Reports roll up on both axes (§5).

### L3 — integration (new; the highest-value gap)

Runs in node against the emulators, importing `src/data` modules directly —
vitest sets `import.meta.env.DEV`, so with `VITE_EMULATORS=1` in the test env
the app's own `firebase.ts` wiring connects to the emulators with zero refactor.
Owns, at minimum:

- **Multi-step flows and their partial failures**: `joinViaInvite` (batch +
  server confirmation + summary mirror), `leaveGroup` (five sequential awaits,
  order-dependent authorization, no rollback), `removeMember`, `deleteGroup`,
  adoption/handover, rejoin-after-leave.
- **Concurrency** (Class C executable): two contexts claim the same ask,
  vote the same poll, increment the same counter, race the poll engine's
  `tryClaim` transaction — assert final state, not hope.
- **The poll engine end-to-end** against GitHub fixtures: claim election, ETag
  304 path, first-poll backfill cap, daily-bucket pruning, stats7d rollup,
  failing-flag set and clear, rate-limit stop.
- **Every `watch*` query shape** against seeded states — do the queries return
  what their consuming block assumes.
- **resilientWatch** retry/give-up behavior with induced errors.

### L4 — component

Vitest browser mode, real Chromium, `@testing-library/preact` queries by role
and text (which doubles as a keyboard/semantics assertion — UI.md gate). The
`watch*` boundary is mocked by a harness that lets a test push states into any
block: loading → empty(reason) → populated → error → recovered.

- All 11 `src/ui` primitives: pure render + interaction contracts.
- Every Home block (the M16.5 decomposition made each block one component with
  one listener — a ready-made seam), driven through `homeBlocks` gate states.
- Every view in `src/views`, prioritized by size and risk: GroupHome, Repos,
  RepoDetail, Members, Profile, GroupSettings, IdeaDetail, AskDetail first.
- **Class G enumeration**: for each `emptyStates` entry in the registry, a test
  drives that exact reason and asserts the copy names it.
- **Class B enumeration**: for each view, induce watch failure and assert the
  recovery affordance (retry / dismiss / staleboard) exists and works.

### L5 — E2E journeys

Playwright against a served **emulator-mode build** (§3) with the emulators and
GitHub fixtures. Multi-user journeys use two browser contexts — this retires
the two-Chrome-profiles ritual and the screenshot-and-eyeball method: journeys
assert on roles and text, and every failure leaves a Playwright trace
(screenshot + DOM + network per step) in the report artifacts.

The journey list (each is a registry-tagged spec):

1. First run: emulator sign-in → onboarding → create circle → repo import
   (GitHub fixtures) → Home renders.
2. Join via invite → M17 questions → narrowed Home (ADR-022) → widening by
   each gate input → `showAll` escape hatch.
3. Ask lifecycle across two users: post → claim → resolve → credit line.
4. Stuck flag: post → persists on Home → cleared by owner.
5. Collab request: request (fixture issue created) → owner accepts in their own
   context → accepted state, journey/credit surfaces.
6. Repo lifecycle: register → status changes → needs set (`needsSince`) →
   interest → longest-waiting surfacing → adoption after owner leaves.
7. Ideas: pitch → interest → comment → germinate to repo → two-way link.
8. Sessions: create → RSVP from second user → away-inbox entry for host →
   .ics download parses → cancel.
9. Polls: create → vote both users → results hidden until own vote → close →
   single-fact result.
10. Announcements + wall: admin-only compose, append-only, links + pinned repo.
11. Watches + inbox: watch repo/ask/idea → notification levels (mute skips
    queries) → per-device dismissal.
12. Leave/rejoin: leave → anonymization visible to others → rejoin via invite →
    history intact where designed.
13. Cross-circle (ADR-025): two circles, mutual membership → AlsoIn shows;
    non-mutual → doesn't.
14. Poll engine journey: seed stale repos → fixture events → sparklines and
    Active-this-week fill; ETag 304 second cycle.
15. **The update journey (Class D crown jewel)**: build A served → tab open →
    build B swapped in → sw update check → reload bar appears → reload lands
    on B. Uses the build-pair harness from L7.

### L6 — visual, a11y, perf

- **Visual**: Playwright `toHaveScreenshot` per route and per key sheet/dialog,
  on one desktop and one mobile viewport. Determinism: a dedicated seeded
  scenario with fixed timestamps, Playwright's clock API pinning `Date.now()`,
  animation-off flag, masked avatars. **Baselines are generated only inside the
  Playwright Docker image** (cross-OS font rendering makes local baselines
  worthless); `npm run test:visual` runs the same container locally.
- **A11y**: `@axe-core/playwright` per route + open sheets; keyboard tab-order
  walks for the primary flows (UI.md gate made executable).
- **Perf**: bundle-size budget check in the fast gate (gzip per chunk, from
  ARCH §7: JS ≤ 220 KB total app+framework); Lighthouse CI against the served
  production build in the full suite (Home perf budget per UI.md).

### L7 — artifact smoke

Static assertions on `dist/` after a production build — the checks run by hand
on 2026-09-06, automated:

- No emulator markers in any chunk (`connectFirestoreEmulator`, `127.0.0.1:9099`,
  the console banner) — proves the tree-shake that the one-artifact rule leans on.
- CSP meta present and byte-exact against the expected policy.
- sw.js: `__BUILD_ID__` replaced, and **two consecutive builds with a source
  touch produce different sw.js bytes** (Class D's own rule: a mechanism that
  fires on change must be verified to change).
- Precache manifest matches the emitted files.
- Maintenance screen renders with zero network when `MAINTENANCE.on` (Playwright,
  offline route-block, against the true bundle).

## 3. Runtime and modes — the one-artifact rule in practice

Today the emulator guard is `import.meta.env.DEV && VITE_EMULATORS === '1'`
(src/firebase.ts, src/main.tsx). `DEV` is false in **any** build, so no built
bundle can reach the emulators — which blocks L5 entirely. T0 changes the
guards to `import.meta.env.VITE_EMULATORS === '1'` alone:

- Production build: `VITE_EMULATORS` is undefined → statically false → the
  emulator branch is eliminated exactly as before. **L7 asserts this on every
  build** — the guard's safety stops being an assumption.
- `vite build --mode emulator`: `.env.emulator` sets the flag → the same
  source, same plugins, same sw stamping, produces the L5 test bundle. Its CSP
  additionally allows loopback connect-src (the CSP plugin becomes
  mode-aware; production CSP is unchanged and L7-verified).

The delta between the two builds is therefore exactly: one define, plus the CSP
loopback entries. A T0 script builds both from the same tree and asserts the
delta is only that (chunk-list comparison + marker checks). This is the
contained, verified exception that lets functional E2E run against a real
build — the untouched production artifact is itself covered by L7.

The maintenance short-circuit keeps its current semantics (emulator runs walk
past it; production pause is real) under the same single flag.

## 4. Fixtures, clocks, scenarios

- **One scenario library**: `test/fixtures/scenarios.ts` — typed builders for
  members, repos, asks, ideas, sessions, polls, invites, at three sizes
  (`minimal` ~3 members, `demo` = today's seed, `windowed` — enough volume to
  exercise M16 bounds and pagination). `scripts/seed-emulator.mjs` becomes a
  thin consumer, so dev seed and test fixtures cannot drift (the Class F
  instinct applied to data).
- **One GitHub fixture set**: `test/harness/github/` — typed payloads for every
  event type the normalizer handles, plus repo/user/issue responses, ETag and
  rate-limit header variants. Unit tests import them; Playwright serves them
  via route interception of `api.github.com/**`. The real API is never called
  by any test.
- **Clocks**: `vi.useFakeTimers` in L1/L4; Playwright clock API in L5/L6;
  scenario builders take a `now` so relative times are deterministic.
- **Auth**: emulator sign-in path (exists) for L5; `authenticatedContext` (L2)
  and emulator Auth users (L3) elsewhere.

## 5. Reports — store, format, indexing

Everything below `reports/` is generated, self-contained (relative links only,
no external assets), and gitignored. Local-first now; because runs are
append-only directories plus one JSONL, moving to any cloud store later is a
sync, not a redesign. CI uploads the same directory as a workflow artifact in
the interim.

```
reports/
  INDEX.md                     # entry point: latest status, run catalog, feature matrix
  history.jsonl                # one line per run: sha, totals per layer, durations — the analysis substrate
  latest/                      # copy of the newest run (stable path for agents)
  runs/<runId>/                # runId = <utc-stamp>-<sha7>
    summary.md                 # human: verdict, failures first, deltas vs previous run
    summary.json               # machine: totals, env (node, emulator, browser versions), git state
    ctrf.json                  # merged CTRF for the whole run
    layers/<layer>/            # unit | rules | integration | component | e2e | visual | a11y | perf | static | artifact
      summary.md  ctrf.json
    features/<slug>.md         # per-feature rollup: status per layer, coverage %, linked artifacts
    areas/backend.md  ui.md    # the two-axis rollup
    coverage/                  # merged istanbul json + lcov + html; per-feature table via registry join
    artifacts/                 # traces, screenshots, diffs — referenced from summaries
```

**Indexing contract (three hops).** INDEX.md → layer or feature summary →
raw detail. Stable paths (`reports/latest/features/asks.md`), stable anchors
(`#e2e`, `#failures`), failures always listed before passes, every failure
linked to its artifact. This contract is documented here and in INDEX.md
itself, so an agent needs no discovery pass.

**CTRF** is the canonical leaf format (open JSON schema, per-runner reporters
exist for vitest and Playwright; anything missing is a ~60-line converter).
Feature tags ride in test names (§1) and are lifted into CTRF `tags` by the
generator.

**Coverage** runs istanbul-provider across L1/L3/L4, merged; the registry join
produces the per-feature coverage table — the direct, numeric answer to
"is every feature tested". Thresholds ratchet (§9): each T-milestone raises the
floor; the end state is 100% registry completeness, ≥90% line coverage overall,
100% on `src/data` + `src/util` + `src/poll`.

## 6. Analysis and the dashboard

`reports/dashboard.html` — a single self-contained file, generated per run with
the data inlined (opens from `file://`, no server; `npm run reports:open` for
convenience). Dark, minimal, text-first, no emoji — the app's own design
tokens.

Sections, in order of what Shashwat actually asks:

1. **Verdict strip** — latest run: pass/fail per layer, wall time, sha, dirty flag.
2. **Feature matrix** — the central artifact: features × layers grid, each cell
   pass / fail / missing / exempt; missing cells are the to-do list.
3. **Failures** — grouped by feature, each linking to trace/diff/output.
4. **Flakiness board** — tests whose outcome varied across recent runs at the
   same sha (from history.jsonl); the top of this list is the maintenance queue.
5. **Trends** — duration p50/p95 per layer, coverage %, test count, slowest 20,
   across runs.
6. **Coverage** — per-feature and per-directory, with the ratchet line drawn.

The dashboard reads only `history.jsonl` + the run's JSON — no live process,
nothing to deploy, consistent with the no-server constitution.

## 7. Failure classes as executable checks

| Class | Executable form | Layer |
|---|---|---|
| A — mirror as truth | Grep-gate: every read of a denormalized field (registry-listed) is display-only or allowlisted with a reason; integration tests desync each mirror and assert actions still resolve against the authoritative doc | L0 + L3 |
| B — latched errors | Per-view: induce watch failure, assert a recovery affordance exists and works; grep-gate: every `onGiveUp`/catch that sets UI state pairs with a reset path | L4 + L0 |
| C — counter races | Grep-gate for `+ 1`/read-modify-write near counters (the REVIEW.md sweep, automated with allowlist); concurrency tests on every counter | L0 + L3 |
| D — stale bundles | Consecutive-build sw.js byte diff; precache↔dist match; the update journey (L5 #15) | L7 + L5 |
| E — one-shot on live page | Grep-gate: views mixing `watch*` and one-shot fetches must be on the documented-digest allowlist | L0 |
| F — duplicated predicates | Grep-gate: role/ownership expressions outside the named helpers | L0 |
| G — lying empty states | Registry `emptyStates` enumeration + one component test per reason asserting the copy | L4 |

New rule for REVIEW.md once T1 lands: **adding a failure class means adding its
gate in the same change.** The manual sweep remains for what greps can't see;
the gates keep the known classes from regressing silently.

A cousin of Class D that greps also can't see: **the emulator ignores
`firestore.indexes.json`**, so a missing composite index surfaces only in
production. T1 adds a query manifest (`test/registry/queries.ts` — every
composite query shape in `src/data`) checked against `firestore.indexes.json`
in the fast gate, plus an L0 sweep that flags `query(` callsites absent from
the manifest. The 400-on-single-field-index gotcha gets a validity check in the
same gate.

## 8. CI — fast gate and full suite

```
push/PR ──► FAST GATE (blocks deploy, target < 6 min)
            lint · tsc · L0 static gates · L1 unit · L2 rules · build · L7 artifact smoke
              └─ pass ──► deploy (unchanged path, Pages)
push to main ──► FULL SUITE (parallel job, non-blocking, publishes reports)
                 L3 integration · L4 component · L5 e2e · L6 visual/a11y/perf
                 · coverage merge · report generation · artifact upload
nightly (cron) ──► FULL SUITE           # trend data at a steady cadence
manual ──► workflow_dispatch · locally: npm run test:full
```

- The fast gate is today's CI plus L0/L7 — minutes of added cost, not the
  multiple that the full suite would impose. Deploy latency is preserved; this
  is the resolution of the deployment-performance concern.
- A full-suite failure on main does not un-deploy, it **reports** — red
  dashboard, red badge in the run summary. Shashwat decides whether it blocks
  the next push. (Revisit after a month of data: if the full suite is fast and
  stable enough, promote L3 into the gate.)
- Local `npm run test:full` produces byte-identical report structure to CI —
  reports are local-first per the current constraint.

## 9. Implementation milestones (Opus builds; each has the standard DoD plus its own gate)

| # | Milestone | Contents | Done when |
|---|---|---|---|
| T0 | **Spine & harness** | Registry + completeness gates; guard change (§3) + delta-verification script; vitest projects restructure (static/unit/rules/integration/component); CTRF wiring; `reports/` generator v0 (INDEX, run summary, history.jsonl); scenario library extracted from seed script; ADR-026 (one artifact) + ADR-027 (report store) recorded | Registry gates fail on an unclaimed file; a run produces a navigable report; seed script consumes scenarios |
| T1 | **Gates** | L0 class gates A/B/C/E/F; query→index manifest + validity check; bundle budgets; L7 artifact smoke incl. consecutive-build sw diff | Every gate demonstrated to fail on a seeded violation, then green |
| T2 | **Backend depth (L3)** | Integration suite: flows, partial failures, concurrency, poll engine on fixtures, all `watch*` shapes, resilientWatch; L2 gap-fill (announcements/summary/audit edges); coverage wiring + ratchet 1 (`src/data` ≥ 80%) | The `leaveGroup` partial-failure matrix and every Class C race are red-green tested |
| T3 | **UI depth (L4)** | Browser-mode setup; watch-boundary mock harness; ui primitives; Home blocks through gate states; views tier 1 then tier 2; Class B/G enumeration per registry; ratchet 2 (views ≥ 70%) | Every view has loading/empty(each reason)/error/populated specs; feature matrix UI column fills |
| T4 | **Journeys (L5)** | Playwright + emulator-mode build serving; GitHub route fixtures; journeys 1–14; two-context multi-user harness | All journeys green and registry-mapped; traces land in reports |
| T5 | **Pixels & wallet (L6 + L5 #15)** | Visual baselines in the Playwright container; axe per route; keyboard walks; Lighthouse budget; build-pair update journey | Baselines reproducible in-container; a11y violations = 0 or dated-allowlisted |
| T6 | **Dashboard & analysis** | dashboard.html; flakiness board; trends; per-feature coverage join; failure→artifact linking | Dashboard answers §6's six sections from a cold `npm run test:full` |
| T7 | **CI staging & binding docs** | Workflow split per §8; nightly cron; artifact upload; PLAN §10 DoD amended (registry updated · relevant layers green · report regenerated); REVIEW.md gains the gate rule; this doc updated from plan → system record | Fast gate < 6 min on CI; full suite < 30 min local; docs merged |

Order rationale: the registry first because everything hangs off it; gates
early because they catch real bugs immediately at near-zero cost; backend
before UI because it extends the suite that already works; journeys before
pixels because visual tests need the E2E harness stable.

## 9a. T0 as built (2026-09-06)

T0 is complete. What differs from the plan above, and why:

- **The layer gate is a no-regression baseline, not a completeness check.**
  Enforcing "every declared layer has tests" on day one would have required
  ~16 dishonest exemptions, since T2–T5 have not run. Instead
  `KNOWN_GAPS` in the registry lists every declared-but-unbuilt pair in the
  enforced layers; a *new* gap fails the build, and a gap that becomes covered
  also fails (so the list cannot go stale). Shrinking it to empty is what T1/T2
  are for. All three teeth were verified by seeding a violation: an unclaimed
  `src/` file, an unclaimed rules match block and an untagged top-level
  `describe` each fail the suite.
- **Tags are required on top-level describes only.** Nested describes inherit
  their parent's feature; requiring a tag on all 66 existing describes would
  have been noise for no signal.
- **CTRF is produced by our own converter**, not a reporter package: runners
  write their native JSON to `reports/raw/`, and `scripts/report.mjs` converts
  and joins it against the registry. The feature tag has to be lifted out of
  describe titles, which no off-the-shelf reporter can do, so a dependency would
  have bought nothing. No new devDependency was added in T0.
- **The scenario library is TypeScript consumed directly by the `.mjs` seed.**
  Node 22 strips types, so `scripts/seed-emulator.mjs` imports
  `test/fixtures/scenarios.ts` — one source of truth, no build step, no second
  copy to drift. It needs `allowImportingTsExtensions` and explicit `.ts`
  specifiers in shared modules, because Node resolves ESM strictly.
- **`SIZE=minimal|demo|windowed`** picks the seed size; `windowed` (60 members,
  40 repos) exercises every M16 bound and the write batching.
- **The emulator guard finding** is recorded in ADR-026: `DEV && VITE_EMULATORS`
  meant no built bundle could reach the emulators, so L5 was impossible as
  specified. Fixed, and asserted by both a source-shape check in the fast gate
  and `scripts/verify-build-delta.mjs` against the built bundles.

Baseline recorded by the first run: **339 tests green** (22 static, 115 unit,
202 rules) across 3 layers; **45 passing feature/layer cells, 16 planned,
156 missing** — the last number being the T2–T5 workload, now visible per
feature in `reports/latest/summary.md#matrix` instead of being a guess.

## 9b. T1 as built (2026-09-06)

T1 is complete: 54 static gates, every one demonstrated to fail on a seeded
violation and then restored. What differs from the plan, and what it found:

**Each class is a manifest, not a bare grep.** A grep cannot tell a display read
from a decision, so it does not pretend to. `test/registry/invariants.ts` lists
every instance of each pattern with a written justification; the gate fails on
an instance that is not listed *and* on a listed instance that has disappeared,
so the manifests cannot rot. Entries key on the exact source line, so moving
code is free but editing it forces the reasoning to be re-read.

- **Class A** narrowed to the four *state* mirrors (`groupIds`,
  `githubOwnerLogin`, `ownerLeft`, `adoptedFromLogin`) — 15 justified decisions.
  Count mirrors are not grepped at call sites at all; ADR-021 makes them
  display-only and the real guarantee is structural, so the gate asserts instead
  that **firestore.rules never reads a stored count** (`resource.data.claimCount`
  and friends), which is stronger than auditing every `{memberCount}` in JSX.
- **Class B** — 10 give-up paths, each naming what clears the state it sets.
  Whether the recovery *works* is T3.
- **Class C** — one documented exception (`unclaimAsk`, already noted inline and
  in REVIEW.md). Everything else moves by `increment()`, and the gate also
  asserts `increment()` is still being used, so the check cannot go quiet for
  the wrong reason.
- **Class E** — 4 one-shot reads beside live listeners, each recorded as a
  deliberate digest with the reason.
- **Class F** — 6 ownership/permission spellings, of which **2 are real
  violations kept as backlog**: `InterestButton` and `Repos` each re-implement an
  ownership test that `ownsRepo`/`canManageRepo` already own. Separately, 13
  copies of `role === 'admin'` are reported, not failed — there is no canonical
  helper for them to duplicate yet, which is how Class F starts.
- **Class G** static half: every view rendering an `EmptyState` must belong to a
  feature that enumerates its reasons. This forced three features to declare
  theirs; **42 enumerated empty states** now await T3 component tests.

**The query→index manifest is the highest-value gate.** The emulator ignores
`firestore.indexes.json`, so a missing composite index is invisible to every
other layer and fails only in production. `test/registry/queries.ts` lists all
37 `query()` constructions with their filter shapes; the gate matches each
against the declared indexes in both directions, and separately refuses
single-field index declarations (which 400 the entire deploy) and duplicates.
Building it found **8 query sites** that a first pass had missed, and two
findings recorded below.

**L7 artifact smoke** (`scripts/verify-artifact.mjs`) asserts BUILD_ID is
stamped *and equals the entry chunk hash*, cache names are per-build, the shell
fetch is `no-store`, the CSP ships closed, no emulator marker survives, and the
gzip budget holds. Its centrepiece is the consecutive-build check: build, change
a shipped string, rebuild, and require sw.js to differ. Freezing the stamp
reproduces the M7→M14 state and the script reports two failures, which is the
outage it exists to prevent.

Two things this milestone got wrong first, both worth keeping in mind:

- The first consecutive-build probe appended a *comment*, which minification
  strips — so the build was legitimately byte-identical and the check failed for
  the wrong reason. It now edits a shipped string literal.
- The first draft asserted against whatever was already in `dist/` instead of
  building fresh, and duly reported a stale artifact as passing. It always
  builds now. A script written to catch "which bundle is this?" had that bug.

Baseline after T1: **371 green** (54 static, 115 unit, 202 rules), 47 passing
matrix cells, 14 planned, 156 missing. Bundle at **218.2 KB gzipped against the
220 KB budget — 1.8 KB of headroom**.

### Findings for the owner (neither is fixed here)

1. **A production-only query bug, unconfirmed.** `fetchMyOpenItems`
   (src/data/asks.ts) runs `claimerUids array-contains uid AND state in
   [open, claimed]` on `asks`. No declared index covers that shape — the only
   `claimerUids` index is `claimerUids + createdAt`. It is reached from
   PersonalHome for any member who has claimed an ask, so it would surface there
   as a failed-precondition. The emulator cannot settle this and production is
   paused, so the manifest marks it `unverified` and the gate reports it loudly
   rather than guessing. Confirm against the real project before adding an index.
2. **A fossil index.** `collabRequests: requesterUid, state, createdAt` is used
   by no query in the manifest — probably left behind when a query changed shape.
   Reported, not failed.

## 9c. T2–T7 as built (2026-09-07)

All eight milestones are shipped. **438 tests green** across six layers —
54 static, 115 unit, 202 rules, 47 integration, 29 component, 20 E2E — in
**65 seconds** for the whole suite from a clean tree. 68 passing feature/layer
cells; 126 planned in `KNOWN_GAPS`; 25 still unclaimed.

**T2 — integration (L3).** `test/integration/harness.ts` drives the app's own
`firebase.ts` against the emulators, signed in as a *specific* uid via the
emulator's acceptance of unsigned custom tokens, with the real rules applied.
The distinction that made it work: the **action** under test runs through the
authenticated path, while arrangement and assertions read privileged
(`inspect*`). Asserting through the actor's own permissions was testing the
read rules instead of the flow — and `leaveGroup` ends by deleting the very
membership that authorized reading the circle. Covers the partial-failure
matrix, Class C races (five concurrent claims, twenty interleaved increments,
the documented unclaim race), the poll engine end-to-end on fixtures (ETag 304,
idempotent re-ingest, claim election, rate-limit stop, the 20-repo bite), and
every live query's shape.

**T3 — component (L4).** Vitest browser mode in real Chromium with the app's
real stylesheets, queried by role and text throughout. **`vi.mock` does not
intercept anything under this browser-mode setup** — verified down to a leaf
module, and installing `msw` did not change it. Rather than fake a seam, the
layer covers what the app's own signal stores can reach: routing, the Class D
reload bar, the denied-circle recovery and its retry, the pause screen. Every
state is set the way the data layer sets it, so nothing passes because a mock
was wrong. Per-feature empty states moved to E2E, where the emulator supplies
them for real.

**T4 — journeys (L5).** `scripts/e2e-serve.mjs` builds the emulator-mode bundle,
starts the emulators, seeds the circle and serves `dist-emulator/` under the
real base path with no SPA rewrite — Pages-shaped. Playwright runs against
**that build**, not a dev server. `api.github.com` is intercepted with the same
fixture set the integration layer uses. Multi-user journeys open a second
browser context, which retires the two-Chrome-profiles ritual: separate
storage, separate auth, separate service worker, one command.

**T5 — a11y, visual, budgets.** `@axe-core/playwright` audits five routes
against WCAG 2.2 A/AA, plus tab-order and focus-visibility walks. Visual specs
exist with the clock pinned, animations disabled and volatile regions masked,
but **no baselines are committed**: cross-OS font rasterisation makes a locally
generated baseline wrong for everyone else, so `scripts/visual-baselines.sh`
generates them inside the Playwright container and `visual` is the one layer
left unenforced until that runs.

**T6 — dashboard.** `reports/latest/dashboard.html`, self-contained, opens from
`file://`: verdict strip, layer table, the full feature×layer matrix, failures
with traces, a flakiness board computed from `history.jsonl`, trends and the
slowest twenty.

**T7 — CI split.** `deploy.yml` is the fast gate that blocks the deploy (lint,
types, static, unit, rules, build, artifact smoke). `full.yml` runs integration,
component, E2E and a11y beside it plus nightly at 02:30 UTC, uploads the report
tree and writes the summary into the run page. A failure there reports; it does
not un-deploy.

### What these milestones got wrong first

- The component tests emitted into a watch stub before Preact had run its
  effects. The stub now replays its last value on attach, which is what
  `onSnapshot` does anyway — the fix removed a race rather than hiding it.
- The E2E invalid-invite test judged the screen before the invite read
  resolved and called a loading state a blank page. It passed only because
  earlier tests had already warmed the database; on a clean run it failed
  honestly. It now waits for the copy, and asserts the real words.
- `resilientWatch` retries **only** `permission-denied` — an outage is not a
  denial. The first test asserted retries on `unavailable` and failed; the
  code was right and the expectation was wrong.
- The scanner matched only `.test.ts`, so every `.spec.ts` journey tag was
  invisible and 7 features looked uncovered when they were not.

### Open findings

1. **The suspected missing index** (from T1) is still unconfirmed and still
   reported loudly on every run.
2. **Colour contrast fails WCAG AA** on `.viz__meta` and `.chip` — the dark
   theme's faint text is under 4.5:1. Dated-allowlisted in
   `test/e2e/a11y.spec.ts` because moving `--text-faint` is a design-token
   decision (ADR-012, UI.md §1), not one a test run should make.
3. **The bundle has 1.8 KB of headroom** against its 220 KB budget.
4. **Visual baselines** need one container run before that layer means anything.

## 9d. Coverage and the performance budget (2026-09-07)

The two gaps left open after T7, closed as far as each honestly can be.

### Coverage — done

Collected per layer into its own istanbul report and merged by
`scripts/coverage.mjs`, because the layers cannot run in one pass: unit is node,
integration needs the emulators, component needs a browser. The merge is the
point — "is this line covered *anywhere*" is the only question worth asking, and
a data module exercised by an integration test is covered whether or not a unit
test touches it. Merging lifts the number from 10.8% (unit alone) to **22.35%**.

The floor is a **ratchet**, recorded in `test/registry/coverage-floor.json` and
enforced by `npm run coverage:check`: coverage may not drop, and when it rises
the floor is raised with `--update-floor`. A fixed 90% target would have failed
from the first run and been switched off within a week; a floor that only moves
up actually survives. Verified by raising it artificially — the check fails and
names the metric.

Coverage now appears in three places: the run summary (totals plus the twelve
least-covered features), every feature page (`#coverage`), and the dashboard.
That per-feature table is the useful artifact — `poll-engine` is at 73.6% while
`invites`, `group-delete` and `circle-wall` are at 0%, which is a far better
backlog than a single global percentage.

### Lighthouse — wired, and not working anywhere

The config, the staging script and the CI job are all in place and correct, and
the job is in `full.yml` as **non-blocking**. It does not run on the author's
machine, and it does not run on GitHub's runners either: Lighthouse aborts every
attempt with `NO_FCP` — "the page did not paint any content".

Ruled out, with evidence, so nobody repeats the search:

| Hypothesis | Result |
|---|---|
| Base path — assets 404 when `dist/` is served at the root | Real bug, fixed by staging under `/repocircle/`; not the cause |
| LHCI's static server sets no `text/javascript` | Real bug, fixed by `scripts/serve-static.mjs`; not the cause |
| Entrance animation holds content at `opacity: 0` | Real bug, fixed (see below); not the cause |
| Screen emulation / CPU throttling | Disabled; unchanged |
| `Content-Security-Policy` blocking instrumentation | Stripped from a staged copy; unchanged |
| Chrome binary | Playwright's chromium fails identically |
| `public/recover.js` navigating away after 3s | Removed from a staged copy; unchanged |
| The machine | A clean Ubuntu CI runner fails identically |

Meanwhile a trivial static page **on the same server at the same subpath**
audits fine (FCP 0.6s), and the real bundle renders correctly and quickly in
headless Chromium when driven by Playwright — measured, with zero console
errors.

**A clean Ubuntu runner fails identically** (full suite run 1, 2026-09-07), so
the "it may work elsewhere" hypothesis is gone as well. This is the app under
Lighthouse, and the cause is unknown. The next thing worth trying is
Lighthouse's own trace artifacts (`--save-assets`), which were never captured.

The **enforced** weight budget is unaffected: it is the gzip check in
`scripts/verify-artifact.mjs`, it runs in the fast gate, and it is the number
ARCHITECTURE §7 actually commits to (218.2 KB against 220 KB).

### One app fix came out of this

`base.css`'s reduced-motion block shortened animations but did not neutralise
their delay or `fill-mode: both`, so content stayed at the keyframe's
`opacity: 0` until the animation began — a reduced-motion reader was still
waiting through a 120ms stagger at zero opacity, and a browser that never
composited the animation would show nothing at all. The block now zeroes the
delay and drops the fill. Measured before and after: panel opacity at 50ms went
from 0 to 1 under reduced motion.

## 9e. Visual baselines (2026-09-07)

Generated in the Playwright container and committed; `visual` is now an enforced
layer. Three baselines: sign-in at desktop and mobile, and not-found. Seventeen
screens remain, listed in `KNOWN_GAPS`.

Two things had to be fixed before the baselines were worth anything, and both
are the reason the generator prints "review the images before committing them".

**The CSP blocks style injection.** `page.addStyleTag` — the obvious way to
disable animations before a shot — is refused by `style-src 'self'`, and
loosening the policy would mean the screenshots came from an artifact nobody
receives. The specs now call `emulateMedia({ reducedMotion: 'reduce' })`, which
triggers the app's *own* reduced-motion block. That block only reaches the
settled state at all because of the fix in §9d, so the two findings are linked:
the visual layer depends on reduced motion being correct.

**A mask can destroy the thing it is protecting.** `.halo` was masked as
"an animated gradient". It is neither animated nor small: it is
`position: fixed; inset: 0`, so Playwright painted the entire viewport with its
mask colour and wrote a solid magenta reference — 4.7 KB where the real page is
284 KB. That baseline would have passed forever while proving nothing. It was
caught by looking at the images, which is the only thing that catches it.

Also removed: a shot named "the pause screen is unmistakable" that captured the
sign-in screen. The pause is deliberately skipped for emulator builds — that is
what lets anyone develop while the app is paused — so this harness cannot reach
it, and a maintenance-sounding name over a sign-in screenshot is worse than no
coverage. The pause screen's content is asserted in the component layer instead.

Verified to actually catch a regression: a one-word copy change in `NotFound`
produced 709 differing pixels on that screen and left the other two green.

## 9f. The coverage push (2026-09-07)

Merged statement coverage went from **22.09% to 57.62%**; the suite from 467 to
**586 tests**. Layers: 54 static · 144 unit · 202 rules · 110 integration ·
29 component · 47 E2E. 106 passing feature/layer cells, 112 still planned.

### The structural change that mattered most

**E2E was contributing nothing.** Playwright drives a built bundle, so every
line the journeys executed counted as uncovered — the number said the views were
untested while a run was stepping straight through them. Instrumenting the
emulator build with `vite-plugin-istanbul` and pulling `window.__coverage__` out
of each page lifted the figure from 22.09% to 37.27% on its own, without a
single new test. That is coverage that always existed and was never counted.

The instrumentation is emulator-only and `scripts/verify-build-delta.mjs` now
asserts production carries neither the counters nor a source map. Source maps
are excluded from the chunk-set comparison, because the instrumented build
legitimately emits them and the check is about shipped code.

### Where the rest came from

- **Integration**, 47 → 110 tests: comments, ideas, announcements, invites,
  circle creation and deletion, the circle wall, watches, the away-inbox,
  availability and skills, and full lifecycles for repos, asks, sessions, polls
  and collaboration requests.
- **Unit**, 115 → 144: the formatting helpers, the diagnostics buffer, and the
  token generator — including a distribution test, because rejection sampling
  is the whole reason `randomToken` is not `b % 36`.
- **E2E**, 20 → 47: every reachable screen against seeded data, plus the write
  paths — RSVP, voting, claiming, picking skills, widening Home, sharing a repo,
  founding a circle and creating an invite.

### What this turned up

**`deleteGroupEverything` orphaned four collections — since fixed.** It swept
repos, asks, invites, collabRequests, integrations, auditLog and meta. It
predated M15 (ideas), M17 (announcements) and M19 (sessions, polls), and nobody
extended it when those shipped, so deleting a circle left them behind:
unreachable, but stored and billable. It also never swept the comments and
interests hanging under repos, asks and ideas, the RSVPs under sessions, or the
votes under polls — Firestore does not cascade, so those outlive their parents.

The fix is in §9g: the sweep now works from a declared `CIRCLE_SHAPE`, and a
static gate checks that list against the match blocks in `firestore.rules`.

**Two fixture gaps that looked like app bugs.** The scenario seeded no
`users/{uid}` documents, so `forgetGroup` updated a missing document and
returned permission-denied — which reads exactly like a rules failure. And
`setPinnedRepo` to the value already pinned changes no keys, so the admin-key
guard correctly does not fire; the test was wrong, not the rule.

**A CSP gap in the emulator build.** `frame-src` did not allow the Auth
emulator's relay iframe. Production is unaffected (it frames
`*.firebaseapp.com`), and the app's own violation listener is what surfaced it.

### Two habits worth keeping

Both cost real time here. First: **the app writes typographic apostrophes**, and
a Playwright regex containing `'` silently matches nothing — which presents as a
*skipped* test rather than a failing one. That is how a suite stops testing
things without anyone noticing. Second: **an accessible name is computed, not
`textContent`**; `{ exact: true }` against a name read off the DOM matched
nothing, and `locator('button', { hasText })` was the reliable form.

### Where it stops, and why

The remaining uncovered code is mostly deep interaction branches inside the
largest views — `Repos.tsx`, `GroupSettings.tsx`, `Members.tsx`. Reaching them
means many fine-grained journeys, each asserting less than the last, and the
component layer cannot help because `vi.mock` does not work under this browser
mode (§9c). 57.62% with `src/data`, `src/util` and `src/poll` well covered is a
better place to stop than a higher number built out of assertions on markup.

One test was written and then deleted rather than kept: the delete-circle
confirmation could not be located deterministically, and a test that passes for
reasons it cannot state is worse than none. That path is covered at the
integration layer instead.

## 9g. Fixing the delete sweep (2026-09-07)

`deleteGroupEverything` now removes everything a circle contains, including the
subcollections that Firestore will not cascade into: comments and interests
under repos, asks and ideas, RSVPs under sessions, votes under polls, and the
four top-level collections it had never heard of.

**The fix is the gate, not the list.** Adding four names would have left the
next milestone free to make the same mistake a fourth time — nothing connected
the new collection to this file, and a comment asking the next person to
remember is not a mechanism. So the sweep is now driven by an exported
`CIRCLE_SHAPE`, and `test/static/shape.test.ts` derives the circle's real shape
from `firestore.rules` and compares the two.

That works because the rules already describe the shape exactly: a collection
that has no match block cannot be written at all, so every collection that can
hold data must appear there. The check runs both ways — a collection in the
rules that the sweep does not know about fails the build, and an entry in
`CIRCLE_SHAPE` with no match block fails too, so the list cannot quietly go
stale either.

Verified by seeding both failures. Deleting the four names back out reproduces
the original bug and the gate names all four; adding a `reactions`
subcollection to the rules fails with `sessions/{id}/reactions`.

`members` stays outside `CIRCLE_SHAPE` and is swept last, because the caller's
own membership has to outlive every rule check that needs it — that ordering was
already right and is covered by the rules suite.

The integration test that documented the gap now asserts the opposite: it seeds
a vote, an idea interest and a repo comment, deletes the circle, and requires
every path to be empty. It was written to go red on the fix, which is what made
this change start from a failing test rather than from a hopeful one.

## 10. Dependencies and scripts

New devDependencies (all dev-side; the app's 3 runtime deps are untouched):
`@vitest/browser`, `playwright`/`@playwright/test`, `@testing-library/preact`,
`@axe-core/playwright`, `@vitest/coverage-istanbul`, CTRF reporters for vitest
and Playwright, `@lhci/cli` (T5). No new runtime dependency, no server.

| Script | Runs |
|---|---|
| `test` | L0 + L1 (node, no emulator — the quick loop) |
| `test:rules` | L2 under emulators:exec (unchanged) |
| `test:integration` | L3 under emulators:exec (one emulator boot with L2 when run together) |
| `test:component` | L4, headless Chromium |
| `test:e2e` | builds emulator-mode bundle, boots emulators + static server, Playwright |
| `test:visual` / `test:a11y` | L6 in the Playwright container |
| `test:artifact` | production build + L7 |
| `test:full` | everything above + coverage merge + `report` |
| `report` | regenerate reports/ + dashboard from raw outputs |
| `reports:open` | open the latest dashboard |

## 11. Risks and accepted trade-offs

- **Wall time.** Full suite target < 30 min locally; enforced by parallel
  vitest projects, one emulator boot shared by L2+L3, and journey sharding if
  needed. The fast gate is the protected budget; the full suite is allowed to
  be thorough.
- **Visual flake.** Contained by container-only baselines, pinned clock, seeded
  scenario, masks. If a screen still flakes, it gets masked tighter or demoted
  to structural assertions — flaky visual tests are worse than none.
- **Browser-mode maturity.** Vitest 4 browser mode is stable and ships in CI at
  scale in 2026, and Preact runs through the same @preact/preset-vite pipeline.
  Fallback if a wall is hit: the same specs run under Playwright component
  testing — the testing-library query layer is portable either way.
- **Mocked watch boundary drift.** The mock harness types are imported from the
  real data modules, so a signature change breaks compilation; L3 tests the
  real implementations; L5 tests the wiring. Drift has three tripwires.
- **The emulator-mode build delta.** Accepted, minimized (one define + CSP
  loopback), and verified by script + L7 on every run. This is the honest cost
  of E2E-testing a static SPA whose environment is compile-time; the
  alternative (runtime config) would put emulator code in production bundles.
- **Dependency weight.** All dev-side. The $0 / no-server / no-runtime-deps
  constitution is untouched.

## 12. Starter feature inventory (completed and reviewed at T0)

Slugs, grouped; PRD/ADR cross-refs in parentheses.

- **Identity & entry**: `auth-signin` (F-01) · `onboarding` (F-12, M7) ·
  `profile-recovery` · `personal-home` (ADR-015)
- **Tenancy**: `groups-create` (F-02) · `invites` (F-03, ADR-010) ·
  `join-flow` (M13, M17) · `membership-roles` (ADR-014) · `leave-rejoin` (M13)
  · `group-delete` · `settings-admin`
- **Repos**: `repo-registry` (F-04) · `repo-import` · `repo-status` (F-10) ·
  `repo-needs` (M9) · `repo-list-view` (M20) · `adoption-handover` (M12/M13) ·
  `repo-sync` · `cross-circle` (M20, ADR-025)
- **Activity**: `poll-engine` (ADR-004) · `active-this-week` (F-05) ·
  `sparklines` · `activity-events`
- **Help loop**: `asks` (F-06) · `stuck-flags` (F-07) · `claims` (F-08) ·
  `longest-waiting` (M18) · `resolution-credit` (ADR-019)
- **Collaboration**: `collab-requests` (F-09) · `ideas` (M15, ADR-020) ·
  `germination` · `comments` (M10) · `mentions` · `interests`
- **People**: `profiles` (M11, ADR-018) · `skills-matcher` (M11) ·
  `availability` (ADR-014) · `journey` (M12)
- **Story & signal**: `building-together` (M12) · `arrivals` · `away-inbox`
  (M18) · `watches` (M18) · `notification-levels` (M18) · `discord-webhook`
  (F-… I-02, ADR-007)
- **Gatherings**: `sessions` (M19, ADR-023) · `rsvp` · `ics-export` ·
  `polls-voting` (M19, ADR-024)
- **Circle surface**: `announcements` (M17) · `circle-wall` (M17) ·
  `home-gating` (M16.5, ADR-022) · `summary-doc` (M16, ADR-021) ·
  `empty-states` (F-13, Class G)
- **Platform**: `pwa-install` · `app-update` (Class D) · `maintenance-mode` ·
  `diag` · `csp` · `your-activity` (F-11)

Infrastructure bucket (claimed, not feature-tagged): firebase init, router,
signals stores, ui primitives, styles, logging.
