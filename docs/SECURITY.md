# RepoCircle — Security Design

"The app needs to be secure in every way." In a serverless static app the security
budget concentrates in five places, each covered below:

1. **Firestore security rules** — the only server-side authorization layer (§3)
2. **GitHub token handling** — the most valuable secret we touch (§5)
3. **XSS discipline + CSP** — a static app's classic downfall (§6)
4. **Invite-link + integration design** — the social attack surface (§4, §7)
5. **Supply chain + release hygiene** — public repo, auto-deploy (§8)

## 1. Assets and adversaries

| Asset                                          | Impact if compromised                                    |
| ---------------------------------------------- | -------------------------------------------------------- |
| Members' GitHub OAuth tokens (`public_repo`)   | Write access to victims' public repos — the crown jewels |
| Group private data (asks, availability, notes) | Privacy breach of a semi-private social space            |
| Discord webhook URL                            | Channel spam/phishing until regenerated                  |
| Firestore quota / GitHub rate limits           | Denial of service, surprise lockout                      |
| The deployed site itself (Pages + Actions)     | Full XSS-equivalent compromise of all users              |

| Adversary                          | Capabilities assumed                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outsider**                       | Knows all URLs and the public Firebase config (it _is_ public); can call Firestore/Auth APIs directly with arbitrary payloads — **rules are the only wall** |
| **Invite-link leaker**             | Got a link shared beyond the group                                                                                                                          |
| **Malicious / compromised member** | Valid auth; can run arbitrary requests against Firestore within what rules allow, and post garbage data                                                     |
| **XSS attacker**                   | Tries to smuggle scripts through user-controlled strings (titles, notes, repo descriptions _from GitHub_, ...)                                              |
| **Supply-chain attacker**          | Typosquatted/compromised npm package or GitHub Action                                                                                                       |

Non-goals for Phase 1 (documented, not hidden): protection against a malicious _group
admin_ (they govern the group by design), and cryptographic truth of activity data
(see §4 "fabricated events").

## 2. Trust boundaries

