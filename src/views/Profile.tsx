import { useEffect, useMemo, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { useCircleMembers } from '../data/activeGroup';
import { setSkills } from '../data/members';
import { watchIdeas } from '../data/ideas';
import { watchRepos } from '../data/repos';
import {
  HELP_AREAS,
  REPO_NEEDS,
  ROLE_LABEL,
  type HelpArea,
  type Idea,
  type Member,
  type Repo,
} from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { StatusDot } from '../ui/StatusDot';
import { toast } from '../ui/Toast';
import { availabilityText } from '../util/availability';
import { langClass } from '../util/lang';
import { log, noteServerError } from '../util/log';
import { languageEvidence, ownsRepo, suggestHelpWith } from '../util/skills';
import { relTime } from '../util/time';
import { AvailabilitySheet } from './Members';

/**
 * M11 — a member in this circle. At 20 people everyone knows Arjun; at 200 a
 * comment from a stranger carries nothing. This page is what makes it carry
 * something: what they offer (declared), what they work in (derived from their
 * repos — fact, not claim), and what they're building here. Group-scoped on
 * purpose; there is no cross-circle profile, no counters, no comparison.
 */
export function Profile({ gid, uid }: { gid: string; uid: string }) {
  const members = useCircleMembers(gid);
  const m = members?.find((x) => x.uid === uid);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [editSkills, setEditSkills] = useState(false);
  const [editAvail, setEditAvail] = useState(false);
  const myUid = sessionUser.value?.uid;
  const isMe = myUid === uid;

  useEffect(
    () =>
      watchRepos(gid, setRepos, (code) => {
        log('warn', `profile repos watch: ${code}`);
        noteServerError(code, 'repos'); // Class B
      }),
    [gid],
  );
  useEffect(
    () =>
      watchIdeas(gid, setIdeas, (code) => {
        log('warn', `profile ideas watch: ${code}`);
        noteServerError(code, 'ideas');
      }),
    [gid],
  );

  if (members === null) return <span class="skeleton" />;
  if (!m)
    return (
      <EmptyState
        line="They’re not in this circle (anymore)."
        action={<a href={`#/g/${gid}/members`}>All members</a>}
      />
    );

  const theirs = (repos ?? []).filter((r) => ownsRepo(r, m));
  const evidence = languageEvidence(theirs);
  const fresh = [...theirs].sort(
    (a, b) =>
      Math.max(b.lastEventAt?.toMillis() ?? 0, b.createdAt?.toMillis() ?? 0) -
      Math.max(a.lastEventAt?.toMillis() ?? 0, a.createdAt?.toMillis() ?? 0),
  );

  return (
    <main class="stack">
      <section class="profile__head rise">
        <Avatar src={m.avatarUrl} login={m.login} large />
        <div class="stack profile__id">
          <h2>{m.name || m.login}</h2>
          <div class="row wrap small dim">
            <a
              class="mono"
              href={`https://github.com/${m.login}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              @{m.login} ↗
            </a>
            {m.role !== 'member' && (
              <Chip tone={m.role === 'admin' ? 'accent' : 'default'}>{ROLE_LABEL[m.role]}</Chip>
            )}
            <StatusDot
              tone={
                m.availability.status === 'free'
                  ? 'accent'
                  : m.availability.status === 'away'
                    ? 'warn'
                    : 'idle'
              }
            />
            <span>{availabilityText(m)}</span>
          </div>
        </div>
        {isMe && (
          <div class="row profile__actions">
            <Pill onClick={() => setEditAvail(true)}>Availability</Pill>
          </div>
        )}
      </section>

      <section class="card stack rise-2">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Can help with</span>
          <span class="topbar__spacer" />
          {isMe && m.helpWith.length > 0 && <Pill onClick={() => setEditSkills(true)}>Edit</Pill>}
        </div>
        {m.helpWith.length > 0 ? (
          <div class="row wrap">
            {m.helpWith.map((h) => (
              <Chip key={h} tone="accent">
                {HELP_AREAS.find((a) => a.key === h)?.label ?? h}
              </Chip>
            ))}
          </div>
        ) : isMe ? (
          <div class="row wrap">
            <span class="small dim">
              Say what you’re good at and repos that want it will find you on Home.
            </span>
            <Pill variant="primary" onClick={() => setEditSkills(true)}>
              Pick what you can help with
            </Pill>
          </div>
        ) : (
          <span class="small faint">They haven’t said yet.</span>
        )}
        {m.learning.length > 0 && (
          <div class="row wrap">
            <span class="small faint">learning</span>
            {m.learning.map((l) => (
              <Chip key={l}>{l}</Chip>
            ))}
          </div>
        )}
        {evidence.length > 0 && (
          <div class="row wrap small dim profile__langs">
            <span class="faint">works in</span>
            {evidence.slice(0, 6).map((e) => (
              <span key={e.language} class="row profile__lang">
                <span class={`langdot ${langClass(e.language)}`} />
                <span>{e.language}</span>
                {e.repos > 1 && <span class="faint">×{e.repos}</span>}
              </span>
            ))}
          </div>
        )}
      </section>

      <section class="card stack rise-2">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">In this circle</span>
          {theirs.length > 0 && <span class="sectionhead__count">{theirs.length}</span>}
        </div>
        {repos === null && <span class="skeleton" />}
        {repos !== null && theirs.length === 0 && (
          <EmptyState
            line={isMe ? 'None of your repos are shared here yet.' : 'No repos shared here yet.'}
          />
        )}
        {fresh.map((r) => (
          <a key={r.id} class="idea" href={`#/g/${gid}/repo/${r.id}`}>
            <span class="row">
              <span class={`langdot ${langClass(r.language)}`} />
              <span class="mono idea__name">{r.fullName.split('/')[1] ?? r.fullName}</span>
              {r.needs && (
                <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === r.needs)?.label}</Chip>
              )}
              {r.seekingOwner && <Chip tone="warn">needs an owner</Chip>}
              <span class="topbar__spacer" />
              <span class="small faint">{r.lastEventAt ? relTime(r.lastEventAt) : ''}</span>
            </span>
            {(r.pitch || r.description) && (
              <span class="idea__pitch">{r.pitch || r.description}</span>
            )}
          </a>
        ))}
      </section>

      {(() => {
        const theirIdeas = (ideas ?? []).filter(
          (i) => i.authorUid === uid && i.state !== 'germinated',
        );
        if (theirIdeas.length === 0) return null;
        return (
          <section class="card stack rise-2">
            <div class="sectionhead">
              <span class="sectionhead__mark" />
              <span class="sectionhead__title">Ideas on the table</span>
              <span class="sectionhead__count">{theirIdeas.length}</span>
            </div>
            {theirIdeas.map((i) => (
              <a key={i.id} class="idea" href={`#/g/${gid}/idea/${i.id}`}>
                <span class="row">
                  <span class="idea__name">{i.title}</span>
                  {i.state === 'parked' && <Chip>parked</Chip>}
                  <span class="topbar__spacer" />
                  {(i.interestCount ?? 0) > 0 && (
                    <span class="small faint">{i.interestCount} would build it</span>
                  )}
                </span>
                <span class="idea__pitch">{i.pitch}</span>
              </a>
            ))}
          </section>
        );
      })()}

      {editSkills && (
        <SkillsSheet gid={gid} me={m} myRepos={theirs} onClose={() => setEditSkills(false)} />
      )}
      {editAvail && isMe && (
        <AvailabilitySheet gid={gid} current={m.availability} onClose={() => setEditAvail(false)} />
      )}
    </main>
  );
}

