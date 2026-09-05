import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeMembers, myMembership } from '../data/activeGroup';
import {
  addComment,
  deleteComment,
  editComment,
  setPinned,
  watchComments,
  type Comment,
  type CommentSubject,
} from '../data/comments';
import { watchRepos } from '../data/repos';
import { myProfile } from '../data/users';
import type { Repo } from '../data/types';
import { notifyDiscord } from '../notify/discord';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { extractMentions, extractRepoRefs } from '../util/mentions';
import { relTime } from '../util/time';
import { CommentBody } from './CommentBody';

const MAX = 1000;

export function CommentThread({
  gid,
  subject,
  canModerate,
  title = 'Discussion',
}: {
  gid: string;
  subject: CommentSubject;
  canModerate: boolean;
  title?: string;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const canWrite = !!me && me.role !== 'guest' && me.role !== 'alumnus';

  useEffect(() => watchComments(gid, subject, setComments), [gid, subject.kind, subject.id]);
  useEffect(() => watchRepos(gid, setRepos, () => undefined), [gid]);

  const memberLogins = useMemo(
    () => (activeMembers.value ?? []).map((m) => m.login),
    [activeMembers.value],
  );
  const repoNames = useMemo(
    () => repos.map((r) => r.fullName.split('/')[1] ?? r.fullName),
    [repos],
  );
  const repoHref = (name: string) => {
    const hit = repos.find(
      (r) => (r.fullName.split('/')[1] ?? r.fullName).toLowerCase() === name.toLowerCase(),
    );
    return hit ? `#/g/${gid}/repo/${hit.id}` : undefined;
  };

  // Autocomplete for the token being typed right now.
  const suggestions = useMemo(() => {
    const m = draft.match(/(^|\s)([@#])([A-Za-z0-9._-]*)$/);
    if (!m) return null;
    const [, , sigil, partial] = m;
    const pool = sigil === '@' ? memberLogins : repoNames;
    const hits = pool
      .filter((v) => v.toLowerCase().startsWith((partial ?? '').toLowerCase()))
      .slice(0, 5);
    return hits.length ? { sigil, partial: partial ?? '', hits } : null;
  }, [draft, memberLogins, repoNames]);

  function applySuggestion(value: string) {
    if (!suggestions) return;
    const cut = draft.length - suggestions.partial.length;
    setDraft(`${draft.slice(0, cut)}${value} `);
    boxRef.current?.focus();
  }

  async function submit() {
    const profile = uid ? myProfile(uid) : null;
    const body = draft.trim();
    if (!profile || !body) return;
    setBusy(true);
    try {
      const mentions = extractMentions(body, memberLogins);
      const repoRefs = extractRepoRefs(body, repoNames);
      if (editing) {
        await editComment(gid, subject, editing.id, body, mentions, repoRefs);
        setEditing(null);
      } else {
        await addComment(gid, subject, profile, {
          body,
          parentId: replyTo?.id ?? null,
          mentions,
          repoRefs,
          // Routes the parent author's away-inbox; never yourself.
          replyToUid: replyTo && replyTo.authorUid !== profile.uid ? replyTo.authorUid : null,
        });
        notifyDiscord(gid, 'postClaims', {
          title: `@${profile.login} commented on a ${subject.kind === 'repo' ? 'repo' : 'ask'}`,
          description: body.slice(0, 160),
          path:
            subject.kind === 'repo'
              ? `#/g/${gid}/repo/${subject.id}`
              : `#/g/${gid}/ask/${subject.id}`,
        });
      }
      setDraft('');
      setReplyTo(null);
    } catch {
      toast('Comment didn’t save — check your connection.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  const top = (comments ?? []).filter((c) => !c.parentId);
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parentId === id);
  const ordered = [...top].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  function renderOne(c: Comment, isReply = false) {
    const isAuthor = c.authorUid === uid;
    return (
      <div
        key={c.id}
        class={`comment ${isReply ? 'comment--reply' : ''} ${c.pinned ? 'comment--pinned' : ''}`}
      >
        <Avatar login={c.authorLogin} src={c.authorAvatarUrl} />
        <div class="comment__main">
          <div class="row small faint comment__meta">
            <a class="comment__author" href={`#/g/${gid}/m/${c.authorUid}`}>
              @{c.authorLogin}
            </a>
            <span>{relTime(c.createdAt)}</span>
            {c.editedAt && <span>· edited</span>}
            {c.pinned && <span class="chip chip--accent">pinned</span>}
          </div>
          <CommentBody body={c.body} onRepo={repoHref} />
          <div class="row small comment__actions">
            {canWrite && !isReply && (
              <button
                class="comment__act"
                onClick={() => {
                  setReplyTo(c);
                  setEditing(null);
                  boxRef.current?.focus();
                }}
              >
                Reply
              </button>
            )}
            {isAuthor && canWrite && (
              <button
                class="comment__act"
                onClick={() => {
                  setEditing(c);
                  setDraft(c.body);
                  setReplyTo(null);
                  boxRef.current?.focus();
                }}
              >
                Edit
              </button>
            )}
            {canModerate && !isReply && (
              <button
                class="comment__act"
                onClick={() => void setPinned(gid, subject, c.id, !c.pinned)}
              >
                {c.pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {(isAuthor || canModerate) && (
              <button
                class="comment__act comment__act--danger"
                onClick={() =>
                  void deleteComment(gid, subject, c.id).catch(() =>
                    toast('Could not delete.', { error: true }),
                  )
                }
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">{title}</span>
        {comments && comments.length > 0 && (
          <span class="sectionhead__count">{comments.length}</span>
        )}
      </div>

      {comments === null && <span class="skeleton" />}
      {comments?.length === 0 && (
        <EmptyState icon="ask" line="No comments yet — say what you think, or ask how it works." />
      )}

      {ordered.map((c) => (
        <div key={c.id} class="stack comment__group">
          {renderOne(c)}
          {repliesOf(c.id).map((r) => renderOne(r, true))}
        </div>
      ))}

      {canWrite && (
        <div class="stack comment__composer">
          {replyTo && (
            <div class="row small dim">
              <span>Replying to @{replyTo.authorLogin}</span>
              <button class="comment__act" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            </div>
          )}
          {editing && (
            <div class="row small dim">
              <span>Editing your comment</span>
              <button
                class="comment__act"
                onClick={() => {
                  setEditing(null);
                  setDraft('');
                }}
              >
                cancel
              </button>
            </div>
          )}
          <textarea
            ref={boxRef}
            class="field__input"
            rows={3}
            maxLength={MAX}
            value={draft}
            onInput={(e) => setDraft((e.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Type @ to mention someone, # to link a repo in this circle"
          />
          {suggestions && (
            <div class="row wrap comment__suggest">
              {suggestions.hits.map((h) => (
                <button key={h} class="chip" onClick={() => applySuggestion(h)}>
                  {suggestions.sigil}
                  {h}
                </button>
              ))}
            </div>
          )}
          <div class="row">
            <span class="small faint">
              {draft.length > MAX * 0.8 ? `${draft.length}/${MAX}` : ''}
            </span>
            <span class="topbar__spacer" />
            <Pill
              variant="primary"
              busy={busy}
              disabled={!draft.trim()}
              onClick={() => void submit()}
            >
              {editing ? 'Save' : replyTo ? 'Reply' : 'Comment'}
            </Pill>
          </div>
        </div>
      )}
    </section>
  );
}