Every request crosses: browser → (Firebase Auth ID token) → Firestore rules, or
browser → (user's own GitHub token) → GitHub. No cross-user credential exists. The
static bundle is public; **nothing in the repo or bundle is secret** — the GitHub
OAuth client secret lives only inside Firebase's provider config console.

## 3. Firestore rules — draft v1 (finalized + tested in M1/M8)

Principles: **default deny**; membership gate on every group path; role checks for
privileged writes; shape validation (types, lengths, enums) on every create/update;
state machines enforced server-side; no `list` on secrets-by-URL (invites).

> **`firestore.rules` is the truth; the listing below is the original draft.**
> Keeping a second copy of a 600-line policy in prose guarantees the copy is wrong,
> so this section deliberately stops short of reproducing it. What follows the
> listing is a record of every match block added since the draft and the reasoning
> that is _not_ recoverable from reading the rules themselves.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function me() { return request.auth.uid; }
    function memberPath(gid) {
      return /databases/$(database)/documents/groups/$(gid)/members/$(me());
    }
    function isMember(gid) { return signedIn() && exists(memberPath(gid)); }
    function memberRole(gid) { return get(memberPath(gid)).data.role; }
    function canWrite(gid) { return isMember(gid) && memberRole(gid) in ['admin','member','mentor']; }
    function isAdmin(gid) { return isMember(gid) && memberRole(gid) == 'admin'; }
    function str(x, min, max) { return x is string && x.size() >= min && x.size() <= max; }

    match /users/{uid} {
      allow get, create, update: if signedIn() && me() == uid
        && !('token' in request.resource.data)        // belt-and-braces: no token-ish fields
        && !('accessToken' in request.resource.data);
      allow list, delete: if false;
    }

    match /groups/{gid} {
      allow get: if isMember(gid);
      allow list: if false;                            // groups are joined by id/invite, never browsed
      allow create: if signedIn()
        && request.resource.data.createdBy == me()
        && str(request.resource.data.name, 3, 50);
      allow update: if isAdmin(gid);
      allow delete: if false;                          // Phase 2 tool, deliberate ceremony

      match /members/{uid} {
        allow read: if isMember(gid);
        // Join: self, with a live invite; role comes from the invite, founder path in group create batch
        allow create: if signedIn() && me() == uid && (
          request.resource.data.joinedVia == 'founder'
            ? getAfter(/databases/$(database)/documents/groups/$(gid)).data.createdBy == me()
              && request.resource.data.role == 'admin'
            : inviteValid(gid, request.resource.data.joinedVia)
              && request.resource.data.role ==
                 get(/databases/$(database)/documents/groups/$(gid)/invites/$(request.resource.data.joinedVia)).data.role
        );
        // Self-edit: availability/tags/checklist only. Role changes: admin only, never self.
        allow update: if (me() == uid && isMember(gid)
              && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['availability','helpWith','learning','checklist','login','name','avatarUrl']))
          || (isAdmin(gid) && me() != uid
              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['role']));
        allow delete: if me() == uid || isAdmin(gid);  // leave, or admin removal (audit-logged)
      }

      function inviteValid(gid, token) {
        let inv = get(/databases/$(database)/documents/groups/$(gid)/invites/$(token)).data;
        return inv.revoked == false && inv.expiresAt > request.time;
      }

      match /invites/{token} {
        allow get: if signedIn();                      // token in hand = may inspect that one invite
        allow list: if false;                          // NEVER enumerable
        allow create: if isAdmin(gid)
          && request.resource.data.role in ['member','guest']   // no admin-by-link
          && request.resource.data.expiresAt <= request.time + duration.value(30, 'd');
        allow update: if isAdmin(gid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['revoked','label']);
        allow delete: if isAdmin(gid);
      }

      match /repos/{repoId} {
        allow read: if isMember(gid);
        allow create: if canWrite(gid)
          && repoId.matches('[0-9]{1,16}')
          && request.resource.data.registeredBy == me()
          && str(request.resource.data.fullName, 3, 140);
        allow update: if canWrite(gid);                // poll state is shared-write; field caps in validation fn (M8 tightens)
        allow delete: if isAdmin(gid) || resource.data.registeredBy == me()
          || resource.data.ownerUid == me();

        match /events/{eventId} {
          allow read: if isMember(gid);
          allow create: if canWrite(gid)
            && str(request.resource.data.summary, 1, 200)
            && request.resource.data.occurredAt is timestamp;
          allow update, delete: if false;              // append-only; TTL reaps
        }
        match /activityDaily/{day} {
          allow read: if isMember(gid);
          allow write: if canWrite(gid) && day.matches('20[0-9]{2}-[0-9]{2}-[0-9]{2}');
        }
      }

      match /asks/{askId} {
        allow read: if isMember(gid);
        allow create: if canWrite(gid)
          && request.resource.data.authorUid == me()
          && request.resource.data.state == 'open'
          && request.resource.data.kind in ['ask','stuck']
          && str(request.resource.data.title, 4, 120)
          && request.resource.data.detail.size() <= 500
          && request.resource.data.tags.size() <= 8;
        // State machine: open->claimed (any writer), open/claimed->resolved (author/admin), edits by author
        allow update: if canWrite(gid) && (
          (resource.data.authorUid == me()
             && request.resource.data.authorUid == resource.data.authorUid)
          || isAdmin(gid)
          || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['state','claimCount'])
              && resource.data.state == 'open' && request.resource.data.state == 'claimed')
        );
        allow delete: if resource.data.authorUid == me() || isAdmin(gid);

        match /claims/{uid} {
          allow read: if isMember(gid);
          allow create: if canWrite(gid) && me() == uid
            && request.resource.data.note.size() <= 140;
          allow delete: if me() == uid || isAdmin(gid);
          allow update: if false;
        }
      }

      match /collabRequests/{reqId} {
        allow read: if isMember(gid);
        allow create: if canWrite(gid)
          && request.resource.data.requesterUid == me()
          && request.resource.data.state == 'pending'
          && str(request.resource.data.note, 1, 280);
        // Decide: repo owner or admin; cancel: requester
        allow update: if isMember(gid) && (
          (resource.data.state == 'pending'
             && request.resource.data.state in ['accepted','declined']
             && (isAdmin(gid)
                 || get(/databases/$(database)/documents/groups/$(gid)/repos/$(resource.data.repoId)).data.ownerUid == me()))
          || (resource.data.requesterUid == me() && request.resource.data.state == 'cancelled')
        );
        allow delete: if false;
      }

      match /integrations/{kind} {
        allow read: if isMember(gid);                  // members' clients post to the webhook (see §7)
        allow write: if isAdmin(gid) && kind in ['discord','slack'];
      }

      match /auditLog/{entryId} {
        allow read: if isAdmin(gid);
        allow create: if isMember(gid) && request.resource.data.actorUid == me();
        allow update, delete: if false;
      }
    }

    match /{document=**} { allow read, write: if false; }   // default deny backstop
  }
}
```

Known refinements queued for M8 hardening (tracked in PLAN): per-field validation on
`repos` update (split poll-state writes from metadata writes), tag content regex,
`getAfter` founder-batch verification on group create, and a `duration`-based cap on
`availability.until`.

### 3b. Added since the draft — and why

| Path                                               | Who may write                                                                              | The decision worth recording                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups/{gid}/ideas/{ideaId}` (M15)                | any writing member; germination also by an admin or the linked repo's owner                | Someone else building your idea is the value moment, not an edge case, so the link is not author-only                                                                                                                              |
| `.../{repos,ideas,asks}/{id}/comments/{id}` (M10)  | author edits and deletes own; subject owner and admins moderate                            | Stored raw, rendered as text nodes only (§6)                                                                                                                                                                                       |
| `.../{repos,ideas}/{id}/interests/{uid}` (M9/M15)  | self only, doc id = uid                                                                    | `gid` and `repoOwnerUid` are **spoof-checked against the parent** — they route someone's away-inbox, so a forgeable value would be an inbox-injection primitive                                                                    |
| `users/{uid}/watches/{watchId}` (M12, widened M18) | self only                                                                                  | Pre-M18 key set stays allowed so old saves keep resolving; `kind` is a closed enum                                                                                                                                                 |
| `groups/{gid}/meta/summary` (M16)                  | any member for the counts, **admins only** for `links`/`pinnedRepoId`                      | Split by `affectedKeys()`. Guests may move the counts: a member count left wrong by one after a guest joins is a visible lie, and that costs more than the blast radius of a shape-capped display document that authorizes nothing |
| `groups/{gid}/announcements/{annId}` (M17)         | admins create; **nobody updates**                                                          | Append-only by design — an announcement is a statement made at a moment, so correcting it means posting again rather than rewriting what people already read                                                                       |
| `groups/{gid}/sessions/{sessionId}` (M19)          | any writing member creates; host or admin edits and cancels; anyone may move `rsvpCount`   | Calling a session is a circle ritual, not an admin function. `hostUid` is immutable — rules refuse reassignment, the same hole that was closed for repo `ownerUid` in M12                                                          |
| `.../sessions/{sessionId}/interests/{uid}` (M19)   | self only                                                                                  | Same shape as the other interests **on purpose**, so the existing collection-group read rule and index cover RSVPs; `repoOwnerUid` spoof-checked against the session                                                               |
| `groups/{gid}/polls/{pollId}` (M19)                | any writing member creates; voting moves `options` only while open; author or admin closes | Question and author are immutable across an update, so a voter cannot rewrite what was asked                                                                                                                                       |
| `.../polls/{pollId}/votes/{uid}` (M19)             | self only, doc id = uid, only while the poll is open                                       | **One vote per member is structural, not enforced** — there is no rule to get wrong                                                                                                                                                |
| `member.helpWith` / `member.domainTags` (M11/M17)  | self only                                                                                  | Closed vocabularies. The join screen offers chips rather than a text field, which is what keeps the values joinable — and rules can enforce a vocabulary where they could never enforce prose                                      |
| `users/{uid}.circlePrefs` (M18)                    | self only                                                                                  | Map-shaped; a bad value degrades to `all`                                                                                                                                                                                          |

