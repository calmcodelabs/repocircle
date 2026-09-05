import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { log } from '../util/log';

// Outbound-only Discord notifications via the group's incoming webhook (ADR-007).
// Fire-and-forget: user actions must never block or fail on chat delivery.

export type DiscordToggle = 'postAsks' | 'postClaims' | 'postCollabs' | 'postShipped';

export type DiscordConfig = {
  webhookUrl: string;
  channelLabel?: string;
  postAsks: boolean;
  postClaims: boolean;
  postCollabs: boolean;
  postShipped: boolean;
};

const cache = new Map<string, { at: number; cfg: DiscordConfig | null }>();
let lastPostAt = 0;
const MIN_SPACING_MS = 15_000;

async function getConfig(gid: string): Promise<DiscordConfig | null> {
  const hit = cache.get(gid);
  if (hit && Date.now() - hit.at < 60_000) return hit.cfg;
  try {
    const snap = await getDoc(doc(db(), `groups/${gid}/integrations/discord`));
    const cfg = snap.exists() ? (snap.data() as DiscordConfig) : null;
    cache.set(gid, { at: Date.now(), cfg });
    return cfg;
  } catch {
    return null;
  }
}

export function invalidateDiscordCache(gid: string): void {
  cache.delete(gid);
}

export function notifyDiscord(
  gid: string,
  toggle: DiscordToggle,
  msg: { title: string; description?: string; path?: string },
): void {
  void (async () => {
    const cfg = await getConfig(gid);
    if (!cfg?.webhookUrl || !cfg[toggle]) return;
    if (Date.now() - lastPostAt < MIN_SPACING_MS) {
      log('info', 'discord post skipped (throttle)');
      return;
    }
    lastPostAt = Date.now();
    const url = msg.path ? `${location.origin}${location.pathname}${msg.path}` : undefined;
    try {
      await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{ title: msg.title.slice(0, 240), description: msg.description?.slice(0, 500), url, color: 0x3ecf8e }],
          allowed_mentions: { parse: [] },
        }),
      });
      log('info', 'discord posted');
    } catch {
      log('warn', 'discord post failed');
    }
  })();
}

/** Settings "send test post" — returns success so the UI can confirm. */
export async function testDiscord(webhookUrl: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title: '👋 RepoCircle connected', description: 'Asks, claims and collab requests will appear here.', color: 0x3ecf8e }],
        allowed_mentions: { parse: [] },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
