import { describe, it, expect, beforeEach, vi } from 'vitest';

// sessionStorage mock: the vault must work with AND without storage available.
function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe('[auth-signin] auth/vault', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('stores and clears via sessionStorage', async () => {
    const store = mockSessionStorage();
    const vault = await import('../../src/auth/vault');
    expect(vault.hasToken()).toBe(false);
    vault.setToken('gho_test123');
    expect(vault.getToken()).toBe('gho_test123');
    expect(store.get('rc.gh')).toBe('gho_test123');
    vault.clearToken();
    expect(vault.hasToken()).toBe(false);
    expect(store.has('rc.gh')).toBe(false);
  });

  it('survives storage being unavailable (memory-only mode)', async () => {
    // No sessionStorage global at all (node env): every access throws inside vault.
    const vault = await import('../../src/auth/vault');
    vault.setToken('gho_memonly');
    expect(vault.getToken()).toBe('gho_memonly');
    vault.clearToken();
    expect(vault.getToken()).toBe(null);
  });

  it('re-reads persisted token after in-memory copy is gone (fresh import)', async () => {
    mockSessionStorage();
    const v1 = await import('../../src/auth/vault');
    v1.setToken('gho_persisted');
    vi.resetModules(); // simulate a reload in the same tab
    const v2 = await import('../../src/auth/vault');
    expect(v2.getToken()).toBe('gho_persisted');
  });
});
