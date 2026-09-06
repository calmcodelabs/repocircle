# RepoCircle — Decision Log (ADRs)

Short records of decisions that shape the build. Format: context → decision →
consequences. Newer entries append at the bottom. PRD §15's open questions are
answered in ADR-002/004/007/009/010/012.

---

**ADR-001 · Name: RepoCircle.** Working title "Group Repo Hub" was placeholder.
Chosen for: *repo* (the anchor object) + *circle* (a small trusted group), easy to
say/spell, professional, unclaimed on github.com/calmcodelabs. Repo slug `repocircle`.

**ADR-002 · Hosting model: GitHub Pages + Firebase Spark, no server (owner constraint).**
The owner directed "host like Score Keeper." Overrides PRD §12's Next.js/Postgres/
worker suggestion (PRD grants engineer final say). Consequences: public repo, $0
cost, no secrets in codebase, security concentrates into Firestore rules, and four
PRD features change shape (webhooks→polling, bot→outbound webhook, digest email→P3,
push→P3). Full mapping: ARCHITECTURE §1/§10. Also answers PRD §15-Q1: **OAuth App**
(via Firebase Auth provider), not GitHub App — no webhook infrastructure exists to
benefit from a GitHub App, and Firebase has no GitHub-App provider.

**ADR-003 · Frontend: Vite + Preact + TypeScript, hash routing, Preact signals.**
Alternatives: vanilla TS (Score Keeper style — too little structure for ~10 screens),
React (3× bundle for zero gain), Svelte (fine, but Preact keeps JSX + tiny runtime).
Hash routing because Pages serves a subpath with no rewrite rules; `404.html` tricks
are fragile with PWAs. TypeScript because the data layer + rules contract benefit
most from types shared end-to-end.

**ADR-004 · Activity ingestion: client-side polling engine, not webhooks (Phase 1).**
Webhooks require a public receiver we don't have. PRD §7.4/§9.2 already bless polling
as fallback within a 7-day window. Design (claims via transaction, ETag conditional
gets, idempotent event IDs): ARCHITECTURE §5. Consequence: freshness tied to an open
client; fabricated-event risk accepted (SECURITY §4). Also answers PRD §15-Q2: repos
the registrant can't admin behave identically — polling needs no rights beyond public
read, so no owner prompt is needed.

**ADR-005 · GitHub tokens live in sessionStorage only, never in Firestore.**
PRD says "encrypt tokens at rest"; with no server, any at-rest store we can decrypt,
an XSS can too — while a *stored* token corpus makes Firestore a honeypot. Not
persisting beats encrypting. Cost: one re-auth popup per new tab that touches GitHub
APIs. SECURITY §5.

**ADR-006 · All GitHub writes use the acting user's own token, client-side.**
Issue creation uses the requester's token; the collaborator invite uses the owner's,
fired from the owner's own accept tap (PRD §7.3 verbatim). No impersonation surface
exists anywhere in the system.

**ADR-007 · Discord P0 = per-group incoming webhook (outbound only).**
A bot (slash commands `/active` `/asks` `/whois`) needs an interactions endpoint →
Phase 3 Worker (ADR-011). Outbound posts cover the P0 loop: asks, stuck flags,
claims, collab requests, shipped. Webhook URL readable by members (they post);
blast-radius analysis SECURITY §7. Answers PRD §15-Q4: thread mirroring deferred.

**ADR-008 · No aggregated counters as authority; `count()` queries instead.**
Stored totals drift and invite ranking creep. Aggregation queries are cheap, and the
"no leaderboards" principle (PRD §3) is easier to keep when nothing accumulates on a
profile. Cosmetic mirrors (claimCount) may drift harmlessly.

**ADR-009 · A repo may be registered in multiple groups (PRD §15-Q3: yes).**
Firestore path `groups/{gid}/repos/{repoId}` scopes everything per group naturally;
asks/threads/events never leak across groups. Cost: duplicated event rows per group —
negligible at our scale, TTL-bounded.

**ADR-010 · Invite links: random-token doc IDs, get-not-list, expiry ≤ 30 d, no admin role.**
Token = capability. Rules forbid `list` so tokens can't be enumerated; admins are
promoted explicitly post-join. Leaked link ⇒ revoke + rotate. Answers PRD §15-Q5
implicitly: GHE/self-hosted GitLab out of scope for Phases 1–3.

**ADR-011 · Phase-3 escape hatch: one Cloudflare Worker (free) — deliberately not now.**
Unlocks webhooks, slash commands, push sending, iCal feeds, digest email, and hides
the Discord URL. Rejected for Phase 1: second platform, first real secret, always-on
attack surface, and the PRD's exit criterion for Phase 1 (weekly return without
prompting) doesn't need any of it.

