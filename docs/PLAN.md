# RepoCircle — Master Build Plan

The execution plan for Phase 1 (PRD §13 "Core loop") on the serverless architecture,
plus shaped outlines for Phases 2–3. Written so any future dev session can pick up a
milestone cold: each has an objective, ordered tasks with checkboxes, and acceptance
criteria that double as the test script.

**How to use this document**
- Work milestones in order — the sequence front-loads the two riskiest systems
  (ingestion, collaborator flow) per PRD §13, after the security foundation exists.
- Tick checkboxes in commits as tasks land; a milestone closes only when its
  acceptance criteria pass **on the deployed Pages site**, not just localhost.
- Every milestone ends with the SECURITY §11 checklist.
- Scope guard: if a task isn't needed by a P0 feature (PRD §6 tables), it doesn't
  belong in Phase 1. Add it to §6/§7 here instead.

**Phase-1 feature set** (PRD): F-01…F-13, R-01, A-01, I-01*(as polling)*,
I-02*(as outbound webhook)* — plus M-03 availability (pulled forward: trivial, high
warmth) and A-07 custom tags (needed by ask composer anyway).

---

## M0 · Foundations & walking skeleton — *"it deploys, it signs in"* (~2–3 days)

> **Progress note (2026-09-05):** all M0 engineering landed in one session — scaffold,
> design system, auth+vault, rules (36 emulator tests green), CI. Remaining before M0
> can close: the owner's one-time console setup (SETUP §A/§B: OAuth App + Firebase
> project + config paste + rules deploy), then live sign-in verification and the
> device spike on real hardware. Bundle: 189 KB gz JS (budget 220).

Objective: the full pipeline works end-to-end with near-zero product code: repo →
CI → Pages → Firebase auth → Firestore write behind rules. De-risks platform quirks
(iOS PWA sign-in!) before features exist.

- [x] Vite + Preact + TS scaffold; strict tsconfig; ESLint (incl. `innerHTML` ban) + Prettier
- [x] Design tokens (UI.md §1) as CSS custom properties; Inter self-hosted; base
      components: Card, Pill, Chip, Sheet, Skeleton, EmptyState, Toast
- [x] Hash router with the route map from ARCHITECTURE §3; app shell (top bar, empty Home)
- [x] `firebase.ts` init + `firebase-config.ts` (from SETUP B5); Firestore offline
      persistence on
- [x] Auth: sign-in/out with GitHub provider (`read:user user:email`); session store;
      `users/{uid}` upsert; token vault (SECURITY §5) with unit tests
