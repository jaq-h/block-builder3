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
  See `src/utils/blockMapping.test.ts` (node) and `src/utils/blockMapping.dom.test.tsx`
  (jsdom) for the split.
- Globals are off. Import `describe`/`it`/`expect` from `vitest` explicitly.
- `src/test/setup.ts` registers the jest-dom matchers, unmounts React trees after
  each test, and replaces `fetch` for the whole suite: Kraken's `AssetPairs` request is
  answered from `marketFixtures.ts` and every other URL throws, so no test reaches the
  network. It is the mount that is the trap rather than any one file - anything rendering
  `MarketProvider` fetches - so a test needing its own response stubs `fetch` itself.
- Tests are colocated with the code they cover, named `*.test.ts`/`*.test.tsx`. Two live
  under `api/_lib/` instead because they are about the whole repository rather than about a
  neighbouring module: `credentialBoundary.test.ts` builds the client and scans the emitted
  bundle, and `deploymentSurface.test.ts` checks which routes a deploy would publish. Both
  are `api/`'s responsibility, because the boundary is. `vite/` holds two more on the same
  principle - a repository-wide test sits with whatever owns the fact, not with its subject.
  `vite/eagerChunk.test.ts` scans a production build for `lightweight-charts` in the eager
  chunk, because which module lands in which chunk is the Vite build's business rather than
  the chart's. `vite/buttonResetLayer.test.ts` is there for that reason and one more: it has
  to read `src/index.css` as text, and `src` is typechecked without node types while `vite/`
  has them - which is the second reason the bundle scan is there too.

A test may deliberately assert **current, wrong** behaviour, commented
`CHARACTERISATION OF A KNOWN BUG - do not "fix" this expectation`. None are live today;
the last of them, in `src/api/orderMapper.test.ts`, were converted when the bugs they
pinned were fixed. That is the convention when you fix such a bug: flip the expectation to
the correct behaviour and keep a `FORMERLY A CHARACTERISATION OF A KNOWN BUG` note
recording the wrong values, rather than deleting the test or quietly loosening it.

`src/test/marketFixtures.ts` holds Kraken's real `MarketPrecision` records for the pairs on
offer. Use them rather than inventing one: the point of the set is the spread - BTC prices to
one decimal and ARB to four, BTC's minimum order is 0.00005 and ARB's is 60 - and a test that
only ever sees one pair cannot catch a formatter that has quietly defaulted to another's.

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
  `vite/eagerChunk.test.ts` enforces this against the emitted bundle.
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

The README's **Interaction model** section is authoritative. Twelve things bite in ordinary work:

- **Never add a `window` *mouse* listener to drive a drag.** The gesture layer is
  `usePointerGesture`, on Pointer Events. Mouse events are also suppressed during a drag,
  because `pointerdown` calls `preventDefault`. This forbids `mouseup`/`mousemove`, which the
  browser genuinely does not deliver for a release outside the window; it is not a rule
  against `window` itself, and the pointer listeners below are the point.
- **A gesture starts on an element and ends on the window, and every gesture ends.**
  `usePointerGesture` puts only `pointerdown` on the element - the one thing that has to know
  *which* element this is - and listens on the window for `pointermove`, `pointerup` and
  `pointercancel` for the life of the gesture, keyed on the pointer id. `setPointerCapture` is
  still taken, for what it is actually for, holding hit-testing still: **inside the page it is
  not what delivers the release, and outside the window it is the only thing that does.**
  **The exits, in full, because none of them may be simplified away:** a release the window
  heard, a `pointercancel`, unmount, a fresh `pointerdown` on the element while it still
  carries *that hook instance's* handlers, a `pointermove` carrying `buttons === 0`, and the
  shared `blockInHand` register being emptied. Unmount is the one that has to be taken by
  hand, since the window listeners come off with the component; a new drag hook gets it for
  free and must not re-open the hole by holding gesture state of its own. The register is a
  boundary rather than a detector - it ends a stale gesture when the user clicks away, and
  has no opinion about when one went stale - so `buttons === 0` stays as the platform-level
  backstop for a user who never clicks away, and one making the other redundant in a given
  trace is not the same as it being redundant. **What is not covered:** between an unheard
  release and the next exit, the gesture is still live and its overlay is still on the cursor.
  Do not "simplify" any of this back into an early return, and do not answer it with a capture
  watchdog, a timer or a `lostpointercapture` listener: the hook cannot see a capture it never
  got. The README's **Interaction model** section carries why each exit exists and what the
  element-only delivery cost; `usePointerGesture.dom.test.tsx` pins it under "a release the
  element never receives" and "the shared block-in-hand register", and
  `GridArea.dom.test.tsx` under "a release the dragged block never receives".
- **"A block is in hand" has exactly one owner: `src/hooks/blockInHand.ts`.** A pointer
  gesture and a command carry both register there and hand over the function that ends them;
  `releaseBlockInHand()` is the one call that ends whatever is held. Do not add a second
  thing for a release site to remember - a new mechanism registers there instead. The two
  cooperating refs this replaced are why: the hatch cleared its own carry while a stale
  gesture kept window listeners that match on pointer id alone, and a mouse's id is a
  constant 1, so the `pointerup` completing a dismissal click was resolved as that gesture's
  drop on no cell and `handleDragEnd` deleted the block.
