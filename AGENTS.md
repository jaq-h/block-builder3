# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

`CLAUDE.md` is a symlink to this file. Edit this one.

`README.md` is the authoritative description of the product, its architecture and its
directory layout. Read it first; this file records only what the README does not, plus
the conventions every session is expected to follow.

## Commands

| Task | Command |
|---|---|
| Dev server (port 3002) | `npm run dev` |
| Typecheck | `npx tsc -b` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Tests, watching | `npm run test:watch` |
| Tests with coverage | `npm run test:coverage` |
| Production build | `npm run build` (runs `tsc -b` first) |

Node version is pinned in `.nvmrc`. CI runs typecheck, lint, tests and build as four
independent jobs; see `.github/workflows/ci.yml` and the shared
`.github/actions/setup-project` composite action.

## Testing

Vitest, configured in the `test` block of `vite.config.ts` so it reuses the app's own
plugins and `resolve.alias` map. There is no second copy of the alias table, and `?react`
SVG imports work in tests for the same reason.

- The default environment is `node`, because most of the suite is pure logic. A test that
  needs a DOM opts in with a `// @vitest-environment jsdom` docblock on its first line.
  See `src/utils/grid.test.ts` (node) and `src/utils/grid.dom.test.ts` (jsdom) for the split.
- Globals are off. Import `describe`/`it`/`expect` from `vitest` explicitly.
- `src/test/setup.ts` registers the jest-dom matchers and unmounts React trees after
  each test.
- Tests are colocated with the code they cover, named `*.test.ts`/`*.test.tsx`.

Some tests deliberately assert **current, wrong** behaviour. They are commented
`CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation`. If you are fixing the
underlying bug, change the test and the comment together; do not quietly loosen it.

`src/test/pointerCapture.ts` installs a tracking `setPointerCapture` on `Element.prototype`:
jsdom ships `PointerEvent` but not the capture methods, so without it the assertion that a
drag survives a release outside the window has nothing to assert against.

`src/test/fakeWebSocket.ts` is a controllable `WebSocket` stand-in whose `send`
throws while CONNECTING, exactly as the browser does; that strictness is what
makes the connect race in `src/api/krakenWebSocket.ts` fail a test rather than
pass quietly. `src/test/panelStubs.tsx` plus `src/test/mountTracker.ts` count
component mounts, which is how `src/App.test.tsx` detects a duplicated tree.

Coverage is reported, not enforced. The suite targets the logic where a defect would
corrupt a real order (`src/api/orderMapper.ts`, `src/api/krakenAuth.ts`, `src/utils/`)
rather than chasing a repository-wide percentage.

## Deployment

Vercel, configured entirely by `vercel.json`; the README's **Deployment** section justifies every
entry in it. Two facts bite during ordinary work:

- **A new external endpoint has to be added to the CSP's `connect-src`.** Miss it and the request
  is blocked in production only, with nothing in the source to explain why. `npm run preview` does
  not apply these headers because they live in `vercel.json`, not in the app; `npx vercel dev` does.
- **The chart panel is code-split.** Import it from the `orderChart` barrel, never from
  `./OrderChart` directly, or `lightweight-charts` lands back in the initial chunk.

## Credentials and simulation mode

`vite.config.ts` injects `KRAKEN_API_KEY` and `KRAKEN_API_PRIVATE_KEY` into the client
bundle through `define`, which means **the API private key ships in the browser**. This is
known and is being re-architected separately. Do not build new work on top of it, and never
commit a real credential: local keys go in `local.env` (gitignored, see `local.env.example`).

Keep the `?? ""` on those two `define` values. Without it `JSON.stringify(undefined)`
produces no string, and Vitest's transform substitutes the literal `"undefined"` -
a truthy value that makes `hasValidCredentials()` claim credentials exist when
none do, in tests only.

CI needs no secrets, and no test may hardcode a live credential. `src/api/krakenAuth.test.ts`
signs against the throwaway example vector Kraken publishes in its own API docs.

Simulation mode is decided in `src/hooks/useTradeExecution.ts`:

- Production always simulates, whatever the toggle says. Orders are saved locally.
- Development defaults to simulation, and only offers the API-mode toggle when credentials
  are actually present.

So a dev server with no `local.env` is safe to click through end to end.

## Interaction: pointer, keyboard and touch

The README's **Interaction model** section is authoritative. Three things bite in ordinary work:

- **Never add a `window` mouse listener to drive a drag.** The gesture layer is
  `usePointerGesture`, on Pointer Events with `setPointerCapture`, which is what delivers a
  release outside the browser window. Mouse events are also suppressed during a drag, because
  `pointerdown` calls `preventDefault`.
- **Every new interactive affordance needs a keyboard path and an announcement**, not just a
  handler. Placement is expressed in terms of a target cell in `GridArea`
  (`placeProviderInCell` / `moveBlockToCell`); the pointer drag and the command model both
  call it. Anything that bypasses those two functions will work for one input method only.
