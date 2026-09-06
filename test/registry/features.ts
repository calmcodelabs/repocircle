/**
 * The feature registry — the spine of the testing system (TESTING.md §1).
 *
 * "Every feature is tested" is only a checkable proposition if "every feature"
 * is written down. This module enumerates them, maps each to the code that
 * implements it and the layers where it must have tests, and is the join key
 * for every report: the feature matrix, per-feature coverage and the
 * failure-class gates all read from here.
 *
 * Rules for editing (PLAN §10 makes this part of Definition of Done):
 *  - `id` is permanent. Reports, report paths and history are keyed on it;
 *    renaming one orphans its history. Add a new feature instead.
 *  - Every file under src/ must be claimed by at least one feature. The gate in
 *    test/static/registry.test.ts fails on an unclaimed file, which is what
 *    makes "nothing remains untouched" enforceable rather than aspirational.
 *  - Every `match` block in firestore.rules must be claimed the same way.
 *  - `layers` is the *target* — where this feature must eventually have tests.
 *    Only the layers in ENFORCED_LAYERS fail the build today; the rest show as
 *    "missing" in the feature matrix, which is the T2–T5 to-do list.
 */

export type FeatureArea = 'backend' | 'ui' | 'both';

export type Layer = 'static' | 'unit' | 'rules' | 'integration' | 'component' | 'e2e' | 'visual';

export const ALL_LAYERS: Layer[] = [
  'static',
  'unit',
  'rules',
  'integration',
  'component',
  'e2e',
  'visual',
];

/** Which layers a test lives in, by directory. Keep in sync with vitest projects. */
export const LAYER_DIRS: Record<string, Layer> = {
  'test/static': 'static',
  'test/unit': 'unit',
  'test/rules': 'rules',
  'test/integration': 'integration',
  'test/component': 'component',
  'test/e2e': 'e2e',
  'test/visual': 'visual',
};

/**
 * Layers whose absence fails the build *today*. The ratchet: T2 adds
 * 'integration', T3 'component', T4 'e2e', T5 'visual'. Until a layer is
 * enforced, a feature missing it is reported, not fatal — otherwise T0 could
 * not be green before T5 exists.
 */
export const ENFORCED_LAYERS: Layer[] = [
  'static',
  'unit',
  'rules',
  'integration',
  'component',
  'e2e',
  'visual',
];
// 'visual' joined the list once container-generated baselines were committed.
// They can only be produced by scripts/visual-baselines.sh — a baseline made on
// a developer machine fails for everyone else, because font rasterisation is not
// portable.

/**
 * Declared-but-not-yet-built feature/layer pairs in the ENFORCED_LAYERS, as of
 * T0 (2026-09-06). This is a no-regression baseline, not a set of excuses:
 *
 *  - a feature that declares an enforced layer, has no test there, and is NOT
 *    listed here fails the build — new gaps cannot be introduced;
 *  - an entry here that HAS become covered also fails the build, so the list
 *    cannot quietly go stale.
 *
 * T1 closes the two static entries; T2 closes the unit and rules ones as part
 * of its gap-fill. Shrinking this array to empty is the milestone's real
 * definition of done.
 */
