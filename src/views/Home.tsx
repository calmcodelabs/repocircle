import { useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { hasToken } from '../auth/vault';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Mark } from '../ui/Mark';
import { Pill } from '../ui/Pill';
import { StatusDot } from '../ui/StatusDot';

/**
 * M0 walking-skeleton Home: proves auth + shell + deploy pipeline.
 * M1 replaces the body with groups (create/join), then the three Home blocks land.
 */
export function Home() {
  const u = sessionUser.value;
  const [menuOpen, setMenuOpen] = useState(false);
  if (!u) return null;
  const login = u.displayName ?? 'you';

  return (
    <div class="app">
      <header class="topbar">
        <Mark />
        <strong>RepoCircle</strong>
        <span class="topbar__spacer" />
        <button
          class="row"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          <Avatar src={u.photoURL ?? undefined} login={login} />
        </button>
      </header>

      {menuOpen && (
        <div class="card stack home__menu">
          <div class="row">
            <Avatar src={u.photoURL ?? undefined} login={login} />
            <div>
              <div>{login}</div>
              <div class="small faint">{hasToken() ? 'GitHub connected' : 'GitHub token: sign in again when needed'}</div>
            </div>
          </div>
          <Pill variant="ghost" onClick={() => void signOutApp()}>
            Sign out
          </Pill>
        </div>
      )}

      <main class="stack">
        <section class="card stack">
          <div class="row">
            <StatusDot tone="accent" />
            <h3>Walking skeleton is live</h3>
            <span class="topbar__spacer" />
            <Chip tone="accent">M0</Chip>
          </div>
          <p class="small dim">
            You’re signed in through Firebase, this shell deployed from CI to GitHub Pages, and
            Firestore security rules are active. That’s the whole point of M0.
          </p>
          <div class="row small faint">
            <span>Next: groups &amp; invites</span>
            <Chip>M1</Chip>
          </div>
        </section>

        <section class="card">
          <div class="label">Your groups</div>
          <EmptyState
            line="No groups yet — creating and joining groups arrives with M1."
            action={
              <Pill disabled ariaLabel="Create group (arrives in M1)">
                Create a group
              </Pill>
            }
          />
        </section>
      </main>
    </div>
  );
}