Two limits the rules genuinely cannot reach, held elsewhere instead:

- **A poll decides a question; it never rates people or their work** (ADR-024).
  Rules cannot read semantics, so this is held by the ADR and by what the composer
  asks for — the same mechanism ADR-014 uses for availability tone.
- **Cross-circle repo surfacing requires mutual membership** (ADR-025). There is no
  rule for this because there is no shared index to guard: a `publicRepos/{id}`
  registry would leak the existence of private circles to anyone holding a repo id,
  so the feature resolves by reading one document per circle the viewer already
  belongs to, and shows nothing to anyone else.

## 4. Residual risks accepted for Phase 1 — stated, not silent

| Risk                                       | Why accepted                                                         | Compensating control / future fix                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Member fabricates activity events          | Rules validate shape, not truth vs GitHub                            | Events carry `actorLogin` + deep `url` (fakes are conspicuous); trust-bounded groups; Phase-3 Worker webhooks make ingestion trustworthy |
| Member reads Discord webhook URL and spams | Members are in that Discord server anyway; regeneration is one click | §7 mitigations; Worker relay in Phase 3 hides the URL entirely                                                                           |
| Last-admin lockout (admin leaves)          | Rules can't count admins cheaply                                     | Client blocks leaving as last admin; recovery = Firebase console (documented in SETUP)                                                   |
| Denormalized display names drift           | Cosmetic only                                                        | Opportunistic refresh on author activity                                                                                                 |

