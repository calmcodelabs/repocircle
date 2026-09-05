const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Unbiased random base36 token via rejection sampling. 26 chars ≈ 134 bits. */
export function randomToken(len = 26): string {
  let out = '';
  const buf = new Uint8Array(len * 2);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (out.length >= len) break;
      if (b < 252) out += ALPHABET[b % 36]; // 252 = 36·7 → no modulo bias
    }
  }
  return out;
}

/** Short non-secret id for group docs (membership rules gate access, not the id). */
export function newGroupId(): string {
  return randomToken(12);
}
