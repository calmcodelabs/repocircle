import { isConfigured } from '../firebase';
import { sessionUser } from '../auth/session';
import { hasToken } from '../auth/vault';
import { logBuffer } from '../util/log';
import { rateRemaining } from '../github/client';
import { pollState } from '../poll/engine';
import { route } from '../router';
import { Pill } from '../ui/Pill';

/**
 * Drop Firestore's IndexedDB copy and reload. Firebase Auth keeps its session in
 * IndexedDB too, so this signs you out — say so rather than surprising anyone.
 */
async function clearLocalCache(): Promise<void> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  const targets = dbs.map((d) => d.name).filter((n): n is string => !!n && /firestore|firebase/i.test(n));
  await Promise.all(
    targets.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
  location.replace(`${location.pathname}?cleared=${Date.now()}`);
}

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
          `gh-rate    ${rateRemaining.value === null ? 'no calls yet' : `${rateRemaining.value} left this hour`}`,
          `route      ${route.value.name}`,
          `ua         ${navigator.userAgent}`,
        ].join('\n')}
      </pre>
      <h3>poll</h3>
      <pre class="card diag__pre">
        {[
          `last cycle ${pollState.value.lastCycleAt ? new Date(pollState.value.lastCycleAt).toISOString().slice(11, 19) : 'never'}`,
          `running    ${pollState.value.running}`,
          ...pollState.value.results.slice(-10).map((r) => `${new Date(r.at).toISOString().slice(11, 19)} ${r.repo} → ${r.outcome}`),
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
      <h3>maintenance</h3>
      <p class="small dim">
        Firestore keeps an offline copy in this browser. If the app shows data that no longer
        exists on the server, clear that copy and reload — nothing on the server is touched.
      </p>
      <Pill onClick={() => void clearLocalCache()}>Clear local cache &amp; reload</Pill>

      <p>
        <a href="#/">back</a>
      </p>
    </div>
  );
}