- **Which cell a drop landed in has one owner: `src/utils/dropTarget.ts`.** It hit-tests the
  dragged block's own 40px tile rather than the pointer, so a cell the block's EDGE overlaps
  is a cell it can land in. All three sites take it - the palette drag that creates an order,
  the free drag of a placed block, and the hover highlight - because a highlight computed one
  way and a drop the other is a target that promises a cell the release then refuses. The
  point test it replaced (`findCellAtPosition`, gone from `grid.ts`) left a dead band half a
  tile wide around every cell plus the whole 24px gutter between two of them, in which a
  release showed a block plainly over a cell and announced "Released outside the grid"; that
  band is not speed-dependent, but the same point test drove the highlight, so only a fast
  drag gave the user no chance to notice. **Overlapping two or more cells** resolves by
  greatest overlap area, then the cell containing the pointer, then the lowest `(col, row)` -
  sorted there rather than taken from `querySelectorAll` order. The resolver answers geometry
  and stops: `isCellValidForPlacement` and the placement primitives still decide whether the
  cell will take the order, and folding validity in would silently place a block in a
  neighbour it merely brushed. Do not reintroduce a point test, and do not give the highlight
  a rule of its own.
- **A click outside the placement surface puts down whatever is in hand**, by emptying that
  register. The surface is the element `GridArea` draws - the palette a block is picked up
  from and the cells it can be put down in - and it is chosen by that element rather than by a
  panel outline, so this rule and the drop rules can never disagree about what "on a target"
  means. It listens for `pointerdown` in the capture phase: a drag that is genuinely in flight
  holds pointer capture and its events are retargeted to the dragged block, which is inside
  the surface, so a live gesture is not cancelled by it. That rests on the capture, which is
  not guaranteed. Focus is not handed back, for the same reason Tab does not hand it back.
- **Only a palette order is ever carried.** A placed block does not change cells, by any
  input method (decision D9, and see "Prices and order types"), so the carry has one kind of
  source and `CarriedBlock.source: ProviderSource` is the type saying so. Pressing Enter,
  tapping or clicking a placed block reaches `refuseMove` instead, and whether that refusal
  offers the arrow keys is decided by `cellDrawsPriceAxis` - the same owner the renderer uses
  to decide whether to draw an axis at all, so the affordance named is one this render really
  wired.
- **The mouse is a first-class user of the command model: click to pick up, click to place**,
  and hold-to-drag is unchanged beside it. `TAP_SLOP_PX` (4px) is the one threshold that
  separates a click from a drag, for every device - a per-device number would be a second
  derivation of one fact. Two things are true for a *mouse* carry and no other, both gated on
  `CarriedBlock.origin === "mouse"`, because a mouse is the only pointer with a cursor on
  screen while nothing is pressed: the block follows that cursor as the same
  `dragOverlayStore` ghost a drag uses, and `pointToTarget` makes the cell under the cursor
  the carry's target. `pointToTarget` is **silent** - it fires for every cell a sweep crosses,
  and announcing would be the live region talking over itself. `ActivationOrigin` is
  `keyboard | mouse | touch` for the same reason; pen groups with touch, since what matters is
  a persistent cursor rather than hover. `dragOverlayStore` keeps every live ghost as a stack
  and draws the newest, so `startDragOverlay` hands back a handle and `stopDragOverlay(handle)`
  takes away that holder's own ghost and no other. Both directions need it: a drag started on
  the carried block puts its ghost up *before* the carry ends, and a click that lands on some
  other block runs a whole gesture *inside* a carry that outlives it. A handle-less
  `stopDragOverlay()` empties the stack, and `GridArea`'s dismissal hatch is its one caller,
  because that is the one thing putting down everything in hand. What the stack does not do is
  notice a holder that goes away without stopping its ghost.
- **Every new interactive affordance needs a keyboard path and an announcement**, not just a
  handler. Placement is expressed in terms of a target cell in `GridArea`
  (`placeProviderInCell` for a palette order, `keepBlockInItsCell` for the refusal a placed
  one gets); the pointer drag and the command model both call them. Anything that bypasses
  those two functions will work for one input method only.
- **Never compose an announcement string at a call site.** `src/utils/gridAnnouncements.ts`
  writes every sentence the grid speaks and `useGridAnnouncer` is the only thing that reaches
  the live region; callers report an *outcome*, and the placement primitives return a
  `PlacementResult` so the sentence comes from what the grid did rather than from what the
  caller was about to attempt. Both defects this structure replaced were a message written
  next to the code that was about to act - one false, one silent - and each point fix created
  the next. A new message means a new outcome in that union, not a new `announce` call.
  One event that ends several things at once is still one message: `releaseBlockInHand`
  reports an outcome per mechanism, and `useGridAnnouncer`'s `asOneEvent` collects them into a
  single live-region write, joined by `describeOutcomes` - two writes means the second replaces
  the first before it has been read.
  A second live region breaks this as surely as a second `announce` does, so no component
  that speaks *about the grid* may carry `aria-live`, `role="status"` or `role="alert"` -
  the two would talk over each other during the one interaction that fires both. That is
  what the `role="status"` removal from `MarketSelector`'s precision warning was about.
  Ordinary *visible* text is not a live region and is always allowed; that warning is one.
  `ErrorBoundary`'s `role="alert"` fallback is not a violation and must not be "fixed":
  it *replaces* the subtree it guards and speaks once about that subtree's own failure,
  so there is no running commentary for it to compete with - by the time it speaks, the
  announcer it would have talked over is not rendered at all.