export const KNOWN_GAPS: Array<[string, Layer]> = [
  // Pure-logic tests that were never written; T2.
  ['onboarding', 'unit'],
  ['membership-roles', 'unit'],
  ['sparklines', 'unit'],
  ['asks', 'unit'],
  ['collab-requests', 'unit'],
  ['comments', 'unit'],
  ['availability', 'unit'],
  ['discord-webhook', 'unit'],
  ['app-update', 'unit'],
  ['infrastructure', 'unit'],
  // Rules blocks reachable only through flows the rules suite never drove; T2.
  ['settings-admin', 'rules'],
  ['cross-circle', 'rules'],
  ['activity-events', 'rules'],
  ['discord-webhook', 'rules'],
  // T2 built the integration layer and used it where it pays most: the
  // multi-step flows with no transaction around them, the counter races, the
  // poll engine against fixtures, and every live query's shape. These features
  // declare the layer but their own integration tests are still to write —
  // the layer is enforced, so this list can only shrink.
  ['auth-signin', 'integration'],
  ['onboarding', 'integration'],
  ['groups-create', 'integration'],
  ['invites', 'integration'],
  ['group-delete', 'integration'],
  ['settings-admin', 'integration'],
  ['active-circle', 'integration'],
  ['repo-import', 'integration'],
  ['repo-status', 'integration'],
  ['repo-needs', 'integration'],
  ['cross-circle', 'integration'],
  ['activity-events', 'integration'],
  ['longest-waiting', 'integration'],
  ['collab-requests', 'integration'],
  ['ideas', 'integration'],
  ['comments', 'integration'],
  ['interests', 'integration'],
  ['profiles', 'integration'],
  ['skills-matcher', 'integration'],
  ['availability', 'integration'],
  ['away-inbox', 'integration'],
  ['watches', 'integration'],
  ['notification-levels', 'integration'],
  ['discord-webhook', 'integration'],
  ['sessions', 'integration'],
  ['rsvp', 'integration'],
  ['announcements', 'integration'],
  ['circle-wall', 'integration'],
  // T3 built the component layer in a real browser and covered what the app's
  // own signal stores can reach: routing, the update bar, the denied-circle
  // recovery, the pause screen. States that live behind a watch* call are not
  // reachable without module mocking, which does not work under this browser
  // mode (TESTING.md §9c) — those features are covered at E2E instead and
  // their component tests remain to write.
  ['auth-signin', 'component'],
  ['onboarding', 'component'],
  ['personal-home', 'component'],
  ['invites', 'component'],
  ['join-flow', 'component'],
  ['membership-roles', 'component'],
  ['settings-admin', 'component'],
  ['repo-registry', 'component'],
  ['repo-import', 'component'],
  ['repo-status', 'component'],
  ['repo-needs', 'component'],
  ['repo-list-view', 'component'],
  ['adoption-handover', 'component'],
  ['cross-circle', 'component'],
  ['active-this-week', 'component'],
  ['asks', 'component'],
  ['claims', 'component'],
  ['longest-waiting', 'component'],
  ['collab-requests', 'component'],
  ['ideas', 'component'],
  ['comments', 'component'],
  ['mentions', 'component'],
  ['interests', 'component'],
  ['profiles', 'component'],
  ['skills-matcher', 'component'],
  ['availability', 'component'],
  ['journey', 'component'],
  ['building-together', 'component'],
  ['arrivals', 'component'],
  ['away-inbox', 'component'],
  ['watches', 'component'],
  ['notification-levels', 'component'],
  ['sessions', 'component'],
  ['rsvp', 'component'],
  ['ics-export', 'component'],
  ['polls-voting', 'component'],
  ['announcements', 'component'],
  ['circle-wall', 'component'],
  ['home-gating', 'component'],
  ['empty-states', 'component'],
  ['your-activity', 'component'],
  ['diag', 'component'],
  // T4 built the journey layer against the real emulator-mode build and
  // covered the spine: sign-in, the invite and join flow, Home, repos,
  // members, routing, two-member sessions, the service worker and the CSP.
  // These features are reachable through it but have no journey yet.
  ['onboarding', 'e2e'],
  ['profile-recovery', 'e2e'],
  ['personal-home', 'e2e'],
  ['groups-create', 'e2e'],
  ['invites', 'e2e'],
  ['leave-rejoin', 'e2e'],
  ['settings-admin', 'e2e'],
  ['active-circle', 'e2e'],
  ['repo-import', 'e2e'],
  ['repo-status', 'e2e'],
  ['repo-needs', 'e2e'],
  ['repo-list-view', 'e2e'],
  ['adoption-handover', 'e2e'],
  ['cross-circle', 'e2e'],
  ['poll-engine', 'e2e'],
  ['active-this-week', 'e2e'],
  ['asks', 'e2e'],
  ['claims', 'e2e'],
  ['longest-waiting', 'e2e'],
  ['collab-requests', 'e2e'],
  ['ideas', 'e2e'],
  ['comments', 'e2e'],
  ['interests', 'e2e'],
  ['profiles', 'e2e'],
  ['skills-matcher', 'e2e'],
  ['journey', 'e2e'],
  ['building-together', 'e2e'],
  ['arrivals', 'e2e'],
  ['away-inbox', 'e2e'],
  ['watches', 'e2e'],
  ['notification-levels', 'e2e'],
  ['sessions', 'e2e'],
  ['rsvp', 'e2e'],
  ['ics-export', 'e2e'],
  ['polls-voting', 'e2e'],
  ['announcements', 'e2e'],
  ['circle-wall', 'e2e'],
  ['your-activity', 'e2e'],
  ['app-update', 'e2e'],
  ['maintenance-mode', 'e2e'],
  ['diag', 'e2e'],
  ['csp', 'e2e'],
  // Baselines exist for sign-in (two viewports) and not-found. These screens
  // need one shot each, generated the same way — inside the container, never
  // on a developer machine.
  ['onboarding', 'visual'],
  ['personal-home', 'visual'],
  ['join-flow', 'visual'],
  ['membership-roles', 'visual'],
  ['settings-admin', 'visual'],
  ['repo-registry', 'visual'],
  ['repo-needs', 'visual'],
  ['repo-list-view', 'visual'],
  ['active-this-week', 'visual'],
  ['sparklines', 'visual'],
  ['asks', 'visual'],
  ['ideas', 'visual'],
  ['profiles', 'visual'],
  ['sessions', 'visual'],
  ['polls-voting', 'visual'],
  ['home-gating', 'visual'],
  ['ui-primitives', 'visual'],
];