**ADR-012 · Dark-first design system per owner's reference imagery.**
Tokens/spec in UI.md. Light theme is a Phase-2 token flip. Fonts self-hosted (CSP
`'self'`, no CDN). Product name/domain (PRD §15-Q6): RepoCircle on the Pages URL;
custom domain optional later (needs Firebase auth-domain + CSP updates — noted in
SETUP).

**ADR-013 · License: undecided on purpose.** Public repo currently "all rights
reserved." Owner to choose (MIT would match Score Keeper's spirit) before inviting
outside contributors.

**ADR-014 · Availability statuses are audience-neutral: "on exams" → "away".**
The PRD (§3, M-03) makes "on exams" a first-class availability status. In practice
that bakes a student assumption into the most-seen chip in the product, while
RepoCircle also serves friend circles and working-dev groups (the PRD's own personas).
Statuses are now **free to help / heads down / away / custom** — "away" covers exams,
travel, leave, or any stretch of unavailability without niching the app to campuses.
Deliberate departure from the PRD on a product-owner call (2026-09-05). Custom status
still lets anyone say "on exams" in their own words if they want to. Legacy `exams`
values in existing member docs degrade to "available" (Members.tsx guard) until reset.

**ADR-015 · Personal homepage at root (deliberate PRD deviation, owner decision).**
The PRD's IA has no personal page — the group Home is "the whole product" (§5.2), and
§2 warns that profile/showcase layers killed prior attempts. Shashwat, as product
owner, chose a personal homepage anyway (2026-09-05): the root now shows a
**launchpad** — your groups, repos you own across groups, and (from M5) your open
asks/claims/requests — instead of auto-redirecting into the last group. Guardrails to
stay out of the showcase trap: no counters, no streaks, no aggregated stats, nothing
public — it is navigation plus your own open loops, nothing more. The logo links here;
`lastGid` remains only as switcher state. Cost accepted: one extra tap to reach group
content for single-group daily use.


**ADR-016 · Firestore memory cache, not IndexedDB persistence (reverses part of ADR-002/ARCH §7).**
Persistent offline caching cost far more than it gave. It renders writes the server
has not accepted and keeps serving documents the server no longer has, so the UI
states things that are not true: a circle that "saved" and then vanished, a join that
looked successful while the admin never saw the member, members appearing and
disappearing as queries silently fell back to cache. A collaboration app's screen
should show what the server confirmed, not what this device hopes. Switched to
`memoryLocalCache()`: reads are fast within a session, every reload reflects the
server, and rejected writes surface as errors instead of phantom success.
Cost accepted: no offline reads across reloads. The service worker still serves the
app shell offline, and Firestore still queues writes within a session. Revisit only
with a genuine offline requirement — and then re-verify the phantom-state problem.


**ADR-017 · The target is a 100–300 person bounded community, not a friend circle
(supersedes PRD §1/§2 audience).**
Pitching the built product to a skeptic surfaced a weakness no feature fixes: at
twenty friends who see each other daily, ambient awareness already exists, so the app
competes with the group chat and loses. Opening it to the public fails the other way —
the "looking for a collaborator" gap is real, but strangers' need for *something* to
build is satisfied by any project, so they sign up and vanish; the failure is
follow-through, not discovery. The variable that actually matters is **how well the
group already knows itself**: awareness must be genuinely missing while accountability
is still real. That band is a department, a cohort, or one large Discord. The
primitives are unchanged — this is a change of who is in the room, not a rewrite —
but it promotes filtering, member identity, a durable gated join link, and a
joined-and-shipped record from optional to core. Recorded as a hypothesis to test;
rationale and implications in `docs/POSITIONING.md`.


**ADR-018 · Profiles are identity, not showcase; skills are seeded from code.**
First milestone against ADR-017: at 200 semi-strangers a comment carries nothing
unless the person does, so members get a page — but PRD §2 is explicit that
profile/showcase layers killed prior attempts. The line we hold: profiles are
group-scoped (no cross-circle identity), show declared offers (helpWith/learning)
and derived facts (languages from repos actually shared here, counted client-side,
never stored), and carry no aggregate numbers, streaks, or anything that ranks one
member against another. The matcher joins repo.needs against member.helpWith with
'anything' matching any non-empty offer. The coverage problem — blank forms stay
blank — is solved by seeding the edit sheet from the languages in the member's own
repos and asking for confirmation, not composition; suggestions never claim
'design' or 'feedback' because code can't testify to those. helpWith shares the
needs vocabulary so matching is an exact join, enforced in rules (closed set, no
free text). Learning is bounded free text (6 × 24 chars, per-index rules checks).


**ADR-019 · The story is told from facts, and no fact is ever aggregated.**
M12 makes the human loop visible: who joined whom, who raised a hand, who got
someone unstuck, who took over what. Every one of these is a single recorded
fact rendered where it happened — a journey line on the repo, a credit line on
the ask, a "with @x" on Home. The line we will not cross: no fact is ever
counted, summed, or ranked across people. "@priya had the answer" is warmth;
"priya: 12 resolves" is a leaderboard wearing a coat, and the PRD's no-ranking
principle (§3) applies to derived numbers exactly as it does to stored ones.
Corollaries: the away-inbox is a visit-time digest (getDocs + lastSeenAt
watermark), not a notification system; watches are private to the watcher;
inbox routing fields (gid, replyToUid, repoOwnerUid) are denormalized onto docs
and rules-verified against their parents so nobody can pollute anyone's inbox.


**ADR-020 · Ideas are repos minus the code; germination links, never migrates.**
The value moment (ADR-017) starts before any repository exists, so the idea
gets a first-class doc — but NOT a new subsystem. It reuses the repo vocabulary
(pitch/needs/tags), the comment primitive, the interests mechanic, the matcher
and the away-inbox; its subcollections keep the same collection names so every
existing collection-group rule and index covers them. One new lifecycle:
open → germinated | parked. Germination is a two-way link (idea.repoId,
repo.ideaId + ideaByLogin) writable by the idea's author, an admin, or the
linked repo's owner — rules validate the repo exists in the circle. Nothing is
migrated or deleted: comments and hands raised stay on the idea, the repo's
journey opens with the idea chapter, and the credit line is a single fact
(never aggregated). Parked is an honest shelf, not a soft delete.


**ADR-021 · The summary doc holds counts; every list is a bounded query.**
`groups/{gid}/meta/summary` holds three numbers — memberCount, repoCount,
openAskCount — plus the admin surface (links, pinnedRepoId) that M17 fills in.
Nothing else. **Superseded during M16:** the first draft also mirrored capped
lists (recent faces, arrivals, new repos, repos wanting help) into the same
document. That was wrong, and the reason is worth keeping: Firestore bills
documents *returned*, not scanned, so `orderBy(...).limit(6)` costs six reads
against a six-hundred-repo collection. A bounded query is therefore the same
cost order as a mirrored list while returning whole, current documents —
where the mirror duplicated display fields that drift, which is Class A
exposure in the exact codebase whose review system exists because of Class A.

What survives is what no bounded query can answer: a count. Getting one
otherwise means reading the whole collection, and that is what took the app
down. Counts move by increment() (Class C), are maintained best-effort by
member clients at write time (Spark has no triggers), and are display-only —
nothing authorizes on them, and rebuildSummary() recounts from aggregation
queries when they drift. Where a list needs an ordering the documents do not
already carry, the ordering becomes a field on the document rather than a
mirror: `repo.needsSince` is why the longest-waiting repo can be found with a
query, so a repo nobody answers rises instead of sinking.

Corollary, and the rule that pays for most of M16: reading a whole collection
is a design error, not an optimisation opportunity. Only two screens may hold
the full member list (the roster and settings, via an explicit
`useCircleMembers`); every other page reads its own membership as one document.

**ADR-022 · Home narrows to what can mean something yet, and says that it has.**
Discord's onboarding data says the first ten minutes decide retention, and its
mechanism — progressive disclosure — is the same shape as our read problem, so
they are one piece of work: a block that is not rendered mounts no listener and
costs no reads. Gating markup while the parent still subscribed would be
theatre, which is why every Home block owns the listener it needs and
`visibleBlocks()` is the read budget as much as the layout.

**Corrected while building.** The plan said "the checklist is the unlock". That
overstates it and contradicts a decision already made in the code: the F-12
checklist is *a guide, not a gate* — every tab stays reachable and the card
celebrates progress. So the rule is not "have they done their chores" but **can
this block mean anything to this member yet**: the matcher needs skills to join
on, "Your activity" is definitionally empty before you have any, the repo
blocks need repos to exist. Every input can only ever *widen* the page. Checklist
progress is admitted as evidence of settling in, never as a requirement, and
after forty-eight hours it stops mattering at all.

Two guardrails. `showAll` is a one-tap, remembered escape hatch that beats every
narrowing except the matcher, which stays hidden because it has nothing to
match on. And the page **says** it is narrow, because a page quietly smaller
than it will be later is exactly the thing that sends someone hunting a bug
that is not there — the same reasoning as Class G, applied to a whole screen
rather than one empty state.

**ADR-023 · Sessions are member gatherings; RSVP reuses interests; reminders
wait for the Worker.** Any writing member may schedule one — "working on this
Saturday, join me" is a circle ritual, not an admin act (edit/cancel: host or
admin). An RSVP is an interests doc with repoOwnerUid = hostUid, so the
away-inbox, the collection-group read rule and the composite index cover
session RSVPs with zero new paths — the same reuse that made ideas cheap
(ADR-020). Calendar export is a client-built .ics download; a live
subscription URL and push reminders need a sender and join the Phase-3 Worker
list (ADR-011). rsvpCount is a participation mirror like claimCount — counts
on a thing are fine; ranking people never is (ADR-019).