- **`LiveAnnouncer` only speaks from a panel that is on screen.** Below `lg`, `App.tsx`
  hides the inactive panel with `display: none`, and a `display: none` subtree is out of the
  accessibility tree - so a live-region write inside it announces to nobody. Anything the
  grid *refuses* therefore needs a visible half where the user acted, as well as the
  announcement: a refused strategy load says so on its own card in the Active Orders panel
  (`refusedStrategy`), because that is where Edit was pressed.
- **A control's selected state may never be drawn in colour alone**, and it has to be
  readable programmatically as well as visually. `PatternSelector` is the worked example:
  the chosen assembly type carries an accent border, a tick glyph in a slot reserved on
  every button so nothing shifts, and `aria-pressed`, inside a group named
  "Order assembly type". `PatternSelector.dom.test.tsx` pins all three.
- **A block on a price axis is a `role="slider"` whose value is signed** - positive above the
  market price, negative below - so arrow-key direction matches on-screen direction on both
  scale directions. `yPosition` in the data stays an unsigned magnitude plus a `direction`.

## The chart panel

`src/components/widgets/orderChart/` owns the price chart. Four rules keep it honest:

- **The price scale is presentation and nothing else.** `priceScale.ts` holds the
  vocabulary - the kinds, the buttons offering them, the default - and `priceScaleMode.ts`
  maps that choice onto the library's `PriceScaleMode` and stops there. No price,
  no order and no grid position is derived from it, which is the whole reason the
  logarithmic option is safe here: the grid and the chart share exactly one fact, the price,
  and both take it from `priceForOffset`. They share no coordinate space - the grid's axis
  is a 0-50% control track in a cell, the chart's is a price axis in a separate panel - so
  there is no second derivation for a logarithmic mapping to break. A scale argument
  appearing in `orderPriceLines` would be that second derivation, and
  `orderPriceLines.test.ts` guards it by *calling* the function with each shape a scale
  would plausibly arrive in and asserting the prices do not move. An arity assertion would
  not: `Function.prototype.length` stops counting at the first optional parameter, so
  `toHaveLength(2)` stays green for `scale?: PriceScaleKind` and for a trailing options
  object, which are exactly the regressions it would exist to catch.
  `orderAutoscale.ts` carries the one thing a logarithmic axis genuinely cannot do: show a
  zero or negative price, which the drag layer's 0-100 vs 50 percent mismatch used to
  produce; `clampOffset` closed that, and the guard stays because a guard that trusts its
  callers is not one. It always returns a provider, never `undefined`: `applyOptions` merges with a
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
  **A bar close redraws one bar, not the series.** `candles` growing by a bar is not
  new data arriving, it is the bar already on the chart being declared final, so
  `OrderChart` writes that one bar over itself with `update()` and leaves the rest
  standing. `appendedCandles` in `src/utils/liveCandles.ts` is the one owner of what
  counts as an extension, and its docblock carries why each case is judged as it is;
  anything that is not one - a market switch, a corrected backfill, a series holding
  nothing - still takes the full `setData`. `OrderChart.dom.test.tsx` pins the
  transition under "a bar close".
- **The header is one component, and the placeholder is that component.** `ChartHeader.tsx`
  draws both rows for the real panel and for the `Suspense` fallback in `LazyOrderChart`,
  which renders it with its `controls` prop omitted: the same buttons at the same sizes,
  `disabled`, behind `aria-hidden`, and - because `:hover` matches a disabled element and
  the cursor is honoured on one - drawn by `chartToggleButton` with no hand cursor and no
  hover feedback, so no input method offers a control that would silently do nothing.
  That is what makes the swap cost no layout shift, and it is not something a constant
  can do - what a wrapped row measures depends on the panel's width, so the two headers
  have to *be* the same markup. `chartHeaderSecondaryRow`'s `min-h-[38px]` was the
  previous answer and is gone; measured on production builds, the placeholder and the real
  header stood at 103px against 139px at both 390px and 1024px while that floor was in place
  and agreeing with itself. They are equal at 390, 1024 and 1440 now.
- **Nothing `ChartHeader` reaches may import `lightweight-charts` as a value.** It is in the
  eager chunk, so a value import there puts the app's largest dependency back in the initial
  payload and undoes the code split silently - the build still succeeds. This is why
  `priceScaleMode.ts` is a module of its own rather than a function at the foot of
  `priceScale.ts`: `PriceScaleMode` is an enum, so naming it is a value import.
  `indicators/types.ts` is safe because its library import is `import type`. **This is
  enforced, not documented: `vite/eagerChunk.test.ts` builds and fails if the eager chunk
  carries the library.** It takes "eager" from the build's own manifest - the entry chunk plus
  what it statically imports, transitively - rather than from `dist/assets/index-*.js`, so a
  new shared chunk is covered without being named, and it scans for the strings the library
  emits into its own minified output rather than for the package specifier, which minification
  removes. It also asserts those markers are *present* in a lazy chunk, so a build that dropped
  the library or a release that renamed a marker fails the file instead of passing an absence
  check that has stopped meaning anything.

Chart controls are toggle buttons carrying `aria-pressed`; they announce themselves and
must not reach for a live region (`aria-live` and `role="status"` alike).
`gridAnnouncements.ts` stays the app's only announcer.
Their accessible name is `label: description`, so the visible text stays *inside* the name
rather than being replaced by it (WCAG 2.5.3 Label in Name): a bare `aria-label` spelling
out the abbreviation renames "SMA 20" to something a voice-control user cannot say.

