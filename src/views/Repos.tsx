import { useEffect, useRef, useState } from 'preact/hooks';
import { authError, ensureGitHubToken, sessionUser } from '../auth/session';
import { hasToken } from '../auth/vault';
import { myMembership } from '../data/activeGroup';
import { canManageRepo, registerRepos, removeRepo, setRepoStatus, watchRepos } from '../data/repos';
import { myProfile } from '../data/users';
import { REPO_STATUSES, type Repo, type RepoStatus } from '../data/types';
import { GhError } from '../github/client';
import { pollState, refreshNow, sparkSeries } from '../poll/engine';
import { Spark } from '../ui/Spark';
import { getRepoByFullName, listMyPublicRepos } from '../github/repos';
import type { GhRepo } from '../github/types';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { CollabSheet } from './CollabSheet';
import { langClass } from '../util/lang';
import { log } from '../util/log';
import { relMs, relTime } from '../util/time';

const STATUS_TONE: Record<RepoStatus, 'default' | 'accent' | 'warn'> = {
  idea: 'default',
  building: 'accent',
  paused: 'warn',
  done: 'default',
};

export function Repos({ gid }: { gid: string }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [manage, setManage] = useState<Repo | null>(null);
  const [collabFor, setCollabFor] = useState<Repo | null>(null);
  const autoOpened = useRef(false);

  const me = myMembership.value;
  const uid = sessionUser.value?.uid;
  const iAmAdmin = me?.role === 'admin';
  const canAdd = !!me && me.role !== 'guest' && me.role !== 'alumnus';

  useEffect(
    () =>
      watchRepos(gid, setRepos, (code) => {
        log('warn', `repos watch: ${code}`);
      }),
    [gid],
  );

  // First-run nudge (S3): a fresh group with zero repos opens the import picker once.
  useEffect(() => {
    if (repos?.length === 0 && canAdd && !autoOpened.current && !sessionStorage.getItem(`rc.importSeen.${gid}`)) {
      autoOpened.current = true;
      try {
        sessionStorage.setItem(`rc.importSeen.${gid}`, '1');
      } catch {
        /* best-effort */
      }
      void openImport();
    }
  }, [repos, canAdd]);

  async function openImport() {
    if (!hasToken()) await ensureGitHubToken(); // popup inside the user gesture
    setImportOpen(true);
  }

  return (
    <main class="stack">
      <div class="row">
        <h2>Repos</h2>
        {repos && repos.length > 0 && <span class="dim small">{repos.length}</span>}
        <span class="topbar__spacer" />
        {canAdd && (
          <>
            <Pill
              variant="ghost"
              busy={pollState.value.running}
              onClick={() => void refreshNow(gid)}
              ariaLabel="Refresh activity from GitHub"
            >
              ↻
            </Pill>
            <Pill onClick={() => setAddOpen(true)}>Add by name</Pill>
            <Pill variant="primary" onClick={() => void openImport()}>
              Import mine
            </Pill>
          </>
        )}
      </div>

      {repos === null && <span class="skeleton" />}
      {repos?.length === 0 && (
        <EmptyState
          line="No repos yet — import your public repos, and this becomes the group’s shared window."
          action={canAdd ? <Pill onClick={() => void openImport()}>Import my repos</Pill> : undefined}
        />
      )}
      <div class="repogrid">
        {repos?.map((r) => (
          <RepoCard
            key={r.id}
            gid={gid}
            repo={r}
            canManage={canManageRepo(r, uid, iAmAdmin)}
            canCollab={canAdd && !canManageRepo(r, uid, iAmAdmin)}
            onManage={() => setManage(r)}
            onCollab={() => setCollabFor(r)}
          />
        ))}
      </div>

      {importOpen && <ImportSheet gid={gid} onClose={() => setImportOpen(false)} />}
      {addOpen && <AddRepoSheet gid={gid} onClose={() => setAddOpen(false)} />}
      {manage && <ManageRepoSheet gid={gid} repo={manage} onClose={() => setManage(null)} />}
      {collabFor && <CollabSheet gid={gid} repo={collabFor} onClose={() => setCollabFor(null)} />}
    </main>
  );
}

