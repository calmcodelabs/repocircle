import { signOutApp } from '../auth/session';
import { Mark } from '../ui/Mark';
import { Pill } from '../ui/Pill';

/**
 * Signed in, but the profile document is missing — the account exists in Firebase
 * Auth while `users/{uid}` doesn't (data reset, or a first-sign-in write that
 * failed). Every action that needs a profile would otherwise no-op silently, so
 * say what happened and offer the one thing that fixes it.
 */
export function ProfileRecovery() {
  return (
    <div class="app signin">
      <div class="halo halo--signin" />
      <main class="signin__panel rise">
        <Mark size={48} />
        <h2>Let’s reconnect your account</h2>
        <p class="lead signin__tag">
          You’re signed in, but your RepoCircle profile isn’t loading. Signing in again rebuilds
          it — nothing you’ve created is lost.
        </p>
        <Pill variant="primary" big onClick={() => void signOutApp()}>
          Sign in again
        </Pill>
      </main>
    </div>
  );
}
