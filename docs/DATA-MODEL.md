# RepoCircle — Firestore Data Model

Maps the PRD §8 entity list onto Firestore. Conventions used throughout:

- **Tenancy**: everything group-scoped lives under `groups/{gid}/…` — the rules make
  membership of `gid` the precondition for *any* access beneath it (SECURITY §3).
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
groups/{gid}
groups/{gid}/members/{uid}
groups/{gid}/invites/{token}
groups/{gid}/repos/{repoId}
groups/{gid}/repos/{repoId}/events/{eventId}
groups/{gid}/repos/{repoId}/activityDaily/{YYYY-MM-DD}
groups/{gid}/asks/{askId}
groups/{gid}/asks/{askId}/claims/{uid}
groups/{gid}/collabRequests/{reqId}
groups/{gid}/integrations/{kind}            # 'discord' (P0), 'slack' (P2)
groups/{gid}/auditLog/{entryId}
# Phase 2+ (schema reserved, not built in Phase 1):
groups/{gid}/threads/{threadId}/posts/{postId}
groups/{gid}/kudos/{kudosId}
groups/{gid}/events/{eventId}               # calendar events
groups/{gid}/members/{uid}/notificationPrefs/{eventType}
users/{uid}/follows/{followId}
publicPages/{slug}                          # opt-in public group page mirror (G-01)
```

## 2. Document schemas (Phase 1)

### `users/{uid}` — self-readable/writable only
| Field | Type | Notes |
|---|---|---|
| githubId | number | From provider profile; immutable after create |
| login, name, avatarUrl | string | Mirror of GitHub profile |
| scopesGranted | string[] | e.g. `["read:user","user:email","public_repo"]` — UI hint only, never an authz source |
| groupIds | string[] | Mirror for "my groups" screen; source of truth = membership docs |
| checklist | map<string,bool> | Global onboarding bits (per-group bits live on membership) |
| createdAt, lastSeenAt | ts | |

**No GitHub token field exists. Tokens never touch Firestore.** (SECURITY §5)

### `groups/{gid}`
| Field | Type | Notes |
|---|---|---|
| name | string 3–50 chars | |
| description | string ≤ 280 | |
| visibility | `"private"` \| `"public_page"` | `public_page` is Phase 2 (G-01) |
| createdBy | uid | |
| memberCount | number | Maintained best-effort by clients; display only, never authz |
| settings | map | `{ askTags: string[] (≤ 20), defaultRole: "member" }` |
| createdAt | ts | |

### `groups/{gid}/members/{uid}` — the tenancy anchor
| Field | Type | Notes |
|---|---|---|
| role | `admin` \| `member` \| `guest` \| `mentor` \| `alumnus` | A-01. `guest`/`alumnus` are read-only roles (rules-enforced) |
| login, name, avatarUrl | string | Denormalized for the member list |
| availability | map | `{ status: "free"\|"heads_down"\|"away"\|"custom", note?: ≤60, until?: ts }` (M-03 ships early — it's cheap and humane) |
| helpWith, learning | string[] ≤ 10 × ≤ 24 chars | M-02, Phase 2 UI but schema now |
| checklist | map<string,bool> | F-12: addedRepo, followedMember, postedOrAnswered, connectedChat, setAvailability |
| joinedAt | ts | |
| joinedVia | string | invite token ref or `"founder"` — audit trail |

### `groups/{gid}/invites/{token}` — token IS the doc id (unguessable, non-listable)
| Field | Type | Notes |
|---|---|---|
| role | `member` \| `guest` | Admins are promoted explicitly, never via link (F-03 hardening) |
| expiresAt | ts | Required; UI offers 24 h / 7 d / 30 d |
| revoked | bool | |
| createdBy | uid | |
| createdAt | ts | |
| label | string ≤ 40 | "posted in club Discord" — admin's memory aid |

### `groups/{gid}/repos/{repoId}` — repoId = GitHub numeric repo id (string)
| Field | Type | Notes |
|---|---|---|
| fullName | string | `owner/name`; updated on rename detection |
| htmlUrl, description, language, topics[] | | Card display (R-01) |
| githubOwnerLogin | string | |
| ownerUid | uid \| null | The member who owns it on GitHub (if they're in the group) |
| registeredBy | uid | |
| status | `idea` \| `building` \| `paused` \| `done` | F-10; owner/admin-writable |
| demoUrl | string \| null | Validated `https://` |
| archived | bool | |
| lastEventAt | ts \| null | Drives "Active this week" ordering |
| poll | map | `{ lastPolledAt: ts, etag: string, failing: bool }` — engine state (ARCH §5) |
| stats7d | map | `{ commits, prsOpened, prsMerged, issues, releases }` — recomputed during polls |
| createdAt | ts | |

### `groups/{gid}/repos/{repoId}/events/{eventId}` — eventId = GitHub event id
| Field | Type | Notes |
|---|---|---|
| type | string enum | push, pr_opened, pr_merged, issue_opened, issue_closed, release, branch_created, fork |
| actorLogin, actorAvatarUrl | string | |
| summary | string ≤ 200 | Pre-rendered line: "3 commits to main" |
| url | string | Deep link to GitHub |
| occurredAt | ts | From GitHub payload |
| source | `"poll"` | `"webhook"` reserved for Phase 3 |
| expireAt | ts | occurredAt + 180 d → **Firestore TTL policy** deletes it (PRD §11 retention, zero code) |

