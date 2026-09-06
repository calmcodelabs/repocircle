import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // docs/ holds build tooling (Node scripts) and generated assets, not app
  // source — linting it with the browser config fails on Node globals.
  // dist-emulator/ is the E2E build (TESTING.md §3) and reports/ is generated —
  // both are output, neither is source.
  { ignores: ['dist/', 'dist-emulator/', 'reports/', 'node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // XSS bans — docs/SECURITY.md §6. User content renders as text nodes, period.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Banned (SECURITY.md §6): render text nodes only.' },
        { property: 'outerHTML', message: 'Banned (SECURITY.md §6): render text nodes only.' },
        { object: 'document', property: 'write', message: 'Banned (SECURITY.md §6).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Banned (SECURITY.md §6).',
        },
        { selector: "CallExpression[callee.name='eval']", message: 'No eval (CSP).' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**', 'scripts/**', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // CommonJS tooling config (Lighthouse CI reads .cjs), so `module` and
    // `require` are the module system rather than undeclared globals.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
);
