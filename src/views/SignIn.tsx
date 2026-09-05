import { useState } from 'preact/hooks';
import { isConfigured } from '../firebase';
import { authBusy, authError, signInWithGitHub } from '../auth/session';
import { Mark } from '../ui/Mark';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';

const REPO_URL = 'https://github.com/calmcodelabs/repocircle';

export function SignIn({ invited = false }: { invited?: boolean }) {
  const [showAccess, setShowAccess] = useState(false);

  return (
    <div class="app signin">
      <div class="halo halo--signin" />
      <main class="signin__panel rise">
        <Mark size={60} />
        {invited ? (
          <>
            <h1>
              You’re invited to a <span class="tint">circle</span>.
            </h1>
            <p class="lead signin__tag">Sign in with GitHub to see who, and what they’re building.</p>
          </>
        ) : (
          <>
            <h1>
              See what your circle is <span class="tint">building</span>.
            </h1>
            <p class="lead signin__tag">
              A private space for your dev circle — share what you’re building, and jump in on
              each other’s projects.
            </p>
          </>
        )}

        <div class="hero signin__viz rise-2" aria-hidden="true">
          <div class="hero__label">Your circle, live</div>
          <div class="viz__card viz__card--flag">
            <span class="dot dot--accent" />
            <span class="viz__body">
              <span class="viz__title">mahesh/pocket-journal — 3 commits today</span>
              <span class="viz__meta">TypeScript · building</span>
            </span>
            <span class="viz__claim">Join in</span>
          </div>
          <div class="viz__card viz__card--done">
            <span class="dot dot--accent" />
            <span class="viz__title">Rahul joined — building together ✓</span>
          </div>
        </div>

        {isConfigured ? (
          <div class="stack signin__cta rise-3">
            <Pill variant="primary" big busy={authBusy.value} onClick={() => void signInWithGitHub()}>
              Continue with GitHub
            </Pill>
            {authError.value && <p class="small signin__error">{authError.value}</p>}
            <p class="small faint">
              Reads public repos only ·{' '}
              <button class="signin__link" onClick={() => setShowAccess(true)}>
                what we access
              </button>
            </p>
          </div>
        ) : (
          <div class="card signin__setup">
            <h3>One-time setup pending</h3>
            <p class="small dim">
              The backend (Firebase) isn’t connected yet. Run the runbook in{' '}
              <a href={`${REPO_URL}/blob/main/docs/SETUP.md`} rel="noopener noreferrer" target="_blank">
                docs/SETUP.md
              </a>{' '}
              and paste the config into <span class="mono">src/firebase-config.ts</span>.
            </p>
          </div>
        )}
      </main>

      {showAccess && (
        <Sheet title="What RepoCircle accesses" onClose={() => setShowAccess(false)}>
          <div class="stack small dim">
            <p>
              <b class="mono">read:user</b> + <b class="mono">user:email</b> — who you are on GitHub
              (login, avatar). Your email is used for sign-in identity only and never shown to the
              group.
            </p>
            <p>
              <b class="mono">public_repo</b> — requested later, only when you first use a feature
              that needs it (opening a collaboration issue, sending a collaborator invite). Never
              private-repo access, in any phase.
            </p>
            <p>
              Your GitHub token stays in this tab only — it is never stored on any server. Revoke
              anytime: GitHub → Settings → Applications.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
