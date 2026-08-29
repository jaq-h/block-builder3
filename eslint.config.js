import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ---------------------------------------------------------------------------
// Price-formatting readiness has one owner
// ---------------------------------------------------------------------------
//
// "Can this pair's prices be written, and at what precision" is three states,
// folded once, in `src/utils/priceFormatReadiness.ts`. Six surfaces used to
// answer it for themselves, which produced the same defect on four consecutive
// review rounds of the multi-pair work: each fix was right about its own
// surface and taught the next one nothing.
//
// Readiness is a function of exactly two ingredients - the precision-or-absent
// and whether the AssetPairs request has answered - so a module that can reach
// neither cannot form a second opinion. The rules below put those ingredients
// out of reach repository-wide, with a short allowlist carrying the reason each
// file legitimately handles one. They are stated as what a module may not do
// rather than as a list of the modules doing it right, so a module nobody has
// written yet is covered on the day it is written.
//
// The runtime half of the guard - that the context carries the tri-state and
// neither ingredient - stays in `src/utils/priceFormatReadiness.test.ts`,
// because a value's own key set is something a test can read and a linter
// cannot.

/** Ingredient one: "has the AssetPairs request answered, either way". */
const SETTLED_FLAG = [
  {
    selector: 'Identifier[name="metadataSettled"]',
    message:
      'The settled flag belongs to MarketProvider, which folds it into the readiness and never exposes it. Naming it elsewhere means a second copy, and a surface judging readiness for itself. Read `priceFormat` from `useMarket` instead. See src/utils/priceFormatReadiness.ts.',
  },
]

/**
 * Ingredient two: a `MarketPrecision` that may be absent.
 *
 * A precision that may be absent is half the readiness; the other half is why
 * it is absent, and a module holding the first alone has to invent the second.
 */
const ABSENT_ABLE_PRECISION = [
  {
    selector:
      'TSUnionType:has(TSTypeReference > Identifier[name="MarketPrecision"]):has(TSNullKeyword)',
    message:
      'An absent-able MarketPrecision is a readiness decision in disguise: absent means "not yet" or "never", and this type cannot say which. Take a PriceFormatReadiness and read its status, or call precisionOf. See src/utils/priceFormatReadiness.ts.',
  },
  {
    selector:
      'TSUnionType:has(TSTypeReference > Identifier[name="MarketPrecision"]):has(TSUndefinedKeyword)',
    message:
      'An absent-able MarketPrecision is a readiness decision in disguise: absent means "not yet" or "never", and this type cannot say which. Take a PriceFormatReadiness and read its status, or call precisionOf. See src/utils/priceFormatReadiness.ts.',
  },
  {
    selector:
      'Identifier[optional=true] > TSTypeAnnotation > TSTypeReference > Identifier[name="MarketPrecision"]',
    message:
      'An optional MarketPrecision is a readiness decision in disguise: absent means "not yet" or "never", and this parameter cannot say which. Take a PriceFormatReadiness and read its status, or call precisionOf. See src/utils/priceFormatReadiness.ts.',
  },
  {
    selector:
      'TSPropertySignature[optional=true] > TSTypeAnnotation > TSTypeReference > Identifier[name="MarketPrecision"]',
    message:
      'An optional MarketPrecision is a readiness decision in disguise: absent means "not yet" or "never", and this property cannot say which. Take a PriceFormatReadiness and read its status, or call precisionOf. See src/utils/priceFormatReadiness.ts.',
  },
]

/**
 * Ingredient four: the batch's load error, which is the readiness proxy that
 * was tried and was wrong in both directions - a batch answering without one
 * pair sets no error while that pair has no rules, and a later failure sets one
 * over pairs whose rules are in hand. It is the provider's own state now,
 * driving recovery, and it reaches no surface at all.
 */
const METADATA_ERROR = [
  {
    selector: 'Identifier[name="metadataError"]',
    message:
      'The batch load error is not a readiness proxy: it is unset for a pair Kraken simply does not list, and set for pairs whose rules are in hand. It is MarketProvider\'s own state, arming its retries, and is deliberately not on the context. Read `priceFormat` from `useMarket` instead. See src/utils/priceFormatReadiness.ts.',
  },
]

const restrictedSyntax = (...groups) => ['error', ...groups.flat()]

