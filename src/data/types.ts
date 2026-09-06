import type { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'member' | 'guest' | 'mentor' | 'alumnus';

export type AvailabilityStatus = 'free' | 'heads_down' | 'away' | 'custom';

export type Availability = {
  status: AvailabilityStatus;
  note?: string;
  until?: Timestamp | null;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'public_page';
  createdBy: string;
  memberCount: number;
  settings: { askTags: string[]; defaultRole: 'member' };
  createdAt: Timestamp | null;
  v: 1;
};

/**
 * How a member shares their own repos with a circle. 'auto' keeps registering
 * newly-created public repos; `excluded` remembers what they removed by hand so
 * the sync never resurrects it.
 */
export type RepoSync = {
  mode: 'auto' | 'manual';
  excluded?: string[];
  decidedAt?: Timestamp | null;
};

export type Member = {
  uid: string;
  role: Role;
  login: string;
  name: string;
  avatarUrl: string;
  availability: Availability;
  helpWith: HelpArea[];
  learning: string[];
  checklist: Record<string, boolean>;
  repoSync?: RepoSync;
  joinedAt: Timestamp | null;
  joinedVia: string;
  v: 1;
};

export type Invite = {
  token: string;
  role: 'member' | 'guest';
  expiresAt: Timestamp;
  revoked: boolean;
  createdBy: string;
  createdByLogin?: string;
  groupName?: string;
  groupDescription?: string;
  memberCount?: number;
  repoCount?: number;
  createdAt: Timestamp | null;
  label?: string;
  v: 1;
};

export type MyProfile = {
  uid: string;
  login: string;
  name: string;
  avatarUrl: string;
};

/** Class F (REVIEW.md): the only spelling of "may this member write?". */
export function canWriteRole(m: Pick<Member, 'role'> | null | undefined): boolean {
  return !!m && m.role !== 'guest' && m.role !== 'alumnus';
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'admin',
  member: 'member',
  guest: 'guest',
  mentor: 'mentor',
  alumnus: 'alumnus',
};

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  free: 'free to help',
  heads_down: 'heads down',
  away: 'away',
  custom: 'custom',
};

export type RepoStatus = 'idea' | 'building' | 'paused' | 'done';

/** M15 — an idea is a repo minus the code. One lifecycle, same vocabulary. */
export type IdeaState = 'open' | 'germinated' | 'parked';

export type Idea = {
  id: string;
  title: string;
  pitch: string;
  detail?: string;
  domainTags?: string[];
  needs?: RepoNeed | null;
  authorUid: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  state: IdeaState;
  repoId?: string;
  repoFullName?: string;
  germinatedAt?: Timestamp | null;
  germinatedByUid?: string;
  germinatedByLogin?: string;
  interestCount?: number;
  commentCount?: number;
  createdAt: Timestamp | null;
  v: 1;
};

/** What the owner wants from the circle — turns a repo into a request. */
export type RepoNeed = 'feedback' | 'frontend' | 'backend' | 'ml' | 'design' | 'anything';

export const REPO_NEEDS: Array<{ key: RepoNeed; label: string }> = [
  { key: 'feedback', label: 'Just want feedback' },
  { key: 'frontend', label: 'Need frontend help' },
  { key: 'backend', label: 'Need backend help' },
  { key: 'ml', label: 'Need ML help' },
  { key: 'design', label: 'Need design help' },
  { key: 'anything', label: 'Need a co-builder' },
];

export const DOMAIN_TAGS = ['web', 'mobile', 'ML', 'tooling', 'game', 'hardware', 'data', 'other'];

/**
 * What a member can offer — the join key against Repo.needs. Same vocabulary
 * minus 'anything' ("need a co-builder" is a repo's ask, not a person's skill;
 * a repo needing 'anything' matches every member who has said something).
 */
export type HelpArea = Exclude<RepoNeed, 'anything'>;

export const HELP_AREAS: Array<{ key: HelpArea; label: string }> = [
  { key: 'feedback', label: 'feedback & review' },
  { key: 'frontend', label: 'frontend' },
  { key: 'backend', label: 'backend' },
  { key: 'ml', label: 'ML' },
  { key: 'design', label: 'design' },
];

