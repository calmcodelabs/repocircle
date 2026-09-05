import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';

// F-12 onboarding checklist — a guide, not a gate (soft version of the PRD's
// module unlocks; every tab stays reachable, the card celebrates progress).
type Item = {
  key: string;
  label: string;
  href?: string;
  done: (c: Record<string, boolean>, extras: Extras) => boolean;
};
type Extras = { hasDiscord: boolean; hasCompany: boolean };

const ITEMS: Item[] = [
  { key: 'addedRepo', label: 'Share your repos', href: 'repos', done: (c) => !!c.addedRepo },
  {
    key: 'invitedSomeone',
    label: 'Invite your circle',
    href: 'members',
    done: (c, x) => !!c.invitedSomeone || x.hasCompany,
  },
  {
    key: 'postedOrAnswered',
    label: 'Post an ask — or claim one',
    done: (c) => !!c.postedOrAnswered,
  },
  {
    key: 'setAvailability',
    label: 'Set your availability',
    href: 'members',
    done: (c) => !!c.setAvailability,
  },
  {
    key: 'saidHelpWith',
    label: 'Say what you can help with',
    href: 'me',
    done: (c) => !!c.saidHelpWith,
  },
  {
    key: 'connectedChat',
    label: 'Connect Discord (any admin)',
    href: 'settings',
    done: (c, x) => !!c.connectedChat || x.hasDiscord,
  },
];

export function ChecklistCard({
  gid,
  hasDiscord,
  memberCount,
}: {
  gid: string;
  hasDiscord: boolean;
  memberCount: number;
}) {
  const me = myMembership.value;
  const uid = sessionUser.value?.uid;
  if (!me || me.checklist?.dismissed) return null;
  const extras: Extras = { hasDiscord, hasCompany: memberCount > 1 };
  const done = ITEMS.filter((i) => i.done(me.checklist ?? {}, extras));
  if (done.length === ITEMS.length) return null;

  return (
    <section class="hero hero--dim stack checklist rise-2">
      <div class="row">
        <span class="hero__label">Getting started</span>
        <span class="sectionhead__count">
          {done.length}/{ITEMS.length}
        </span>
        <span class="topbar__spacer" />
        <Pill
          variant="ghost"
          ariaLabel="Dismiss checklist"
          onClick={() =>
            uid &&
            void updateDoc(doc(db(), `groups/${gid}/members/${uid}`), {
              'checklist.dismissed': true,
            }).catch(() => undefined)
          }
        >
          ×
        </Pill>
      </div>
      <div class="checkbar" aria-hidden="true">
        <span class={`checkbar__fill checkbar__fill--${done.length}`} />
      </div>
      {ITEMS.map((item) => {
        const isDone = item.done(me.checklist ?? {}, extras);
        const inner = (
          <>
            <span class={`check ${isDone ? 'check--done' : ''}`} aria-hidden="true">
              {isDone && <Icon name="check" size={12} />}
            </span>
            <span class={isDone ? 'small faint checklist__done' : 'small'}>{item.label}</span>
          </>
        );
        const href = item.href === 'me' ? (uid ? `m/${uid}` : undefined) : item.href;
        return href && !isDone ? (
          <a key={item.key} class="row checklist__row" href={`#/g/${gid}/${href}`}>
            {inner}
          </a>
        ) : (
          <div key={item.key} class="row checklist__row">
            {inner}
          </div>
        );
      })}
    </section>
  );
}