### `groups/{gid}/repos/{repoId}/activityDaily/{YYYY-MM-DD}`
`{ commits, prsOpened, prsMerged, issuesOpened, releases: number }` — increment-merged
during ingestion; a 14-day query renders the sparkline. Kept forever (tiny).

### `groups/{gid}/asks/{askId}`
| Field | Type | Notes |
|---|---|---|
| kind | `ask` \| `stuck` | F-06 / F-07 share one collection |
| title | string 4–120 | Stuck flags: title only |
| detail | string ≤ 500 | |
| tags | string[] ≤ 8 | From `group.settings.askTags` ∪ defaults |
| repoId | string \| null | Free-standing asks allowed |
| pairingUrl | string \| null | R-16 early: Live Share/Codespaces link on an ask |
| authorUid, authorLogin, authorAvatarUrl | | |
| state | `open` \| `claimed` \| `resolved` | Transitions rules-enforced (SECURITY §3) |
| claimCount | number | Mirror of claims subcollection size (display) |
| createdAt, resolvedAt | ts | Resolved-this-week metric = `count()` on `resolvedAt` range |

### `groups/{gid}/asks/{askId}/claims/{uid}`
`{ login, avatarUrl, note ≤ 140, claimedAt }` — doc id = claimant uid (one claim per
member, multiple claimers fine — F-08).

### `groups/{gid}/collabRequests/{reqId}`
| Field | Type | Notes |
|---|---|---|
| repoId, repoFullName | | |
| requesterUid, requesterLogin | | |
| note | string ≤ 280 | |
| githubIssueNumber | number \| null | Written after issue creation succeeds |
| state | `pending` \| `accepted` \| `declined` \| `cancelled` | Only repo `ownerUid` or admin may decide (rules) |
| decidedBy, decidedAt | | |
| createdAt | ts | |

### `groups/{gid}/integrations/discord`
`{ webhookUrl, channelLabel, postAsks, postClaims, postCollabs, postShipped: bool,
configuredBy, updatedAt }` — readable by members (their clients post to it), writable
by admins. Risk analysis in SECURITY §7.

### `groups/{gid}/auditLog/{entryId}`
`{ actorUid, actorLogin, action, subjectType, subjectId, detail ≤ 200, createdAt }` —
create-only by members for privileged actions (role change, removal, invite revoke,
integration change, repo archive); readable by admins (A-04 groundwork).

## 3. Composite indexes (declared in `firestore.indexes.json` from day one)

| Collection | Fields | Feeds |
|---|---|---|
| asks | state ASC, createdAt DESC | Open-asks block, ask history |
| asks | authorUid ASC, createdAt DESC | "Your activity" |
| repos | archived ASC, lastEventAt DESC | Active this week |
| events (collectionGroup off — scoped per repo) | occurredAt DESC | Repo feed |
| collabRequests | state ASC, createdAt DESC | Owner inbox |

## 4. Query patterns per screen (read-cost discipline)

| Screen | Listeners (live) | One-shot |
|---|---|---|
| Home | repos (≤ 50, non-archived), asks `state in [open, claimed]` limit 25 | resolved-count aggregation |
| Your activity | asks by author limit 10 | my claims (collectionGroup where uid == me… avoided: claims carry `groupId`+`authorUid`? No — my claimed asks resolved via `claims` docs keyed by uid using a collectionGroup query with a rules filter, limit 10) |
| Repo detail | events limit 30, activityDaily last 14 | contributors (cached in doc) |
| Members | members (≤ 50) | — |

Rule of thumb: a Home session ≈ 80–120 document reads cold, ~0 warm (IndexedDB cache
+ only-changed-docs delta). See §7 for why this fits the free tier.

## 5. Data lifecycle

- **Events**: TTL-deleted at 180 days (PRD §11) after being folded into `activityDaily`.
- **Leaving a group** (PRD §11 privacy): membership doc deleted; the leaver's asks/
  claims/posts get `authorLogin: "(left the group)"`, `authorUid` retained (rules need
  it) but avatar dropped. A `util/anonymize.ts` batch does this client-side at leave time.
- **Repo deregistration**: doc + subcollections deleted by owner/admin (batched client
  delete; subcollection sweep capped at 500/batch, looped).
- **Group deletion**: Phase 2 admin tool (requires typed confirmation; audit-logged).

## 6. Consistency notes

- Idempotency by construction: natural IDs for events; transactions only for poll
  claims and invite acceptance; everything else is last-write-wins on
  author-owned docs (safe: single writer per doc by rule).
- `claimCount` / `memberCount` are cosmetic mirrors — they may drift under races and
  that is acceptable; truth = subcollection `count()` used anywhere it matters.
- Clock skew: rules compare against `request.time`, never client clocks.

## 7. Free-tier quota math (Spark: 50 K reads / 20 K writes / 1 GiB per day-ish)

Assume the PRD's heavy case: 1 group, 40 members, 100 repos, 25% daily actives.

| Load | Estimate |
|---|---|
| Reads: 10 actives × ~120 cold + deltas | ~2.5 K/day |
| Writes: polling (100 repos × 24 cycles hitting ~15% with news × ~4 docs) | ~1.5 K/day |
| Writes: asks/claims/presence | < 300/day |
| Storage: events ≤ 200 B × ~40 K live rows | ~10 MB |

Order-of-magnitude headroom everywhere. The dangerous pattern would be unbounded
listeners — hence the per-screen listener table in §4 and detach-on-navigate rule.
