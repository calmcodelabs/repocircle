import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
import { createEnv, db, GID, askDoc, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/repos/777`), {
      fullName: 'bob/x',
      ownerUid: 'bob',
      registeredBy: 'bob',
      status: 'building',
      archived: false,
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('adversarial: forged payloads outside the app happy path', () => {
  it('events with a non-poll source are rejected (webhook is Phase-3 only)', async () => {
    const bob = env.authenticatedContext('bob');
    const ev = {
      type: 'push',
      actorLogin: 'bob',
      actorAvatarUrl: '',
      summary: 'x',
      url: 'https://github.com/bob/x',
      occurredAt: Timestamp.now(),
      expireAt: Timestamp.now(),
      source: 'webhook',
      v: 1,
    };
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/repos/777/events/1`), ev));
    await assertSucceeds(
      setDoc(doc(db(bob), `groups/${GID}/repos/777/events/2`), { ...ev, source: 'poll' }),
    );
  });

  it('integrations: member write denied; admin junk URL denied; admin real URL allowed', async () => {
    const bob = env.authenticatedContext('bob');
    const alice = env.authenticatedContext('alice');
    const cfg = {
      webhookUrl: 'https://discord.com/api/webhooks/123456789/aBcD_ef.12-34',
      channelLabel: '#dev',
      postAsks: true,
      postClaims: true,
      postCollabs: true,
      postShipped: true,
      configuredBy: 'alice',
      updatedAt: Timestamp.now(),
      v: 1,
    };
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/integrations/discord`), { ...cfg, configuredBy: 'bob' }),
    );
    await assertFails(
      setDoc(doc(db(alice), `groups/${GID}/integrations/discord`), {
        ...cfg,
        webhookUrl: 'https://evil.example/hook',
      }),
    );
    await assertFails(
      setDoc(doc(db(alice), `groups/${GID}/integrations/discord`), {
        ...cfg,
        webhookUrl: 'https://discord.com.evil.example/api/webhooks/1/x',
      }),
    );
    await assertSucceeds(setDoc(doc(db(alice), `groups/${GID}/integrations/discord`), cfg));
  });

  it('ask author cannot be reassigned after creation', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/asks/a1`), askDoc('bob'));
    });
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/asks/a1`), { authorUid: 'alice' }));
  });

  it('claim transition cannot smuggle extra fields', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/asks/a2`), askDoc('alice'));
    });
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/asks/a2`), {
        state: 'claimed',
        claimCount: 1,
        title: 'hijacked title!',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/asks/a2`), {
        state: 'claimed',
        claimCount: 1,
        claimerUids: ['bob'],
      }),
    );
  });

  it('checklist self-update stays within allowed keys', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { 'checklist.addedRepo': true }),
    );
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), {
        'checklist.addedRepo': true,
        role: 'admin',
      }),
    );
  });
});
