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

export type Member = {
  uid: string;
  role: Role;
  login: string;
  name: string;
  avatarUrl: string;
  availability: Availability;
  helpWith: string[];
  learning: string[];
  checklist: Record<string, boolean>;
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
  poll: { lastPolledAt: Timestamp | null; etag: string | null; failing: boolean; lastEventId?: string | null };
  stats7d: { commits: number; prsOpened: number; prsMerged: number; issues: number; releases: number };
  daily?: Record<string, { commits: number; prsOpened: number; prsMerged: number; issuesOpened: number; releases: number }>;
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
  createdAt: Timestamp | null;
  resolvedAt?: Timestamp | null;
  v: 1;
};

export type AskClaim = {
  uid: string;
  login: string;
  avatarUrl: string;
  note?: string;
  claimedAt: Timestamp | null;
};
