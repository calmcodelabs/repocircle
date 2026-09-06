/**
 * The failure classes, made executable (REVIEW.md, TESTING.md §7).
 *
 * REVIEW.md exists because three point-fixes in one day turned out to be the
 * same bug three times. Its sweep is a human discipline; this file is the half a
 * machine can hold. Each class below gets a manifest of the instances that exist
 * today, every entry saying why it is correct — and the gate in
 * test/static/classes.test.ts fails when an instance appears that is not listed.
 *
 * That shape is deliberate. A grep cannot tell a display read from a decision,
 * so it must not pretend to; what it *can* do is refuse to let a new one appear
 * without a human writing down which it is. Entries are keyed on the exact
 * source line rather than a line number, so moving code is free but editing it
 * forces the justification to be re-read.
 *
 * Reducing these lists is real work, not bookkeeping: several entries are the
 * duplication REVIEW.md warns about, still present.
 */

export type Instance = {
  /** Source file, repo-relative. */
  file: string;
  /** The exact trimmed source line. Edits force a re-review; moves do not. */
  line: string;
  /** Why this instance is correct — or, if it is not, what should replace it. */
  why: string;
  /** Set when this is a real violation kept for now; it is the backlog. */
  violation?: boolean;
};

// ---------------------------------------------------------------- Class A

/**
 * Denormalized fields. Reading one is fine; *acting* on one when the
 * authoritative record is readable is the bug (REVIEW.md Class A).
 */
export const MIRROR_FIELDS = ['groupIds', 'githubOwnerLogin', 'ownerLeft', 'adoptedFromLogin'];

/**
 * The count mirrors are deliberately NOT in the list above. ADR-021 makes them
 * display-only, and the guarantee behind that is structural rather than a
 * matter of call-site discipline: firestore.rules never reads the summary
 * document, so no count can authorize anything no matter how a view uses it.
 * classes.test.ts asserts exactly that, which is a stronger check than grepping
 * every `{memberCount}` in JSX.
 */
export const COUNT_MIRRORS = [
  'memberCount',
  'repoCount',
  'openAskCount',
  'claimCount',
  'interestCount',
  'commentCount',
  'rsvpCount',
];

/** Reads of a mirror that feed a branch, filter or return. */
export const MIRROR_DECISIONS: Instance[] = [
  {
    file: 'src/views/App.tsx',
    line: 'if (u === null || u.groupIds.length === 0) return <Onboard />;',
    why: 'Routing only, and the fallback is Onboard — the screen that recovers from a stale mirror rather than a dead end. A wrong answer costs one extra screen, never access.',
  },
  {
    file: 'src/views/GroupShell.tsx',
    line: 'const inMyList = myUserDoc.value?.groupIds.includes(gid) ?? false;',
    why: 'Reached only after activeDenied, where the membership document has already been read authoritatively and found absent. The mirror picks which recovery copy to show, not whether access is denied.',
  },
  {
    file: 'src/views/AlsoIn.tsx',
    line: 'const groupIds = myUserDoc.value?.groupIds ?? [];',
    why: 'Candidate list for the cross-circle probe; every candidate is confirmed by a real read below.',
  },
  {
    file: 'src/views/AlsoIn.tsx',
    line: 'const others = groupIds.filter((g) => g !== gid).slice(0, 7);',
    why: 'Each candidate is then confirmed by a read under rules (ADR-025), so a stale entry yields nothing rather than a false badge.',
  },
  {
    file: 'src/views/PersonalHome.tsx',
    line: 'const groupIds = me?.groupIds ?? [];',
    why: 'The list of circles to show on the personal home. A stale gid renders a card whose reads then fail closed.',
  },
  {
    file: 'src/views/PersonalHome.tsx',
    line: 'void fetchInbox(me.groupIds, u.uid, me.login, me.lastSeenAt, me.circlePrefs ?? {}).then(',
    why: 'Chooses which circles the away-inbox queries. A stale gid returns nothing under rules.',
  },
  {
    file: 'src/views/PersonalHome.tsx',
    line: 'void fetchSaved(u.uid, me.groupIds).then((s) => alive && setSaved(s));',
    why: 'Same: scopes a read. M18 stopped auto-deleting watches on a groupIds miss precisely because that was acting on the mirror.',
  },
  {
    file: 'src/data/inbox.ts',
    line: "const gids = groupIds.filter((g) => prefs[g] !== 'mute').slice(0, GROUP_CAP);",
    why: 'Chooses which circles to query. A stale gid costs a wasted query, never wrong content.',
  },
  {
    file: 'src/views/RepoDetail.tsx',
    line: '{repo.ownerLeft && !liveOwner && (',
    why: 'The `!liveOwner` term is the authoritative check — a rejoined owner clears the banner even while the mirror still says otherwise. This is the pattern the class prescribes.',
  },
  {
    file: 'src/views/RepoDetail.tsx',
    line: '{!repo.ownerLeft && !repo.adoptedByLogin && repo.seekingOwner && (',
    why: 'Display of a chip. No action keys on it; the adoption action re-checks ownership itself.',
  },
  {
    file: 'src/views/RepoDetail.tsx',
    line: 'crediting @{repo.adoptedFromLogin ?? repo.githubOwnerLogin} as the starter. On GitHub',
    why: 'Credit line — history, recorded at the moment it was true.',
  },
  {
    file: 'src/data/repos.ts',
    line: 'adoptedFromLogin: repo.adoptedFromLogin ?? repo.githubOwnerLogin,',
    why: 'Writes the credit line at handover, which is exactly when the mirror is accurate.',
  },
  {
    file: 'src/util/journey.ts',
    line: 'text: `started by @${repo.adoptedFromLogin ?? repo.githubOwnerLogin}`,',
    why: 'Journey entry — a historical fact, rendered as text.',
  },
  {
    file: 'src/util/journey.ts',
    line: 'login: repo.adoptedFromLogin ?? repo.githubOwnerLogin,',
    why: 'Same journey entry, the link target.',
  },
  {
    file: 'src/util/skills.ts',
    line: 'return r.ownerUid === m.uid || r.githubOwnerLogin.toLowerCase() === m.login.toLowerCase();',
    why: 'The body of ownsRepo. The login comparison is the deliberate fallback for repos whose ownerUid was never resolved; ownerUid is checked first and wins.',
  },
];

