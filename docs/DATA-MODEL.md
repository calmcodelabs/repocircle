# RepoCircle — Firestore Data Model

Maps the PRD §8 entity list onto Firestore. Conventions used throughout:

- **Tenancy**: everything group-scoped lives under `groups/{gid}/…` — the rules make
  membership of `gid` the precondition for _any_ access beneath it (SECURITY §3).
- **IDs**: natural GitHub IDs where they exist (repo id, event id) → idempotent writes;
  `crypto.randomUUID()` otherwise; invite tokens are 128-bit random base32.
- **Denormalization**: display fields (`login`, `name`, `avatarUrl`) are copied onto
  membership/ask/claim docs at write time so lists render with zero joins. They refresh
  opportunistically when the owning user acts. Staleness is cosmetic only.
- **Timestamps**: `serverTimestamp()` for anything rules must trust; client clock only
  for display-side fields. All names below ending `At` are Firestore Timestamps.
- Every doc carries `v: 1` (schema version) for future migrations.

## 1. Collection tree

```
users/{uid}
users/{uid}/watches/{watchId}                # saved things, any kind (M12, widened M18)
groups/{gid}
groups/{gid}/meta/summary                    # the circle's counts — Home's one read (M16)
groups/{gid}/members/{uid}
groups/{gid}/invites/{token}
groups/{gid}/announcements/{annId}           # admin-only, append-only (M17)
groups/{gid}/repos/{repoId}
groups/{gid}/repos/{repoId}/events/{eventId}
groups/{gid}/repos/{repoId}/comments/{id}
groups/{gid}/repos/{repoId}/interests/{uid}
groups/{gid}/repos/{repoId}/activityDaily/{YYYY-MM-DD}   # superseded by repo.daily (M3)
groups/{gid}/ideas/{ideaId}                  # M15
groups/{gid}/ideas/{ideaId}/comments/{id}
groups/{gid}/ideas/{ideaId}/interests/{uid}
groups/{gid}/asks/{askId}
groups/{gid}/asks/{askId}/claims/{uid}
groups/{gid}/asks/{askId}/comments/{id}
groups/{gid}/sessions/{sessionId}            # gatherings (M19)
groups/{gid}/sessions/{sessionId}/interests/{uid}        # RSVPs — same shape on purpose
groups/{gid}/polls/{pollId}                  # M19
groups/{gid}/polls/{pollId}/votes/{uid}      # doc id = uid ⇒ one vote per member
groups/{gid}/collabRequests/{reqId}
groups/{gid}/integrations/{kind}            # 'discord' (P0), 'slack' (P2)
groups/{gid}/auditLog/{entryId}
# Phase 2+ (schema reserved, not built in Phase 1):
groups/{gid}/threads/{threadId}/posts/{postId}
groups/{gid}/kudos/{kudosId}
users/{uid}/follows/{followId}
publicPages/{slug}                          # opt-in public group page mirror (G-01)
```

## 2. Document schemas (Phase 1)

### `users/{uid}` — self-readable/writable only

| Field                  | Type                                      | Notes                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| githubId               | number                                    | From provider profile; immutable after create                                                                                                                                                                                                                       |
| login, name, avatarUrl | string                                    | Mirror of GitHub profile                                                                                                                                                                                                                                            |
| scopesGranted          | string[]                                  | e.g. `["read:user","user:email","public_repo"]` — UI hint only, never an authz source                                                                                                                                                                               |
| groupIds               | string[]                                  | Mirror for "my groups" screen; source of truth = membership docs                                                                                                                                                                                                    |
| checklist              | map<string,bool>                          | Global onboarding bits (per-group bits live on membership)                                                                                                                                                                                                          |
| circlePrefs            | map<gid, `"all"`\|`"mentions"`\|`"mute"`> | M18. What the away-inbox shows per circle. Absent means `all`; `mute` skips that circle's inbox queries entirely, so the preference _saves_ reads rather than spending them. Exactly three options (Slack's finding: more of them made people feel less in control) |
| createdAt, lastSeenAt  | ts                                        |                                                                                                                                                                                                                                                                     |

### `users/{uid}/watches/{watchId}` — saved things, self-only

M12 as watched repos, widened in M18 to anything worth coming back to.

| Field         | Type                      | Notes                                                                           |
| ------------- | ------------------------- | ------------------------------------------------------------------------------- |
| gid           | string                    | Which circle it lives in                                                        |
| kind          | `repo` \| `ask` \| `idea` | **Absent means `repo`** — documents written before M18 are read, not migrated   |
| itemId, title | string                    | Pre-M18 documents carry `repoId`/`fullName` instead; both key sets stay allowed |
| addedAt       | ts                        |                                                                                 |