- [x] Deploy `firestore.rules` v1 (SECURITY §3) + `firestore.indexes.json`; emulator
      wired; first 10 rules tests green (users/*, default-deny)
- [x] GitHub Actions: lint → typecheck → test → build → deploy-pages (SHA-pinned,
      minimal permissions); replaces the placeholder page; PWA manifest + icons +
      installability (SW ships in M7)
- [x] CSP meta tag active (SECURITY §6) — verified zero console violations
- [ ] **Device spike**: sign in + write a doc on Android Chrome, desktop Chrome/Firefox,
      iOS Safari **and iOS installed-PWA** — document popup vs redirect findings in
      DECISIONS (this is risk R1, retired here or replanned *now*)

Accept: visiting the live Pages URL on phone and laptop → sign in with GitHub →
your avatar renders → a `users/{uid}` doc exists → sign-out cleans up → an
unauthenticated Firestore probe (curl) is denied by rules → Lighthouse PWA
installable ≥ baseline, perf ≥ 85 mobile on the shell.

## M1 · Groups, invites, membership — *the tenancy core* (~3–4 days)

> **Progress note (2026-09-05):** M1 engineering landed same-day: data layer
> (groups/invites/members/audit/anonymize), Onboard + Join + GroupShell/Home/
> Members/Settings views, switcher, last-admin guard. Rules refined: admins may
> `list` invites; invites carry groupName/createdByLogin; authors may update their
> own display fields (anonymize path) — 37 emulator tests green. Acceptance still
> open: two-account join/role/removal pass on real devices (needs a second GitHub
> account) and the production rules re-paste.

Objective: multi-group tenancy with roles and invite links, fully rules-enforced.
Everything after this builds inside a group.

- [x] Create-group flow (S2): batch create group + founder admin membership
      (`joinedVia: "founder"`); groupIds mirror on user
- [x] Invite links: generate (role member/guest, expiry 24h/7d/30d, label), list,
      revoke (S10 §Invites); join screen resolving `#/join/:gid/:token` (S1 variant);
      role from invite enforced by rules
- [x] Group switcher (top bar) + multi-group membership; last-active group remembered
- [x] Members screen v1 (S9): list, roles, availability status + editor (M-03);
      admin: change role / remove member → auditLog entries
- [x] Leave group (with last-admin client guard); leave-anonymization util
      (DATA-MODEL §5) + unit tests
- [x] Rules tests: full invites/members matrix from SECURITY §10 green
- [x] Empty states for all new lists (F-13)

Accept: on two real devices with two GitHub accounts — create group on A; invite via
link; join on B as member; B sees members list; B cannot revoke invites (UI absent
*and* rules-denied — prove with emulator test); expired link rejected with a humane
error; A removes B; audit log shows both role events to A only.

## M2 · Repo registry & import (~2–3 days)

> **Progress note (2026-09-05):** M2 engineering landed: github/client.ts chokepoint
> (api.github.com-only, injected token provider, ETag cache, rate tracking, GhError
> taxonomy, 401→refresh-once), import picker with dedupe + first-run auto-open,
> add-by-name with preview, repo cards (status chips, language dots — class-based for
> CSP, topics, demo links), owner/registrant/admin-guarded status+remove (rules
> hardened + deployed; 47 rules tests), subcollection sweep on deregister.
> 20 unit tests. Pending: Opus browser-testing pass + two-account acceptance.

Objective: repos in, cards rendering, statuses — the nouns of the product (F-04,
R-01, F-10).

- [x] `github/client.ts`: typed fetch, ETag cache table, rate-limit guard, error
      taxonomy (401 → re-auth prompt, 403-limit → backoff banner, 404 → gone)
- [x] Import picker (S3) post-create/join: `GET /user/repos?type=owner&sort=pushed`,
      preselected, opt-out; batch register
- [x] Manual add (by URL/owner-name search) for repos you contribute to (F-04)
- [x] Repo docs written per DATA-MODEL (id = GitHub numeric id); dedupe on re-register
- [x] Repo cards (S7) grid on `#/g/:gid/repos`: description, language dot, topics,
      status chip inline-editable by owner/admin (F-10), demo link (allowlisted URL)
- [x] Deregister/archive (owner or admin) with confirm sheet + subcollection sweep
- [x] Rules tests: repos matrix (numeric-id enforcement, guest denial, owner delete)

Accept: import 10 of your repos in one flow; second device registers a repo by URL;
paused status hides it from (future) active block queries — verified by query in
console; a guest account sees cards but every mutation control is absent and
rules-denied.

## M3 · Activity ingestion engine — *riskiest system, built early* (~4–5 days)

> **Progress note (2026-09-05, "one go" build):** engineering for M3–M7 landed in a
> single session, plus M8's adversarial rules suite (58 emulator tests total).
> Deviations: activity rollups live in an embedded 21-day `daily` map on the repo doc
> (not the activityDaily subcollection — one read per card instead of 14); checklist
> is a guide, not a module gate (soft version of F-12 unlocks); collab-request label
> is best-effort (GitHub drops labels from non-push users). Remaining before launch:
> Opus browser-test pass, TTL policy console step, phone device spike, week-of-dogfood
> observation (M8 exit criterion).

Objective: ARCHITECTURE §5 running in production: polling claims, ETag economy,
idempotent events, daily rollups, sparklines, "Active this week" (F-05, F-11 data,
I-01-as-polling).

- [ ] `poll/engine.ts`: staleness scan → transaction claim → fetch → normalize →
      batched idempotent writes (events + activityDaily + repo.stats7d/lastEventAt/etag)
- [ ] Normalizers for the six event types with fixture-driven unit tests
      (recorded real payloads in `test/fixtures/gh-events/`)
- [ ] Visibility-aware 15-min scheduler; manual "refresh now" affordance; per-repo
      failure state (`poll.failing`) surfaced subtly on card + `#/diag`
- [ ] TTL policy live (SETUP B7); `expireAt` stamped on events
- [ ] `Spark` component fed by 14-day activityDaily query
- [ ] Home block "Active this week" (S4-2): non-archived, non-paused, lastEventAt in
      7 days, ordered by recency — **explicitly no ranking** (F-05 wording honored)
- [ ] Repo detail feed (S7): last 30 events with icons/links
- [ ] `#/diag` v1: rate headroom, last cycle log, claims won/lost
- [ ] Rules tests: events append-only, cross-group ingestion denied

Accept: push a commit + open a PR on a registered repo → within 15 min (or on
refresh-now) both appear in the feed, the sparkline ticks up, repo rises in Active
this week; two clients open simultaneously don't double-ingest (event doc count
exact; claims visible in diag); a 304 cycle consumes zero rate limit (diag proves);
kill network mid-cycle → no partial corruption (idempotent re-run heals).

## M4 · Collaborator requests — *second risky system* (F-09, ~3 days)

- [ ] Contextual scope escalation to `public_repo` with a friendly pre-prompt sheet
      ("why we're asking") — only when first needed (F-01)
- [ ] Request flow (S8): note → create labeled GitHub issue (create label if missing,
      race-tolerant) → `collabRequests` doc → toasts + "Your activity" row
- [ ] Owner inbox: accept → `PUT collaborators` + close issue with templated comment;
      decline → polite comment + close; both update doc + audit trail on the issue
- [ ] Honest failure surfaces: scope missing, no push rights, GitHub 4xx/secondary
      rate limits (serialized writes, ≥1.5 s apart)
- [ ] Requester notification of decision (in-app badge; Discord post lands in M6)
- [ ] Rules tests: collabRequests matrix (random member can't decide, etc.)

Accept: full loop between two real accounts on a real public repo: request from B →
issue appears on GitHub with label → A accepts in-app → B receives the *actual
GitHub invitation email*, issue auto-closed with comment → doc state accepted;
decline path equally clean; a third member can see but not decide (UI + rules).

## M5 · Asks & stuck flags — *the core loop* (F-06/07/08, ~3 days)

- [ ] Composer sheet (S5): ask/stuck segmented, validation mirroring rules exactly
      (shared constants in `util/limits.ts` imported by rules tests too)
- [ ] Home "Needs help" block (S4-3) with claim-in-one-tap; stuck styling (warn)
- [ ] Ask detail (S6): claims with notes, unclaim, resolve (author/admin),
      timeline; resolved → Unblocked `count()` on Home header ("7 unblocked this
      week" — group-level, G-05 spirit, no names)
- [ ] "Your activity" block (S4-4) completed: posted/claimed/pending-collabs
- [ ] Custom tag management in settings (A-07); defaults: frontend, backend, ML,
      docs, testing, devops, design
- [ ] Pairing-link field (R-16 subset) rendered as safe external chip
- [ ] Rules tests: full asks/claims matrix incl. state machine abuse
- [ ] All F-13 empty states pass a screenshot review on phone

Accept: on phones: post stuck flag on A (≤ 15 s from Home tap to posted), it tops
B's Home instantly; B claims with note; A sees claim + resolves; counter increments;
tag filter chips work; every rules-denial path shows a humane error, never a silent fail.

## M6 · Discord integration (I-02 outbound, ~1–2 days)

- [ ] Settings card (S10): webhook URL (admin-write), event toggles, "send test post"
- [ ] `notify/discord.ts`: templated embeds (title, author, backlink), 15 s client
      throttle, `allowed_mentions: {parse: []}`, fire-and-forget with silent failure
      + diag logging
- [ ] Posts on: ask/stuck created, claimed, resolved, collab requested/decided
- [ ] Backlinks deep-link into the PWA (`#/g/:gid/ask/:id`)

Accept: real Discord server: each of the six events lands < 2 s as a clean embed;
tapping the link on mobile opens the installed PWA at the right screen; webhook
regeneration invalidates old URL and app recovers with the new one.

## M7 · Onboarding, PWA completion & polish (~3 days)

- [ ] First-run S1/S2/S3 flow assembled (invite-aware); "populated before you
      scroll" — kick polling during import so Home is alive (PRD §7.1)
- [ ] Checklist (F-12): five items wired to real signals; module tabs unlock with
      toasts; dismissible card
- [ ] Service worker: precache shell, network-first index, avatar cache; offline
      banner; queued-write toast ("will sync when online")
- [ ] Install prompts: Android beforeinstallprompt card; iOS add-to-home-screen
      instructional sheet; safe-area polish
- [ ] Accessibility pass: keyboard walk of every flow, focus rings, sheet traps,
      contrast audit vs tokens, `prefers-reduced-motion`
- [ ] Performance: bundle budget check (≤ 220 KB gz JS), code-split Layer-2 routes,
      Lighthouse mobile ≥ 90 perf / ≥ 95 a11y on Home warm
- [ ] Copy pass (UI.md §5 voice) over every string, error, empty state

Accept: fresh user with invite link reaches a *live* Home in < 60 s (PRD §3 "first
success in under a minute" — timed); app installs on Android + iOS and reopens to
Home offline showing cached data; checklist completion unlocks all four tabs;
Lighthouse budgets met on a throttled mid-range profile.

## M8 · Hardening & real-group launch (~2–3 days + a week of observation)

- [ ] Rules refinements from SECURITY §3 "queued" list; full ~40-case matrix green in CI
- [ ] Adversarial pass with a scratch account: forged-payload attempts against every
      collection via raw SDK calls (scripted, kept as `test/adversarial/`)
- [ ] SECURITY §11 release checklist executed and committed as a signed-off doc
- [ ] Quota/limit review: Firestore usage after a week of dogfood vs DATA-MODEL §7
- [ ] App Check decision (SECURITY §8) recorded in DECISIONS
- [ ] Seed the first real group (the friend circle); watch PRD §14 signals for a
      week: asks posted/claimed, weekly return
- [ ] Triage list → Phase 2 cut line

Accept: PRD §13 Phase-1 exit criterion observable — members return without
prompting, asks get posted *and* claimed; zero rules-test regressions; no security
checklist item waived.

**Phase-1 total: ~4 weeks focused solo work** (PRD's 3–5 week estimate holds under
the serverless redesign; ingestion complexity moved client-side rather than removed).

---

## §5b · Post-plan milestones (shipped after M8, driven by product findings)

- **M9 · Idea board (2026-09-06).** Pitch line, needs chip, domain tags + filters,
  README plain-text preview, social image, "I'm interested" one-tap, adoption flag.
- **M10 · Comments (2026-09-06).** One primitive on repos and asks; replies, edit/
  delete, pin, @mentions + #repo-refs as chips; text-node rendering only.
- **M11 · Profiles & matching (2026-09-06, first ADR-017 milestone).** The two
  bets picked from POSITIONING §5: member profiles and helpWith→needs matching.
  - Rules: `validSkills()` — helpWith from the closed needs vocabulary (≤5),
    learning ≤6 items ≤24 chars each, per-index checks (rules can't loop).
  - `src/util/skills.ts`: `ownsRepo`, `languageEvidence` (derived "works in"
    facts from circle repos), `suggestHelpWith` (language→area seed for the edit
    sheet — coverage beats composition; nothing suggests design/feedback).
  - Profile at `#/g/:gid/m/:uid`: identity, availability, helpWith/learning
    chips, derived languages, their circle repos. Self-edit via SkillsSheet
    (pre-filled from own repos when helpWith is empty) + AvailabilitySheet.
  - Home: "Wants what you're good at" block (repo.needs ∈ my helpWith;
    'anything' matches any non-empty offer; own repos excluded; freshest first;
    deduped out of "Wants a hand"), plus a one-time prompt card when helpWith is
    empty and matchable repos exist. Checklist item 6 "Say what you can help with".
  - Profile links wherever a person appears: member rows, comment authors,
    interest faces, repo owner, home avatar strip.
  - 84 rules + 50 unit tests. Guardrails per ADR-018: group-scoped, no counters,
    no comparison — identity, not showcase.

- **M12 · The circle's story (2026-09-06).** Six features, one thesis: the human
  loop, made visible. **Building together** (Home: repos where the owner plus ≥1
  accepted collaborator are both here — the product working, shown as fact).
  **New in the circle** (arrivals ≤7d introduced by their skills). **A repo's
  journey** (started → hands raised → joined → adopted → released; pure builder
  in `src/util/journey.ts`). **Credit lines** (ask resolution optionally names
  who unblocked you; adoption names starter and successor — single facts, never
  aggregated, ADR-019). **Watch a repo** (`users/{uid}/watches`, self-only) and
  **While you were away** on the personal home (replies/mentions/interest across
  circles, `src/data/inbox.ts`, watermarked by `users.lastSeenAt`, throttled).
  Infrastructure: comments/interests denormalize `gid` (+`replyToUid`,
  `repoOwnerUid` — both spoof-checked against parents); collection-group read
  rules require gid-pinned queries (this also FIXED M10's Recent discussion,
  which was silently denied server-side); 4 collection-group composite indexes;
  **closed a real hole: any member could reassign repo `ownerUid`** — ownership
  now moves only via a recorded handover to a member. Adoption transfers in-app
  ownership (collab routing, management rights); GitHub stays untouched.
  102 rules + 66 unit tests.

- **M13 · Complete transactions (2026-09-06).** The three live-test bugs shared a
  root: removal and joining left half-finished state behind.
  - **Rejoin fixed:** Join.tsx now probes the member doc *from the server* and
    redirects only when it exists — the users/{uid}.groupIds mirror (which an
    admin can't clean on removal) no longer turns a fresh invite into a dead
    end. Navigation happens only after joinViaInvite's server read-back.
  - **Sticky denial fixed:** activeGroup re-subscribes once (3s) on a first
    permission-denied before declaring it fact; the denied screen gained a
    Try again pill (retryActiveGroup). Live evidence: a join commit landed 80s
    after listeners had given up.
  - **Orphans adoptable:** removeMember/leaveGroup flag the departing member's
    repos `seekingOwner + ownerLeft` *before* the membership goes; admins can
    hand them over (HandOverSheet now admin-capable) and adoption clears the
    flags; RepoDetail shows "owner left the circle — up for adoption" and gives
    admins an "Open for adoption" pill for historical orphans.
  - **Stale mirrors visible:** PersonalHome renders unreachable circles as a
    dashed card with "Remove from my list" (never auto-forgets — an outage is
    indistinguishable from a removal). Away-inbox "new" dots now also respect a
    per-device, per-account localStorage watermark, closing the 1h markSeen gap.
  - 106 rules + 69 unit tests.

- **M14 · Failure-class review (2026-09-06).** Point-fixing three instances of
  the same bug in one day forced the system: **docs/REVIEW.md** defines failure
  classes A–F; every milestone's DoD now re-runs the sweep. Fixed in the same
  pass, per class: **D** — tabs learn about deploys (SW update check on
  visibility + 30min, reload bar on controllerchange; six same-day deploys had
  left user tabs on old bundles — the real "nothing works" cause); **C** —
  claimCount/interestCount raced via read-modify-write, now increment();
  **A** — watches pruned on the groupIds *mirror*, now only on provable
  not-exists (pruneDecision() pure + tested); **E** — Building together and
  the journey used one-shot collab fetches on live pages, now watches;
  **B** — repos-watch give-ups surface on the staleboard banner instead of a
  silent skeleton; **F** — canWriteRole()/circleOwner() replace seven scattered
  spellings of write-permission and ownership. Founders no longer appear as
  "New in the circle". 76 unit + 106 rules tests.

- **M15 · Ideas (2026-09-06).** The chapter before the code: a member pitches an
  idea (title, one-line pitch, detail, needs from the same closed vocabulary,
  tags), the circle discusses it (same comment primitive), raises hands (same
  interests, routed to the author's away-inbox), and when it becomes real it
  **germinates**: a two-way link idea↔repo writable by the author, an admin, or
  the linked repo's owner (someone else building your idea is the point) with
  the repo's existence validated in rules. The repo gains "from an idea by @x"
  and its journey opens with the idea chapter; the idea doc stays as the record
  (facts never move, ADR-019). Zero new indexes — subcollections reuse the
  comments/interests names, so collection-group reads and the inbox cover ideas
  automatically. Surfaces: FAB → "+ Share" two-row chooser (ask/idea), Home
  "Ideas brewing" + matcher includes matching ideas, Repos strip, Profile
  "Ideas on the table", IdeaDetail route. Lifecycle: open → germinated | parked.
  Class sweep done at build time (increment counters, live watches, canWriteRole
  reuse, per-reason empty states, display-hint credit with the idea doc as
  truth). 117 rules + 79 unit tests.

- **M16 · Read-cost work (planned, next after launch).** The group home mounts
  seven listeners, three reading whole collections; a 200-member circle costs
  ~900 document reads per visit, which exhausts the free tier in ~55 visits and
  would cost real money on Blaze. Paginate repos, add a per-circle summary doc,
  stop re-deriving on every snapshot, and scope the member reads to what is
  shown — target under ~30 reads per visit at any size. Full analysis, platform
  comparison and the hosting/custom-domain plan: **docs/SCALING.md**.

---

## §6 · Phase 2 outline (after retention signal, PRD §13)

Clusters, in likely order — each gets its own mini-plan when scheduled:
1. **Threads** (R-09 → the only in-app discussion): markdown via marked+DOMPurify
   (SECURITY §6 pattern), per-repo/per-ask, SSE-free polling refresh. Then Q&A
   accepted answers (R-10).
2. **Members depth**: M-01 language stats (GraphQL nightly batch — client-side on
   admin visit), M-02 help-with editor already schema'd, M-05 teammate finder,
   M-10 whois search.
3. **Reviews**: V-01 PR queue (poll `/pulls` across repos), V-02 review pings,
   V-04 24-h nudge banner (never individual), V-05 health card.
4. **Repos depth**: R-02 resources, R-03 setup checklist, R-05 weekly plan,
   R-07/R-08 first-contribution + good-first-issue aggregation.
5. **Group surfaces**: G-01 public page (`publicPages/{slug}` mirror, unauth-readable
   by rule, opt-in), G-02/G-03 shipped feeds, G-10 digest (in-app + Discord post),
   G-11 kudos (never aggregated — rules forbid reads that would count).
6. **Events v1**: E-01 calendar + downloadable .ics, E-03 sub-teams.
7. Slack (I-03) via incoming webhook, mirroring M6.
   *(Group deletion — originally slotted here — shipped early on an owner call,
   2026-09-05: admin-only ordered sweep + typed-name ceremony; see
   src/data/deleteGroup.ts and delete-group rules tests.)*
8. Light theme; notification granularity N-01/N-02.

## §7 · Phase 3 outline

The **Worker unlock** (ADR-011): real webhooks (HMAC, dedupe by delivery id —
PRD §9.4 verbatim), Discord slash commands, web push (N-03), live iCal URLs,
digest email, hidden Discord URL. Plus: sprints/demo-day/retro cluster (E-02,
E-05, E-07, E-08), dependency map (G-08), snippet library (G-09), heatmap (G-06),
GitLab (I-04), archive automation (A-05), lead analytics (A-06 — group-level only).

## §8 · Testing strategy (cumulative, CI-gated from M0)

| Layer | Tool | What it proves |
|---|---|---|
| Unit | vitest | normalizers, rollups, limits, anonymizer, token vault, url allowlist |
| Rules | @firebase/rules-unit-testing + emulator | the entire authz matrix (SECURITY §10) |
| Adversarial | scripted raw-SDK attacks (M8) | rules hold outside the app's happy path |
| E2E smoke | Playwright against emulator-backed dev build | sign-in stub → group → ask → claim |
| Device matrix | manual script per milestone | Android Chrome, iOS Safari, iOS PWA, desktop Chrome/Firefox/Safari |
| Perf/a11y | Lighthouse CI budget | UI.md gates |

## §9 · Risk register

| # | Risk | L×I | Mitigation | Retired |
|---|---|---|---|---|
| R1 | iOS PWA GitHub sign-in friction (popup/redirect/3p-cookie changes) | M×H | M0 device spike *first*; fallback: sign in via Safari then install; document | M0 |
| R2 | Firestore free quota blown by listener sprawl | L×M | DATA-MODEL §4 listener budget, detach discipline, console watch in M8 | M8 |
| R3 | GitHub secondary rate limits on issue/invite writes | L×M | ≥ 30 s client throttle on writes, honest error UI | M4 |
| R4 | Events API gaps (missing types, 90-day cap) | M×L | Scope: 7-day window only (PRD-blessed); rollups persist history | M3 |
| R5 | Fabricated activity by malicious member | L×M | Accepted + conspicuous-by-design (SECURITY §4); Worker fixes in P3 | — |
| R6 | Discord webhook leak/spam | M×L | SECURITY §7 containment; regen runbook | — |
| R7 | Rules complexity outgrows maintainability | M×H | Rules tests as spec; shared limits module; refactor gate in M8 | M8 |
| R8 | Solo-maintainer bus factor | —×M | These docs; everything reproducible from repo + two consoles | — |

## §10 · Definition of Done (every feature, every milestone)

- [ ] **docs/REVIEW.md failure-class sweep run against the diff** (added 2026-09-06;
      classes A–G: mirror-as-truth, latched errors, counter races, stale bundles,
      one-shot-on-live-page, duplicated predicates, lying empty states)

Works on phone *and* laptop on the live site · rules deny everything the UI doesn't
offer · empty/loading/error states exist · keyboard reachable · strings match voice ·
no console errors/CSP violations · tests for new logic · docs updated when behavior
diverges from plan (PLAN is a living document — divergence gets a dated note, not
silence).