// ---------------------------------------------------------------- Class B

/**
 * Every listener give-up path, and what can undo the state it sets. An error
 * state that nothing can clear is the bug; silence is the smell (REVIEW.md
 * Class B). Whether the recovery *works* is a component test (T3) — this
 * manifest only guarantees one was named.
 */
export const ERROR_RECOVERIES: Instance[] = [
  {
    file: 'src/data/resilientWatch.ts',
    line: 'opts: { retries?: number; onGiveUp?: (code: string) => void; baseDelayMs?: number } = {},',
    why: 'The definition. The bounded retry it implements is the first recovery every caller inherits.',
  },
  {
    file: 'src/data/resilientWatch.ts',
    line: 'opts.onGiveUp?.(err.code);',
    why: 'The give-up call itself, after the bounded retries are spent.',
  },
  {
    file: 'src/data/activeGroup.ts',
    line: 'onGiveUp: (code) => {',
    why: 'Group and membership watches. Recovery: noteDenied re-subscribes once after a pause, then the denied screen offers Try again (retryActiveGroup); resource-exhausted and unavailable never set the denial at all.',
  },
  {
    file: 'src/data/repos.ts',
    line: '{ onGiveUp: onError },',
    why: 'Passes through to the calling block, which surfaces the shared staleboard banner.',
  },
  {
    file: 'src/data/asks.ts',
    line: '{ onGiveUp: onError },',
    why: 'Passes through to the calling block, which surfaces the shared staleboard banner.',
  },
  {
    file: 'src/data/ideas.ts',
    line: '{ onGiveUp: onError },',
    why: 'Passes through to the calling block, which surfaces the shared staleboard banner.',
  },
  {
    file: 'src/data/members.ts',
    line: '{ onGiveUp: onError },',
    why: 'Passes through to the calling block, which surfaces the shared staleboard banner.',
  },
  {
    file: 'src/data/summary.ts',
    line: '{ onGiveUp: onError },',
    why: 'Counts going missing is cosmetic; activeGroup logs it and never turns it into a denial verdict.',
  },
  {
    file: 'src/data/sessions.ts',
    line: 'onGiveUp: (code) => {',
    why: 'Coming-up block logs and clears to an empty list, which renders its own empty state rather than a stuck skeleton.',
  },
  {
    file: 'src/data/polls.ts',
    line: 'onGiveUp: (code) => {',
    why: 'Poll card logs and clears to no-poll, which renders nothing rather than a stuck skeleton.',
  },
];

// ---------------------------------------------------------------- Class C

/** Counter fields that may only ever move by increment(). */
export const COUNTER_FIELDS = [
  'memberCount',
  'repoCount',
  'openAskCount',
  'claimCount',
  'interestCount',
  'commentCount',
  'rsvpCount',
  'count',
];

