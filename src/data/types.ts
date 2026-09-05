import type { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'member' | 'guest' | 'mentor' | 'alumnus';

export type AvailabilityStatus = 'free' | 'heads_down' | 'exams' | 'custom';

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
  exams: 'on exams',
  custom: 'custom',
};