/**
 * The credential and the signing code live server-side. An import from the
 * client tree would compile them into the bundle, which is exactly the defect
 * this boundary exists to prevent. This is the source-side guard;
 * `api/_lib/credentialBoundary.test.ts` covers the built output, which is what
 * actually ships.
 */
const SERVER_BOUNDARY_IMPORT = {
  group: ['**/api/_lib/**', '**/api/kraken/**'],
  message:
    'Server-side only. The browser must never import Kraken signing code or server config.',
}

/**
 * Ingredient three, and the one that would hand a surface both of the others
 * at once: a module fetching its own catalogue answers the whole question
 * privately, with nothing above it to catch the second opinion.
 */
const METADATA_FETCH_IMPORT = {
  // Every path the catalogue can be reached by: the module that defines it, the
  // client's `api` barrel that re-exports it, and the `@api` alias for either.
  // Narrower than `**` on purpose - `importNames` makes ESLint refuse a star
  // re-export of any matched module, since it cannot see through one, and a
  // blanket group would fail `src/styles/index.ts` for re-exporting its own
  // siblings.
  group: [
    '**/assetMetadata',
    '**/api',
    '**/api/index',
    '@api',
    '@api/index',
    '@api/assetMetadata',
  ],
  importNames: ['fetchMarketPrecisions'],
  message:
    'The AssetPairs catalogue is fetched once, by MarketProvider. A surface fetching its own rules holds both readiness ingredients and decides privately. Read `priceFormat` from `useMarket` instead. See src/utils/priceFormatReadiness.ts.',
}

/**
 * Test files and test helpers build these facts on purpose - they stand in for
 * Kraken and for the provider - so they are not surfaces and the rules above do
 * not apply to them.
 */
const NOT_A_SURFACE = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**']

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
    files: ['src/**/*.{ts,tsx}'],
    ignores: NOT_A_SURFACE,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [SERVER_BOUNDARY_IMPORT, METADATA_FETCH_IMPORT] },
      ],
      'no-restricted-syntax': restrictedSyntax(
        SETTLED_FLAG,
        ABSENT_ABLE_PRECISION,
        METADATA_ERROR,
      ),
    },
  },
  {
    // A test stands in for Kraken and for the provider, so it holds the raw
    // ingredients deliberately. The server boundary still applies to it.
    files: NOT_A_SURFACE,
    rules: {
      'no-restricted-imports': ['error', { patterns: [SERVER_BOUNDARY_IMPORT] }],
    },
  },

  // -------------------------------------------------------------------------
  // The allowlist. Each file below handles an ingredient legitimately, and the
  // rules it is still held to are spelled out rather than switched off wholesale.
  // -------------------------------------------------------------------------
  {
    // The fold's own home: it takes the precision-or-absent as input and hands
    // it back out of the `ready` state through `precisionOf`.
    files: ['src/utils/priceFormatReadiness.ts'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(SETTLED_FLAG, METADATA_ERROR),
    },
  },
  {
    // The last point where the two facts exist separately. It holds the settled
    // flag as state, owns the `Map` whose missing entry IS the raw precision
    // fact, keeps the load error that arms its own recovery, and fetches the
    // catalogue. None of those leaves this file.
    files: ['src/store/MarketProvider.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SERVER_BOUNDARY_IMPORT] }],
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Produces the records, and skips an entry it cannot read - so absence is
    // something it writes rather than something it interprets.
    files: ['src/api/assetMetadata.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SERVER_BOUNDARY_IMPORT] }],
      'no-restricted-syntax': restrictedSyntax(SETTLED_FLAG, METADATA_ERROR),
    },
  },
  {
    // Re-exports the fetch from the client's api barrel.
    files: ['src/api/index.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SERVER_BOUNDARY_IMPORT] }],
    },
  },
  {
    // `validateOrder`'s precision is an optional argument to a pure validator
    // rather than held state. It is the last line of defence and runs after
    // `useKrakenAPI` has already refused a grid it has no rules for, so it has
    // no readiness to decide: absent means "check what can be checked without
    // per-pair rules", the same in both unready states.
    files: ['src/api/orderMapper.ts'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(SETTLED_FLAG, METADATA_ERROR),
    },
  },
])
