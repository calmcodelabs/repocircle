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
