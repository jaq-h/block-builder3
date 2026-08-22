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

- The suite covers `src/`, `api/` and `vite/` - see `test.include`. Server-side signing runs on
  every push, in the same command as the client tests.
- The default environment is `node`, because most of the suite is pure logic. A test that
  needs a DOM opts in with a `// @vitest-environment jsdom` docblock on its first line.
  See `src/utils/grid.test.ts` (node) and `src/utils/grid.dom.test.ts` (jsdom) for the split.
- Globals are off. Import `describe`/`it`/`expect` from `vitest` explicitly.
- `src/test/setup.ts` registers the jest-dom matchers and unmounts React trees after
  each test.
- Tests are colocated with the code they cover, named `*.test.ts`/`*.test.tsx`. Two live
  under `api/_lib/` instead because they are about the whole repository rather than about a
  neighbouring module: `credentialBoundary.test.ts` builds the client and scans the emitted
  bundle, and `deploymentSurface.test.ts` checks which routes a deploy would publish. Both
  are `api/`'s responsibility, because the boundary is.

A test may deliberately assert **current, wrong** behaviour, commented
`CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation`. None are live today;
the last of them, in `src/api/orderMapper.test.ts`, were converted when the bugs they
pinned were fixed. That is the convention when you fix such a bug: flip the expectation to
the correct behaviour and keep a `FORMERLY A CHARACTERISATION OF A KNOWN BUG` note
recording the wrong values, rather than deleting the test or quietly loosening it.

`src/test/pointerCapture.ts` installs a tracking `setPointerCapture` on `Element.prototype`:
jsdom ships `PointerEvent` but not the capture methods, so without it the assertion that a
drag survives a release outside the window has nothing to assert against.

`src/test/fakeWebSocket.ts` is a controllable `WebSocket` stand-in whose `send`
throws while CONNECTING, exactly as the browser does; that strictness is what
makes the connect race in `src/api/krakenWebSocket.ts` fail a test rather than
pass quietly. `src/test/panelStubs.tsx` plus `src/test/mountTracker.ts` count
component mounts, which is how `src/App.test.tsx` detects a duplicated tree.

Coverage is reported, not enforced. The suite targets the logic where a defect would
corrupt a real order or leak a credential (`api/_lib/`, `src/api/orderMapper.ts`,
`src/utils/`) rather than chasing a repository-wide percentage.

## Deployment

Vercel, configured by `vercel.json` plus `.vercelignore`; the README's **Deployment** section
justifies every entry in them. Four facts bite during ordinary work:

- **A new external endpoint has to be added to the CSP's `connect-src`.** Miss it and the request
  is blocked in production only, with nothing in the source to explain why. `npm run preview` does
  not apply these headers because they live in `vercel.json`, not in the app; `npx vercel dev` does.
- **The chart panel is code-split.** Import it from the `orderChart` barrel, never from
  `./OrderChart` directly, or `lightweight-charts` lands back in the initial chunk.
- **`api/` is a set of serverless functions, and the SPA rewrite excludes it.** Handlers take
  Node's `IncomingMessage`/`ServerResponse` so the same module runs on Vercel, on the Vite dev
  server and in the tests. Nothing there reads a request body, which is the one place those three
  environments genuinely differ.
- **Every non-underscore file under `api/` becomes a public route.** That includes a colocated
  test, which would deploy as an endpoint that imports `vitest` and exports no handler.
  `.vercelignore` excludes `api/**/*.test.ts`, and `api/_lib/deploymentSurface.test.ts` asserts which
  routes the deploy would actually publish.

## Credentials and the server boundary

**No Kraken credential may reach the browser, in any build, by any path.** This is the
project's hardest rule. The private key lives only in the server-side environment that
`api/` reads; `src/` holds no credential and no signing code, and `vite.config.ts` has no
`define` (a `define` value is compiled into the bundle as a literal, which is exactly how
the key used to leak). Never commit a real credential: local keys go in `local.env`
(gitignored, see `local.env.example`).

Two automated guards keep it that way, and both are cheap to run:

- `api/_lib/credentialBoundary.test.ts` runs a real production build with the credential
  variables set to sentinels and scans what it emitted. It is the acceptance check, executed,
  and it costs a build every `npm test`.
- `no-restricted-imports` in `eslint.config.js` blocks `src/` from importing `api/_lib` or
  `api/kraken`.