export type Feature = {
  /** Permanent kebab-case slug; also names the per-feature report file. */
  id: string;
  name: string;
  /** Cross-reference into PRD feature ids, ADRs or milestones. */
  ref?: string;
  area: FeatureArea;
  /** Router Route names this feature is reachable through. */
  routes?: string[];
  /** Files under src/, path relative to src/. */
  files: string[];
  /** Full match-block paths in firestore.rules, as reconstructed by the parser. */
  rulesBlocks?: string[];
  /** Where this feature must have tests. See ENFORCED_LAYERS for what bites now. */
  layers: Layer[];
  /**
   * The distinct reasons a list in this feature can be empty (Class G). Each
   * one earns a component test in T3 asserting the copy names *that* reason.
   * Completed during T3; the seeds here come from the REVIEW.md Class G cases.
   */
  emptyStates?: string[];
  /** Layer -> dated reason it is deliberately waived. */
  exemptions?: Partial<Record<Layer, string>>;
};

export const FEATURES: Feature[] = [
  // ---------------------------------------------------------------- identity
  {
    id: 'auth-signin',
    name: 'GitHub sign-in and token vault',
    ref: 'F-01, ADR-005',
    area: 'both',
    routes: ['root'],
    files: ['auth/session.ts', 'auth/vault.ts', 'views/SignIn.tsx'],
    rulesBlocks: ['/users/{uid}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e', 'visual'],
  },
  {
    id: 'onboarding',
    name: 'First run and the onboarding checklist',
    ref: 'F-12, M7',
    area: 'both',
    routes: ['new', 'root'],
    files: ['views/Onboard.tsx', 'views/ChecklistCard.tsx'],
    layers: ['unit', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['no groups yet', 'all checklist items done'],
  },
  {
    id: 'profile-recovery',
    name: 'Recovery when the user document is missing',
    area: 'ui',
    routes: ['root'],
    files: ['views/ProfileRecovery.tsx'],
    layers: ['component', 'e2e'],
  },
  {
    id: 'personal-home',
    name: 'Personal homepage across circles',
    ref: 'ADR-015',
    area: 'ui',
    routes: ['root'],
    files: ['views/PersonalHome.tsx'],
    layers: ['component', 'e2e', 'visual'],
    emptyStates: ['no circles', 'circles but no activity'],
  },

  // ---------------------------------------------------------------- tenancy
  {
    id: 'groups-create',
    name: 'Creating a circle',
    ref: 'F-02',
    area: 'both',
    routes: ['new'],
    files: ['data/groups.ts'],
    rulesBlocks: ['/groups/{gid}'],
    layers: ['rules', 'integration', 'e2e'],
  },
  {
    id: 'invites',
    name: 'Invite links, roles, expiry and revocation',
    ref: 'F-03, ADR-010',
    area: 'both',
    routes: ['members', 'settings'],
    files: ['data/invites.ts', 'views/InviteManager.tsx'],
    rulesBlocks: ['/groups/{gid}/invites/{token}'],
    layers: ['rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no invites created', 'all invites expired or revoked'],
  },
  {
    id: 'join-flow',
    name: 'Joining via invite, including the join questions',
    ref: 'M13, M17',
    area: 'both',
    routes: ['join'],
    files: ['views/Join.tsx'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: [
      'invite expired',
      'invite revoked',
      'already a member of this circle',
      'invite token does not exist',
    ],
  },
  {
    id: 'membership-roles',
    name: 'Members, roles and availability',
    ref: 'ADR-014',
    area: 'both',
    routes: ['members'],
    files: ['data/members.ts', 'views/Members.tsx'],
    rulesBlocks: ['/groups/{gid}/members/{uid}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['only you in the circle', 'filtered to a skill with no matches'],
  },
  {
    id: 'leave-rejoin',
    name: 'Leaving, anonymization and rejoining',
    ref: 'M13, PRD §11',
    area: 'backend',
    files: ['util/anonymize.ts'],
    layers: ['integration', 'e2e'],
  },
  {
    id: 'group-delete',
    name: 'Deleting a circle',
    area: 'backend',
    routes: ['settings'],
    files: ['data/deleteGroup.ts'],
    layers: ['rules', 'integration'],
  },
  {
    id: 'settings-admin',
    name: 'Circle settings and the audit log',
    area: 'both',
    routes: ['settings'],
    files: ['views/GroupSettings.tsx', 'data/audit.ts'],
    rulesBlocks: ['/groups/{gid}/auditLog/{entryId}'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
  },
  {
    id: 'active-circle',
    name: 'Circle shell: active group, my membership, denial handling',
    ref: 'M16, Class B',
    area: 'both',
    files: ['data/activeGroup.ts', 'views/GroupShell.tsx'],
    layers: ['integration', 'component', 'e2e'],
  },

  // ------------------------------------------------------------------ repos
  {
    id: 'repo-registry',
    name: 'Repo registry and the card gallery',
    ref: 'F-04',
    area: 'both',
    routes: ['repos'],
    files: ['data/repos.ts', 'views/Repos.tsx'],
    rulesBlocks: ['/groups/{gid}/repos/{repoId}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: [
      'no repos registered',
      'all repos filtered out by the needs filter',
      'all repos archived',
    ],
  },
  {
    id: 'repo-import',
    name: 'Importing your public repos, sync mode and readme',
    ref: 'F-04',
    area: 'both',
    files: ['github/repos.ts', 'data/repoSync.ts', 'util/readme.ts'],
    layers: ['unit', 'integration', 'component', 'e2e'],
    emptyStates: ['no public repos', 'every public repo already added'],
  },
  {
    id: 'repo-status',
    name: 'Project status: idea, building, paused, done',
    ref: 'F-10',
    area: 'both',
    files: [],
    layers: ['rules', 'integration', 'component', 'e2e'],
  },
  {
    id: 'repo-needs',
    name: 'What a repo needs, and the repo detail page',
    ref: 'M9',
    area: 'both',
    routes: ['repodetail'],
    files: ['views/RepoDetail.tsx'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: [
      'no activity recorded yet',
      'polling has not run since registration',
      'poll is failing for this repo',
      'nobody has expressed interest',
      'no comments yet',
    ],
  },
  {
    id: 'repo-list-view',
    name: 'Repo list view alongside the gallery',
    ref: 'M20',
    area: 'ui',
    routes: ['repos'],
    files: [],
    layers: ['component', 'e2e', 'visual'],
  },
  {
    id: 'adoption-handover',
    name: 'Orphaned repos, seeking owner, adoption and credit',
    ref: 'M12, M13',
    area: 'both',
    files: [],
    layers: ['rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no repos up for adoption'],
  },
  {
    id: 'cross-circle',
    name: 'Which other circles a repo is in',
    ref: 'M20, ADR-025',
    area: 'both',
    files: ['views/AlsoIn.tsx'],
    layers: ['rules', 'integration', 'component', 'e2e'],
  },

  // --------------------------------------------------------------- activity
  {
    id: 'poll-engine',
    name: 'Activity polling engine and the GitHub client',
    ref: 'ADR-004, ARCH §5',
    area: 'backend',
    files: ['poll/engine.ts', 'poll/normalize.ts', 'github/client.ts', 'github/types.ts'],
    layers: ['unit', 'integration', 'e2e'],
  },
  {
    id: 'activity-events',
    name: 'Stored activity events and daily rollups',
    area: 'backend',
    files: [],
    rulesBlocks: [
      '/groups/{gid}/repos/{repoId}/events/{eventId}',
      '/groups/{gid}/repos/{repoId}/activityDaily/{day}',
    ],
    layers: ['rules', 'integration'],
  },
  {
    id: 'active-this-week',
    name: 'Active this week',
    ref: 'F-05',
    area: 'ui',
    routes: ['home'],
    files: [],
    layers: ['component', 'e2e', 'visual'],
    emptyStates: ['no repos in the circle', 'all repos paused', 'quiet week'],
  },
  {
    id: 'sparklines',
    name: 'Sparklines',
    ref: 'F-05',
    area: 'ui',
    files: ['ui/Spark.tsx'],
    layers: ['unit', 'component', 'visual'],
  },

  // -------------------------------------------------------------- help loop
  {
    id: 'asks',
    name: 'Asks and stuck flags',
    ref: 'F-06, F-07',
    area: 'both',
    routes: ['ask', 'home'],
    files: ['data/asks.ts', 'views/AskComposer.tsx', 'views/AskDetail.tsx'],
    rulesBlocks: ['/groups/{gid}/asks/{askId}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: [
      'no asks ever posted',
      'asks exist but all resolved',
      'filtered by tag with no matches',
    ],
  },
  {
    id: 'claims',
    name: 'Claiming and resolving an ask',
    ref: 'F-08, ADR-019',
    area: 'both',
    files: [],
    rulesBlocks: ['/groups/{gid}/asks/{askId}/claims/{uid}'],
    layers: ['rules', 'integration', 'component', 'e2e'],
  },
  {
    id: 'longest-waiting',
    name: 'Longest-waiting asks and repos',
    ref: 'M18',
    area: 'both',
    files: [],
    layers: ['integration', 'component', 'e2e'],
    emptyStates: ['nothing has been waiting'],
  },

  // ---------------------------------------------------------- collaboration
  {
    id: 'collab-requests',
    name: 'Collaborator requests',
    ref: 'F-09, ADR-006',
    area: 'both',
    files: ['data/collabs.ts', 'views/CollabInbox.tsx', 'views/CollabSheet.tsx'],
    rulesBlocks: ['/groups/{gid}/collabRequests/{reqId}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no requests pending', 'requests exist but all decided'],
  },
  {
    id: 'ideas',
    name: 'Ideas as first-class documents, and germination',
    ref: 'M15, ADR-020',
    area: 'both',
    routes: ['idea'],
    files: [
      'data/ideas.ts',
      'views/IdeaComposer.tsx',
      'views/IdeaDetail.tsx',
      'views/IdeaSheet.tsx',
    ],
    rulesBlocks: ['/groups/{gid}/ideas/{ideaId}'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['no ideas pitched', 'all ideas germinated', 'all ideas parked'],
  },
  {
    id: 'comments',
    name: 'Comments on repos, asks and ideas',
    ref: 'M10',
    area: 'both',
    files: ['data/comments.ts', 'views/CommentThread.tsx', 'views/CommentBody.tsx'],
    rulesBlocks: [
      '/{path=**}/comments/{commentId}',
      '/groups/{gid}/repos/{repoId}/comments/{commentId}',
      '/groups/{gid}/ideas/{ideaId}/comments/{commentId}',
      '/groups/{gid}/asks/{askId}/comments/{commentId}',
    ],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no comments yet'],
  },
  {
    id: 'mentions',
    name: 'Mentions and repo references in text',
    area: 'both',
    files: ['util/mentions.ts', 'util/repoRef.ts'],
    layers: ['unit', 'component'],
  },
  {
    id: 'interests',
    name: 'Expressing interest in a repo, idea or session',
    area: 'both',
    files: ['views/InterestButton.tsx'],
    rulesBlocks: [
      '/{path=**}/interests/{interestUid}',
      '/groups/{gid}/repos/{repoId}/interests/{uid}',
      '/groups/{gid}/ideas/{ideaId}/interests/{uid}',
    ],
    layers: ['rules', 'integration', 'component', 'e2e'],
  },

  // ----------------------------------------------------------------- people
  {
    id: 'profiles',
    name: 'Member profiles',
    ref: 'M11, ADR-018',
    area: 'both',
    routes: ['profile'],
    files: ['views/Profile.tsx', 'data/users.ts'],
    rulesBlocks: ['/users/{uid}'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['no repos yet', 'no skills set', 'no activity in this circle'],
  },
  {
    id: 'skills-matcher',
    name: 'Skills and the helpWith to needs matcher',
    ref: 'M11',
    area: 'both',
    files: ['util/skills.ts'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no skills set', 'skills set but nothing matches'],
  },
  {
    id: 'availability',
    name: 'Availability status',
    ref: 'ADR-014',
    area: 'both',
    files: ['util/availability.ts'],
    layers: ['unit', 'rules', 'integration', 'component'],
  },
  {
    id: 'journey',
    name: 'The repo journey and credit lines',
    ref: 'M12, ADR-019',
    area: 'both',
    files: ['util/journey.ts'],
    layers: ['unit', 'component', 'e2e'],
  },
  {
    id: 'building-together',
    name: 'Building together',
    ref: 'M12',
    area: 'ui',
    routes: ['home'],
    files: [],
    layers: ['component', 'e2e'],
    emptyStates: ['nobody is collaborating yet'],
  },
  {
    id: 'arrivals',
    name: 'New in the circle',
    area: 'ui',
    routes: ['home'],
    files: [],
    layers: ['component', 'e2e'],
    emptyStates: ['nobody joined recently'],
  },

  // ------------------------------------------------------------ signal
  {
    id: 'away-inbox',
    name: 'What happened while you were away',
    ref: 'M18, ADR-019',
    area: 'both',
    routes: ['home'],
    files: ['data/inbox.ts', 'util/inboxItems.ts'],
    layers: ['unit', 'integration', 'component', 'e2e'],
    emptyStates: ['nothing happened while away', 'everything already dismissed'],
  },
  {
    id: 'watches',
    name: 'Watching repos, asks and ideas',
    ref: 'M18',
    area: 'both',
    files: ['data/watches.ts'],
    rulesBlocks: ['/users/{uid}/watches/{watchId}'],
    layers: ['unit', 'rules', 'integration', 'component', 'e2e'],
    emptyStates: ['watching nothing'],
  },
  {
    id: 'notification-levels',
    name: 'Notification levels, including mute skipping queries',
    ref: 'M18',
    area: 'both',
    files: [],
    layers: ['integration', 'component', 'e2e'],
  },
  {
    id: 'discord-webhook',
    name: 'Outbound Discord notifications',
    ref: 'ADR-007, I-02',
    area: 'backend',
    files: ['notify/discord.ts'],
    rulesBlocks: ['/groups/{gid}/integrations/{kind}'],
    layers: ['unit', 'rules', 'integration'],
  },

  // ------------------------------------------------------------- gatherings
  {
    id: 'sessions',
    name: 'Sessions the circle schedules',
    ref: 'M19, ADR-023',
    area: 'both',
    routes: ['home'],
    files: ['data/sessions.ts', 'views/SessionComposer.tsx', 'views/ComingUp.tsx'],
    rulesBlocks: ['/groups/{gid}/sessions/{sessionId}'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['nothing scheduled', 'everything scheduled is in the past'],
  },
  {
    id: 'rsvp',
    name: 'RSVPs as interests documents',
    ref: 'M19',
    area: 'both',
    files: [],
    rulesBlocks: ['/groups/{gid}/sessions/{sessionId}/interests/{uid}'],
    layers: ['rules', 'integration', 'component', 'e2e'],
  },
  {
    id: 'ics-export',
    name: 'Calendar export',
    ref: 'M19, I-06',
    area: 'both',
    files: ['util/ics.ts'],
    layers: ['unit', 'component', 'e2e'],
  },
  {
    id: 'polls-voting',
    name: 'Polls the circle votes on',
    ref: 'M19, ADR-024',
    area: 'both',
    routes: ['home'],
    files: ['data/polls.ts', 'views/PollCard.tsx', 'views/PollComposer.tsx'],
    rulesBlocks: ['/groups/{gid}/polls/{pollId}', '/groups/{gid}/polls/{pollId}/votes/{uid}'],
    layers: ['rules', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: ['no polls open', 'poll closed'],
  },

  // --------------------------------------------------------- circle surface
  {
    id: 'announcements',
    name: 'Admin announcements',
    ref: 'M17',
    area: 'both',
    routes: ['home'],
    files: ['data/announcements.ts', 'views/AnnouncementComposer.tsx', 'views/CircleNotices.tsx'],
    rulesBlocks: ['/groups/{gid}/announcements/{annId}'],
    layers: ['rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no announcements'],
  },
  {
    id: 'circle-wall',
    name: 'Circle wall: links and pinned repo',
    ref: 'M17',
    area: 'both',
    routes: ['home'],
    files: ['views/CircleWallCard.tsx'],
    layers: ['rules', 'integration', 'component', 'e2e'],
    emptyStates: ['no links and nothing pinned'],
  },
  {
    id: 'home-gating',
    name: 'Home narrows to what can mean something yet',
    ref: 'M16.5, ADR-022',
    area: 'both',
    routes: ['home'],
    files: ['util/homeBlocks.ts', 'views/GroupHome.tsx'],
    layers: ['unit', 'integration', 'component', 'e2e', 'visual'],
    emptyStates: [
      'page deliberately narrowed for a new member (ADR-022 says so on the page)',
      'circle has no repos yet',
      'settled member, genuinely quiet week',
    ],
  },
  {
    id: 'summary-doc',
    name: 'The per-circle summary document',
    ref: 'M16, ADR-021',
    area: 'backend',
    files: ['data/summary.ts'],
    rulesBlocks: ['/groups/{gid}/meta/{docId}'],
    layers: ['rules', 'integration'],
  },
  {
    id: 'empty-states',
    name: 'Empty states that name the real reason',
    ref: 'F-13, Class G',
    area: 'ui',
    files: ['ui/EmptyState.tsx'],
    layers: ['static', 'component'],
  },
  {
    id: 'your-activity',
    name: 'Your activity',
    ref: 'F-11',
    area: 'ui',
    routes: ['home'],
    files: [],
    layers: ['component', 'e2e'],
    emptyStates: ['you have not done anything here yet'],
  },

  // --------------------------------------------------------------- platform
  {
    id: 'routing',
    name: 'Hash routing and not-found',
    ref: 'ADR-003',
    area: 'both',
    files: ['router.ts', 'views/App.tsx', 'views/NotFound.tsx'],
    layers: ['unit', 'component', 'e2e'],
  },
  {
    id: 'ui-primitives',
    name: 'Design system primitives',
    ref: 'UI.md, ADR-012',
    area: 'ui',
    files: [
      'ui/Avatar.tsx',
      'ui/Chip.tsx',
      'ui/EmptyState.tsx',
      'ui/Field.tsx',
      'ui/Icon.tsx',
      'ui/Mark.tsx',
      'ui/Pill.tsx',
      'ui/Sheet.tsx',
      'ui/Spark.tsx',
      'ui/StatusDot.tsx',
      'ui/Toast.tsx',
    ],
    layers: ['component', 'visual'],
  },
  {
    id: 'resilient-listeners',
    name: 'Listener retry and give-up behaviour',
    ref: 'Class B',
    area: 'backend',
    files: ['data/resilientWatch.ts'],
    layers: ['unit', 'integration'],
  },
  {
    id: 'app-update',
    name: 'Service worker updates reaching open tabs',
    ref: 'Class D, M14',
    area: 'both',
    files: ['util/appUpdate.ts'],
    layers: ['unit', 'component', 'e2e'],
  },
  {
    id: 'pwa-install',
    name: 'Installability and the offline shell',
    ref: 'M7, ARCH §7',
    area: 'ui',
    files: [],
    layers: ['e2e'],
  },
  {
    id: 'maintenance-mode',
    name: 'The maintenance pause',
    area: 'both',
    files: ['maintenance.ts', 'views/Maintenance.tsx'],
    layers: ['component', 'e2e'],
  },
  {
    id: 'diag',
    name: 'Diagnostics screen',
    ref: 'ARCH §8',
    area: 'ui',
    routes: ['diag'],
    files: ['views/Diag.tsx'],
    layers: ['component', 'e2e'],
  },
  {
    id: 'csp',
    name: 'Content-Security-Policy of the shipped bundle',
    ref: 'SECURITY §6',
    area: 'ui',
    files: [],
    layers: ['static', 'e2e'],
  },
  {
    id: 'infrastructure',
    name: 'App wiring: firebase init, ids, types, logging, limits, formatting',
    area: 'both',
    files: [
      'firebase.ts',
      'firebase-config.ts',
      'main.tsx',
      'vite-env.d.ts',
      'data/ids.ts',
      'data/types.ts',
      'util/lang.ts',
      'util/lazy.tsx',
      'util/limits.ts',
      'util/log.ts',
      'util/time.ts',
    ],
    layers: ['unit', 'static'],
  },
];

/** Match blocks that are structural rather than a feature's authorization. */
export const RULES_BLOCKS_EXEMPT: string[] = [
  '/databases/{database}/documents', // the wrapper
  '/{document=**}', // the final catch-all deny
];

export const FEATURE_IDS: string[] = FEATURES.map((f) => f.id);

export function featureById(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}

export function featuresForArea(area: FeatureArea): Feature[] {
  return FEATURES.filter((f) => f.area === area || f.area === 'both');
}
