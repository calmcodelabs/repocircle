import { defineConfig } from 'vitest/config';

// Rules tests hit the Firestore emulator; run via `npm run test:rules`
// (firebase emulators:exec sets FIRESTORE_EMULATOR_HOST for us).
export default defineConfig({
  test: {
    include: ['test/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 40000,
    fileParallelism: false,
  },
});