export type RepoInterest = {
  uid: string;
  login: string;
  avatarUrl: string;
  note?: string;
  createdAt: Timestamp | null;
};

export type Repo = {
  id: string; // GitHub numeric repo id as string (doc id)
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  topics: string[];
  githubOwnerLogin: string;
  ownerUid: string | null;
  registeredBy: string;
  status: RepoStatus;
  demoUrl: string | null;
  archived: boolean;
  lastEventAt: Timestamp | null;
  poll: {
    lastPolledAt: Timestamp | null;
    etag: string | null;
    failing: boolean;
    lastEventId?: string | null;
  };
  stats7d: {
    commits: number;
    prsOpened: number;
    prsMerged: number;
    issues: number;
    releases: number;
  };
  daily?: Record<
    string,
    {
      commits: number;
      prsOpened: number;
      prsMerged: number;
      issuesOpened: number;
      releases: number;
    }
  >;
  /** The human sentence: what is this idea, in the owner's words. */
  pitch?: string;
  needs?: RepoNeed | null;
  domainTags?: string[];
  /** Owner has moved on and would like someone else to take it over. */
  seekingOwner?: boolean;
  /** The owner left the circle; the repo stays and waits for adoption. */
  ownerLeft?: boolean;
  /** Born as an idea in this circle (M15) — display hint; the idea doc is the truth. */
  ideaId?: string;
  ideaByLogin?: string;
  /** Set on handover: ownership moved in-app; the credit line reads from these. */
  adoptedByUid?: string;
  adoptedByLogin?: string;
  adoptedFromLogin?: string;
  adoptedAt?: Timestamp | null;
  interestCount?: number;
  commentCount?: number;
  createdAt: Timestamp | null;
  v: 1;
};

export const REPO_STATUSES: RepoStatus[] = ['idea', 'building', 'paused', 'done'];

export type AskKind = 'ask' | 'stuck';
export type AskState = 'open' | 'claimed' | 'resolved';

export type Ask = {
  id: string;
  kind: AskKind;
  title: string;
  detail?: string;
  tags: string[];
  repoId?: string | null;
  pairingUrl?: string | null;
  authorUid: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  state: AskState;
  claimCount: number;
  claimerUids?: string[];
  commentCount?: number;
  createdAt: Timestamp | null;
  resolvedAt?: Timestamp | null;
  /** Who got the author unstuck — one fact, never aggregated (ADR-019). */
  resolvedWithUid?: string;
  resolvedWithLogin?: string;
  v: 1;
};

export type AskClaim = {
  uid: string;
  login: string;
  avatarUrl: string;
  note?: string;
  claimedAt: Timestamp | null;
};

/**
 * M16 — the per-circle summary doc (`groups/{gid}/meta/summary`, ADR-021).
 * Home used to learn "how many members, how many repos, who is new" by reading
 * every member and every repo. This one document answers all of it in one read.
 *
 * Every field is a display mirror (Class A): nothing here authorizes anything
 * and no action keys on it — tapping through resolves the authoritative doc.
 * Timestamps inside these arrays are client clocks on purpose; Firestore
 * forbids serverTimestamp() inside an array element, and these are display-only.
 */
export type SummaryFace = { uid: string; login: string; avatarUrl: string };
export type SummaryArrival = SummaryFace & { at: Timestamp | null };
export type SummaryNewRepo = {
  repoId: string;
  fullName: string;
  language: string | null;
  ownerLogin: string;
  at: Timestamp | null;
};
export type SummaryNeed = {
  repoId: string;
  fullName: string;
  needs: RepoNeed | null;
  /** Owner moved on or left; the repo waits for someone to take it. */
  seekingOwner?: boolean;
  /** When it started waiting — M18 orders the longest-waiting first. */
  since: Timestamp | null;
};
/** Admin-curated circle links (M17) — schema lands with the doc, UI follows. */
export type SummaryLink = { label: string; url: string };

export type CircleSummary = {
  memberCount: number;
  repoCount: number;
  openAskCount: number;
  faces: SummaryFace[];
  arrivals: SummaryArrival[];
  newRepos: SummaryNewRepo[];
  wantsAHand: SummaryNeed[];
  links: SummaryLink[];
  pinnedRepoId: string | null;
  v: 1;
};