/**
 * "What can you help with?" — the coverage problem is the whole design. A blank
 * form gets filled by the keen few; a form pre-filled from the languages in
 * your own repos gets *confirmed* by nearly everyone. Suggestions come from
 * code you actually pushed, so the default is honest.
 */
export function SkillsSheet({
  gid,
  me,
  myRepos,
  onClose,
}: {
  gid: string;
  me: Member;
  myRepos: Repo[];
  onClose: () => void;
}) {
  const suggested = useMemo(() => suggestHelpWith(languageEvidence(myRepos)), [myRepos]);
  const prefilled = me.helpWith.length === 0 && suggested.length > 0;
  const [picked, setPicked] = useState<Set<HelpArea>>(
    new Set(me.helpWith.length > 0 ? me.helpWith : suggested),
  );
  const [learning, setLearning] = useState<string[]>(me.learning);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(a: HelpArea) {
    const next = new Set(picked);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    setPicked(next);
  }

  function addLearning() {
    const t = draft.trim().slice(0, 24);
    setDraft('');
    if (!t || learning.some((l) => l.toLowerCase() === t.toLowerCase())) return;
    if (learning.length >= 6) {
      toast('Six things is plenty to be learning.', { error: true });
      return;
    }
    setLearning([...learning, t]);
  }

  async function save() {
    setBusy(true);
    try {
      await setSkills(gid, me.uid, {
        helpWith: HELP_AREAS.map((a) => a.key).filter((k) => picked.has(k)),
        learning,
      });
      toast('Saved — matching repos show up on Home');
      onClose();
    } catch {
      toast('Could not save — check your connection.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="What you bring" onClose={onClose}>
      <div class="stack">
        <div class="field">
          <span class="field__label">You can help with</span>
          <div class="row wrap">
            {HELP_AREAS.map((a) => (
              <button
                key={a.key}
                class={`chip ${picked.has(a.key) ? 'chip--accent' : ''}`}
                aria-pressed={picked.has(a.key)}
                onClick={() => toggle(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
          {prefilled && (
            <span class="field__hint">
              Suggested from the languages in your repos — untick anything that’s off.
            </span>
          )}
        </div>

        <div class="field">
          <span class="field__label">Learning right now (optional)</span>
          {learning.length > 0 && (
            <div class="row wrap">
              {learning.map((l) => (
                <button
                  key={l}
                  class="chip chip--accent"
                  aria-label={`Remove ${l}`}
                  onClick={() => setLearning(learning.filter((x) => x !== l))}
                >
                  {l} ×
                </button>
              ))}
            </div>
          )}
          <Field
            label=""
            value={draft}
            onInput={setDraft}
            maxLength={24}
            placeholder="Rust, CUDA, shaders…"
            hint="Enter adds each one. People pull learners in — that’s the point of saying it."
            onEnter={addLearning}
          />
        </div>

        <Pill variant="primary" busy={busy} onClick={() => void save()}>
          Save
        </Pill>
      </div>
    </Sheet>
  );
}
