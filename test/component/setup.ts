/**
 * Component-layer setup (TESTING.md §2, L4).
 *
 * Runs in a real browser, so the app's own stylesheets load and assertions
 * about visibility and focus mean what they say. Each test starts from a clean
 * document and clean signal state — Preact signals are module-level, so a
 * leaked value from one test is a phantom failure in the next.
 */
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/components.css';
import '../../src/styles/views.css';
import { resetStores } from './harness/stores.ts';
import { resetWatches } from './harness/watch.ts';

beforeEach(() => {
  resetStores();
  resetWatches();
});

afterEach(() => {
  cleanup();
  resetStores();
  resetWatches();
});
