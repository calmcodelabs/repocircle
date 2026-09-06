import { useEffect, useState } from 'preact/hooks';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import {
  addIdeaInterest,
  deleteIdea,
  germinateIdea,
  removeIdeaInterest,
  setIdeaState,
  watchIdeaInterests,
} from '../data/ideas';
import { watchRepos } from '../data/repos';
import { myProfile } from '../data/users';
import { canWriteRole, REPO_NEEDS, type Idea, type Repo, type RepoInterest } from '../data/types';
import { navigate } from '../router';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { langClass } from '../util/lang';
import { log, noteServerError } from '../util/log';
import { ownsRepo } from '../util/skills';
import { relTime } from '../util/time';
import { CommentThread } from './CommentThread';
import { notifyDiscord } from '../notify/discord';

/** M15 — one idea: the pitch, the discussion, the hands raised, the germination. */
export function IdeaDetail({ gid, ideaId }: { gid: string; ideaId: string }) {
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined);
  const [interests, setInterests] = useState<RepoInterest[]>([]);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const canWrite = canWriteRole(me);
  const iAmAdmin = me?.role === 'admin';

  useEffect(
    () =>
      onSnapshot(
        doc(db(), `groups/${gid}/ideas/${ideaId}`),
        (snap) => setIdea(snap.exists() ? ({ id: snap.id, ...snap.data() } as Idea) : null),
        (e) => {
          log('warn', `idea watch: ${e.code}`);
          noteServerError(e.code, 'idea');
          setIdea(null);
        },
      ),
    [gid, ideaId],
  );
  useEffect(() => watchIdeaInterests(gid, ideaId, setInterests), [gid, ideaId]);
  useEffect(
    () =>
      watchRepos(gid, setRepos, (code) => {
        log('warn', `idea repos watch: ${code}`);
        noteServerError(code, 'repos');
      }),
    [gid],
  );

  if (idea === undefined) return <span class="skeleton" />;
  if (idea === null)
    return (
      <EmptyState
        line="This idea is gone — germinated and tidied, or deleted by its author."
        action={<a href={`#/g/${gid}`}>Back to the circle</a>}
      />
    );

  const isAuthor = idea.authorUid === uid;
  const mine = !!uid && interests.some((i) => i.uid === uid);
  const linkedRepo = idea.repoId ? (repos ?? []).find((r) => r.id === idea.repoId) : undefined;
  // Who may germinate: author, admin, or someone who owns a circle repo to link.
  const myRepos = (repos ?? []).filter((r) => me && ownsRepo(r, me));
  const canGerminate =
    idea.state !== 'germinated' && canWrite && (isAuthor || iAmAdmin || myRepos.length > 0);

  async function toggleInterest() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !idea) return;
    try {
      if (mine) await removeIdeaInterest(gid, idea.id, profile.uid);
      else {
        await addIdeaInterest(gid, idea, profile);
        toast(`@${idea.authorLogin} will see you'd build this`);
      }
    } catch {
      toast('Could not save that — check your connection.', { error: true });
    }
  }

  async function park(state: 'open' | 'parked') {
    if (!idea) return;
    setBusy(true);
    try {
      await setIdeaState(gid, idea.id, state);
      toast(state === 'parked' ? 'Parked — it stays here, paused' : 'Reopened');
    } catch {
      toast('Could not update the idea.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="stack">
      <section class="card stack rise">
        <div class="row wrap">
          <Chip
            tone={
              idea.state === 'germinated' ? 'accent' : idea.state === 'parked' ? 'default' : 'warn'
            }
          >
            {idea.state === 'germinated'
              ? 'germinated'
              : idea.state === 'parked'
                ? 'parked'
                : 'idea'}
          </Chip>
          {idea.needs && idea.state === 'open' && (
            <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === idea.needs)?.label}</Chip>
          )}
          {(idea.domainTags ?? []).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
          <span class="topbar__spacer" />
          <span class="small faint">{relTime(idea.createdAt)}</span>
        </div>
        <h2>{idea.title}</h2>
        <p class="lead">{idea.pitch}</p>
        {idea.detail && <p class="small dim idea__detail">{idea.detail}</p>}
        <div class="row small dim">
          <Avatar login={idea.authorLogin} src={idea.authorAvatarUrl} />
          <span>
            pitched by <b>@{idea.authorLogin}</b>
          </span>
        </div>

        {idea.state === 'germinated' && (
          <div class="row small">
            <span class="dot dot--accent" />
            <span>
              It's real now —{' '}
              {idea.repoId ? (
                <a href={`#/g/${gid}/repo/${idea.repoId}`}>
                  <b>{idea.repoFullName}</b>
                </a>
              ) : (
                <b>{idea.repoFullName}</b>
              )}
              {idea.germinatedByLogin && idea.germinatedByLogin !== idea.authorLogin && (
                <span class="faint"> · built by @{idea.germinatedByLogin}</span>
              )}
            </span>
            {idea.germinatedAt && <span class="faint">{relTime(idea.germinatedAt)}</span>}
          </div>
        )}

        <div class="row wrap">
          {interests.length > 0 && (
            <span class="row interest__faces">
              {interests.slice(0, 5).map((i) => (
                <a key={i.uid} href={`#/g/${gid}/m/${i.uid}`} aria-label={`@${i.login}`}>
                  <Avatar login={i.login} src={i.avatarUrl} />
                </a>
              ))}
              <span class="small faint">{interests.length} would build this</span>
            </span>
          )}
          <span class="topbar__spacer" />
          {canWrite && !isAuthor && idea.state === 'open' && (
            <button
              class={`chip ${mine ? 'chip--accent' : ''} interest__btn`}
              aria-pressed={mine}
              onClick={() => void toggleInterest()}
            >
              {mine ? "I'd build this ✓".replace(' ✓', '') : "I'd build this"}
            </button>
          )}
          {canGerminate && (
            <Pill variant="primary" onClick={() => setLinkOpen(true)}>
              It's a repo now
            </Pill>
          )}
          {isAuthor && idea.state === 'open' && (
            <Pill busy={busy} onClick={() => void park('parked')}>
              Park it
            </Pill>
          )}
          {isAuthor && idea.state === 'parked' && (
            <Pill busy={busy} onClick={() => void park('open')}>
              Reopen
            </Pill>
          )}
          {(isAuthor || iAmAdmin) && idea.state !== 'germinated' && (
            <Pill
              variant="danger"
              onClick={() =>
                void deleteIdea(gid, idea.id).then(() => {
                  toast('Idea deleted');
                  navigate(`#/g/${gid}`);
                })
              }
            >
              Delete
            </Pill>
          )}
        </div>
      </section>

      <CommentThread
        gid={gid}
        subject={{ kind: 'idea', id: ideaId }}
        canModerate={isAuthor || iAmAdmin}
        title="Talk it through"
      />

      {linkedRepo && idea.state === 'germinated' && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Where it went</span>
          </div>
          <a class="idea" href={`#/g/${gid}/repo/${linkedRepo.id}`}>
            <span class="row">
              <span class={`langdot ${langClass(linkedRepo.language)}`} />
              <span class="mono idea__name">{linkedRepo.fullName}</span>
              <span class="topbar__spacer" />
              <span class="small faint">
                {linkedRepo.lastEventAt ? relTime(linkedRepo.lastEventAt) : ''}
              </span>
            </span>
            {(linkedRepo.pitch || linkedRepo.description) && (
              <span class="idea__pitch">{linkedRepo.pitch || linkedRepo.description}</span>
            )}
          </a>
        </section>
      )}

      {linkOpen && idea && (
        <GerminateSheet
          gid={gid}
          idea={idea}
          myRepos={isAuthor || iAmAdmin ? (repos ?? []) : myRepos}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </main>
  );
}

/**
 * Link the idea to the repo it became. The picker offers circle repos the
 * actor may link (rules enforce the same set server-side).
 */
function GerminateSheet({
  gid,
  idea,
  myRepos,
  onClose,
}: {
  gid: string;
  idea: Idea;
  myRepos: Repo[];
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Repo | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;
  const candidates = myRepos.filter((r) => !r.archived);

  async function confirm() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !picked) return;
    setBusy(true);
    try {
      await germinateIdea(gid, profile, idea, picked);
      toast(`${idea.title} lives at ${picked.fullName} now`);
      notifyDiscord(gid, 'postClaims', {
        title: `Idea germinated: ${idea.title} → ${picked.fullName}`,
        path: `#/g/${gid}/repo/${picked.id}`,
      });
      onClose();
    } catch {
      toast('Linking failed — is the repo registered in this circle?', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Where does “${idea.title}” live now?`} onClose={onClose}>
      <div class="stack">
        <p class="small dim">
          Pick the repo it became. The idea keeps its history and links forward; the repo card
          credits @{idea.authorLogin} for the spark.
        </p>
        {candidates.length === 0 && (
          <p class="small faint">
            No repos of yours are registered here yet — add it on the Repos page first (auto-share
            usually catches new repos within a few minutes).
          </p>
        )}
        {candidates.map((r) => (
          <button
            key={r.id}
            class={`row member ${picked?.id === r.id ? 'member--picked' : ''}`}
            aria-pressed={picked?.id === r.id}
            onClick={() => setPicked(r)}
          >
            <span class={`langdot ${langClass(r.language)}`} />
            <span class="mono">{r.fullName}</span>
            <span class="topbar__spacer" />
            <span class="small faint">{r.lastEventAt ? relTime(r.lastEventAt) : ''}</span>
          </button>
        ))}
        <Pill variant="primary" busy={busy} disabled={!picked} onClick={() => void confirm()}>
          {picked ? `Link ${picked.fullName.split('/')[1]}` : 'Pick the repo'}
        </Pill>
      </div>
    </Sheet>
  );
}