## 5. GitHub token policy

- Scopes: start `read:user user:email`; escalate to `public_repo` contextually
  (PRD F-01). Never request `repo` (private) in any phase of this design.
- Storage: **in-memory + sessionStorage only** (per-tab, non-persistent). Never
  Firestore, never localStorage, never cookies, never logs, never error reports.
- Every GitHub call goes through one `github/client.ts` chokepoint which: injects the
  token from the vault, strips it from any thrown error, enforces the rate-limit
  guard, and refuses non-`api.github.com` URLs (no token exfiltration via
  attacker-supplied URL fields — `demoUrl`/`pairingUrl` are _never_ fetched, only
  rendered as links).
- Sign-out wipes the vault; "Disconnect GitHub" instructions (revoke at
  github.com/settings/applications) in the app's security page.
- Why not encrypt-in-Firestore (PRD §9.1 "encrypted at rest")? Client-side encryption
  with a client-held key adds no wall an XSS can't jump, and server-held keys need a
  server. Not storing the token at all is strictly stronger than encrypting it.

## 6. XSS discipline and CSP

- **No `innerHTML`/`dangerouslySetInnerHTML` anywhere.** Preact renders text nodes;
  an ESLint rule (`no-restricted-properties`) enforces the ban in CI.
- All user/GitHub-sourced strings are treated as hostile: rendered as text, length-
  capped at write time by rules and at render time by CSS truncation.
- URLs (`demoUrl`, `pairingUrl`, event `url`): allowlist `https:` scheme at write
  time (client) + render with `rel="noopener noreferrer nofollow"`, `target=_blank`.
- Markdown (Phase 2 threads, R-09): rendered with `marked` + **DOMPurify** with a
  tight allowlist (no images-by-URL in v1, no raw HTML passthrough) + CSP as backstop.
- **CSP** served via `<meta http-equiv="Content-Security-Policy">` (Pages can't set
  headers):
  `default-src 'none'; script-src 'self' https://apis.google.com (Firebase Auth popup relay); style-src 'self'; font-src 'self';
img-src 'self' https://avatars.githubusercontent.com https://opengraph.githubassets.com data:;
connect-src 'self' https://api.github.com https://*.googleapis.com
https://securetoken.googleapis.com https://identitytoolkit.googleapis.com
https://discord.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none';
manifest-src 'self'; worker-src 'self'`.
  All JS/CSS/fonts are bundled locally (no CDNs) precisely so `'self'` works.
- No inline scripts, no inline styles, no `eval` (Vite configured accordingly).

## 7. Discord webhook — contained blast radius

- Stored per group; **writable by admins only, readable by members** (their clients
  post). Documented to admins at setup: "any member could extract this URL; treat it
  like the channel is group-writable — it already is."
- Posts are throttled client-side (≥ 15 s between posts per client) and the payload is
  always app-templated (title + backlink), never raw user HTML/mentions
  (`allowed_mentions: { parse: [] }` suppresses @everyone pings).
- Compromise response: regenerate webhook in Discord, paste new URL. One minute, no
  code. Sensitive groups can skip the integration entirely — it's optional.

## 8. Supply chain, CI and release hygiene

- Dependencies: minimal set (preact, firebase, marked+dompurify in P2, dev: vite,
  typescript, vitest, eslint). Lockfile committed; `npm audit` + `npm outdated` in CI;
  Dependabot on.
