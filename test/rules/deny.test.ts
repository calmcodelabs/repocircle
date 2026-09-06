import { describe, it, beforeAll, afterAll } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createEnv, db } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});

describe('[infrastructure] default deny backstop', () => {
  it('undeclared paths are unreadable and unwritable even signed in', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), 'junk/x'), { a: 1 }));
    await assertFails(getDoc(doc(db(alice), 'junk/x')));
    await assertFails(setDoc(doc(db(alice), 'publicPages/slug'), { a: 1 }));
  });
});
