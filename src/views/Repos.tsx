import { useEffect, useRef, useState } from 'preact/hooks';
import { authError, ensureGitHubToken, sessionUser } from '../auth/session';
import { hasToken } from '../auth/vault';
import { activeMembers, myMembership } from '../data/activeGroup';
import { canManageRepo, registerRepos, removeRepo, setRepoStatus, watchRepos } from '../data/repos';
import { excludeFromSync, hasDecidedSharing, setRepoSyncMode, syncMyRepos } from '../data/repoSync';
import { myProfile } from '../data/users';
import { canWriteRole, REPO_NEEDS, REPO_STATUSES, type Repo, type RepoStatus } from '../data/types';
import { IdeaSheet } from './IdeaSheet';
import { InterestButton } from './InterestButton';
import { socialPreviewUrl } from '../github/repos';
import { GhError } from '../github/client';
import { pollState, refreshNow, sparkSeries } from '../poll/engine';
import { Spark } from '../ui/Spark';
import { getRepoByFullName, listMyPublicRepos } from '../github/repos';
import type { GhRepo } from '../github/types';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { CollabSheet } from './CollabSheet';
import { InviteSheet } from './InviteManager';
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ideaFor, setIdeaFor] = useState<Repo | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const autoOpened = useRef(false);

  const me = myMembership.value;
  const uid = sessionUser.value?.uid;
  const iAmAdmin = me?.role === 'admin';
  const canAdd = canWriteRole(me);

  useEffect(
    () =>
      watchRepos(gid, setRepos, (code) => {
        log('warn', `repos watch: ${code}`);
      }),
    [gid],
  );

  const tagsInUse = [...new Set((repos ?? []).flatMap((r) => r.domainTags ?? []))].slice(0, 8);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const visible = (repos ?? []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'needs help') return !!r.needs || r.seekingOwner;
    if (filter === 'new') return (r.createdAt?.toMillis() ?? 0) >= weekAgo;
    return (r.domainTags ?? []).includes(filter);
  });

  // Every member gets asked to share once — the founder AND everyone invited after
  // them (PRD F-04). Keyed on "have I shared anything here", not "is the circle
  // empty", which is what previously skipped invited members entirely.
  useEffect(() => {
    if (!repos || !canAdd || autoOpened.current) return;
    if (hasDecidedSharing(me) || repos.some((r) => r.registeredBy === uid)) return;
    if (sessionStorage.getItem(`rc.importSeen.${gid}`)) return;
    autoOpened.current = true;
    try {
      sessionStorage.setItem(`rc.importSeen.${gid}`, '1');
    } catch {
      /* best-effort */
    }
    void openImport();
  }, [repos, canAdd, me, uid]);

  // Keep an opted-in member's repos flowing in, including ones created later.
  useEffect(() => {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !me) return;
    void syncMyRepos(gid, profile, me);
  }, [gid, uid, me]);

  async function openImport() {
    if (!hasToken()) await ensureGitHubToken(); // popup inside the user gesture
    setImportOpen(true);
  }

  /**
   * A freshly created circle has one member, so the step after repos is people.
   * Fires once per circle, and only for someone who can actually invite.
   */
  function maybeNudgeInvite() {
    const soloAdmin = me?.role === 'admin' && (activeMembers.value?.length ?? 1) === 1;
    if (!soloAdmin) return;
    try {
      if (sessionStorage.getItem(`rc.inviteNudge.${gid}`)) return;
      sessionStorage.setItem(`rc.inviteNudge.${gid}`, '1');
    } catch {
      /* best-effort */
    }
    setTimeout(() => setInviteOpen(true), 450);
  }

  return (
    <main class="stack">
      <div class="row">
        <h2>Repos</h2>
        {repos && repos.length > 0 && <span class="dim small">{repos.length}</span>}
        <span class="topbar__spacer" />
        {iAmAdmin && <Pill onClick={() => setInviteOpen(true)}>Invite people</Pill>}
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

      {repos && repos.length > 0 && (
        <div class="row wrap repofilter">
          {['all', 'needs help', 'new', ...tagsInUse].map((f) => (
            <button
              key={f}
              class={`chip ${filter === f ? 'chip--accent' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {repos === null && <span class="skeleton" />}
      {repos?.length === 0 && (
        <EmptyState
          line="No repos yet — import your public repos, and this becomes the group’s shared window."
          action={
            canAdd ? <Pill onClick={() => void openImport()}>Import my repos</Pill> : undefined
          }
        />
      )}
      {visible.length === 0 && repos && repos.length > 0 && (
        <EmptyState
          icon="repo"
          line={
            filter === 'needs help'
              ? 'Nobody has asked for help yet — owners can set that from the card menu.'
              : 'Nothing added in the last 7 days — the rest are still under “all”.'
          }
        />
      )}
      <div class="repogrid">
        {visible.map((r) => (
          <RepoCard
            key={r.id}
            gid={gid}
            repo={r}
            canManage={canManageRepo(r, uid, iAmAdmin)}
            canCollab={canAdd && !canManageRepo(r, uid, iAmAdmin)}
            onManage={() => setManage(r)}
            onCollab={() => setCollabFor(r)}
            onEditIdea={() => setIdeaFor(r)}
          />
        ))}
      </div>

      {importOpen && (
        <ImportSheet
          gid={gid}
          onClose={() => {
            setImportOpen(false);
            maybeNudgeInvite();
          }}
        />
      )}
      {addOpen && <AddRepoSheet gid={gid} onClose={() => setAddOpen(false)} />}
      {manage && <ManageRepoSheet gid={gid} repo={manage} onClose={() => setManage(null)} />}
      {collabFor && <CollabSheet gid={gid} repo={collabFor} onClose={() => setCollabFor(null)} />}
      {ideaFor && <IdeaSheet gid={gid} repo={ideaFor} onClose={() => setIdeaFor(null)} />}
      {inviteOpen && (
        <InviteSheet
          gid={gid}
          onClose={() => setInviteOpen(false)}
          intro="Repos are in — now bring the people. Create a link and share it wherever your circle already talks."
        />
      )}
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
  onEditIdea,
}: {
  gid: string;
  repo: Repo;
  canManage: boolean;
  canCollab: boolean;
  onManage: () => void;
  onCollab: () => void;
  onEditIdea: () => void;
}) {
  const shortName = repo.fullName.split('/')[1] ?? repo.fullName;
  const needLabel = REPO_NEEDS.find((n) => n.key === repo.needs)?.label;
  return (
    <div class="card card--interactive repo">
      <a class="repo__shot" href={`#/g/${gid}/repo/${repo.id}`} aria-hidden="true" tabindex={-1}>
        <img src={socialPreviewUrl(repo.fullName)} alt="" loading="lazy" />
      </a>
      <div class="row">
        <a class="mono repo__name" href={`#/g/${gid}/repo/${repo.id}`}>
          {shortName}
        </a>
        <Chip tone={STATUS_TONE[repo.status]}>{repo.status}</Chip>
        <span class="topbar__spacer" />
        {canManage && (
          <button
            class="repo__more"
            onClick={onEditIdea}
            aria-label={`Edit the idea behind ${shortName}`}
          >
            <Icon name="ask" size={15} />
          </button>
        )}
        {canManage ? (
          <button class="repo__more" onClick={onManage} aria-label={`Manage ${shortName}`}>
            ⋯
          </button>
        ) : (
          canCollab && (
            <button
              class="repo__more"
              onClick={onCollab}
              aria-label={`Request to collaborate on ${shortName}`}
            >
              <Icon name="handshake" size={16} />
            </button>
          )
        )}
      </div>
      {repo.pitch ? (
        <p class="repo__pitch">{repo.pitch}</p>
      ) : (
        repo.description && <p class="small dim repo__desc">{repo.description}</p>
      )}
      {(needLabel || repo.seekingOwner) && (
        <div class="row wrap">
          {needLabel && <Chip tone="accent">{needLabel}</Chip>}
          {repo.seekingOwner && <Chip tone="warn">Looking for a new owner</Chip>}
        </div>
      )}
      <div class="row small dim repo__meta">
        {repo.language && (
          <span class="chip">
            <span class={`langdot ${langClass(repo.language)}`} />
            {repo.language}
          </span>
        )}
        {(repo.domainTags ?? []).slice(0, 3).map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
        {(repo.domainTags ?? []).length === 0 &&
          repo.topics.slice(0, 2).map((t) => <Chip key={t}>{t}</Chip>)}
        {repo.lastEventAt && <span class="chip">{relTime(repo.lastEventAt)}</span>}
        <span class="topbar__spacer" />
        {repo.demoUrl && (
          <a
            href={repo.demoUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label="Open demo"
          >
            demo ↗
          </a>
        )}
      </div>
      <div class="row small faint">
        <Avatar
          login={repo.githubOwnerLogin}
          src={`https://avatars.githubusercontent.com/${repo.githubOwnerLogin}`}
        />
        <span class="mono">@{repo.githubOwnerLogin}</span>
        <span class="topbar__spacer" />
        <Spark series={sparkSeries(repo.daily, 14)} label={`activity over the last 14 days`} />
      </div>
      <div class="row small faint repo__social">
        <a href={`#/g/${gid}/repo/${repo.id}`} class="repo__comments">
          {repo.commentCount
            ? `${repo.commentCount} comment${repo.commentCount === 1 ? '' : 's'}`
            : 'Comment'}
        </a>
      </div>
      <InterestButton gid={gid} repo={repo} />
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
  const [autoShare, setAutoShare] = useState(true);
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
      const added = await registerRepos(
        gid,
        profile,
        list.filter((r) => selected.has(r.id)),
      );
      await setRepoSyncMode(gid, profile.uid, autoShare ? 'auto' : 'manual').catch(() => undefined);
      toast(
        autoShare
          ? `Sharing ${added} repo${added === 1 ? '' : 's'} — new ones will appear automatically`
          : added > 0
            ? `Added ${added} repo${added === 1 ? '' : 's'}`
            : 'Nothing new to add',
      );
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
        {list?.length === 0 && (
          <EmptyState
            line={
              existing.size > 0
                ? 'No public repos on your account that aren’t already here.'
                : 'No public repos on your account yet.'
            }
          />
        )}
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
                      {r.description && (
                        <span class="small faint import__desc">{r.description}</span>
                      )}
                    </span>
                    <span class="topbar__spacer" />
                    {already ? (
                      <Chip>added</Chip>
                    ) : (
                      r.pushed_at && (
                        <span class="small faint">{relMs(Date.parse(r.pushed_at))}</span>
                      )
                    )}
                  </label>
                );
              })}
            </div>
            <label class="row autoshare">
              <input
                type="checkbox"
                checked={autoShare}
                onChange={(e) => setAutoShare((e.currentTarget as HTMLInputElement).checked)}
              />
              <span class="small">
                Keep sharing automatically
                <span class="faint">
                  {' '}
                  — public repos you create later show up here too. Private repos are never touched.
                </span>
              </span>
            </label>
            <Pill
              variant="primary"
              busy={busy}
              disabled={selected.size === 0}
              onClick={() => void onAdd()}
            >
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
          <Pill
            variant="primary"
            busy={busy}
            disabled={!input.trim()}
            onClick={() => void lookup()}
          >
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
      if (repo.registeredBy === profile.uid || repo.ownerUid === profile.uid) {
        await excludeFromSync(gid, profile.uid, repo.id);
      }
      toast(`${repo.fullName} removed from the circle`);
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
              <button
                key={s}
                class="segmented__btn"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <span class="field__hint">paused and done drop out of “Active this week”</span>
        </div>
        <Pill
          variant="primary"
          busy={busy}
          disabled={status === repo.status}
          onClick={() => void saveStatus()}
        >
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
