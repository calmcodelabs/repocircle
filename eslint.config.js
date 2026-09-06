import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // docs/ holds build tooling (Node scripts) and generated assets, not app
  // source — linting it with the browser config fails on Node globals.
  { ignores: ['dist/', 'node_modules/', 'docs/'] },
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
);