## Layout and the CSS cascade

Fourteen traps live in the layout, and each is easy to reintroduce.

**The app's chrome wraps; it never scrolls.** A row of controls - a toolbar, a
title bar, a tab strip - that cannot fit its width gets `flex-wrap`, and the row
grows. It does **not** get `overflow-x-auto`. Two things go wrong when it does,
and the first is invisible on the machines this project is developed on: the
box's own height then depends on the platform's scrollbar, because an
auto-height `overflow-x-auto` box grows by the gutter a classic space-taking bar
needs - on the reverted attempt's analysis in issue #20, about 15px, so a 32px
group measures about 47px on Windows and most Linux and 32px on macOS overlay
scrollbars. Those two are inherited rather than observed here, and cannot be
observed here: this project's machines have overlay scrollbars, which is itself
why the scroller was rejected as unverifiable. The second is that a scrollport
clips the focus rings of the controls inside it, on both axes: `outline` is not
part of the border box, so `scroll-into-view` slices the ring of the very
control the scrolling exists to reach. This was tried on `chartControlGroup` and
reverted. **Scrolling remains correct for content**, and every `overflow-auto`
in `src/` is that kind: a region whose height a parent already fixes - the
Active Orders card list, the assembly panel's content - so its own content does
not decide its size. The consequence, and the reason there is no
`scrollbar-width`, `scrollbar-gutter` or `::-webkit-scrollbar` rule anywhere:
the app never puts a scrollbar somewhere its width could change a layout, so it
never has to style one. `ChartHeader.dom.test.tsx` pins the chart's control
groups against both halves of this.

**`panelTitleBar`'s `h-16` has exactly one exception, and it is written down
next to the constant.** `wrappingPanelTitleBar` in `src/styles/shared.ts` is the
same rail with the height relaxed to a floor and wrapping allowed, and the chart
panel's title bar is its only user - the only title bar carrying controls rather
than a title alone. Seven timeframe buttons could not fit beside the pair and the
price, and with a fixed height the overflow was *drawn outside the panel's*
`overflow-hidden`: measured on `main` with the offline warning showing, the
trailing controls sat up to 144.53px past the panel edge at every viewport below
480px, and up to 132.53px past it in the 1024-1100px band where the chart panel
is at its 300px floor. Unreachable by any input, with nothing to scroll them back.
The exception costs nothing where the constant matters: the three title bars are
only side by side above `lg` - below it the layout is tabbed - and this bar
measures **exactly 64px at every width from 360px to 1920px**, wrapped or not,
because two lines come to 20px of text plus a 12px row gap plus a 24px control,
which is 56px and inside the floor. Only at 320px does it exceed 64, and there no
two panels share a screen. The assembly and Active Orders bars take
`panelTitleBar` unchanged. A new panel takes `panelTitleBar`, not this.

**The desktop shell only has a height above `lg`.** `body`/`#root` are
content-sized, so `h-full` resolves to `auto` unless something above it commits to
a height. `appContainer` (`src/App.styles.ts`) supplies that with `lg:h-dvh`; the
assembly panel below it is a flex column whose action bar is `shrink-0` and whose
grid area scrolls. Remove the `lg:h-dvh` and the action bar - Execute Trade
included - drops below the fold again. Below `lg` the height is deliberately
content-driven so the tabbed layout still scrolls with the page.

**The shell's row template changes with the breakpoint, because what is in the
grid changes with it.** Below `lg` `appContainer` holds two in-flow items, the tab
nav and `main`, so it is `grid-rows-[auto_1fr]`. Above `lg` the nav is
`display: none` and the visually-hidden `h1` is absolutely positioned, so neither
is a grid item and `main` is alone - which put it in the `auto` row and left the
`1fr` row standing empty beneath it, measured as tracks of `835.5px 64.5px` at
1440x900. `lg:grid-rows-[1fr]` is what keeps that band of viewport from being
thrown away. Adding a child to `appContainer` means checking the template again.

**The bare element rules in `src/index.css` live in `@layer base`, and there is
no escape hatch from them.** They are element *defaults*, and a default is
something a component overrides - which only holds while they are layered.
Unlayered CSS wins over layered CSS regardless of specificity and every Tailwind
utility is layered, so for as long as that block sat outside a layer a matched
button ignored its own `px-*`, `border-2`, `rounded-*` and `bg-*`. **Never write
a bare `button {}`, `a {}`, `body {}` or `h1 {}` rule outside `@layer base`**;
`vite/buttonResetLayer.test.ts` asks that of each of those four element types in
turn and fails if one appears, because jsdom applies no author stylesheet and no
rendering test can see a cascade. Its reach is stated in full at the top of that
file, holes included: it models the defaults the app writes for its own markup,
so a rule scoped by a class, or one selector reaching two of those types at once,
is outside it.

**There is exactly one mechanism, and it is "write the utility".** Two lanes
previously dodged the unlayered reset without knowing about each other - a
`data-unstyled` opt-out attribute on `PatternSelector`, and `!` modifiers in
`executeButtonVariants` and `chartToggleButton`. Both are gone, along with the
`:not(...)` that made the first one work. A control that wants to look different
now says so in its own utilities and they win. Do not reintroduce either
mechanism, and do not invent a third: one fact styled two ways is the problem
this repository keeps paying for, and styling is not exempt from it.