A change that touches this boundary also carries the acceptance check by hand in its PR
description: build with the variables set, grep `dist/` for them, and paste the commands and
their output rather than a summary of them.

`api/_lib/serverConfig.ts` is the boundary in one function. Read it before changing anything
about modes. Its rules: the public deployment (`VERCEL_ENV` of `production` or `preview`) is
simulation only and *refuses* to hold a credential at all, so no hosting-dashboard variable
can cross the line; live mode requires all four of an explicit `KRAKEN_TRADING_MODE=live`, a
complete credential pair, an explicit `KRAKEN_ALLOW_LOCAL_LIVE=1`, and an environment carrying
no hosting signal (`VERCEL`, `AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT` or any
`VERCEL_ENV`); anything ambiguous returns `misconfigured` rather than guessing. An
unrecognised environment is never assumed to be local, because `VERCEL_ENV` is a system
variable a project can be configured not to expose. `npx vercel dev` sets `VERCEL`, so it
simulates.

**Live mode is loopback only, and we ship no authentication for it.** A live server signs for
whoever reaches it, so it is confined twice: `vite/krakenApiDevServer.ts` *fails to start* when
live mode is configured on a bind other than `localhost`, `127.0.0.1` or `::1` (an empty
host is refused too, since it listens on every interface), and
`isOperatorRequest` in `api/_lib/loopback.ts` gates `/api/kraken/balance`,
`/api/kraken/ws-token` and `/api/kraken/status` per request, regardless of the bind. The bind
check and the `Host` check share one list of loopback names (`LOOPBACK_HOST_NAMES`), because
two lists that merely agreed is how a live server on `127.0.0.2` came to start happily and then
refuse every request it got. It is four checks and each closes a hole the others leave: the
peer address is loopback, the `Host` header names a loopback host (this is what stops a DNS
rebind, which produces a loopback peer for a page you never opened), the request carries this
app's own `X-Block-Builder-App` header, and no foreign origin is declared by `Sec-Fetch-Site`
or `Origin` (this is what stops any site the operator visits from burning a Kraken nonce
through the token mint). The header is the only affirmative check: the other three infer a
caller from headers a request may simply omit, and each was bypassed in turn by a shape that
omits them, most recently an `<img src>` on a browser predating Fetch Metadata, which sends
neither `Sec-Fetch-Site` nor `Origin`. A page on another site cannot set a header without a
preflight neither server grants it (the deployed function answers `OPTIONS` 405; the dev
server's `cors` middleware answers 204 but allows loopback origins only), so absence of the
origin headers is no longer read as "this is curl". A page on another loopback origin does
get through that preflight, and is caught by the origin check instead. The client
sends it from `API_REQUEST_HEADERS` in `src/api/appRequestHeader.ts`; that name and
`APP_REQUEST_HEADER` in `api/_lib/loopback.ts` are **two constants that must stay in step**,
and `api/kraken/handlers.test.ts` builds a request from the client's copy so a drift fails
there. A caller that fails any check gets the same `503 "mode":"simulation"` a simulating
deployment gives everybody, and `/api/kraken/status` tells it the same thing: a remote caller
must not be able to tell a live host from a simulating one, so no refusal may name a
credential. `misconfigured` stays loud to every caller, because that state signs nothing and a
key added to a hosting dashboard has to break visibly. Other hosting must bind live mode to
`127.0.0.1` itself. Exposing a live instance beyond loopback requires the operator to add their
own protection; we deliberately provide none.

Private Kraken endpoints are an **allowlist** in `api/_lib/krakenClient.ts`, not a proxy.
A generic signing endpoint would let any visitor have the server sign anything. Adding an
operation is a deliberate change; order placement is deliberately not on the list.

The browser learns the mode from `GET /api/kraken/status`, cached for the page in
`src/api/tradingMode.ts` and read through `useTradingMode`. It defaults to "no live
trading", so an unanswered or malformed response simulates. That flag drives the UI only;
the refusal that matters is server side, on every credentialed endpoint.

CI needs no secrets, and no test may hardcode a live credential.
`api/_lib/krakenSigning.test.ts` signs against the throwaway example vector Kraken publishes
in its own API docs.

A dev server with no `local.env` is simulation only and safe to click through end to end.
`npm run dev` mounts the `api/` handlers itself (`vite/krakenApiDevServer.ts`), so the
endpoints behave in dev exactly as they do deployed. That plugin is skipped under Vitest -
it reads `local.env` into `process.env`, and the suite must never see a developer's real
credentials.

## Interaction: pointer, keyboard and touch

The README's **Interaction model** section is authoritative. Four things bite in ordinary work:

- **Never add a `window` mouse listener to drive a drag.** The gesture layer is
  `usePointerGesture`, on Pointer Events with `setPointerCapture`, which is what delivers a
  release outside the browser window. Mouse events are also suppressed during a drag, because
  `pointerdown` calls `preventDefault`.
- **Every new interactive affordance needs a keyboard path and an announcement**, not just a
  handler. Placement is expressed in terms of a target cell in `GridArea`
  (`placeProviderInCell` / `moveBlockToCell`); the pointer drag and the command model both
  call it. Anything that bypasses those two functions will work for one input method only.
- **Never compose an announcement string at a call site.** `src/utils/gridAnnouncements.ts`
  writes every sentence the grid speaks and `useGridAnnouncer` is the only thing that reaches
  the live region; callers report an *outcome*, and the placement primitives return a
  `PlacementResult` so the sentence comes from what the grid did rather than from what the
  caller was about to attempt. Both defects this structure replaced were a message written
  next to the code that was about to act - one false, one silent - and each point fix created
  the next. A new message means a new outcome in that union, not a new `announce` call.
- **A block on a price axis is a `role="slider"` whose value is signed** - positive above the
  market price, negative below - so arrow-key direction matches on-screen direction on both
  scale directions. `yPosition` in the data stays an unsigned magnitude plus a `direction`.

## The chart panel

`src/components/widgets/orderChart/` owns the price chart. Two rules keep it honest:

- **The price scale is presentation and nothing else.** `priceScale.ts` maps the
  linear/logarithmic choice onto the library's `PriceScaleMode` and stops there. No price,
  no order and no grid position is derived from it, which is the whole reason the
  logarithmic option is safe here: the grid and the chart share exactly one fact, the price,
  and both take it from `calculatePrice`. They share no coordinate space - the grid's axis
  is a 0-50% control track in a cell, the chart's is a price axis in a separate panel - so
  there is no second derivation for a logarithmic mapping to break. A scale argument
  appearing in `orderPriceLines` would be that second derivation, and
  `orderPriceLines.test.ts` guards it by *calling* the function with each shape a scale
  would plausibly arrive in and asserting the prices do not move. An arity assertion would
  not: `Function.prototype.length` stops counting at the first optional parameter, so
  `toHaveLength(2)` stays green for `scale?: PriceScaleKind` and for a trailing options
  object, which are exactly the regressions it would exist to catch.
  `orderAutoscale.ts` carries the one thing a logarithmic axis genuinely cannot do: show a
  zero or negative price, which the drag layer's 0-100 vs 50 percent mismatch can still
  produce. It always returns a provider, never `undefined`: `applyOptions` merges with a
  helper that skips an undefined source value, so `undefined` does not clear a provider,
  it leaves the previous one installed and the chart stretched to a level the user has
  already deleted.
- **An indicator is a pure `compute` plus a registry entry.** `indicators/registry.ts` is
  the one list; the toolbar, the line series and their lifecycle in `useIndicatorSeries.ts`
  are all derived from it, so adding one needs no wiring. Averages are pinned against a
  published vector in `indicators/movingAverage.test.ts` rather than eyeballed. An
  oscillator needing its own pane is not covered by this shape and would have to add one.
  Feed an overlay the *live* candle list - `withLatestCandle(candles, latestCandle)` from
  `src/utils/liveCandles.ts` - never `useOHLCData`'s `candles` alone and never a list built
  any other way. An overlay is a function of the whole series while the candle series
  advances through `update`, and the two fed differently is a line that looks live and is
  not. Both halves of that fold have now been wrong in turn: fed the backfill alone an
  overlay froze at the fetch, and fed each tick folded into a backfill that never grew it
  advanced while dropping every bar that had closed since, averaging across a hole. The fold
  is therefore one function with one owner on each side - `useOHLCData` folds a bar into
  `candles` when the interval rolls over and that bar is final, keeping `candles`
  identity-stable between bar closes; the chart folds the forming bar on top. The forming
  bar counts towards an average, pinned in `movingAverage.ts` next to the EMA seed.

Chart controls are toggle buttons carrying `aria-pressed`; they announce themselves and
must not reach for a live region. `gridAnnouncements.ts` stays the app's only announcer.
Their accessible name is `label: description`, so the visible text stays *inside* the name
rather than being replaced by it (WCAG 2.5.3 Label in Name): a bare `aria-label` spelling
out the abbreviation renames "SMA 20" to something a voice-control user cannot say.

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

The invariants the order path depends on, each of which was previously violated in
`src/api/orderMapper.ts` and is now pinned by tests:

- **One price formula.** `src/utils/price.ts` `priceAtOffset` is the shared owner of
  "percentage offset from market" for the grid display and the order mapper. The grid cell
  renders its price chip through `calculatePrice`, which delegates to it, and the order
  mapper builds Kraken payloads from it directly, so the price sent is the price shown.
  The chart's order lines join them: `orderPriceLines.ts` calls the same `calculatePrice`,
  and `orderPriceLines.dom.test.tsx` reads the chip a real `GridCell` renders and asserts
  it is the number the chart draws, so the copy the chart used to inline cannot come back.
  Captain's decision D3: a block at yPosition 25 means **25%** from market,
  not 2.5%. The side of the market comes from the block's own `direction`, never from
  re-deriving one from row/column - those disagree under the bulk pattern. That settles the
  direction question **for single-block cells**; it is still **open for bulk cells holding
  mixed order families**, which is the known gap below, owned by `bb3-mapping-owner`.
- **A block's order type is `BlockData.orderType`.** Never parse it back out of the block id.
  Ids look like `sa-stop-loss-limit-limit-2`, and substring matching on them turned every
  `-limit` variant into a plain limit order with no trigger. Because `mapOrderType` refuses
  an unrecognised type rather than guessing, its table in `src/api/orderMapper.ts` and the
  `ORDER_TYPES` palette in `src/data/orderTypes.ts` are **two lists that must stay in step**,
  like the path aliases below. Add a type to the palette alone and it drops, renders, saves
  and reloads fine, then throws at Execute; `orderMapper.test.ts` maps every palette entry
  so that fails in CI instead.
- **A block carries only its own axis.** A dual-axis order type is placed as two blocks, one
  per axis, and `BlockData.axes` on each is just that leg's (`["trigger"]` or `["limit"]`),
  never the order type's whole list. Rebuilding a saved block from `typeDef.axes` gave one
  leg both, and the mapper then read that leg's single slider twice and emitted a payload
  whose `trigger_price` and `limit_price` were the same number - which passes `validateOrder`
  cleanly, so nothing catches it. `axesForBlockAxis` in `src/utils/blockFactory.ts` owns the
  axis-to-axes mapping, and both hydration paths go through it - `gridFromConfig` in
  `StrategyAssemblyContext.tsx` and the Active Orders panel's grid - rather than reaching for
  `typeDef.axes` or re-deriving `axis === 1 ? trigger : limit`, which has no notion of a
  single-axis type and relabels a Stop Loss saved at axis 2 as a limit leg. The mapper now
  refuses a block that claims both axes, on the primary and on a linked conditional alike,
  so a regression in any construction path fails loudly instead of shipping a trigger price
  equal to the limit price.
- **Conditional links are flat and one level deep.** A Kraken conditional close hangs off
  exactly one primary order and carries no conditional of its own, so each primary may
  carry one conditional, a conditional may not be shared between two primaries, and a
  conditional may not have a conditional of its own. Every other shape of the
  `linkedBlockId` graph is refused by `assertLinksAreFlat` in `src/api/orderMapper.ts`,
  because each one otherwise emits a wrong order set with nothing to explain it: a cycle
  sends no orders at all, a chain drops its tail, a shared conditional submits the same
  close twice, and a link naming a block that is not on the grid emits the primary alone
  with its protective close gone. A block linked as a conditional must also be an order type
  Kraken accepts as a conditional close - `CONDITIONAL_ORDER_TYPES` is the one list, shared
  by that guard and by `buildConditional`, and a block that fails it used to be dropped from
  the payload without a word, having already been skipped for being somebody's conditional.
  `findLinkedBlocks` still drops a link it cannot resolve, because it is a resolver rather
  than a validator; the guard reads each block's raw `linkedBlockId` so it sees the dangle
  the resolver has already discarded.

  **Ordering constraint, a hard prerequisite rather than a nice-to-have:** before anything
  in the app writes `linkedBlockId`, deleting a block must clear every link pointing at it.
  Refusing a dangling link is safe only because nothing writes links today; wiring that path
  up without fixing deletion first turns an ordinary delete into a refused strategy for real
  users. Owned by `bb3-mapping-owner`.

`src/api/orderMapper.ts` refuses rather than guesses: an unrecognised order type, a block
claiming both axes, a link graph that is not flat, an incomplete conditional close, and a
price that is not a finite number or not a positive static one all throw or fail validation,
because silently substituting a different order is the failure this module exists to
prevent. `useKrakenAPI.prepareOrdersFromGrid` catches that and surfaces it as `orderError`.

`validateOrder`'s price guard is a last line of defence, not the fix for what feeds it:
prices reach it as strings, so `"0.0"` is truthy and a presence check passed it. It is
reachable because `calculateYPosition` works on a 0-100 scale while the slider and the axis
labels use `SCALE_CONFIG.MAX_PERCENT = 50`, and the drop handler writes the unclamped result
into the block - a block dragged to the bottom of its cell is a 100% offset, which is a
price of zero. That root cause is in the drag layer and is owned by `bb3-mapping-owner`.
Every price must be finite; **positivity is checked only for a static price**, because under
a `pct` or `quote` price type the value is a signed offset and `-1.5` is legitimate.

Still open in the same file, and deliberately not fixed with the above: the two legs of a
dual-axis order type (`stop-loss-limit` and friends) are emitted as two separate orders
rather than one payload carrying both `limit_price` and `triggers`, so each leg now fails
`validateOrder`. Merging them needs a durable pairing identity on the block, since either
leg can be dragged to another cell.

**Known gap: under the bulk pattern the price shown and the price sent can disagree.**
`src/components/common/grid/GridCell.tsx` derives one `isDescending` for the whole cell from
`blocks[0].direction` and renders every block's price chip, percentage sign and slider
geometry from it, while the mapper reads each block's own `direction`. A bulk-pattern cell
can hold blocks with opposite directions, so the two diverge. Concretely: at a $50,000
market, drop a Limit into Entry/Primary and then a Stop Loss into the same cell, and the
Stop Loss chip reads `-25.00% $37,500` while the payload and the chart line both say
`62,500`. It is not reachable in the conditional pattern, which is the default. It is
deliberately not fixed here, and has been filed to `bb3-mapping-owner`, which owns
reconciling the chip, the chart and the payload together; that owner must decide what a bulk
cell means and apply that one answer to all three in a single change - splitting it across
owners is how display and payload drifted apart in the first place, which is exactly what
decision D3 exists to prevent.

**Known gap: `axis` is derived two ways, so a live grid and a reloaded one can disagree
about which leg is the trigger.** Hydration derives `axes` from the saved `axis`, but the
drop handler rewrites `axis` from the pointer's x-half (`findAxisAtPosition` in
`src/utils/grid.ts` returns 1 for the left half, 2 for the right; `GridArea.tsx` writes it
straight into the config) without touching `axes`. Concretely: drag a Stop Loss Limit's
trigger leg and release just right of the cell midline, and the live session still emits
`triggers.price = 66098.4` from its in-memory `["trigger"]`, while the same config after an
Edit reload comes back as `["limit"]` and emits `limit_price = 66098.4`. Same saved
strategy, two different payloads. Nothing wrong is submitted today, because a split
dual-axis leg fails `validateOrder` either way - but it becomes a silent wrong payload the
moment the two legs are merged into one order, which is why it is written down here rather
than left as folklore. Owned by `bb3-mapping-owner`; `axis` and `axes` should be kept in
step at the one place `axis` changes, through `axesForBlockAxis`.

## Path aliases

`@`, `@components`, `@widgets`, `@common`, `@hooks`, `@utils`, `@store`, `@data`, `@assets`,
`@api` and `@styles` are declared in **two** places that must stay in step:
`resolve.alias` in `vite.config.ts` (runtime and tests) and `compilerOptions.paths` in
`tsconfig.app.json` (typecheck). Adding an alias to one and not the other builds but fails
to typecheck, or vice versa.

Product code currently imports relatively (`../../../../App.styles`) and does not use the
aliases; the tests do. Prefer the aliases in new code.

There is deliberately no alias for `api/`. The client tree must not import it, and an alias
would invite exactly that.

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
