import { useEffect, useState } from 'preact/hooks';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { myUserDoc } from '../data/users';
import type { Group } from '../data/types';

/**
 * M20 — the same repo, registered in another circle I am also in (ADR-025).
 * ADR-009 has always allowed a repo to live in several circles; nothing ever
 * showed it.
 *
 * Mutual membership is the whole design, not a limitation. A global index of
 * repo-to-circle would leak the existence of private circles to anyone holding
 * a repo id, so this resolves by reading, under the rules that already apply:
 * one document per circle I am a member of, and nothing at all for anyone
 * else. Resolved at view time rather than mirrored (Class A).
 *
 * Class E exception, stated: these are one-shot reads on a live page. Which
 * circles have registered a repo changes on the order of never, and a listener
 * per circle would cost more than the fact is worth.
 */
export function AlsoIn({ gid, repoId }: { gid: string; repoId: string }) {
  const [circles, setCircles] = useState<Array<{ gid: string; name: string }>>([]);
  const groupIds = myUserDoc.value?.groupIds ?? [];
  const key = groupIds.join(',');

  useEffect(() => {
    let alive = true;
    const others = groupIds.filter((g) => g !== gid).slice(0, 7);
    if (others.length === 0) {
      setCircles([]);
      return;
    }
    void Promise.all(
      others.map(async (other) => {
        try {
          const repo = await getDoc(doc(db(), `groups/${other}/repos/${repoId}`));
          if (!repo.exists()) return null;
          const g = await getDoc(doc(db(), 'groups', other));
          if (!g.exists()) return null;
          return { gid: other, name: (g.data() as Group).name };
        } catch {
          // Denied or unreachable: a circle I cannot read is simply not shown.
          return null;
        }
      }),
    ).then((found) => {
      if (alive) setCircles(found.filter((x): x is { gid: string; name: string } => x !== null));
    });
    return () => {
      alive = false;
    };
  }, [gid, repoId, key]);

  if (circles.length === 0) return null;
  return (
    <div class="row wrap alsoin">
      <span class="small faint">Also in</span>
      {circles.map((c) => (
        <a key={c.gid} class="chip" href={`#/g/${c.gid}/repo/${repoId}`}>
          {c.name}
        </a>
      ))}
    </div>
  );
}