Taking the layer repainted every button to what its own utilities had always
asked for, and two consequences are owned in the code rather than left as
folklore:

- **`chartToggleButton` carries `min-h-6`/`min-w-6`, the 24px WCAG 2.2 SC 2.5.8
  minimum target size.** Padding alone does not reach it: an 11px label with
  `leading-none` in `py-1` measures 21px tall, which is what every control in
  both chart toolbar rows rendered at before. It is the floor for a control, and
  nothing else derives from it: the lazy fallback matches the real header's
  height by being the same component, not by any row floor. Measure a new control rather than
  reasoning about its classes - `getBoundingClientRect()` in the browser is the
  check, and `#tv-attr-logo` in `src/index.css` is the same fix applied to the
  chart library's own attribution link.
- **`src/components/blocks/block.tsx` is the one deliberate exception to the
  filled treatment,** and the comment on `buttonVariants` is the authority on
  why: a block tile's colour *is* its state (palette entry, valid drop target,
  in hand, drag ghost), so the resting tile keeps a quiet accent tint and the
  saturated end of the scale is left for the states. It is written in that
  component's own utilities - no attribute, no `!`. The drag ghost is one of
  those states, so `DragOverlay` paints the same tile at full `bg-accent-primary`
  while the resting tile stays quiet: **the two colours differ on purpose and
  must not be reconciled.** Only the colour differs - the geometry has one owner,
  `BLOCK_TILE_SHAPE` in `src/components/blocks/blockTile.ts`, which both draw
  from, because a hand-copied class list is how the two came to disagree about
  the colour without either file saying so. That size as a *number* has one
  owner too, and it is the pre-existing `BLOCK_HEIGHT` in `src/styles/grid.ts`
  rather than a second constant beside the class list: the tile is square, so
  the price-axis layout's insets and `BLOCK_HEIGHT / 2` centring, `DragOverlay`
  centring the ghost on the pointer, and `dropTarget.ts` hit-testing that
  ghost's edges are all the same measurement. `blockTile.test.ts` pins that
  number against the class list on both axes, so resizing the tile in one
  cannot leave the other behind.

**Every panel title bar takes its geometry from `panelTitleBar` in
`src/styles/shared.ts`, or from its one documented exception.** The assembly
panel's pattern selector and the Active Orders title take the constant itself;
the chart's title row takes `wrappingPanelTitleBar`, the exception above, which
is the same rail with the height relaxed to a floor. All three titles still share
one height, one 16px rail and one centre line, which is what the rule is for.
Two bars that merely agreed is how they came to disagree by 11.5px in height and
194.14px on the rail. `panelHeaderBar` is that geometry plus the bottom border and
the background, for a panel whose header is a single bar: the assembly panel and
Active Orders. The chart panel is not that shape - it carries a toolbar row under
its title bar, so its header block is taller than the other two and `chartHeader`
draws the border and the background around both rows. It is the title bars that
line up, not the header blocks. A new panel takes `panelTitleBar` rather than its
own copy, and not the exception - that one is spoken for.

**A scrolling panel scrolls with `overflow-auto`, and is bounded by its row
rather than by a number.** `overflow-scroll` reserves and draws a bar on both
axes whether or not anything overflows, and the Active Orders container did that
on a container that can never scroll: `ActiveOrders` is `h-full` inside it and
its own card list is the scroller, so measured empty its scrollHeight equalled
its clientHeight and its scrollWidth its clientWidth. A `max-h-*` on a panel the
grid row already bounds is the same mistake as a magic cell height below - the
800px one there did nothing at 900px of viewport and, at 1440x1400, held the
panel to 800px of a 968px row while the list inside was still overflowing by
301px. That holds only where the row is definite, so the cap comes off above
`lg` alone (`max-h-200 lg:max-h-none`): below it `body`/`#root` are
content-sized, the chain down to the panel is indefinite, and the cap is the
only thing making the card list a scroller rather than growing the page.

**Grid cell height has a derived floor, not a magic number.** `CELL_MIN_HEIGHT`
in `src/styles/grid.ts` is the cell chrome plus `TRACK_INSET` plus a two-block
track: the height at which the price axis stops working. Cells are `flex-1`, so
wherever the panel has room they share it and stand taller. The flat 220px it
replaced was 30px more than the panel could give three of them at 1440x900, which
put a scrollbar on an empty grid and clipped the last two orders out of the
palette. Below roughly 866px of viewport the floor is reached and the panel
scrolls, which is correct: the fix for an overflowing grid is never to hide the
bar.

**Render each panel once.** `src/App.tsx` renders `assemblyPanel` and
`ordersPanel` in a single tree and hides the inactive one below `lg` with
`display: none`. Using a JSX element variable in two branches mounts two
independent components, and crossing the breakpoint then swaps in an empty one -
silent data loss. `src/App.test.tsx` fails if that returns.