/**
 * Read-modify-write on a counter. Empty, and it must stay empty: every counter
 * in src/data already moves by increment(). The gate has no allowlist because
 * there is no correct instance of this pattern.
 */
export const COUNTER_EXCEPTIONS: Instance[] = [
  {
    file: 'src/data/asks.ts',
    line: 'const remaining = Math.max((ask.claimCount ?? 1) - 1, 0);',
    why: 'The documented exception in REVIEW.md: the open/claimed transition has to branch on the count, so it reads the snapshot value. The counter itself still moves by increment(-1); a concurrent unclaim can leave state claimed at zero claims, and the next claim self-heals it.',
  },
];

// ---------------------------------------------------------------- Class E

/**
 * Views that mix live listeners with one-shot fetches. Legitimate only where
 * staleness is the design and that is written down (REVIEW.md Class E).
 */
export const ONE_SHOT_ON_LIVE: Instance[] = [
  {
    file: 'src/views/CircleNotices.tsx',
    line: 'void getDoc(doc(db(), `groups/${gid}/repos/${repoId}`))',
    why: 'Resolves the pinned repo named by the summary doc. The pin changes only by an admin edit, and the summary listener that supplies repoId is live — so a change re-runs this fetch.',
  },
  {
    file: 'src/views/GroupHome.tsx',
    line: 'void getDoc(fsDoc(db(), `groups/${gid}/integrations/discord`))',
    why: 'Reads whether a Discord webhook is configured, to decide if posting is offered. Configuration, not content; it changes on a settings visit, which remounts Home.',
  },
  {
    file: 'src/views/GroupSettings.tsx',
    line: 'void getDoc(doc(db(), `groups/${gid}/integrations/discord`)).then((snap) => {',
    why: 'Loads the current webhook into the settings form. A form field must not move under the editor, so one-shot is the correct behaviour here.',
  },
  {
    file: 'src/views/InviteManager.tsx',
    line: 'repoCount = (await getCountFromServer(collection(db(), `groups/${gid}/repos`))).data()',
    why: 'Snapshots the repo count into the invite document at creation time. The value is deliberately frozen — it describes the circle as the invite was written.',
  },
];

// ---------------------------------------------------------------- Class F

/**
 * The canonical spelling of each shared predicate. A permission or ownership
 * test written anywhere else is Class F — the adoption pill had its own owner
 * check and was wrong while ownsRepo was right.
 */
export const PREDICATE_HELPERS = [
  { name: 'canWriteRole', file: 'src/data/types.ts' },
  { name: 'ownsRepo', file: 'src/util/skills.ts' },
  { name: 'circleOwner', file: 'src/util/skills.ts' },
  { name: 'canManageRepo', file: 'src/data/repos.ts' },
];

export const PREDICATE_INSTANCES: Instance[] = [
  {
    file: 'src/util/skills.ts',
    line: 'return r.ownerUid === m.uid || r.githubOwnerLogin.toLowerCase() === m.login.toLowerCase();',
    why: 'The body of ownsRepo — this is the canonical spelling.',
  },
  {
    file: 'src/data/repos.ts',
    line: 'return !!uid && (isAdmin || repo.ownerUid === uid || repo.registeredBy === uid);',
    why: 'The body of canManageRepo — this is the canonical spelling.',
  },
  {
    file: 'src/data/types.ts',
    line: "return !!m && m.role !== 'guest' && m.role !== 'alumnus';",
    why: 'The body of canWriteRole — this is the canonical spelling.',
  },
  {
    file: 'src/views/Repos.tsx',
    line: 'if (hasDecidedSharing(me) || repos.some((r) => r.registeredBy === uid)) return;',
    why: 'Not a permission test: asks whether this member has ever registered anything, to decide if the sharing prompt is still worth showing.',
  },
  {
    file: 'src/views/InterestButton.tsx',
    line: 'const isOwner = repo.ownerUid === uid;',
    why: 'Class F violation, kept for now: an ownership test spelled inline. It suppresses the interest button on your own repo, so being wrong shows a button that should not be there. Should call ownsRepo.',
    violation: true,
  },
  {
    file: 'src/views/Repos.tsx',
    line: 'if (repo.registeredBy === profile.uid || repo.ownerUid === profile.uid) {',
    why: 'Class F violation, kept for now: canManageRepo without the isAdmin term, spelled inline. Should call canManageRepo.',
    violation: true,
  },
];

/**
 * `role === 'admin'` appears throughout the views and has no canonical helper
 * to duplicate, so it is not a Class F failure — but thirteen copies of one
 * permission idea is how Class F starts. Reported by the gate, not enforced.
 */
export const ADMIN_CHECK_PATTERN = /\brole === 'admin'/;