- **A block on a price axis is a `role="slider"` whose value is signed** - positive above the
  market price, negative below - so arrow-key direction matches on-screen direction on both
  scale directions. `yPosition` in the data stays an unsigned magnitude plus a `direction`.

## Layout and the CSS cascade

Three traps live in the layout, and each is easy to reintroduce.

**The desktop shell only has a height above `lg`.** `body`/`#root` are
content-sized, so `h-full` resolves to `auto` unless something above it commits to
a height. `appContainer` (`src/App.styles.ts`) supplies that with `lg:h-dvh`; the
assembly panel below it is a flex column whose action bar is `shrink-0` and whose
grid area scrolls. Remove the `lg:h-dvh` and the action bar - Execute Trade
included - drops below the fold again. Below `lg` the height is deliberately
content-driven so the tabbed layout still scrolls with the page.

**Bare element rules in `src/index.css` beat every Tailwind utility.** `button {}`
and friends there sit outside any cascade layer, and unlayered CSS wins over
layered CSS regardless of specificity - so `bg-status-green` on a `<button>` does
nothing. `executeButtonVariants` works around it with `!` modifiers and says why.
The real fix is to move that reset into `@layer base`, which repaints every button
in the app and so wants its own change.

**Render each panel once.** `src/App.tsx` renders `assemblyPanel` and
`ordersPanel` in a single tree and hides the inactive one below `lg` with
`display: none`. Using a JSX element variable in two branches mounts two
independent components, and crossing the breakpoint then swaps in an empty one -
silent data loss. `src/App.test.tsx` fails if that returns.

## Prices and order types

Two invariants the order path depends on, both of which were previously violated in
`src/api/orderMapper.ts` and are now pinned by tests:

- **One price formula.** `src/utils/price.ts` `priceAtOffset` is the only implementation of
  "percentage offset from market". The grid cell renders its price chip through
  `calculatePrice`, which delegates to it, and the order mapper builds Kraken payloads from
  it directly, so the price sent is the price shown. Captain's decision D3: a block at
  yPosition 25 means **25%** from market, not 2.5%. The side of the market comes from the
  block's own `direction`, never from re-deriving one from row/column - those disagree under
  the bulk pattern.
- **A block's order type is `BlockData.orderType`.** Never parse it back out of the block id.
  Ids look like `sa-stop-loss-limit-limit-2`, and substring matching on them turned every
  `-limit` variant into a plain limit order with no trigger.

`src/api/orderMapper.ts` refuses rather than guesses: an unrecognised order type and a cycle
in the conditional-link graph both throw, because silently substituting a different order is
the failure this module exists to prevent. `useKrakenAPI.prepareOrdersFromGrid` catches that
and surfaces it as `orderError`.

Still open in the same file, and deliberately not fixed with the above: the two legs of a
dual-axis order type (`stop-loss-limit` and friends) are emitted as two separate orders
rather than one payload carrying both `limit_price` and `triggers`, so each leg now fails
`validateOrder`. Merging them needs a durable pairing identity on the block, since either
leg can be dragged to another cell.

## Path aliases

`@`, `@components`, `@widgets`, `@common`, `@hooks`, `@utils`, `@store`, `@data`, `@assets`,
`@api` and `@styles` are declared in **two** places that must stay in step:
`resolve.alias` in `vite.config.ts` (runtime and tests) and `compilerOptions.paths` in
`tsconfig.app.json` (typecheck). Adding an alias to one and not the other builds but fails
to typecheck, or vice versa.

Product code currently imports relatively (`../../../../App.styles`) and does not use the
aliases; the tests do. Prefer the aliases in new code.

## Component layout

Two tiers under `src/components`, and the distinction is load-bearing:

- `common/` - shared, widget-agnostic pieces (`grid/`, `NavBar`, `DragOverlay`).
- `widgets/<widget>/` - a self-contained feature. Each owns its `components/`, `contexts/`,
  a `*.styles.ts`, a business-logic hook and an `index.ts` barrel. `strategyAssembly` is
  the reference example.

Anything reached by more than one widget belongs in `common/`, not in a sibling widget.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

## Conventions

These are standing rules for this repository, and they apply to code, comments, commit
messages, PR text and documentation alike.

**Writing**

- Never use the em dash. Use a plain dash instead.
- Never add a `Co-Authored-By:` trailer, and never credit an agent as a commit co-author.
- Never hand-edit `CHANGELOG.md` or any file marked auto-generated.

**Technical judgment**

- Do not give much weight to development cost. Prefer quality, simplicity, robustness,
  scalability and long-term maintainability over whatever is cheaper or faster.

**Bug fixing**

- Start by reproducing the bug end to end, as close to how a user actually hits it as
  possible, so the fix addresses the real problem rather than a symptom.

**Quality bar**

- Fix lint failures, test failures and flaky tests on sight, even when the current task did
  not cause them.
- If something clearly looks off, get it fixed along the way.
- When testing the product end to end, be picky about the UI and obsessive about pixel
  perfection.