**There is no router, and adding one back would be a mistake.** Which panel is on
screen is `activeTab` in `App.tsx`, and the tab bar is `lg:hidden` because above
`lg` there is no such thing as an inactive panel - both render side by side. That
is the reason: **no URL can describe the desktop layout.** Routing models mutually
exclusive views and this app has none, so `react-router-dom` was modelling
something untrue. It was also never wired: there were no `<Routes>` anywhere, so
the `/active` link pushed a URL that rendered the identical page, and nothing -
then or now - reads the path. The one control that pointed at it, "View Active
Orders" on the post-submission success message, is a tab switch
(`onViewActiveOrders`, drilled `App` -> `StrategyAssembly` -> `ExecuteTradePanel`)
and is `lg:hidden` for the same reason the tab bar is. A feature that genuinely
needs a shareable URL needs a decision about what a URL means for a two-panel
screen first, not a router underneath the existing one.

**A control that switches tabs from inside a panel has to hand focus out of it.**
Below `lg` the switch puts `hidden lg:block` on the panel that control lives in,
so the button just pressed lands in a `display: none` subtree, the browser drops
focus to `<body>` and the next Tab restarts at the top of the document.
`showActiveOrders` in `App.tsx` is the worked example: it commits the switch with
`flushSync` and *then* focuses the Active Orders tab button, which is mounted
either side of the switch. The order is the point - committing first means the
button already carries `aria-pressed="true"` when the focus event fires, so the
name and state a screen reader computes are the ones the user has arrived at.
`src/App.test.tsx` pins it.

**The feedback strip's gate is `orderCount > 0` *or* `showSuccess`.** A successful
submission raises `showSuccess` and calls `setOrderConfig({})` in one React
update, so the render that first has something to report is also the first render
with the grid empty. Gated on `orderCount` alone, `ExecuteTradePanel` unmounted on
exactly that render and "Orders submitted successfully!" was never once visible;
the failure path looked fine only because a refused submission leaves the orders
on the grid. `strategyAssembly.feedback.dom.test.tsx` pins both halves.

**The success message's time limit has one owner, and it is not a bare
`setTimeout`.** It is an effect in `useTradeExecution` keyed on `showSuccess`, so
there is exactly one pending dismissal and every transition out of a message
cancels it - a new submission, a strategy loaded for edit, a config change,
unmount. Two submissions inside the window used to leave the first timer running
to clear the second message early. Two further rules travel with it and neither
is decoration: `SUCCESS_MESSAGE_TIMEOUT_MS` is 20s rather than the 3s it was
while the message never rendered at all, and the limit **does not fire while the
strip holds the focused element** - the message carries a focusable control, and
taking it away mid-Tab drops focus to `<body>`, so the message stays up and goes
once focus leaves. The strip is `feedbackRef`, drilled `App` ->
`StrategyAssembly` -> `ExecuteTradePanel` and **required at every hop**: an
unfilled ref is not a weaker guard but no guard, because the owner then reads
`null` at the limit and dismisses unconditionally. `focusout` is only the prompt
to re-check `document.activeElement` a tick later, since a window blur fires it
while the strip still holds focus. `src/hooks/useTradeExecution.dom.test.tsx` and
`strategyAssembly.dismissal.dom.test.tsx` pin it.

## Markets

The app trades a **selected** pair, not a fixed one. `src/data/markets.ts` is the catalogue
(BTC, ETH, SOL, ARB, OP - all USD-quoted) and the only place a pair is chosen without the
user choosing it, through `DEFAULT_MARKET`. `MarketProvider` / `useMarket` in `src/store/`
hold the selection for the whole tree; `MarketSelector` is the control.

Three rules, and each replaced a defect that was invisible while the app was BTC-only:

- **No module may default a symbol.** There is no `DEFAULT_SYMBOL` and no
  `symbol = <something>` parameter default anywhere. An omitted symbol is how `buildTrigger`
  came to format a trigger price for BTC inside an ETH payload, so the market is passed
  explicitly or not at all. `useKrakenAPI` takes no `symbol` option at all: it reads the
  selection, so no caller can price a pair the selector is not showing.
- **Per-pair rules come from Kraken, never from a guess.** Price decimals, tick size, lot
  decimals and the minimum order all differ per pair - one decimal for BTC against four for
  ARB, a 0.00005 minimum against 60 - and none of them is derivable from a symbol string or
  from the magnitude of a price. `src/api/assetMetadata.ts` reads them from
  `/0/public/AssetPairs` into a `MarketPrecision`, and `src/utils/marketFormat.ts` is the one
  owner of every price and quantity format, for the payload and the screen alike. There is
  **no fallback precision**: without the metadata `mapGridToOrders` refuses to build a payload
  and says so, because an order rejected by Kraken for bad precision reaches the user as an
  order that silently never appeared.
- **The ticker channel follows the selection and releases the previous one.** The effect in
  `useKrakenAPI` owns it; `connect()` deliberately does not subscribe, because a second
  subscribe takes a reference nothing releases. `KrakenWebSocketManager` refcounts public
  subscriptions - two components call `useKrakenAPI` and both want the same ticker, so an
  unrefcounted unsubscribe from either silences the other.

`ParsedTickerData` is held tagged with the symbol it describes and a frame naming a different
market is dropped, so the previous pair's price can never be what a block is priced from
during a switch.

**Known gap: precision *readiness* has no owner.** "Does this pair have rules yet, are they
known to be absent, or are they still loading" is currently answered independently by
`MarketSelector`, `OrderChart`, `useLightweightChart`, `formatMarketPrice` and the order
path, each from `metadataSettled` plus a precision of its own. Every defect in that class so
far has been one of those five disagreeing with the other four - most recently the chart
drawing a whole axis at lightweight-charts' `precision: 2` default while every chip beside
it read `n/a` for the same pair. Owned by `bb3-price-format-readiness-owner`; a fix belongs
in one readiness value the five read, not in a sixth `metadataSettled &&` expression.