Doc id is `${gid}_${itemId}` for repos — unchanged from M12 so old saves still
resolve — and `${gid}_${kind}_${itemId}` for everything else. Resolution prunes
only what a successful read proves is gone (`pruneDecision`, Class A).

### `groups/{gid}/meta/summary` — the circle's counts (M16, ADR-021)

**Counts only.** Firestore bills documents _returned_, not scanned, so every list
Home shows is a bounded query over real documents; a count is the one thing no
bounded query can answer, and reading a whole collection to get one is what
exhausted the free tier. Maintained best-effort by member clients at write time
(Spark has no triggers), display-only (Class A), repaired by `rebuildSummary()`.

| Field                                | Type                                | Notes                                                                                                                                             |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| memberCount, repoCount, openAskCount | number                              | `increment()` only (Class C). Any member may move them — including guests, because a count left wrong by one after a guest joins is a visible lie |
| links                                | array ≤ 6 `{label ≤ 40, url https}` | **Admin-only key.** The circle wall (M17)                                                                                                         |
| pinnedRepoId                         | string \| null                      | **Admin-only key.** A position an admin states, never anything derived (ADR-019)                                                                  |

Rules split the writable keys with `affectedKeys()`: ordinary maintenance keeps
working on a circle whose admin has already curated links.

### `groups/{gid}/announcements/{annId}` — the circle's voice (M17)

`{ body ≤ 280, authorUid, authorLogin, authorAvatarUrl, createdAt, v }` — admin-only
create, **append-only** (no update rule at all): an announcement is a statement made
at a moment, so correcting it means posting again rather than rewriting what people
already read. Home reads exactly one (`orderBy createdAt desc limit 1`); history is
a `limit(10)` query that runs only when someone opens it. Dismissal is per-member in
localStorage — nothing to store server-side.

**No GitHub token field exists. Tokens never touch Firestore.** (SECURITY §5)

### `groups/{gid}`

| Field       | Type                           | Notes                                                        |
| ----------- | ------------------------------ | ------------------------------------------------------------ |
| name        | string 3–50 chars              |                                                              |
| description | string ≤ 280                   |                                                              |
| visibility  | `"private"` \| `"public_page"` | `public_page` is Phase 2 (G-01)                              |
| createdBy   | uid                            |                                                              |
| memberCount | number                         | Maintained best-effort by clients; display only, never authz |
| settings    | map                            | `{ askTags: string[] (≤ 20), defaultRole: "member" }`        |
| createdAt   | ts                             |                                                              |

### `groups/{gid}/members/{uid}` — the tenancy anchor