function RepoCard({
  gid,
  repo,
  canManage,
  canCollab,
  onManage,
  onCollab,
}: {
  gid: string;
  repo: Repo;
  canManage: boolean;
  canCollab: boolean;
  onManage: () => void;
  onCollab: () => void;
}) {
  const shortName = repo.fullName.split('/')[1] ?? repo.fullName;
  return (
    <div class="card card--interactive repo">
      <div class="row">
        <a class="mono repo__name" href={`#/g/${gid}/repo/${repo.id}`}>
          {shortName}
        </a>
        <Chip tone={STATUS_TONE[repo.status]}>{repo.status}</Chip>
        <span class="topbar__spacer" />
        {canManage ? (
          <button class="repo__more" onClick={onManage} aria-label={`Manage ${shortName}`}>
            ⋯
          </button>
        ) : (
          canCollab && (
            <button class="repo__more" onClick={onCollab} aria-label={`Request to collaborate on ${shortName}`}>
              🤝
            </button>
          )
        )}
      </div>
      {repo.description && <p class="small dim repo__desc">{repo.description}</p>}
      <div class="row small dim repo__meta">
        {repo.language && (
          <span class="chip">
            <span class={`langdot ${langClass(repo.language)}`} />
            {repo.language}
          </span>
        )}
        {repo.topics.slice(0, 2).map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
        {repo.lastEventAt && <span class="chip">{relTime(repo.lastEventAt)}</span>}
        <span class="topbar__spacer" />
        {repo.demoUrl && (
          <a href={repo.demoUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open demo">
            demo ↗
          </a>
        )}
      </div>
      <div class="row small faint">
        <Avatar login={repo.githubOwnerLogin} src={`https://avatars.githubusercontent.com/${repo.githubOwnerLogin}`} />
        <span class="mono">@{repo.githubOwnerLogin}</span>
        <span class="topbar__spacer" />
        <Spark series={sparkSeries(repo.daily)} />
      </div>
    </div>
  );
}

function ghErrorLine(e: unknown): string {
  if (e instanceof GhError) {
    // An auth failure usually has a more specific cause recorded by the auth layer
    // (popup blocked, cancelled, domain not authorized) — prefer it.
    if (e.kind === 'auth' && authError.value) return authError.value;
    return e.message;
  }
  return 'Something went wrong talking to GitHub.';
}

function ImportSheet({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [list, setList] = useState<GhRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authProblem, setAuthProblem] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    setAuthProblem(false);
    try {
      const [mine, have] = await Promise.all([
        listMyPublicRepos(),
        import('../data/repos').then((m) => m.getExistingRepoIds(gid)),
      ]);
      setExisting(have);
      setList(mine);
      setSelected(new Set(mine.filter((r) => !have.has(String(r.id))).map((r) => r.id)));
    } catch (e) {
      setError(ghErrorLine(e));
      setAuthProblem(e instanceof GhError && e.kind === 'auth');
      log('warn', `import load failed`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function onAdd() {
    const u = sessionUser.value?.uid;
    const profile = u ? myProfile(u) : null;
    if (!profile || !list) return;
    setBusy(true);
    try {
      const added = await registerRepos(gid, profile, list.filter((r) => selected.has(r.id)));
      toast(added > 0 ? `Added ${added} repo${added === 1 ? '' : 's'}` : 'Nothing new to add');
      onClose();
    } catch {
      toast('Adding repos failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Import your public repos" onClose={onClose}>
      <div class="stack">
        {list === null && !error && <span class="skeleton" />}
        {error && (
          <div class="stack">
            <p class="small signin__error">{error}</p>
            <Pill
              onClick={() =>
                void (async () => {
                  if (authProblem) await ensureGitHubToken();
                  await load();
                })()
              }
            >
              {authProblem ? 'Reconnect GitHub & retry' : 'Retry'}
            </Pill>
          </div>
        )}
        {list?.length === 0 && <EmptyState line="No public repos on your account yet." />}
        {list && list.length > 0 && (
          <>
            <div class="import__list stack">
              {list.map((r) => {
                const already = existing.has(String(r.id));
                return (
                  <label key={r.id} class={`row import__row ${already ? 'import__row--had' : ''}`}>
                    <input
                      type="checkbox"
                      checked={already || selected.has(r.id)}
                      disabled={already}
                      onChange={() => toggle(r.id)}
                    />
                    <span class="import__meta">
                      <span class="mono small">{r.name}</span>
                      {r.description && <span class="small faint import__desc">{r.description}</span>}
                    </span>
                    <span class="topbar__spacer" />
                    {already ? (
                      <Chip>added</Chip>
                    ) : (
                      r.pushed_at && <span class="small faint">{relMs(Date.parse(r.pushed_at))}</span>
                    )}
                  </label>
                );
              })}
            </div>
            <Pill variant="primary" busy={busy} disabled={selected.size === 0} onClick={() => void onAdd()}>
              {selected.size === 0
                ? 'Everything here is already added'
                : `Add ${selected.size} repo${selected.size === 1 ? '' : 's'}`}
            </Pill>
          </>
        )}
      </div>
    </Sheet>
  );
}

function AddRepoSheet({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<GhRepo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setError(null);
    setPreview(null);
    const { parseRepoRef } = await import('../util/repoRef');
    const ref = parseRepoRef(input);
    if (!ref) {
      setError('Use owner/name or a github.com link.');
      return;
    }
    setBusy(true);
    try {
      if (!hasToken()) await ensureGitHubToken();
      const gh = await getRepoByFullName(ref.owner, ref.name);
      if (gh.private) {
        setError('Only public repos can be registered.');
      } else {
        setPreview(gh);
      }
    } catch (e) {
      setError(ghErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const u = sessionUser.value?.uid;
    const profile = u ? myProfile(u) : null;
    if (!profile || !preview) return;
    setBusy(true);
    try {
      const added = await registerRepos(gid, profile, [preview]);
      toast(added > 0 ? `Added ${preview.full_name}` : 'Already in this group');
      onClose();
    } catch {
      toast('Adding failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add a repo by name" onClose={onClose}>
      <div class="stack">
        <Field
          label="Repo"
          value={input}
          onInput={setInput}
          placeholder="owner/name or https://github.com/owner/name"
          error={error ?? undefined}
          autofocus
        />
        {preview ? (
          <div class="card stack">
            <span class="mono">{preview.full_name}</span>
            {preview.description && <span class="small dim">{preview.description}</span>}
            <Pill variant="primary" busy={busy} onClick={() => void add()}>
              Add to group
            </Pill>
          </div>
        ) : (
          <Pill variant="primary" busy={busy} disabled={!input.trim()} onClick={() => void lookup()}>
            Look up
          </Pill>
        )}
      </div>
    </Sheet>
  );
}

function ManageRepoSheet({ gid, repo, onClose }: { gid: string; repo: Repo; onClose: () => void }) {
  const [status, setStatus] = useState<RepoStatus>(repo.status);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveStatus() {
    setBusy(true);
    try {
      await setRepoStatus(gid, repo.id, status);
      toast(`${repo.fullName.split('/')[1]} is now “${status}”`);
      onClose();
    } catch {
      toast('Status change failed.', { error: true });
      setBusy(false);
    }
  }

  async function doRemove() {
    const u = sessionUser.value?.uid;
    const profile = u ? myProfile(u) : null;
    if (!profile) return;
    setBusy(true);
    try {
      await removeRepo(gid, profile, repo);
      toast(`${repo.fullName} removed from the group`);
      onClose();
    } catch {
      toast('Removing failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={repo.fullName} onClose={onClose}>
      <div class="stack">
        <div class="field">
          <span class="field__label">Status</span>
          <div class="segmented" role="group" aria-label="Project status">
            {REPO_STATUSES.map((s) => (
              <button key={s} class="segmented__btn" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s}
              </button>
            ))}
          </div>
          <span class="field__hint">paused and done drop out of “Active this week”</span>
        </div>
        <Pill variant="primary" busy={busy} disabled={status === repo.status} onClick={() => void saveStatus()}>
          Save status
        </Pill>
        <hr class="rule" />
        {confirmRemove ? (
          <div class="stack">
            <p class="small dim">
              Remove {repo.fullName} from this group? The GitHub repo itself is untouched — this
              only forgets it here (activity history included).
            </p>
            <Pill variant="danger" busy={busy} onClick={() => void doRemove()}>
              Yes, remove it
            </Pill>
          </div>
        ) : (
          <Pill variant="danger" onClick={() => setConfirmRemove(true)}>
            Remove from group
          </Pill>
        )}
      </div>
    </Sheet>
  );
}
