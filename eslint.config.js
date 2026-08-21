import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // `api/` is the server-side boundary and `vite/` is dev-server tooling.
    // Neither runs in a browser, and both need Node's globals.
    files: ['api/**/*.ts', 'vite/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // The credential and the signing code live server-side. An import from the
    // client tree would compile them into the bundle, which is exactly the
    // defect this boundary exists to prevent. `src/test/credentialBoundary.test.ts`
    // covers the same ground from the other direction.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/_lib/**', '**/api/kraken/**'],
              message:
                'Server-side only. The browser must never import Kraken signing code or server config.',
            },
          ],
        },
      ],
    },
  },
])