**ADR-024 · Polls decide questions; they never rate people or work.**
A poll is the circle choosing what to do next — "which workshop", "when do we
demo" — with 2–5 options, one vote per member (doc id = uid makes it
structural), counts as increment mirrors. Results reveal only after your own
vote is in: bandwagon and anchoring die there. The ADR-019 line, drawn
explicitly: options are never members and never repos-as-quality — a poll on
people or projects is a leaderboard wearing a hat. Rules cannot read
semantics, so the composer's framing and this ADR are the guardrail, exactly
as ADR-014 is for availability tone. A closed poll collapses to a single fact
line and stays as the record.

**ADR-025 · Cross-circle surfacing requires mutual membership.**
ADR-009 lets a repo be registered in many circles; showing that is allowed
only where the viewer is a member of both, resolved by direct reads under
existing rules (one getDoc per shared circle, groupIds ≤8) — never a global
registry. A circle's existence is itself private information; a
publicRepos/{id} index would leak it to anyone holding a repo id. Nothing
renders for non-mutual viewers, and that is the design, not a gap. The badge
resolves from live reads at view time, never from a stored mirror (Class A).

**ADR-026 · One build artifact; test affordances are compile-time flags.**
The app is built once and that build is what ships. Anything a test needs from
the app itself (emulator wiring, and later test ids and a pinned clock) lives
behind an `import.meta.env` flag that vite folds to a literal and tree-shakes,
never behind a second "testing build" of the product. Testing a different
artifact than you ship forfeits the assurance the tests exist to buy, and two
builds here would mean two sw.js BUILD_IDs — the Class D failure that already
cost days — plus an E2E run that never exercises the CSP, which only exists in
production builds. Deploy speed is protected instead by staging CI: a fast gate
blocks the deploy, the full suite publishes reports beside it (TESTING.md §8).

