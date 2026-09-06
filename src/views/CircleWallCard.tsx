import { useEffect, useState } from 'preact/hooks';
import { activeSummary } from '../data/activeGroup';
import { watchRepos } from '../data/repos';
import { setCircleLinks, setPinnedRepo } from '../data/summary';
import type { Repo, SummaryLink } from '../data/types';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { log } from '../util/log';

const MAX_LINKS = 6;

/**
 * M17 — the circle wall: the handful of links every member needs (the Discord,
 * the syllabus, the contribution guide) and one pinned repo. Admin-only, and
 * both live on the summary document Home already reads, so showing them costs
 * nothing extra.
 */
export function CircleWallCard({ gid }: { gid: string }) {
  const summary = activeSummary.value;
  const [links, setLinks] = useState<SummaryLink[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Seed the editor once from the server, then let it be the working copy —
  // re-seeding on every snapshot would fight whatever is being typed.
  useEffect(() => {
    if (loaded || !summary) return;
    setLinks(summary.links ?? []);
    setLoaded(true);
  }, [summary, loaded]);

  useEffect(
    () => watchRepos(gid, setRepos, (code) => log('warn', `wall repos: ${code}`), 50),
    [gid],
  );

  function edit(i: number, patch: Partial<SummaryLink>) {
    setLinks(links.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    const clean = links
      .map((l) => ({ label: l.label.trim().slice(0, 40), url: l.url.trim() }))
      .filter((l) => l.label && l.url.startsWith('https://'));
    setBusy(true);
    try {
      await setCircleLinks(gid, clean);
      setLinks(clean);
      toast(
        clean.length === links.length
          ? 'Wall saved'
          : 'Saved — dropped anything without a label and an https link',
      );
    } catch {
      toast('Could not save the wall.', { error: true });
    }
    setBusy(false);
  }

  async function pin(repoId: string | null) {
    try {
      await setPinnedRepo(gid, repoId);
      toast(repoId ? 'Pinned' : 'Unpinned');
    } catch {
      toast('Could not change the pin.', { error: true });
    }
  }

  return (
    <section class="card stack">
      <h3>Circle wall</h3>
      <p class="small dim">
        A few links everyone needs, and the one repo the circle is on right now. Both show at the
        top of Home.
      </p>

      {links.map((l, i) => (
        <div key={i} class="row wrap">
          <input
            class="input"
            placeholder="Label"
            maxLength={40}
            value={l.label}
            onInput={(e) => edit(i, { label: (e.target as HTMLInputElement).value })}
          />
          <input
            class="input"
            placeholder="https://…"
            value={l.url}
            onInput={(e) => edit(i, { url: (e.target as HTMLInputElement).value })}
          />
          <Pill
            variant="ghost"
            ariaLabel={`Remove ${l.label || 'link'}`}
            onClick={() => setLinks(links.filter((_, n) => n !== i))}
          >
            ×
          </Pill>
        </div>
      ))}

      <div class="row">
        {links.length < MAX_LINKS && (
          <Pill onClick={() => setLinks([...links, { label: '', url: '' }])}>Add a link</Pill>
        )}
        <span class="topbar__spacer" />
        <Pill variant="primary" busy={busy} onClick={() => void save()}>
          Save wall
        </Pill>
      </div>

      <label class="small dim" for="pinned-repo">
        Pinned repo
      </label>
      <select
        id="pinned-repo"
        class="input"
        value={summary?.pinnedRepoId ?? ''}
        onChange={(e) => void pin((e.target as HTMLSelectElement).value || null)}
      >
        <option value="">Nothing pinned</option>
        {repos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.fullName}
          </option>
        ))}
      </select>
      {repos.length >= 50 && (
        // Class G: the picker is a window, and saying so beats letting an admin
        // conclude their repo does not exist.
        <span class="small faint">Showing the 50 most recently active repos.</span>
      )}
    </section>
  );
}
