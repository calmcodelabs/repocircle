import { isConfigured } from '../firebase';
import { sessionUser } from '../auth/session';
import { hasToken } from '../auth/vault';
import { logBuffer } from '../util/log';
import { route } from '../router';

/** Hidden diagnostics — ARCHITECTURE §8. Never renders secret material. */
export function Diag() {
  const u = sessionUser.value;
  return (
    <div class="app mono small">
      <h2>diag</h2>
      <pre class="card diag__pre">
        {[
          `version    ${__APP_VERSION__}`,
          `configured ${isConfigured}`,
          `auth       ${u === undefined ? 'resolving' : u === null ? 'signed-out' : u.uid}`,
          `gh-token   ${hasToken() ? 'present (this tab)' : 'absent'}`,
          `route      ${route.value.name}`,
          `ua         ${navigator.userAgent}`,
        ].join('\n')}
      </pre>
      <h3>log</h3>
      <div class="stack">
        {logBuffer.value.length === 0 && <span class="faint">quiet so far</span>}
        {logBuffer.value.map((l) => (
          <div key={l.at} class={l.level === 'error' ? 'diag__err' : undefined}>
            {new Date(l.at).toISOString().slice(11, 19)} {l.level} {l.msg}
          </div>
        ))}
      </div>
      <p>
        <a href="#/">back</a>
      </p>
    </div>
  );
}
