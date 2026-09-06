import { useEffect, useState } from 'preact/hooks';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { watchLatestAnnouncement, type Announcement } from '../data/announcements';
import type { CircleSummary, Repo } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { Pill } from '../ui/Pill';
import { langClass } from '../util/lang';
import { relTime } from '../util/time';

/**
 * M17 — the three things a circle can say about itself rather than about one
 * repo: the current announcement, the links an admin has put on the wall, and
 * the one repo everybody is meant to be looking at this month.
 *
 * All three are cheap on purpose: the links and the pin ride the summary
 * document Home already reads, and the announcement is a single limit-1 query.
 */

const seenKey = (gid: string, uid: string | undefined) => `rc.ann.${gid}.${uid ?? 'anon'}`;

export function AnnouncementBar({ gid }: { gid: string }) {
  const [ann, setAnn] = useState<Announcement | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const uid = sessionUser.value?.uid;

  useEffect(() => watchLatestAnnouncement(gid, setAnn), [gid]);
  useEffect(() => {
    try {
      setDismissedId(localStorage.getItem(seenKey(gid, uid)));
    } catch {
      /* storage denied — the announcement simply keeps showing */
    }
  }, [gid, uid]);

  if (!ann || ann.id === dismissedId) return null;
  return (
    <section class="card stack announce rise">
      <div class="row">
        <span class="hero__label">Announcement</span>
        <span class="topbar__spacer" />
        <span class="small faint">{relTime(ann.createdAt)}</span>
        <Pill
          variant="ghost"
          ariaLabel="Dismiss announcement"
          onClick={() => {
            setDismissedId(ann.id);
            try {
              localStorage.setItem(seenKey(gid, uid), ann.id);
            } catch {
              /* best-effort */
            }
          }}
        >
          ×
        </Pill>
      </div>
      <p class="announce__body">{ann.body}</p>
      <span class="row small faint">
        <Avatar login={ann.authorLogin} src={ann.authorAvatarUrl} />
        <span>@{ann.authorLogin}</span>
      </span>
    </section>
  );
}

export function CircleLinks({ summary }: { summary: CircleSummary | null }) {
  const links = summary?.links ?? [];
  if (links.length === 0) return null;
  return (
    <div class="row wrap circlelinks">
      {links.map((l) => (
        <a key={l.url} class="chip" href={l.url} target="_blank" rel="noopener noreferrer nofollow">
          {l.label}
        </a>
      ))}
    </div>
  );
}

/**
 * The pinned repo is a position, never a score (ADR-019) — "this is what we're
 * on this month", said by an admin, not derived from anything.
 */
export function PinnedRepo({ gid, repoId }: { gid: string; repoId: string }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  useEffect(() => {
    let alive = true;
    void getDoc(doc(db(), `groups/${gid}/repos/${repoId}`))
      .then((s) => {
        if (alive && s.exists()) setRepo({ id: s.id, ...(s.data() as Omit<Repo, 'id'>) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [gid, repoId]);

  // A pin pointing at a repo that has since been removed just goes quiet.
  if (!repo) return null;
  return (
    <a class="card row pinned rise" href={`#/g/${gid}/repo/${repo.id}`}>
      <span class="row">
        <span class={`langdot ${langClass(repo.language)}`} />
        <span class="mono">{repo.fullName.split('/')[1] ?? repo.fullName}</span>
      </span>
      <span class="small dim pinned__pitch">{repo.pitch || repo.description}</span>
      <span class="topbar__spacer" />
      <Chip tone="accent">what we’re on</Chip>
    </a>
  );
}
