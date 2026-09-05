// GitHub token vault — docs/SECURITY.md §5.
// The token lives in memory + sessionStorage ONLY (per-tab, dies with the tab).
// It must never reach Firestore, localStorage, cookies, logs, or error messages.
const KEY = 'rc.gh';
let mem: string | null = null;

export function setToken(token: string): void {
  mem = token;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Private mode / storage denied: in-memory only is fine, just less sticky.
  }
}

export function getToken(): string | null {
  if (mem !== null) return mem;
  try {
    mem = sessionStorage.getItem(KEY);
  } catch {
    mem = null;
  }
  return mem;
}

export function hasToken(): boolean {
  return getToken() !== null;
}

export function clearToken(): void {
  mem = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