## The WebSocket layer

`src/api/krakenWebSocket.ts` is a seam, not a monolith, and the split is the whole design:

- **`socketLifecycle.ts` owns live connection state**, as one explicit state machine per
  socket: `idle`, `connecting`, `open`, `reconnecting`, `failed`. `CONNECTION_TRANSITIONS`
  is the whole table and `transition()` throws on an edge that is not in it, so a new call
  site cannot invent a sixth state out of a boolean. Read that file's header before changing
  anything about connections; it carries what each exit is for.
- **`subscriptionRegistry.ts` owns registered intent** - what the app has asked to be
  subscribed to - and knows nothing about sockets. Intent survives a failed connect, a
  backoff and the terminal state; only `disconnect()` clears it.

Conflating those two is what produced every lifecycle defect this replaced, so the awkward
cases now fall out of the model rather than needing a case each:

- **The budget, the timer and the attempt belong to a `SocketLifecycle` instance**, so one
  socket's flapping cannot spend the other's. The heartbeat is per socket for the same
  reason: one manager-wide interval driven off the public socket's open meant a public
  teardown stopped the private socket's pings.
- **`connect()` answers definitively from every state, `failed` included.** An explicit
  `connect()` is the one way back from terminal and it hands the socket a fresh budget;
  nothing automatic reaches that branch, so a socket that gave up stays given up. That is
  the app's only route back short of a reload, and `subscribe` reaching the connect on a key
  the registry already holds is what carries a remounting consumer through it.
- **One attempt, one promise, settled exactly once.** Resolved on entry to `open`, rejected
  on entry to `reconnecting`, `failed` or `idle`. No exit from `connecting` leaves a caller
  pending, and `disconnect()` settles by hand what the handlers it just detached would have.
  Pending order requests are rejected by `onLost` on every exit too, rather than left to
  their own 30s timeout while the socket they were sent on has already been replaced.
- **Ordering is structural.** `onOpen` runs *inside* the `open` transition - before the
  status is announced and before the connect promise resolves - so no observer can see a
  live socket that has not had its channels replayed. Whether a subscriber still has to send
  its own frame is answered by `openGeneration` across the await, never by a `readyState`
  sampled beforehand.
- **The private token is connection-scoped, and that is enforced rather than assumed.** The
  mint is the private lifecycle's `prepare`, it is handed an `AbortSignal`, and
  `getWebSocketToken` passes that straight to `fetch`. `disconnect()` aborts it, so a
  Kraken token - a live trading credential - is never minted for, nor left behind by, a
  connection that no longer exists. `hasPrivateCredential()` exists so that invariant is
  checkable; it returns a boolean and never the token.

Tests split the same way. `socketLifecycle.test.ts` is the machine with no Kraken in it;
`krakenWebSocket.test.ts` runs the simulated deployment, which is what dev and every public
deploy actually are; `krakenWebSocket.private.test.ts` mocks `isLiveTradingAvailable` true
so the credentialed lifecycle is genuinely exercised rather than skipped everywhere.
`src/test/fakeWebSocket.ts` is the stand-in - see the **Testing** section for why it is
strict about `send` while CONNECTING.

## Prices and order types

The invariants the order path depends on, each of which was previously violated in
`src/api/orderMapper.ts` and is now pinned by tests:

- **One price formula, and one owner of what is fed to it.** `src/utils/price.ts`
  `priceAtOffset` is the formula. `src/utils/blockMapping.ts` is the owner of its arguments,
  and of the whole block-to-price mapping: **axis membership, position, direction and a
  cell's scale**. Every consumer asks it - the price chip (`GridCell`), the read-only card
  (`ReadOnlyGridCell`), the chart (`orderPriceLines`), the Kraken payload
  (`extractBlocksFromGrid`), the vertical drag and the arrow keys - and none of them derives
  any of those four facts for itself. That is the rule to preserve: a fifth consumer works
  it out again is exactly how the chip, the chart and the payload came to disagree.
  Captain's decision D3: a block at yPosition 25 means **25%** from market, not 2.5%.
  Captain's decision D8: **direction belongs to the CELL**, stamped when the first block
  lands. `addBlocksToCell` is the one write path into a cell and the one place a direction
  is chosen; `normaliseCellDirections` brings a grid built elsewhere - a reloaded strategy,
  the Active Orders panel - onto the same invariant. `cellDirection` reading `blocks[0]` is
  therefore a statement about the cell rather than an accident of insertion order, which is
  what makes removing a block safe: the survivors already carry the cell's scale.
  `blockMapping.dom.test.tsx` is the acceptance check - it puts a Limit and a Stop Loss in
  one bulk cell at $50,000 and asserts the chip, the chart line and the payload all say
  `$37,500`, including on a grid whose blocks were never stamped.
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
  users. Still open, and not part of the mapping owner's remit.

`src/api/orderMapper.ts` refuses rather than guesses: an unrecognised order type, a block
claiming both axes, a link graph that is not flat, an incomplete conditional close, and a
price that is not a finite number or not a positive static one all throw or fail validation,
because silently substituting a different order is the failure this module exists to
prevent. `useKrakenAPI.prepareOrdersFromGrid` catches that and surfaces it as `orderError`.