The single contained exception is `vite build --mode emulator`, which E2E needs
because a static SPA's backend choice is made at compile time; runtime config
would put emulator code in the production bundle, which is worse. Its delta from
production is exactly one define plus the loopback `connect-src`, it builds to
`dist-emulator/` so it can never be mistaken for the deployable output, and
`scripts/verify-build-delta.mjs` asserts both bundles emit the same chunk set,
that production contains no emulator marker, and that the emulator build
actually does — otherwise E2E would be testing nothing.

Found while implementing: the guard was `import.meta.env.DEV &&
import.meta.env.VITE_EMULATORS === '1'`, and `DEV` is false in *every* build, so
no built bundle could reach the emulators at all. The `DEV` term is gone; the
`VITE_EMULATORS` term alone is what production folds to false, so the tree-shake
is unchanged — and it is now asserted on every build rather than assumed, which
is Class D's own rule applied to itself.

**ADR-027 · The report store: CTRF leaves, layered index, no server.**
Test runs emit raw JSON that a converter turns into CTRF — an open, tool-neutral
schema — and everything human-readable is generated from it. Reports are written
under `reports/` as append-only run directories plus one `history.jsonl`, with a
three-hop contract: INDEX → a feature/layer/area summary → the failing assertion.
Paths and anchors are stable (`reports/latest/features/asks.md#e2e`), so an agent
reaches any fact without a discovery pass, and failures always precede passes.

CTRF rather than JUnit XML because the schema is extensible and we need to carry
a field nothing off-the-shelf knows about: the feature tag that joins a test to
the registry. That join is also why the converter is ours rather than a reporter
package — roughly sixty lines, no new dependency, and the tag lifting is the
part that matters.

Local-first and generated-not-committed: the tree is reproducible from a run, so
committing it would only produce merge conflicts. Moving it to a cloud store
later is a sync of the same directory, not a redesign. Nothing in the system
needs a process running — consistent with ADR-002.
