import type { Timestamp } from 'firebase/firestore';
import type { CollabRequest } from '../data/collabs';
import type { Repo, RepoInterest } from '../data/types';

/**
 * M12 — a repo's journey: the human line under the machine history. Built
 * purely from facts already stored (creation, interest, accepted collabs,
 * adoption, releases in the loaded window). No synthesis, no scoring.
 */
export type Moment = {
  at: Timestamp | null;
  kind: 'started' | 'interest' | 'joined' | 'adopted' | 'release';
  text: string;
  login?: string;
};

export type ReleaseEvent = { occurredAt: Timestamp; summary: string };

export function buildJourney(
  repo: Repo,
  interests: RepoInterest[],
  collabs: CollabRequest[],
  events: ReleaseEvent[],
  maxInterests = 4,
): Moment[] {
  const moments: Moment[] = [];

  moments.push({
    at: repo.createdAt ?? null,
    kind: 'started',
    text: `started by @${repo.adoptedFromLogin ?? repo.githubOwnerLogin}`,
    login: repo.adoptedFromLogin ?? repo.githubOwnerLogin,
  });

  const shown = interests.slice(0, maxInterests);
  for (const i of shown) {
    moments.push({
      at: i.createdAt ?? null,
      kind: 'interest',
      text: `@${i.login} raised a hand`,
      login: i.login,
    });
  }
  if (interests.length > shown.length) {
    const extra = interests.length - shown.length;
    moments.push({
      at: interests[shown.length]?.createdAt ?? null,
      kind: 'interest',
      text: `${extra} more raised a hand`,
    });
  }

  for (const c of collabs) {
    if (c.state !== 'accepted') continue;
    moments.push({
      at: (c.decidedAt as Timestamp | null) ?? null,
      kind: 'joined',
      text: `@${c.requesterLogin} joined`,
      login: c.requesterLogin,
    });
  }

  if (repo.adoptedByLogin) {
    moments.push({
      at: repo.adoptedAt ?? null,
      kind: 'adopted',
      text: `taken over by @${repo.adoptedByLogin}`,
      login: repo.adoptedByLogin,
    });
  }

  // Oldest release in the loaded events window — honest about its horizon.
  const release = [...events].sort((a, b) => a.occurredAt.toMillis() - b.occurredAt.toMillis())[0];
  if (release) {
    moments.push({ at: release.occurredAt, kind: 'release', text: release.summary });
  }

  return moments.sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0)).slice(0, 10);
}