| Field                  | Type                                                    | Notes                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| role                   | `admin` \| `member` \| `guest` \| `mentor` \| `alumnus` | A-01. `guest`/`alumnus` are read-only roles (rules-enforced)                                                                                                                                                |
| login, name, avatarUrl | string                                                  | Denormalized for the member list                                                                                                                                                                            |
| availability           | map                                                     | `{ status: "free"\|"heads_down"\|"away"\|"custom", note?: ≤60, until?: ts }` (M-03 ships early — it's cheap and humane)                                                                                     |
| helpWith               | string[] ≤ 5, closed vocabulary                         | Joins against `repo.needs`. Asked at the door (M17)                                                                                                                                                         |
| learning               | string[] ≤ 6 × ≤ 24 chars                               | Free text but bounded                                                                                                                                                                                       |
| domainTags             | string[] ≤ 4, closed vocabulary                         | M17. What they want to build. Closed for the same reason `helpWith` is: the join screen offers chips, never a text field, so the value stays joinable instead of becoming prose                             |
| checklist              | map<string,bool>                                        | F-12: addedRepo, invitedSomeone, visitedMembers, postedOrAnswered, connectedChat, setAvailability                                                                                                           |
| repoSync               | map                                                     | `{ mode: "auto"\|"manual", excluded?: string[], decidedAt?: ts }` — F-04 auto-import; `auto` keeps registering newly-created public repos, `excluded` remembers hand-removals so sync never resurrects them |
| joinedAt               | ts                                                      |                                                                                                                                                                                                             |
| joinedVia              | string                                                  | invite token ref or `"founder"` — audit trail                                                                                                                                                               |

### `groups/{gid}/invites/{token}` — token IS the doc id (unguessable, non-listable)

| Field     | Type                | Notes                                                           |
| --------- | ------------------- | --------------------------------------------------------------- |
| role      | `member` \| `guest` | Admins are promoted explicitly, never via link (F-03 hardening) |
| expiresAt | ts                  | Required; UI offers 24 h / 7 d / 30 d                           |
| revoked   | bool                |                                                                 |
| createdBy | uid                 |                                                                 |
| createdAt | ts                  |                                                                 |
| label     | string ≤ 40         | "posted in club Discord" — admin's memory aid                   |

### `groups/{gid}/repos/{repoId}` — repoId = GitHub numeric repo id (string)

| Field                                    | Type                                       | Notes                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fullName                                 | string                                     | `owner/name`; updated on rename detection                                                                                                                                                                                                                                           |
| htmlUrl, description, language, topics[] |                                            | Card display (R-01)                                                                                                                                                                                                                                                                 |
| githubOwnerLogin                         | string                                     |                                                                                                                                                                                                                                                                                     |
| ownerUid                                 | uid \| null                                | The member who owns it on GitHub (if they're in the group)                                                                                                                                                                                                                          |
| registeredBy                             | uid                                        |                                                                                                                                                                                                                                                                                     |
| status                                   | `idea` \| `building` \| `paused` \| `done` | F-10; owner/admin-writable                                                                                                                                                                                                                                                          |
| demoUrl                                  | string \| null                             | Validated `https://`                                                                                                                                                                                                                                                                |
| archived                                 | bool                                       |                                                                                                                                                                                                                                                                                     |
| lastEventAt                              | ts \| null                                 | Drives "Active this week" ordering                                                                                                                                                                                                                                                  |
| poll                                     | map                                        | `{ lastPolledAt: ts, etag: string, failing: bool }` — engine state (ARCH §5)                                                                                                                                                                                                        |
| stats7d                                  | map                                        | `{ commits, prsOpened, prsMerged, issues, releases }` — recomputed during polls                                                                                                                                                                                                     |
| pitch                                    | string ≤ 200                               | M9: the idea in the owner's words — what a friend would understand, not the stack                                                                                                                                                                                                   |
| needs                                    | enum \| null                               | `feedback`, `frontend`, `backend`, `ml`, `design`, `anything` — turns a repo into a request                                                                                                                                                                                         |
| needsSince                               | ts \| null                                 | M18. When it started waiting. A field rather than a mirror, so the longest-waiting can be found by an ordered query — a repo nobody answers must rise, not sink. Survives edits that leave `needs` alone, so re-saving a pitch does not send a month-old request back to the bottom |
| domainTags                               | string[] ≤ 4                               | web/ML/tooling/… — the browse axis once a circle has dozens of repos                                                                                                                                                                                                                |
| seekingOwner                             | bool                                       | Owner has moved on; someone else may adopt it                                                                                                                                                                                                                                       |
| interestCount                            | number                                     | Mirror of the `interests` subcollection (display only)                                                                                                                                                                                                                              |
| createdAt                                | ts                                         |                                                                                                                                                                                                                                                                                     |

### `groups/{gid}/repos/{repoId}/events/{eventId}` — eventId = GitHub event id

| Field                      | Type         | Notes                                                                                   |
| -------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| type                       | string enum  | push, pr_opened, pr_merged, issue_opened, issue_closed, release, branch_created, fork   |
| actorLogin, actorAvatarUrl | string       |                                                                                         |
| summary                    | string ≤ 200 | Pre-rendered line: "3 commits to main"                                                  |
| url                        | string       | Deep link to GitHub                                                                     |
| occurredAt                 | ts           | From GitHub payload                                                                     |
| source                     | `"poll"`     | `"webhook"` reserved for Phase 3                                                        |
| expireAt                   | ts           | occurredAt + 180 d → **Firestore TTL policy** deletes it (PRD §11 retention, zero code) |

### `groups/{gid}/repos/{repoId}/comments/{id}` and `groups/{gid}/asks/{askId}/comments/{id}`

| Field                                     | Type           | Notes                                                     |
| ----------------------------------------- | -------------- | --------------------------------------------------------- |
| authorUid / authorLogin / authorAvatarUrl |                | Denormalized for rendering                                |
| body                                      | string 1–1000  | Stored raw, **rendered as text nodes only** (SECURITY §6) |
| parentId                                  | string \| null | One level of replies; no deeper nesting by design         |
| mentions                                  | string[] ≤ 10  | Circle logins only, resolved at write time                |
| repoRefs                                  | string[] ≤ 10  | Repo short-names in this circle, resolved at write time   |
| pinned                                    | bool           | Repo/ask owner or admin only; created as false            |
| createdAt / editedAt                      | ts             |                                                           |

Authors edit and delete their own; the repo (or ask) owner and admins moderate.
`commentCount` mirrors onto the parent so cards show it without a query.
Recent discussion on Home is a `collectionGroup('comments')` query filtered to the
group by path — single-field auto-index, no composite index needed.

### `groups/{gid}/repos/{repoId}/interests/{uid}`

`{ login, avatarUrl, note?, createdAt }` — "I'm interested", one doc per member,
self-write only. Deliberately lighter than a collab request (which opens a GitHub
issue): this is the first, cheap signal that an idea found a second brain.

### `groups/{gid}/repos/{repoId}/activityDaily/{YYYY-MM-DD}`

**Superseded in M3** by an embedded `daily` map on the repo doc (21-day window,
pruned during polls): one doc read renders card + sparkline instead of a 14-doc
query. The subcollection rules remain for the Phase-3 webhook path.

### `groups/{gid}/asks/{askId}`

| Field                                   | Type                              | Notes                                                       |
| --------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| kind                                    | `ask` \| `stuck`                  | F-06 / F-07 share one collection                            |
| title                                   | string 4–120                      | Stuck flags: title only                                     |
| detail                                  | string ≤ 500                      |                                                             |
| tags                                    | string[] ≤ 8                      | From `group.settings.askTags` ∪ defaults                    |
| repoId                                  | string \| null                    | Free-standing asks allowed                                  |
| pairingUrl                              | string \| null                    | R-16 early: Live Share/Codespaces link on an ask            |
| authorUid, authorLogin, authorAvatarUrl |                                   |                                                             |
| state                                   | `open` \| `claimed` \| `resolved` | Transitions rules-enforced (SECURITY §3)                    |
| claimCount                              | number                            | Mirror of claims subcollection size (display)               |
| createdAt, resolvedAt                   | ts                                | Resolved-this-week metric = `count()` on `resolvedAt` range |

### `groups/{gid}/asks/{askId}/claims/{uid}`

`{ login, avatarUrl, note ≤ 140, claimedAt }` — doc id = claimant uid (one claim per
member, multiple claimers fine — F-08).

### `groups/{gid}/sessions/{sessionId}` — gatherings (M19, ADR-023)

| Field                             | Type           | Notes                                                  |
| --------------------------------- | -------------- | ------------------------------------------------------ |
| title                             | string 3–80    |                                                        |
| detail                            | string ≤ 500   |                                                        |
| startsAt                          | ts             |                                                        |
| durationMin                       | number ≤ 480   |                                                        |
| url                               | https \| null  | Call link, room, wherever it happens                   |
| repoId                            | string \| null |                                                        |
| hostUid, hostLogin, hostAvatarUrl |                | Immutable host — rules refuse reassignment             |
| cancelled                         | bool           | Cancel rather than delete, so people who RSVPd see why |
| rsvpCount                         | number         | `increment()` mirror of the interests subcollection    |
| createdAt                         | ts             |                                                        |

Any writing member may call one — "working on this Saturday, join me" is a circle
ritual, not an admin function; the host or an admin edits and cancels. Anyone may
move `rsvpCount`; the gathering itself belongs to whoever called it.

### `groups/{gid}/sessions/{sessionId}/interests/{uid}` — RSVPs

Deliberately the **same shape as repo and idea interests**: `{ login, avatarUrl,
note?, gid, repoOwnerUid: <hostUid>, createdAt }`. That one decision means the
away-inbox, its collection-group read rule and its composite index all cover session
RSVPs with no new plumbing — the reuse that made ideas cheap in M15. `repoOwnerUid`
is spoof-checked against the session, exactly as the repo and idea versions are
checked against their parents.

### `groups/{gid}/polls/{pollId}` — deciding together (M19, ADR-024)

| Field                                   | Type                                   | Notes                                                                                            |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| question                                | string 4–120                           |                                                                                                  |
| options                                 | map, 2–5 entries `{label ≤ 60, count}` | Counts are `increment()` mirrors (Class C); `count()` over votes is the truth if it ever matters |
| authorUid, authorLogin, authorAvatarUrl |                                        |                                                                                                  |
| state                                   | `open` \| `closed`                     | Closing belongs to the author or an admin; a closed poll is the record                           |
| createdAt, closedAt                     | ts                                     |                                                                                                  |

A poll decides a **question**. Options are things to do, never people or their work
— rules cannot read semantics, so that line is held by ADR-024 and by what the
composer asks for, the same way ADR-014 holds the availability tone.

### `groups/{gid}/polls/{pollId}/votes/{uid}`

`{ optionKey, createdAt }` — **doc id = uid, so one vote per member is structural
rather than enforced.** Changing your mind rewrites the same document and moves two
counters in one batch. Results are revealed to a member only after their own vote is
in: seeing the running total first is how a poll stops measuring what people think
and starts measuring what they think everyone else thinks.

### `groups/{gid}/collabRequests/{reqId}`

| Field                        | Type                                                 | Notes                                            |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| repoId, repoFullName         |                                                      |                                                  |
| requesterUid, requesterLogin |                                                      |                                                  |
| note                         | string ≤ 280                                         |                                                  |
| githubIssueNumber            | number \| null                                       | Written after issue creation succeeds            |
| state                        | `pending` \| `accepted` \| `declined` \| `cancelled` | Only repo `ownerUid` or admin may decide (rules) |
| decidedBy, decidedAt         |                                                      |                                                  |
| createdAt                    | ts                                                   |                                                  |

### `groups/{gid}/integrations/discord`

`{ webhookUrl, channelLabel, postAsks, postClaims, postCollabs, postShipped: bool,
configuredBy, updatedAt }` — readable by members (their clients post to it), writable
by admins. Risk analysis in SECURITY §7.

### `groups/{gid}/auditLog/{entryId}`

`{ actorUid, actorLogin, action, subjectType, subjectId, detail ≤ 200, createdAt }` —
create-only by members for privileged actions (role change, removal, invite revoke,
integration change, repo archive); readable by admins (A-04 groundwork).

## 3. Composite indexes (declared in `firestore.indexes.json` from day one)

`firestore.indexes.json` is the source of truth; this is what the newer ones are for.
Note that a **range filter plus an ordering on the same single field needs no entry** —
Firestore indexes it automatically, and declaring it makes the whole index deployment
fail with a 400 (learned the hard way deploying M19).

| Collection                                     | Fields                                          | Feeds                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| asks                                           | state ASC, createdAt DESC                       | Open-asks block, ask history                                                                                           |
| asks                                           | state ASC, createdAt ASC                        | M18 — the asks nobody has touched, oldest first                                                                        |
| asks                                           | authorUid ASC, createdAt DESC                   | "Your activity"                                                                                                        |
| repos                                          | archived ASC, lastEventAt DESC                  | Active this week                                                                                                       |
| repos                                          | archived ASC, status ASC, lastEventAt DESC      | M16 — live repos only, so "everything is paused" is a claim about the circle rather than about the top eight (Class G) |
| repos                                          | archived ASC, createdAt DESC                    | New this week                                                                                                          |
| repos                                          | needs ASC, needsSince ASC                       | Wants a hand, longest-waiting first; the matcher takes a slice of the same index                                       |
| repos                                          | archived ASC, poll.lastPolledAt ASC             | M16 — the polling engine's bounded bite of the stalest repos                                                           |
| ideas                                          | state ASC, createdAt DESC                       | Ideas brewing                                                                                                          |
| ideas                                          | state ASC, needs ASC, createdAt DESC            | The idea matcher                                                                                                       |
| polls                                          | state ASC, createdAt DESC                       | The open poll                                                                                                          |
| events (collectionGroup off — scoped per repo) | occurredAt DESC                                 | Repo feed                                                                                                              |
| collabRequests                                 | state ASC, createdAt DESC                       | Owner inbox                                                                                                            |
| comments (collectionGroup)                     | gid ASC + (createdAt \| mentions \| replyToUid) | Recent discussion, away-inbox                                                                                          |
| interests (collectionGroup)                    | gid ASC, repoOwnerUid ASC, createdAt DESC       | Away-inbox — covers repo, idea **and** session RSVPs                                                                   |

## 4. Query patterns per screen (read-cost discipline)

**The rule, since M16 (ADR-021): reading a whole collection is a design error.**
Every read is one document or a bounded query. Two consequences worth stating:

- `myMembership` is its own one-document listener. Sifting it out of the member list
  meant every group-scoped page paid for the whole roster, which was most of what
  made Home expensive.
- The full roster is **opt-in** (`useCircleMembers`). Only the members and settings
  screens ask for it; Home shows eight faces and Repos shows none.

| Screen             | Listeners (live)                                                                                                                                                                                                                                      | One-shot                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Any group page     | group doc, my membership doc, `meta/summary`                                                                                                                                                                                                          | —                                                                                |
| Home               | per block, each owning its own listener (M16.5): active repos 8, new repos 6, wanted 10 (+5 matcher), orphans 5, recent members 8, open asks 25, longest-waiting 3, ideas 6 (+3 matcher), collabs 12, comments 12, sessions 3, poll 1, announcement 1 | resolved count ≤ 50, throttled to once a minute per tab; Discord integration doc |
| Repos              | windowed 25, widened by "Load more"                                                                                                                                                                                                                   | —                                                                                |
| Repo detail        | repo, comments, interests, repo collabs                                                                                                                                                                                                               | README, social image, cross-circle lookup (≤ 7 docs, Class E exception)          |
| Members / Settings | members windowed 50                                                                                                                                                                                                                                   | —                                                                                |
| Personal home      | — (the away-inbox is a visit-time digest by design)                                                                                                                                                                                                   | inbox ≤ 8/query/circle, saved ≤ 50, my groups                                    |

**A block that does not render mounts no listener** (M16.5, ADR-022) — that is the
whole mechanism, which makes the layout decision and the read budget the same
decision. Measured: ~70 reads for a new member, ~130 for a settled one, **flat at
any circle size**. Before M16 a 200-member circle cost ~900 and rising. Full
arithmetic, including what this does _not_ achieve, is in
[SCALING.md](SCALING.md) §1.

## 5. Data lifecycle

- **Events**: TTL-deleted at 180 days (PRD §11) after being folded into `activityDaily`.
- **Leaving a group** (PRD §11 privacy): membership doc deleted; the leaver's asks/
  claims/posts get `authorLogin: "(left the group)"`, `authorUid` retained (rules need
  it) but avatar dropped. A `util/anonymize.ts` batch does this client-side at leave time.
- **Repo deregistration**: doc + subcollections deleted by owner/admin (batched client
  delete; subcollection sweep capped at 500/batch, looped).
- **Group deletion**: admin-only ordered sweep (subcollections → other members → group doc → own membership → mirror; see src/data/deleteGroup.ts) behind a typed-name confirmation.

## 6. Consistency notes

- Idempotency by construction: natural IDs for events; transactions only for poll
  claims and invite acceptance; everything else is last-write-wins on
  author-owned docs (safe: single writer per doc by rule).
- **Counters move by `increment()`, never read-modify-write** (REVIEW.md Class C).
  `claimCount`, `interestCount`, `rsvpCount`, poll option counts and the summary
  counts are all cosmetic mirrors: they may drift under races and that is
  acceptable; truth = subcollection `count()` anywhere it matters. The one noted
  exception is `unclaimAsk`, which must branch on the count to pick the next state.
- Denormalized routing fields (`gid`, `replyToUid`, `repoOwnerUid`) are validated in
  rules against their parent document, so nobody can write themselves into — or
  anyone else out of — an away-inbox.
- Clock skew: rules compare against `request.time`, never client clocks.

## 7. Free-tier quota math (Spark: 50 K reads / 20 K writes / 1 GiB per day-ish)

> **Superseded for reads.** The estimate below was written for the PRD's heavy case
> and was optimistic about the pattern, not the arithmetic: a day of ordinary use
> exhausted the free tier on 2026-09-06 and took the app down. M16 fixed the pattern
> and [SCALING.md](SCALING.md) carries the measured numbers, including the honest
> finding that a 200-member circle at five visits per member per day still needs
> Blaze — at about $2/month rather than the $16 the old pattern implied, and flat
> rather than rising with membership. The write and storage estimates below still hold.

Assume the PRD's heavy case: 1 group, 40 members, 100 repos, 25% daily actives.

| Load                                                                     | Estimate   |
| ------------------------------------------------------------------------ | ---------- |
| Reads: 10 actives × ~120 cold + deltas                                   | ~2.5 K/day |
| Writes: polling (100 repos × 24 cycles hitting ~15% with news × ~4 docs) | ~1.5 K/day |
| Writes: asks/claims/presence                                             | < 300/day  |
| Storage: events ≤ 200 B × ~40 K live rows                                | ~10 MB     |

Order-of-magnitude headroom everywhere. The dangerous pattern would be unbounded
listeners — hence the per-screen listener table in §4 and detach-on-navigate rule.