- GitHub Actions: official actions only, **pinned to commit SHAs**; workflow
  permissions: `contents: read, pages: write, id-token: write` and nothing else;
  deploys only from `main`.
- Branch protection on `main` once collaborators exist.
- No-secrets invariant: nothing in the repo is secret, so a leak of the repo is a
  leak of nothing. `gitleaks` runs in CI anyway to catch accidents.
- App Check (abuse throttling for Firestore): evaluated in M8 — ships only if it
  doesn't break iOS PWA sign-in (known friction); rules never rely on it.

## 9. Privacy (PRD §11)

Only public GitHub data is read (`public_repo` scope, public repos). Emails from
GitHub are used for auth identity only — never displayed to the group, never mailed
in Phase 1. Leave-group anonymization is specified in DATA-MODEL §5. No analytics,
no trackers, no third-party requests beyond the four hosts in the CSP.

## 10. Rules test plan (runs in CI against the emulator — M1 onward, hardened M8)

`@firebase/rules-unit-testing` suites, one file per collection, run in CI against the
emulator on every push. **202 cases as of M20** (117 at M15). The matrix:

- Outsider (unauthenticated / non-member): denied every read & write on every group path ✓
- Guest & alumnus: can read everything group-scoped, denied every write surface ✓
- Member: CRUD own asks; cannot edit others' asks; can claim once (doc id = own uid);
  cannot claim as someone else; cannot resolve others' asks; state transitions
  open→claimed→resolved enforced; oversize title/detail/tags rejected ✓
- Invites: get-by-token works signed-in; `list` denied for members/outsiders, allowed for admins (management screen); join with
  expired/revoked invite denied; role escalation via forged membership role denied;
  admin-role invite creation denied ✓
- Members: self role change denied; admin role change of _other_ member allowed;
  self-edit limited to allowed keys; removal by admin allowed, by member denied ✓
- Repos/events: create with non-numeric repoId denied; event update/delete denied
  (append-only); non-member ingestion denied ✓
- CollabRequests: decide by random member denied; by repo owner allowed; by admin
  allowed; cancel by requester allowed ✓
- Integrations: member read allowed, member write denied, admin write allowed ✓
- users/{uid}: cross-uid read/write denied; token-shaped field write denied ✓
- Skills (M11) & domain tags (M17): closed vocabularies enforced; oversize lists
  denied; setting another member's denied; a joiner may bring both in at create ✓
- Summary doc (M16): counters move by increment; guests may maintain them; a member
  cannot set `links` or `pinnedRepoId`, including smuggled in at create time; an
  admin can; ordinary maintenance still works on a circle that has links ✓
- Announcements (M17): admin-only create, author must be the poster, body bounds,
  **nobody can edit one**, admin-only delete ✓
- Saved items (M18): new and pre-M18 shapes both accepted, `kind` enum enforced,
  another user's watches unreachable ✓
- Sessions (M19): member creates, guest cannot, host immutable, cannot be born
  cancelled, duration and https bounds; host or admin cancels; a bystander may move
  `rsvpCount` but not the time; RSVP host field and `gid` cannot be forged ✓
- Polls (M19): 2–5 options, cannot be born closed, voter cannot rewrite the question
  or close it, author and admin can; **a closed poll refuses further votes**; nobody
  can vote as someone else; changing your own vote allowed ✓
- Default-deny: write to an undeclared path denied ✓

Two things the suite does **not** cover, stated so they are not mistaken for covered:
the emulator does not enforce composite indexes (a query missing one passes locally
and fails in production — only a real deploy catches it), and it cannot exercise the
GitHub API or a real OAuth token.

## 11. Security release checklist (every milestone, gate for M8/launch)

- [ ] Rules test suite green against the emulator
- [ ] `npm audit` clean (or documented exceptions)
- [ ] ESLint XSS bans green; grep for `innerHTML` returns nothing
- [ ] CSP present in built `index.html`; no console CSP violations in a full manual pass
- [ ] No token appears in: Firestore export, localStorage, logs, error UI (manual check)
- [ ] Invite expiry + revocation verified live
- [ ] Rate-limit guard verified (mock 403/`X-RateLimit-Remaining: 0`)
- [ ] New third-party hosts? CSP + this doc updated deliberately
