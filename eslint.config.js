import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      'apps/desktop/build/**',
      'apps/desktop/frontend/wailsjs/**',
      'perf/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'svelte/no-useless-mustaches': 'off',
    },
  },

  {
    files: ['apps/desktop/frontend/src/lib/stores/**'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'svelte/require-each-key': 'warn',
      'svelte/prefer-svelte-reactivity': 'warn',
    },
  },
];