`validateOrder`'s price guard is a last line of defence, and now genuinely the last one
rather than the only one: prices reach it as strings, so `"0.0"` is truthy and a presence
check passed it. It used to be reachable, because `calculateYPosition` read a 0-100 scale
while the axis runs to `SCALE_CONFIG.MAX_PERCENT = 50` and the drop handler wrote the
unclamped result into the block - a block dragged to the bottom of its cell was a 100%
offset, which is a price of zero. That reader is gone, and every position now flows through
`blockMapping.ts` before it is drawn or priced. The guard stays, because a validator that
trusts its callers is not one. Every price must be finite; **positivity is checked only for
a static price**, because under a `pct` or `quote` price type the value is a signed offset
and `-1.5` is legitimate.

**Clamp on read, never destroy information on write.** That is why the clamp comes in two
halves, and mixing them up re-opens the hole above. `clampOffset` is the DISPLAY answer: it
bounds the range *and* collapses a non-finite position onto the market line, because a chip
cannot print `NaN%`. `offsetForOrder` is what every path that can reach a Kraken payload
uses instead - the mapper, `orderConfigFromGrid`, and `setBlockPosition` writing a dragged
position back - and it bounds the range while leaving a non-finite value non-finite,
so `validateOrder`'s `Number.isFinite` guard still has something to refuse. Collapsing it
would price a corrupt block at the market, which is a finite, positive, entirely plausible
order. Hydration writes neither clamp into a stored block: `gridFromConfig` copies a saved
position across as it stands and `normaliseCellDirections` stamps a direction and nothing
else, because both used to clamp there and a hydrated grid then reached the mapper already
priced at the market with nothing left to refuse. `NaN` is not nullish, so a `?? 0` never
caught it either.

Still open in the same file, and deliberately not fixed with the above: the two legs of a
dual-axis order type (`stop-loss-limit` and friends) are emitted as two separate orders
rather than one payload carrying both `limit_price` and `triggers`, so each leg now fails
`validateOrder`. Merging them needs a durable pairing identity on the block.

**A placed block never changes cells.** Captain's decision D9, asked directly and answered
"every block": once a block is placed, its cell is where it lives, with no per-block-type
carve-out. `keepBlockInItsCell` in `GridArea.tsx` is the whole of it - it reports
`unchanged` for a release in the block's own cell and `refused` with `reason:
"staysInCell"` for any other, and mutates nothing. The command model carries palette orders
only, which `CarriedBlock.source: ProviderSource` states in the type rather than in a
comment. A misplaced order is corrected by removing it (drag it off the grid) and placing a
new one, until the cell-detail editor ships.

**Known gap: removing a single placed block is not reachable for most of them.**
`handleDragEnd` -> `removeBlock` is the only per-block removal path in the app, and it fires
only when a *free* drag ends outside every cell. `block.tsx` wires `useVerticalDrag` instead
for any block whose cell draws a price axis, so a placed Limit, Stop Loss or Take Profit
cannot be dragged off the grid at all, and no input method has a keyboard removal path for
any block type. Clear All is then the only way to remove one, and it destroys the whole
strategy. This is pre-existing and predates the mapping owner; D9 makes it more visible by
naming delete-and-rebuild as *the* correction path for a misplaced order. Closing it - a
removal affordance that works on a priced block and from the keyboard - is filed as its own
piece of work, and the sr-only block instructions deliberately promise removal only for a
cell that draws no axis until it lands.

**The refusal is legible, not silent.** Three things say so together and none of them is
optional: the announcer's `moveRefused` sentences, a visible note under the grid
(`cellLockedNote`, ordinary text - never a second live region), and no cell drawing itself
as a target while a placed block is dragged (`getActiveAllowedRows` returns none for one).
A gesture that simply does nothing is indistinguishable from a broken control, which is what
D9 asks this to avoid. The note is shown for **both** refusals and worded for each: a block
in a cell drawing no axis is told it can be dragged off the grid, and one on a price axis is
told about the arrow keys instead, because that is the affordance its render actually wires
and it has no removal path at all (see the known gap above). Showing one wording for both is
how the note came to promise a removal the app cannot perform.

**Two closed gaps, recorded because the shape recurs.** Both were one fact derived twice.

- *The price shown versus the price sent.* A bulk cell drew every chip on `blocks[0]`'s
  direction while the mapper read each block's own, so at a $50,000 market a Stop Loss
  dropped beside a Limit read `-25.00% $37,500` on screen against `62,500` in the payload
  and on the chart. Closed by D8 above.
- *`axis` versus `axes`.* Hydration derived `axes` from the saved `axis` while the drop
  handler rewrote `axis` from the pointer's x-half without touching `axes`, so a live grid
  and a reloaded one disagreed about which leg of a dual-axis order was the trigger. Closed
  by deleting the drop-time reader: a drop resolves a cell and nothing else, and
  `axesForBlockAxis` is the one derivation of the pair. Pinned by the round-trip test in
  `StrategyAssemblyContext.reload.test.tsx`.

**`orderConfig` is derived, not maintained.** `orderConfigFromGrid(grid)` is a projection,
memoised in `StrategyAssemblyProvider`; there is no `setOrderConfig`. It used to be a second
copy written by hand at every call site that touched the grid, which is how the chart came
to read a direction the cell had already changed its mind about.

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

- `common/` - shared, widget-agnostic pieces (`grid/`, `MarketSelector`, `DragOverlay`).
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
