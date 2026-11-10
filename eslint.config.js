import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // core/ is pure game logic: it must never depend on rendering or UI.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/render/**', '**/ui/**'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
);
