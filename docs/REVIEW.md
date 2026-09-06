# RepoCircle — Failure-Class Review

The system behind bug-fixing. A bug is never fixed alone: name its class, sweep
the whole codebase for the class, fix every instance, and add the class here.
Every milestone's Definition of Done includes re-running this checklist against
the diff (PLAN §10). Written 2026-09-06 after three point-fixes in one day turned
out to be the same bug three times.

## Class A — A mirror is a hint; the authoritative doc is the truth

Denormalized copies (users.groupIds, githubOwnerLogin, ownerLeft, count mirrors,
login/avatar snapshots) exist for display and routing. **Never derive an action
or a verdict from one when the authoritative record is readable.** Destructive
actions keyed on a mirror are the worst form.

Bit us: Join redirected on stale groupIds (rejoin dead end); "Open for adoption"
keyed on githubOwnerLogin (reappeared after adoption); owner-left banner ignored
a rejoined owner; watches auto-deleted on a groupIds miss.

Sweep: grep reads of every denormalized field; each is either display-only,
rules-verified at write, or backed by an authoritative check before acting.

## Class B — An error state must either retry or be dismissible; never latch

Every listener/fetch has a give-up path. If that path sets state, something must
be able to unset it: an automatic bounded retry, a visible Try-again, or at
minimum the shared staleboard banner — silence is the bug.

Bit us: activeDenied latched after a slow join commit ("not a member" forever);
repos watches logged a warning and left a skeleton with no way out.

Sweep: every onGiveUp / catch that changes UI state names its recovery.

## Class C — Counters change by increment(), never read-modify-write

`count: current + 1` races: two writers, one lost update, and the UI value used
as the base may itself be stale. Firestore's increment() is the only safe form
for mirror counters. (State machines that must branch on the count are allowed
to read it, but say so in a comment.)

Bit us (latent): claimCount, interestCount both raced. commentCount was already
correct — inconsistency is itself the smell.

Sweep: grep `Count: (`, `+ 1`, `- 1`, `currentCount` in src/data.

## Class D — Deployed code changes; open tabs must find out

A PWA tab can run yesterday's bundle forever. Any "X isn't working" report must
first answer: which bundle? The app now checks for a new service worker on
visibility change and every 30 minutes, and shows a reload bar when one takes
over. Testing rule: fresh navigations (what the agent does) mask this class —
the user's long-lived tabs are the real environment.

Bit us: six same-day deploys; open tabs kept pre-M12 code; "so many things not
working" was mostly one thing.

## Class E — On a live page, data is live; one-shot fetches go stale

Pages built on onSnapshot must not mix in getDocs for sibling data that can
change while the page is open — the mixed block silently freezes. One-shot is
fine where staleness is the design (the away-inbox digest) — write that down.

Bit us: Building together and the repo journey used one-shot collab fetches
beside five live blocks.

Sweep: per view, list its data sources; each is watch or documented-digest.

## Class F — Shared predicates live in one place

The same rule written twice drifts (the adoption pill had its own owner check
and was wrong; ownsRepo was right). canWriteRole(), circleOwner(), ownsRepo()
are the only spellings of those rules.

Sweep: grep for role/ownership/permission expressions outside util helpers.

## Deliberate exceptions

- Best-effort writes (checklist ticks, audit lines, markSeen) swallow errors by
  design: losing one is cheaper than interrupting the user's real action.
- The away-inbox and watched-repos are visit-time digests (ADR-019).
- unclaimAsk still branches state on a read claim count — noted inline; a
  concurrent unclaim can leave state 'claimed' with zero claims, self-healing
  on the next claim.
