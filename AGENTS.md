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
  each test, supplies a no-op `ResizeObserver` (jsdom ships none, and a component
  that constructs one throws on mount rather than degrading - a faithful
  implementation would fire exactly as often in a document that is never laid
  out, which is never), and replaces `fetch` for the whole suite: Kraken's `AssetPairs` request is
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
  A repository-wide guard does not have to be a test at all, and the price-formatting
  readiness one is the worked example: most of it is `no-restricted-syntax` and
  `no-restricted-imports` in `eslint.config.js`, with only the part a linter cannot state -
  the context value's own key set - left in `src/utils/priceFormatReadiness.test.ts`. See
  **Markets** for why. **Take the strongest guard the environment actually offers**, and
  where it offers nothing better than reading text, that is not a defect to be fixed: jsdom
  lays nothing out and implements no canvas, so the class-token guards in
  `blockTile.test.ts`, the Tailwind token guards read through `src/test/tailwindTokens.ts`,
  `vite/buttonResetLayer.test.ts` and the `z-4` assertion in `OrderChart.dom.test.tsx` are
  already as strong as they can be and must be left alone.

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

`src/test/tailwindTokens.ts` is how a layout guard reads a class list, and picking
the wrong one of its two readers does not weaken a guard, it inverts it.
`utilitiesInAnyCondition` strips every `<variant>:` prefix and is for a NEGATIVE
assertion, since `sm:h-full` is the forbidden utility under a condition;
`unconditionalUtilities` keeps only the unprefixed tokens and is for a POSITIVE
one, since `sm:flex-row` is precisely not `flex-row`. That file carries the rest,
including why the strip has to leave a bracketed arbitrary value intact.

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

The README's **Interaction model** section is authoritative. Fourteen things bite in ordinary work:

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

  **The candidates are ONE grid's cells, and the caller names which grid.**
  `resolveDrop` and `cellBoxesFromDom` take the element the cells are rendered inside;
  `GridArea` passes `columnsViewportRef`, which it already holds as the owner of which
  columns exist and which of them the panel is withholding, so one element answers all
  three. The document-wide `querySelectorAll` this replaced had no owner at all: `data-col`
  and `data-row` say where a cell sits in ITS grid and nothing about which grid that is, and
  `ReadOnlyGridCell` carries the same pair - so above `lg`, where both panels are on screen,
  a palette drag released over a read-only cell at (0, 1) resolved to (0, 1) and the order
  was placed in the ASSEMBLY cell of those coordinates. Reproduced in Chrome at 1440x900
  with that panel's pre-`84e183d` read-only grid restored: a release centred at (911, 691)
  in the Active Orders panel put a Limit in the assembly grid at x 149..420, announcing
  "Placed Limit order in Entry column, primary row." **The root is that rule NARROWED, not a
  second filter beside it** - there is still one query and one loop, the root deciding which
  cells are in the set and the `pointer-events` read deciding which half of the set each one
  lands in, so a foreign cell never reaches the paging rule at all. `dropTarget.dom.test.ts`
  pins it under "a second grid on the page", including a foreign cell given the
  `pointer-events` an on-page cell has. `handleBlockVerticalDrag`'s axis-track lookup is
  rooted at the same viewport for the same reason.

  Note that `ReadOnlyGridCell` is currently rendered nowhere - the Active Orders panel has
  drawn `OrderCard`s since `84e183d` - so the collision above is latent in the shipped build
  rather than live. That is a fact about today's callers, not a reason to loosen the rule:
  the component is still exported from `components/common/grid`, and the ownership is what
  stops the next grid mounted on the page from silently joining this one's drag.
- **A carry ends when the grid stops standing behind the cells it offered, and
  `useBlockCommand` is the one owner of that transition.** A carry is a promise
  about cells - these will take this order - held as `CarriedBlock.targets` at
  pick-up, drawn as a highlight and read out as `aria-current`. Clear All,
  Reverse Blocks, a pattern switch and a removal all rewrite what the grid holds,
  and while the carry outlived one the app went on inviting a drop into a cell
  `placeProviderInCell` was about to refuse; an earlier lane made that refusal
  honest, and this is the half that stops the invitation being issued. **It is
  derived, not signalled**: the hook re-asks `validTargetsFor` on the grid it is
  handed and compares with `sameTargets`, so a path that replaces the grid cannot
  forget to call anything, because there is nothing to call. Do not answer a
  future case here with a counter the grid's owner bumps or a call each caller
  makes - three call sites is three chances to forget, and the fourth path is
  written by somebody who has not read this file. Two consequences are deliberate
  and neither is a gap: a change that leaves the same cells on offer is not a
  replacement, so nudging a block's price with the arrow keys while carrying does
  **not** drop the carry; and in the *bulk* pattern every cell takes every order,
  so Clear All there leaves the promise true and the carry standing - nothing on
  screen is stale, which is the whole of what a carry can get wrong.
  **A removal is not an exception to any of this, and "a removal frees a cell so
  it can only widen the offer" is false**: conditional validity is diagonal
  adjacency to an OCCUPIED cell rather than emptiness, so removing a block
  DELETES its diagonals and the cell it frees is the smaller half. Walking every
  reachable occupancy of the 2x3 grid gives 28 removals that take a cell away
  from a carry - the smallest being one block in the Entry primary cell, where a
  carried Take Profit is offered the Exit upper conditional and loses exactly
  that cell - and 0 that leave nothing on offer, so no user is ever stranded
  holding an unplaceable order. `removeBlock` and `clearCell` therefore apply
  the same `gridStandsBehind` inside their own `announcer.asOneEvent`, on the
  grid `removeFromGrid` and `clearFromGrid` hand back, which is why those two
  callbacks return what they wrote.
  **That is the rule run one render early, not a second rule**: they are the
  grid writes that also speak, and reported as two events the second erases the
  first - `LiveAnnouncer` alternates regions and clears the one it leaves, both
  assertive - losing the only sentence naming what went, with no undo.
  `gridReplacement.dom.test.tsx` is the guard that
  matters - it is typed over `GridDataActions`, so a new action on the grid-data
  context fails the typecheck until it is classified and is then exercised
  against a live carry without a test being written for it.
  **Which mechanism ends the carry depends on how the control was reached, and
  the two are not competing.** `PatternSelector`, `GridArea` and `UtilityButtons`
  are siblings in `StrategyAssembly`, so Clear All, Reverse and both pattern
  buttons are genuinely OUTSIDE the placement surface - and a real POINTER press
  on any of them reaches the dismissal hatch's capture-phase `pointerdown` first,
  which ends the carry as `cancelled` and says "Cancelled. ...". That is truthful:
  the user really did press something elsewhere, and the grid replacement that
  follows finds no carry left to be stale about. The `gridReplaced` transition
  owns everything the hatch cannot see - a keyboard or assistive-technology
  activation of those same three controls, a programmatic replacement, and the
  removal path, which happens INSIDE the surface where the hatch stays silent by
  design. Do not "fix" either into the other, and do not read one sentence as a
  regression of the other. `gridReplacement.dom.test.tsx` pins both halves per
  control, under "a pointer press on %s" and "a keyboard press on %s".
- **The column pager moves the CARRY'S TARGET, and the viewport follows it - not
  the other way round.** Below `sm` the panel shows one grid column at a time
  (see **Layout and the CSS cascade**), and `ColumnPager` is how the user gets to
  the other one. Carrying nothing, its two buttons just move the viewport.
  Carrying a block, a press dispatches the very same `moveTarget` the Left and
  Right arrow keys dispatch, and `GridArea`'s effect on `carrying.target.col`
  moves the viewport to wherever the target ended up. **The target and the column
  on screen are one fact with one owner**, because the alternative is a
  highlighted cell read out as `aria-current` in a column the user cannot see -
  the mirror of the stale offer the `gridReplaced` transition exists to withdraw.
  **This is the complete set of what that rule produces. It is a stated set
  rather than a list to append to: a fifth item means the rule has changed and
  needs restating, not extending.**

  - **A pick-up starts in the column the panel is showing, and only opens the
    pager elsewhere when that column has no legal cell for the order.** The
    viewport follows the target a pick-up starts on exactly as it follows one
    that moves, so both halves fall out of the same pairing: paged to Exit, the
    user keeps the column they chose and builds their Exit leg there; and where
    the offer excludes it - a conditional order whose only diagonals are in the
    other column - they arrive holding the order in the one place it can go.
    Which column that is comes from `shownColumn` in `GridArea` and is passed
    into `initialTarget`; read that docblock before touching it, because the
    thing it is careful NOT to be is the point.
  - **A press the carry refuses leaves the pager where it is**, and says "No
    cell available in that direction." - exactly what the arrow key does from
    there, because it IS what the arrow key does. The button never claims a
    column the user is not on.
  - **A press for the column the carry is ALREADY targeting is deliberately
    SILENT**, an early return in `handleShowColumn` before the dispatch, and it
    is the one press `moveTarget` cannot answer for. Nothing moves and nothing
    is said. No arrow key means "stay put", so a zero delta returns the state
    unchanged and `moveTarget` would report `noTargetThatWay` - a refusal of a
    press that asked for nothing. The non-carrying branch is already silent for that press and the
    two must agree, so the fix REMOVES an untrue sentence rather than adding a
    true one: no outcome for it exists in `gridAnnouncements.ts` and none should
    be added. **That the case exists at all is the stated cost of the named
    pair**: a single "Next" button always moves, so it has no stay-put press to
    answer for, and two buttons naming their columns do. The cost is worth the
    reason the pair was chosen, and it lands on exactly the users it was chosen
    for - a voice-control user saying the name of the column they are on, and a
    screen-reader user activating the button without first reading
    `aria-pressed`.
  - **While a block is in hand the pager is out of the tab order, and nothing
    anywhere moves focus in answer to paging.** Every key that drives a carry -
    the arrows, Enter, Escape - is handled ON the carried order's palette tile
    or ON a block, with no document-level handler anywhere; so focus left on a
    pager button mid-carry is a user holding an order that no key can put down.
    Focus left in the column that pages off screen is NOT lost: that column is
    DRAWN rather than hidden, so it can still hold focus, and Tab is kept out
    of it by `tabindex` rather than by `inert`, which would blur it.

  **The answer is reachability, not a hand-off**: `tabIndex={-1}` on
  `ColumnPager`'s buttons, **only while carrying**, and nothing else. A
  keyboard carrier cannot be stranded on a control they cannot reach. That
  component's docblock is the authority and carries the whole derivation; five
  things belong here because they are what a reader of this file would
  otherwise undo:

  - **Four rounds of focus hand-offs were tried and all four are withdrawn.**
    Each was right about the paths beside it and blind to the next - the
    carrying move, the bare pager press, the press that leaves focus on the
    button, a rotation across `sm` that hides a column with no press at all -
    and the last of them, written as a derived invariant, moved focus on a
    desktop hover and re-rendered without settling when its request could not
    land. **Do not reintroduce one.** No `focusCarriedSource`, no
    `keepFocusUsable`, no per-writer hook: the carry-target-to-`visibleColumn`
    layout effect writes the viewport and nothing else.
  - **A keyboard carrier never needs the pager**, which is what makes taking it
    out of their reach cost nothing. `validTargetsFor` scopes to no column and
    `stepTarget` takes for a horizontal move every target on the far side, so
    the arrows cross exactly when a legal cell exists there. **It is the
    CONTROL that is out of reach mid-carry, never the ABILITY** - the arrows
    move the carry across and the viewport follows, so a keyboard or
    screen-reader user still reaches the other column and still places the
    order there. Carrying nothing the buttons are an ordinary tab stop, so
    "reachable by pointer, keyboard and screen reader" holds literally as
    well. This is settled; do not re-file it as a gap.
  - **Not focusable is not not operable.** The buttons stay clickable, keep the
    24px target and stay in the accessibility tree; `disabled` would break the
    paging pointer users depend on. Carrying nothing they are an ordinary tab
    stop, because that user has no arrow keys to cross with.
  - **NO HANDLER ON THESE BUTTONS CANCELS A PRESS, and none may be added.** A
    `preventDefault` on `pointerdown` was tried, so a press would not focus
    them either, and it is withdrawn - a `mousedown` equivalent is withdrawn
    with it. It **could not be verified on touch**, which is this layout's
    primary input: measured in Chrome with real trusted input a cancelled
    press still fired `click` and still took no focus, but **that is not
    evidence for touch and must not be cited as such**, and iOS Safari is
    documented to drop the synthesized `click` when the touch-stream press is
    cancelled - which would leave the pager inert to touch for the whole of
    every carry. What it costs is small and is the limit this section already
    accepts elsewhere: a pointer press may focus the button, which is not
    stranding (Tab leaves, the carry stays live, a pointer user taps a cell),
    and the tab-order gate still keeps a keyboard carrier away from it
    entirely.
  - **Two residuals, both accepted deliberately rather than unnoticed, and
    both on the same terms: not stranding, and not reachable keyboard-only.**
    Assistive technology can focus a `tabindex="-1"` element directly, so an AT
    user can still land there mid-carry; they are not stranded - Shift+Tab
    leaves and the carry is still live - but the control is not literally
    unreachable. **`tabIndex` going to -1 does not blur an element that already
    holds focus**, so focus that was on a button when the carry began stays
    there; reaching that needs mixed input - Tab to the pager while carrying
    nothing, then start a carry by pointer - because starting one from the
    keyboard means activating a palette tile, which takes focus to that tile.
    **A third residual is gone rather than accepted, and must not be re-filed**:
    focus already INSIDE the column a press pages away used to drop to
    `<body>`, because a hidden element cannot hold focus. Drawing the off-page
    column deleted it - nothing becomes unfocusable now, so focus survives a
    page. Verified in Chrome and pinned by `GridArea.dom.test.tsx` under "keeps
    focus on a block whose column pages away". Do not answer anything here with
    a focus hand-off.

  `ColumnPager.dom.test.tsx` pins the tab order in both states and that the
  control still pages while carrying; `GridArea.dom.test.tsx` pins the
  behaviour under "pages a carry across and the arrived column places it",
  "is out of the tab order
  while a block is in hand, and in it when not", "lets the arrow keys cross
  columns and back, with the viewport following", "leaves focus alone where
  both columns are drawn", "starts a pick-up in the column it is showing" and
  "leaves a pick-up on the offer's own first cell where both columns are drawn".
  The last two are the pair, and neither is worth much without the other: the
  first has to install `pageTheColumns()`, because jsdom applies no author
  stylesheet and a class list alone computes to the DESKTOP shape, which is
  exactly what the second one asserts.

  **NO COLUMN IS REMEMBERED BETWEEN CARRIES, and a pick-up starting in the
  column on screen is not that.** A preference for the column the user last
  *chose* was tried and taken out again: its rule was a closed enumeration of
  which events counted as a choice - a fresh pick-up, a swap pick-up by a
  second path, a purely vertical move, a same-column pager press, a refused
  pager press - and cases kept being found one at a time, each as a defect,
  through eight review rounds. **Do not reintroduce one.** The rule that
  replaced it asks a different question and has nothing to enumerate: the
  panel is showing one column or it is showing them all, `shownColumn` reads
  which at the moment of the pick-up, and no event anywhere is observed to
  work that out. Above `sm` it is `null` - not "column 0" - so the question
  does not arise and the offer decides on its own, which is why desktop is
  unchanged to the cell. If a change here finds itself deciding which state
  transitions count as a user's choice, it is the withdrawn design coming
  back and should stop rather than add a case.

  **Do not give the pager a move of its own, and do not end a carry on it**:
  paging does not touch the grid, so nothing about the carry has gone stale.
  **`ColumnPager` must stay INSIDE `placementSurfaceRef`, and that is a
  placement constraint rather than an accident of where it was written.** The
  dismissal hatch listens for `pointerdown` on the document in the capture phase
  and empties the block-in-hand register for any target the surface does not
  contain, so a pointer press on a pager rendered outside it would put the
  carried block down and say "Cancelled." - breaking the one requirement the
  control exists for. Moving it into `gridPane`, or above `contentWrapper`, is
  the plausible edit here: it is a bar rather than a lane. A lane that wants to
  do it has to answer the carry release first.
  `GridArea.dom.test.tsx` pins this with a real `pointerdown` under "survives a
  pointer press on the pager while carrying"; every other pager test uses
  `fireEvent.click`, which dispatches no `pointerdown` and so never runs the
  hatch at all. The
  viewport follows the target in a `useLayoutEffect` rather than an effect,
  because after a paint is one frame of the old column drawn while `aria-current`
  already sits in the one `offPageColumn` has just withheld.
  `GridArea.dom.test.tsx` pins every consequence above under "the column pager",
  one test each because they are separate cases.

- **A click outside the placement surface puts down whatever is in hand**, by emptying that
  register. The surface is the element `GridArea` draws - the palette a block is picked up
  from and the cells it can be put down in - and it is chosen by that element rather than by a
  panel outline, so this rule and the drop rules can never disagree about what "on a target"
  means. It listens for `pointerdown` in the capture phase: a drag that is genuinely in flight
  holds pointer capture and its events are retargeted to the dragged block, which is inside
  the surface, so a live gesture is not cancelled by it. That rests on the capture, which is
  not guaranteed. Focus is not handed back, for the same reason Tab does not hand it back.
  It fires before the pressed control's own `onClick`, so for a POINTER press on Clear All,
  Reverse or a pattern button it - not the carry-lifecycle rule above - is what ends the
  carry, and "Cancelled." is the sentence. See that rule for why both are correct.
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

`src/components/widgets/orderChart/` owns the price chart. Five rules keep it honest:

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
- **A cover over the chart plot needs `z-4`, and that is what makes it a cover.**
  `OrderChart`'s two overlays - the pending one and the refusal - are opaque and `inset-0`,
  and that is not enough: lightweight-charts positions its own layers with explicit
  z-indexes, measured in Chrome as canvas 1, canvas 2 and its attribution anchor 3, and a
  positioned element at `z-index: auto` paints below all of them however late it comes in
  the DOM. Without it the refusal was drawn as a caption across a live plot - measured at
  1440x900 with the rules refused, `elementFromPoint` at the panel's centre returned the
  chart's CANVAS, and the axis read 130000.00 to 50000.00 at the library's two decimals with
  a moving crosshair label, which is the exact drawing the cover exists to withhold. jsdom
  lays nothing out and implements no canvas, so `OrderChart.dom.test.tsx` pins the class and
  the geometry is a browser check.

Chart controls are toggle buttons carrying `aria-pressed`; they announce themselves and
must not reach for a live region (`aria-live` and `role="status"` alike).
`gridAnnouncements.ts` stays the app's only announcer.
Their accessible name is `label: description`, so the visible text stays *inside* the name
rather than being replaced by it (WCAG 2.5.3 Label in Name): a bare `aria-label` spelling
out the abbreviation renames "SMA 20" to something a voice-control user cannot say.

## Layout and the CSS cascade

Nineteen traps live in the layout, and each is easy to reintroduce. The one
paragraph below led **Known gap** is not among that nineteen: it records a
defect that is already there rather than one you could bring back.

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
groups against both halves of this, and
`strategyAssembly.layout.dom.test.tsx` pins the assembly panel's grid pane and
action bar against them.

**A price axis takes its height from flex stretch, and may never ask for it as
a percentage.** `getAxisColumnProps` in `src/styles/grid.ts` draws the box every
axis is positioned against, and *everything* the axis draws is positioned
against that box and nothing else: the track and the percentage scale are
`top`/`bottom` insets on it, and `getBlockPositionerProps` lays a block out at
`calc((100% - TRACK_INSETpx) * percent)` within it. One collapsed height is
therefore not one defect, it is the whole axis at once. It carried `h-full`, and
a percentage height needs a definite height to resolve against - which the chain
above it only has while the grid columns are flex items of a ROW. `columnsWrapper`
STACKED them below `sm` at the time, so they were items of a column with no
definite height, because below `lg` the shell is deliberately content-sized (see
the desktop shell trap). **That stacking is gone** - the trap below puts the two
columns side by side at every width and pages between them - so the collapse is
recorded here rather than reproducible; what survives it is the rule.
`height: 100%` resolved to 0, and since every child of the box is
absolutely positioned there was nothing to fall back on. Measured in Chrome with
a Limit in the Entry primary cell, axis column / track / block y: **150 / 80 /
99.5 at 640 and above, and 0 / 0 / 24.5 at 320, 360, 390 and 414** - no track to
grab, the scale clumped into 60px, and the offset mapped onto a NEGATIVE 70px
range, which draws the block above the market line and runs it backwards, while
`positionFromPointer`'s `trackHeight <= 0` guard returned 0 for every drag. An
order could not be priced at all on a phone. `align-items: stretch` sizes it
now - the default for a flex item, and `sliderArea` is a `flex-row` whose cross
axis IS this height, so it needs no definite parent height and cannot be taken
away by anything above it; it was doing the work above `sm` all along, which is why
removing `h-full` left 768, 1024 and 1440 measuring exactly what they measured
before, the assembly grid pane pixel-identical at 1440. **Do not restore
`h-full`, and do not answer a future collapse with a pixel height or a `min-h-*`
here**: the axis is a proportion of whatever height the cell has, so a number
would be a second owner of `CELL_MIN_HEIGHT`'s job. **The invariant has two
owners and both are load-bearing**: the axis column must state no height and
must not opt out of the stretch, and `sliderArea` must stay a `flex-row` that
stretches its children - as a column, or with an `items-start`/`-center`/`-end`,
it supplies nothing and the axis reads zero exactly as `h-full` did.
`grid.test.ts` pins both, in the single-axis and the dual-axis forms, since
jsdom lays nothing out. A third fact is out of every token test's reach: the
axis column has to remain `sliderArea`'s DIRECT child, so an extra wrapper in
`GridCell` or `ReadOnlyGridCell` re-collapses the axis with both class lists
untouched.

**The assembly grid's lanes have a derived minimum width, and what does not fit
is answered by moving the PALETTE and paging the COLUMNS - not by stacking
them.** The lanes are the order palette, the Entry column and the Exit column,
each of the latter two carrying `min-w-[220px]` because that is where a cell
still fits its own price chip - the chip is laid out at `calc(50% + 25px)` from
the axis centre and is about 66px wide at a BTC price, so a 202px cell put
`$58,322.4` at x 247..305.5 against a cell edge at 323, 17.5px of slack. **The
row's min-content width is 542px: the palette's 90px min-width plus those two
220px columns plus two 6px gaps.** That floor is owned by the palette's
`sm:min-w-22.5` and not by its `sm:w-27.5` - 110px is the palette's PREFERRED
width, and it shrinks 20px below it when the row cannot fit. Below `lg` the
panel is the viewport less the shell's 32px of padding, so the row stops fitting
at a 574px viewport, and it was once drawn at that width anyway: measured in
Chrome at 320, 360 and 390 the lanes collapsed to that same min-content 542px in
all three - the palette squeezed to its 90px floor - and the Exit column sat at
x 347..549, entirely outside the viewport. **That is a functional defect rather
than a responsive gap** - a conditional strategy needs both an Entry and an Exit
leg, so the app's core task could not be completed on a phone at all.

**The two columns stay side by side at every width; the panel shows one of them
at a time.** `contentRow` is `flex-col sm:flex-row`, and that direction change
now moves the PALETTE alone - below `sm` it lays its tiles across the panel in
an `auto-fill` grid as a band, with the columns under it. `columnsWrapper` is a
`flex-row` always, and below `sm` it is a one-column viewport over that row:
each column is `w-[calc((100%-0.375rem)/1.2)] shrink-0` (`pagedColumn`, which
gives it `sm:w-full sm:shrink` for the desktop form), the pair overflows to the
right, and `ColumnPager` moves the viewport by setting `scrollLeft`. The
palette is what moves because the arithmetic leaves no choice - with it still a
lane the viewport would be the panel less 90px and a 6px gap, **192 / 232 / 262
/ 286 at 320 / 360 / 390 / 414**, and 192 is under the 220px floor above. As a
band, the WRAPPER gets those same 288 / 328 / 358 / 382, and the column inside
it is narrower still, because 20% of its sibling has to show past the edge.
**Measured in Chrome at 320 / 360 / 390 / 414 on this branch, the column is
235.0 / 268.3 / 293.3 / 313.3 and the peek is exactly 20% at every one of
them**, so the headroom over the 220px floor is **15.0 / 48.3 / 73.3 / 93.3,
tightest at 320**. That is the number a later change is spending, and it is
15px rather than the 68px this paragraph used to claim. What made 20% safe at
that width is a chip check rather than the floor alone: measured at 320, a
placed Limit's price chip runs to x 215.3 against a cell edge at 242, so 26.7px
of slack. Three rules hold it together and none may be simplified away:

- **`overflow-hidden`, never `-auto`, and on BOTH axes.** This is a scroll
  container the user cannot drive, so it draws no scrollbar on any platform - it
  cannot grow by a classic bar's gutter, and it cannot be scrolled to a column
  the pager does not know about, which is what gives "which column is on screen"
  one owner. The wraps-never-scrolls rule above governs *chrome* and these are
  content lanes, so it does not forbid a box here; taking neither of its
  measured harms anyway is what makes that reading safe rather than a loophole.
  **`overflow-x-hidden` alone does not take neither, which is why it is not what
  this says**: setting one axis to anything other than `visible` makes the
  other's `visible` compute to `auto`, so naming only the axis that pages left
  this a real user-drivable VERTICAL scrollport. Nothing overflows it that way
  today - below `sm` it is an auto-height flex item - but the day anything
  bounds its height there, that bar's gutter eats width from a column already
  sized against the 220px floor above, and a guard reading the class list stays
  green through it. `sm:overflow-visible` puts the scroll container away
  entirely where both columns fit.
- **The off-page column is DRAWN, and withheld from hit testing rather than
  hidden.** 20% of it shows past the viewport's edge as a wayfinding cue that
  there is more to view; the number is the captain's own. Both columns keep
  their boxes and stay beside each other, and `offPageColumn` -
  `pointer-events-none sm:pointer-events-auto`
  `max-sm:[&:is(&)_*]:pointer-events-none` - is the whole of what withholds it.
  **VISIBLE DOES NOT MEAN DROPPABLE, and the peek is why that has to be said
  out loud.** A peeking cell steals releases: measured at 390, a release at the
  far right edge put **30px of the dragged tile over an off-page Exit cell
  against 4px over the Entry cell it was drawn on**, so greatest-overlap placed
  the order into a column that was not on screen, with no highlight to warn of
  it - the highlight comes from the same list, so it was off screen too.
  `cellBoxesFromDom` therefore hands back every cell whose computed
  `pointer-events` is `none` as WITHHELD rather than as a candidate. It is keyed
  on that rather than on visibility because drawing the peek separated "can the
  user see it" from "may a drop land in it", and hit testing is the same
  question a drop asks, so the two cannot drift.
  **Withheld is not discarded, and the difference is a block the user does not
  get back.** A free drag released clear of every cell REMOVES the block, so
  collapsing "over a column the panel is not showing" into "over nothing at all"
  put a destructive band inside the panel: at 320 every release from x 246 to
  the panel edge at 288 landed in drawn column and destroyed the order, with no
  undo. `resolveDrop` answers `available`, `withheld` or `offGrid`, and **BOTH
  drag paths read all three**: `handleDragEnd` refuses the middle one through
  `keepBlockInItsCell`, with the `staysInCell` sentence a release over any other
  cell gets, and `handleProviderDragEnd` refuses it as `columnNotShown`, which
  names the column rather than blaming the cell - the placement rules might well
  have taken that order and were never asked. There is deliberately **no helper
  collapsing `withheld` into "no cell"**: that collapse is what told a palette
  user their release was outside the grid while they watched it land on a drawn
  column, and one geometry may not get two accounts. **The exclusion itself is
  unchanged**: nothing is ever placed into a withheld cell, and NEITHER
  highlight names one. The hover highlight takes `available` alone, and so does
  `isValidTarget`, which draws the accent border, the ring, the pattern and the
  breathing animation: drawing the peek made that treatment visible in a column
  every release is refused in - 38px of each cell at 320 - and a highlight
  computed one way with a drop the other is the defect this resolver exists to
  prevent. Both read the same computed `pointer-events`, never `visibleColumn`,
  which WRITES the class rather than answering the question and says nothing
  above `sm`.
  **Inheritance answers a cell but not a block, which is why the class carries
  a second rule.** A cell declares no `pointer-events` of its own and so
  inherits the refusal; `getBlockPositionerProps` declares one, opting the tile
  back in with `*:pointer-events-auto` so the strip it draws does not swallow
  presses meant for the cell under it. That left a block drawn in the sliver
  tappable and draggable - a tap announcing a refusal for an order the user can
  barely see, a vertical drag re-pricing it - while drop resolution stayed
  correct throughout. The subtree rule closes it and wins by SPECIFICITY:
  `:is(&)` repeats the class in the compound, so it lands at (0,2,0) against
  the opt-in's (0,1,0), where a plain `[&_*]` would tie and be settled by
  whichever utility Tailwind emitted second. It is `max-sm:` with **no `sm:`
  counterpart**, deliberately - declaring `auto` across a subtree would beat
  the positioner's own `pointer-events-none` and turn that strip into a hit
  target at every desktop width.
  **Nothing here may hide the column.** A hidden element cannot hold focus, so
  hiding it dropped focus to `<body>` whenever the pager took away the column
  the focused element lived in; drawing it is what deletes that defect. Tab is
  kept out by the `tabindex` rule in `GridArea`, and `inert` is refused for the
  same reason - it blurs what it is applied to, which would bring the defect
  straight back. That rule reads the breakpoint off the viewport's own box, so
  it rides the SAME `ResizeObserver` the scroll rule installs rather than a
  second one: on renders alone it went stale across a rotation, leaving a whole
  column at `tabindex="-1"` where both are drawn, or the peeking one tabbable.
  **The peeking column is REACHABLE BY ASSISTIVE TECHNOLOGY, and that is
  accepted deliberately. Firstmate's call, not the captain's** - the captain
  asked for the peek, and this is its consequence. The column is in the
  accessibility tree, so a screen-reader user can read it and activate a cell in
  it, where under the withdrawn `visibility: hidden` they could not. **Do not
  "restore" the old property**: no `aria-hidden`, no `inert`, and no
  readable-but-not-activatable mode either. Three reasons, and the second
  decides it:

  - **It self-corrects, and that is code rather than hope.** Activating a
    cell in the withheld column PLACES the order in it: `pointer-events: none`
    withholds hit TESTING and not a dispatched click, so the activation reaches
    `GridCell`'s `onClick` and commits the carry exactly as it would on screen.
    On its own that stranded the user - the carry has ended, so the layout
    effect keyed on `carrying.target.col` early-returns, and the panel went on
    showing the OTHER column with the order they had just placed off screen and
    no way back to it. `activateCellInView` in `GridArea` closes that: it shows
    the cell's column BEFORE committing, through `visibleColumn`, the one owner
    of which column is on screen that the pager and the carry-target effect
    already write. Measured in Chrome at 390 in the bulk pattern, carrying a
    Limit with the panel on Entry and activating the Exit lower cell: the panel
    ends on **Exit**, `scrollLeft` **235** - which is the viewport's own maximum,
    so the Exit column sits flush against the right edge with Entry peeking on
    the left, the mirror of the ordinary case - the cell **holds the block**,
    and the announcement is **"Placed Limit order in Exit column, row 3."**
    Do not weaken this to a documented mismatch: an unrecoverable state for an
    assistive-technology user is the same trap as the peek band that once
    DELETED a free-dragged block and the sliver that once drew a valid-target
    highlight at cells the release then refused, and all three were answered the
    same way - make the behaviour match what the app appears to offer. Above
    `sm` nothing is withheld, so this is exactly `activateCell`. Carrying
    nothing the activation is silent, on this column and the one on screen
    alike, and a cell outside the carry's offer is refused with
    "... cannot take this order. Still carrying ...".
  - **Nothing that was ever promised is being given up.** "Nothing in the
    accessibility tree" was a PROPERTY OF THE HIDING MECHANISM the captain
    replaced, not an independent guarantee this design made. A side effect
    disappeared along with the thing that caused it; no rule was broken.
  - **The obvious fix inverts the instruction it claims to implement.** Hiding
    the peek from assistive technology would give those users LESS than sighted
    users get. The captain asked for a cue that there is more to view, and
    suppressing that cue for precisely the users who cannot see the sliver is
    not implementing it carefully.
- **`columnPagerRow` carries `px-2`, and it is not decoration.** The grid pane
  has no horizontal padding, so a lane is flush with the panel's content edge -
  and the panel clips there. Every lane's own focusable children are inset
  within it, so nothing had been focusable at that edge before; a `flex-1`
  button in a flush row is. Measured at 390 with the Exit button focused, its
  box ended at x 374 against a clip at 374 and the ring's whole right segment
  (2px outline at a 2px offset, x 376..378) was drawn nowhere.

`sm` is a floor with room rather than a fitted number - at a 640px viewport the
panel is 608px against that 542px min-content row, and measured there the
palette is at its preferred 110px and each column at 243px, so nothing is at its
floor. Above `lg` the panel is never narrower than 660px, measured at 1024 where
the shell's `minmax(0,700px)` track is squeezed hardest. **Desktop is unchanged
to the pixel**: swept at 640, 768, 1024, 1280 and 1440 against the commit before
the pager, every rect is identical and the app container's row template is still
a single `900px` track at 1024 and up. The pager itself is `sm:hidden`, so above
`sm` it is not a flex item of `contentRow` at all rather than a zero-width one.
`utilityRow` wraps for the same reason: Clear All and Reverse come to 219px
beside a 203px Execute Trade against 326px of bar at 390, and unwrapped that
button was drawn at x 267.5..470.8 with the panel's `overflow-hidden` clipping
its last 80.8px, so the strategy could not be submitted. The Active Orders panel
draws a card list at every width and has no lane row to page; its
`ActiveOrders.styles.ts` still exports a `columnClass`, a `columnsWrapper` and a
`contentWrapper` carrying the same rigid geometry, but nothing imports any of
the three - they are dead, not a second copy of this rule.

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

**A pointer drag still reaches only what is on screen, and the pager is what
makes that enough.** `dropTarget.ts` hit-tests the dragged block's tile against
each cell's viewport rect, the block follows a pointer that cannot leave the
viewport, and there is no autoscroll anywhere in the drag path - so a cell off
screen when the gesture starts cannot be dropped into. That has not changed, and
it is why the *reach* is a property of the layout rather than of the drag.

Stacked, the grid was taller than a phone and the drag reached **2 of 6** cells:
measured at 390x844 with a Limit placed, the page was 2020px and, with the
palette in view at y 196..403, only the Entry upper conditional (y 459..648) and
Entry primary (y 664..852) could be dropped into, with every Exit cell at
y 1122..1719. Paged, the page is **1201px** at the same viewport and the palette
sits at y 245..364 above a single column whose three cells are at y 501..690,
706..894 and 910..1099 - so one vertical scroll puts the palette and all three
in view together, and the other column's three are the same three after one
press of the pager. **6 of 6**, and verified rather than derived: at 390, paging
to Exit and dragging a Limit from the palette into it announced "Placed Limit
order in Exit column, primary row." At 320 the figures are a taller palette band
(y 237..510) over cells at y 608..797, 813..1001 and 1017..1206 in a 1308px
page, and the same holds.

**The command model was always whole and still is**: tap or click to pick up,
page or scroll, tap to place. Its carry survives both, for the same reason -
the carry's target is a cell rather than a viewport position, and paging does
not touch the grid, so the `gridReplaced` transition never fires.

What remains, and it is smaller than the gap it replaces: a drag towards a cell
that is off screen *vertically* still does nothing silently, and nothing tells
the user to scroll or tap instead. Closing that properly still means
autoscrolling the scrollport under the gesture, which is inside the layer this
file guards most heavily: the scroller differs by breakpoint (the document below
`lg`, `contentWrapper` above it), the rects `dropTarget.ts` reads move under a
running scroll so the highlight and the drop must be recomputed per scroll frame
rather than per pointer move, and all six of `usePointerGesture`'s exits have to
keep holding while it runs. Note that the horizontal half of it is NOT such a
case and must not be answered that way: the off-page column is withheld from
hit testing, so its cells are not drop candidates at all and a release over
them is refused rather than mis-resolved - refused, and never read as a release
clear of the grid, which the free drag removes a block on. Tracked outside this repository.

**Known gap: the assembly panel's pattern buttons overflow their header rail
at narrow widths.** `patternSelectorRow` is `cn(panelHeaderBar, "gap-2")`, and
`panelHeaderBar` carries `panelTitleBar`'s fixed `h-16`. The two pattern buttons
(`patternButton`, `min-w-[120px] px-4 py-2`, a label above a description that
wraps) are taller than that 64px rail at narrow widths, and the overflow is
drawn rather than clipped. Measured in Chrome: at 320 the buttons are 94.5px in
the 64px bar - the row's scrollHeight is 79 against a clientHeight of 63 - and
are painted 15.8px above it and 14.8px below, over the `MarketSelector` row
above and the top of the Orders palette below. At 360, 81.0px with 9.0px above
and 8.0px below; at 390, 65.0px with 1.0px above and 0.0px below. At 1024 and
1440 they are 51.5px and fit with 5.8px and 6.8px of slack, so this is a
narrow-width defect only. It is pre-existing rather than anything the paging
rules above introduced: identical figures were measured on the lane change that
first met it and on its base commit 6067cf5, and again on the paging change and
its own base. Nor is it a matter of the buttons simply
being asked to fit - at 320 the bar has 256px of inner width, so two buttons at
`min-w-[120px]` plus the 8px gap leave about 92px of text width each, in which
the label takes two lines and the description three, and the only way that
content reaches 64px inside the rail is without the description, which is a
question about what the buttons say rather than about layout. `marketSelectorRow`
in the same panel is unaffected, having no fixed height and carrying `flex-wrap`
already: it simply grows, measuring 68.5px at 320 and 360 and 46.5px at 390 and
above. **Whether a panel header bar's height may be relaxed is an open question,
and this paragraph does not answer it.** The paragraph above records `h-16` as
having exactly one exception, `wrappingPanelTitleBar`, whose sole user is the
chart panel's title bar, with a new panel told to take the constant. Deciding
what this defect means for that rule is tracked outside this repository; what is
recorded here is the measurement, so the next reader to meet it at 320 can tell
it is known and deferred.

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
`display: none`, so it is not a grid item and `main` is alone - which put it in
the `auto` row and left the `1fr` row standing empty beneath it, measured as
tracks of `835.5px 64.5px` at 1440x900. `lg:grid-rows-[1fr]` is what keeps that
band of viewport from being thrown away. Adding a child to `appContainer` means
checking the template again; the page's visually-hidden `h1` is not one of
them, because it lives inside `main` - see the `<h1>` rule below for why it may
not be moved back out.

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

**A panel's visible title is a heading, and the panel is a `region` landmark
named by it.** The three panels are otherwise one undivided `main`, with nothing
for a landmark or heading user to navigate by, and the page's own `<h1>` is
`sr-only` - so without this the only heading on screen was Active Orders'.
`panelHeadingTitle` in `src/styles/shared.ts` is `panelHeaderTitle` plus an
`m-0` that is **defensive rather than load-bearing**: Tailwind's preflight
already zeroes every element's margin and this app's own `@layer base` adds none
back for a heading, so an `<h2>` here never carries the UA stylesheet's
`margin: 0.83em 0`. It is declared anyway because the rail is `items-center`, so
a heading that ever regained a margin would grow the bar and take the title off
the centre line the paragraph above exists to hold - and this repository's
`@layer base` is exactly where such a bare `h2` rule would be added (see
`vite/buttonResetLayer.test.ts`, which guards that block for `a`, `body`,
`button` and `h1`). Take the constant; do not write `cn("m-0",
panelHeaderTitle)` again.
**The assembly panel's heading is `sr-only`**, because its header bar is
`PatternSelector` - two buttons and no title - and that bar's `h-16` already
overflows at narrow widths (**Known gap** above). **The chart panel's region is
named `Price chart` from `App.tsx` and NOT by its own `<h2>`**, which is the
selected pair: a landmark whose name changes as the user switches markets is one
they cannot navigate back to, the same reason the cell clear control's name is
the cell rather than its contents. The other two use `aria-labelledby` on their
own heading, so name and heading are one fact. Pinned per owner, in
`ChartHeader.dom.test.tsx`, `ActiveOrders.dom.test.tsx` and
`strategyAssembly.feedback.dom.test.tsx`.

**The page's `<h1>` lives inside `<main>`, and a `<header>` banner may not
replace it.** Outside every landmark - where it sat, as a sibling of `main` - it
is content no landmark contains, which axe reports as `region` and a landmark
user cannot reach. The obvious fix is a `<header>` around it and the tab nav,
and that one is closed by the row template above: `lg:grid-rows-[1fr]` is only
correct while `main` is `appContainer`'s ONLY in-flow child above `lg`, which
the nav's `display: none` is what leaves it - the heading is no candidate at
all from inside `main`, and `sr-only` is `position: absolute`, so it claims no
layout there either. A `<header>` would be a grid item and `main` would drop
into an implicit row. `src/App.test.tsx` pins the placement and that the heading
still claims no layout.

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

**Price-formatting readiness has one owner, and it is
`src/utils/priceFormatReadiness.ts`.** "Can this pair's prices be written, and at what
precision" is **three** states - `pending` (the AssetPairs request has not answered),
`ready` (Kraken's rules are in hand, and this is the only state carrying a
`MarketPrecision`), `unavailable` (it answered and described no rules for this pair) -
and they are folded there, once, from the precision-or-null and the settled flag.
`MarketProvider` performs that fold at the last point where those two facts exist
separately, and **neither leaves that file**: the context carries `priceFormat` and not its
ingredients, so there is nothing on it for a surface to recombine. Every surface consumes
it - the selector readout and its warning, the grid chips, the read-only cards, the chart's
axis and crosshair through `useLightweightChart`, the chart panel's own cover, and the order
path through `precisionOf`.

That shape is the fix for a defect found on **four consecutive review rounds** of the
multi-pair work - candle `setData`, then the order price lines, then the series'
`priceFormat`, then the pre-settle window - each correct about its own surface and teaching
the next one nothing, because six surfaces each decided the question for themselves. So the
guard is deliberately not a list of today's surfaces. It states what **any** module in
`src/` may not do, so a surface nobody has written yet is covered on the day it is written,
and it is split by what each mechanism can actually see:

- **Four reach rules are in `eslint.config.js`**, as `no-restricted-syntax` and
  `no-restricted-imports` over `src/**`: no module may name `metadataSettled`, declare an
  absent-able `MarketPrecision` (a union with `null` or `undefined`, or an optional
  parameter or property), import `fetchMarketPrecisions`, or name `metadataError`. That
  last one is the readiness proxy that was tried and was wrong in both directions - a batch
  answering without one pair sets no error while that pair has no rules, and a later
  failure sets one over pairs whose rules are in hand - so it is `MarketProvider`'s own
  state, arming its retries, and reaches no surface. **It is not on the context**: it was,
  nothing read it, and publishing a field the boundary forbids reading is a contradiction
  rather than an affordance. A lane that wants to show the user why the batch failed puts
  it back deliberately, and that friction is the point. Each rule carries a short
  file-scoped allowlist stating why that file legitimately handles the ingredient; test
  files and `src/test/` are exempt, because they stand in for Kraken and for the provider
  rather than being surfaces. `npm run lint` is already one of the four CI jobs, so the
  reach is unchanged.
- **One runtime assertion stays in `src/utils/priceFormatReadiness.test.ts`**: that the
  real `MarketContext` default value carries `priceFormat` and neither of the two facts it
  is folded from - its whole key set is `market`, `markets`, `priceFormat`, `selectMarket`.
  That is the highest-value regression route - a raw ingredient back on the context is
  within reach of every surface at once - and it is a *value's* key set, which a linter
  cannot read.

**Why the AST rather than a text scan**, since the guard used to be one and the reasoning
must survive: matching text can be dead or commented out, a rename slips past a literal
pattern, and a scan that read comments would fail for the very paragraphs recording why the
rule exists - so it had to strip them, which is another hole. The deciding reason is not
that text scans are bad in general, though: it is that **this repository already guards a
structural boundary exactly this way**, with the `no-restricted-imports` rule stopping
`src/` importing `api/_lib` and `api/kraken`, and a second differently-shaped answer to the
same kind of problem is precisely the drift this codebase keeps paying for. This is not a
ruling that every token or text assertion here should become a lint rule - see the
**Testing** section for the ones that are already as strong as their environment allows.

The remaining hole is stated so the next reader knows it: a module reaching an ingredient
under a name none of the rules spell - a re-export renamed on its way out, a value pulled
from a loosely typed `Map` - passes. `pending` and `unavailable` render the same in a text
chip (`NO_PRECISION`), which is a rendering choice made where the distinction is visible,
not a collapse.

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

  **Deleting a block clears every link that named it, and the two are one function.**
  `withoutBlocks` in `src/utils/grid.ts` filters the blocks out and drops the `linkedBlockId`
  of anything pointing at any of them, in one pass. Both removals go through it -
  `removeBlockFromGrid` for one block and `clearCellInGrid` for a whole cell - so neither
  path can be given the filter without the link clearing. The refusal above is only safe
  while nothing in the app can *produce* a dangle, and reachable removal is exactly what
  would have produced one, so a user deleting a linked block never ends up holding a strategy
  the mapper refuses and no control can mend. Do not weaken the refusal to accommodate a
  dangle; fix whatever wrote it. See **Prices and order types**' removal entry for why
  clearing that reference is not the cell-scoped rule being broken.

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
comment. A misplaced order is corrected by removing it and placing a new one, until the
cell-detail editor ships - which is why the removal below is D9's other half rather than a
convenience.

**Removal comes in two operations, and which one a user gets is decided by what their input
method can name.** The keyboard has focus on ONE block, so it removes one. A pointer press
has a CELL, so it clears the cell. They are deliberately different, not two routes to one
thing, and neither may be folded into the other.

- **One block: `useBlockCommand`'s `removeBlock`.** Reached by Delete or Backspace on a
  focused block, and by a free drag released clear of every cell. It writes through
  `removeFromGrid`, which `GridArea` answers with `removeBlockFromGrid`, and reports the
  `removed` outcome. This is D9's correction path at its finest grain: it names one leg of a
  dual-axis order, so a user who means to remove exactly that leg can.
- **One cell: `useBlockCommand`'s `clearCell`.** Reached by the cell's own clear control, the
  only removal a pointer has. It writes through `clearFromGrid`, which `GridArea` answers
  with `clearCellInGrid`, and reports the `cellCleared` outcome. **One press empties the
  cell** - both legs of a dual-axis order together, and every independent order a bulk cell
  holds. That is the captain's instruction, and it is also what stops a pointer user
  destroying half an order: a trigger leg with no limit leg is not an order anybody meant to
  build, and a per-block pointer control asked for two presses to avoid producing one.

Both end a carry in the user's other hand **only when the removal takes a cell away from
it** (see the carry-lifecycle rule in **Interaction**: neither has a rule of its own, and
each returns the grid it wrote so that one rule can be applied in the same event), and both
ask for focus on the palette entry the order came from - the element that was focused is
being removed, so leaving focus alone drops it to `<body>`, and the palette is where D9's
"place a new one" begins. For a cleared cell the palette entry is the FIRST order the cell
held; a bulk cell can hold several, and any of them lands the keyboard beside the rest.

**"Only that cell" and the link clearing are one rule read together, not two in tension.**
The captain's words are "x and edit will only affect that cell, not other cells", and that
is about ORDERS: nothing outside the cleared cell is removed or altered. A `linkedBlockId` is
not an order - it is a reference to one the press has just destroyed - and `withoutBlocks` in
`utils/grid.ts` drops it in the same pass that filters the blocks out, for both operations.
Skipping it would leave the dangle `assertLinksAreFlat` REFUSES, so the user would hold a
legitimate strategy nothing could submit and no control could mend. Tidying the reference is
what keeps the cell-scoped rule from costing something the captain did not ask for. Do not
read the two as contradictory, and do not weaken either.

Removal was once a branch of the free drag's release handler, and that is what made it
unreachable for most of the grid: `block.tsx` wires `useVerticalDrag` instead of
`useFreeDrag` for every block whose cell draws a price axis, so a placed Limit, Stop Loss or
Take Profit could not be dragged off at all and Clear All - which destroys the whole strategy
- was the only way to be rid of one. A removal that is one gesture's side effect is a removal
only that gesture has; do not put it back.

**The clear control lives in the cell's own top-right rail, and the rail's ordering is a
commitment rather than a look.** `cellActionRail` in `src/styles/grid.ts` is one absolutely
positioned cluster holding the cell's controls and then the row-label badge; `rowLabelBadge`
no longer positions itself, because two things owning one corner is how they come to
overlap. The rail is right-anchored and **the badge is its LAST child**, which is what makes
every position in it final: a right-anchored group grows leftwards, so an item added at the
front moves nothing after it. Two consequences, both measured at 1440x900 rather than
assumed:

- **The badge never moves.** It sits 5px from the cell's right border edge and 8px from its
  top whether the cell is empty or holds an order (`min-h-6` on the rail is what holds the
  second number; without it an empty cell's badge sits 3px higher). Put the badge first and
  it slides 28px left the moment a cell takes an order, and a column of cells stops lining
  its badges up.
- **The clear button never moves either.** The planned cell-detail editor (an edit icon that
  flips the cell to its rear side to type values in) joins this rail at the FRONT, so the
  control stays exactly where the user last pressed it. Do not reorder this rail to put a
  growing set of controls to the right of a fixed one.

A pleasant consequence rather than the reason: the extreme corner is the inert badge, so a
press aimed vaguely at a cell's corner does not destroy its orders.

**The control needs no `activateCellInView` counterpart, and adding one would be wrong.**
Below `sm` the off-page column is withheld from hit testing, so a pointer cannot reach its
clear control at all (verified in Chrome at 390: the withheld column's control computes
`pointer-events: none` and sits at `tabindex="-1"`). Assistive technology can still activate
it, and that leaves nobody stranded - clearing produces nothing to find, focus lands on the
palette entry, which is on screen, and the sentence names the cell. `activateCellInView`
exists for the opposite case, where a placement puts a new order in a column the panel is
not showing.

It is **rendered, never revealed on hover**, and that is the decision the affordance turns on
rather than a styling choice: a control shown on `:hover` exists for a mouse and for nothing
else, and the sticky `:hover` a tap leaves behind on some browsers is an accident rather than
an affordance. It carries `p-0` alongside `w-6 h-6` because the layered `button` default is
`padding: 0.6em 1.2em` and a border-box `width` cannot shrink a box below its own padding -
without it the 24px WCAG 2.2 SC 2.5.8 target measured 40.375px in Chrome. Measured at
1440x900 after the move, its box is exactly 24 by 24, inset 5px from the cell's top and right
border edges. It is drawn only on a cell that holds something: a control offering to do
nothing is one a user has to learn to ignore.

**Its name is the CELL and nothing else** - `Clear Entry column, primary row` - and that is
deliberate rather than terse. A voice-control user targets a control BY name, so a name that
changed with the orders inside would change between deciding to say it and saying it. What
the cell holds is already on the cell's own `role="group"` label beside it.

**It fires on `click`, and must never be given a pointer-down handler.** The browser fires
`click` at the nearest common ancestor of the pointer-down and pointer-up targets, so a press
that begins on the control and travels away fires none at all and destroys nothing. An
`onPointerDown` would turn every such press into an emptied cell, with no undo. It also
**stops its own click**: the cell listens for a click to place whatever is in hand, so
without that, clearing while carrying a palette order would empty the cell AND drop the
carried order straight back into it.

**The block-level sentence carries the block's LEG, and from one owner.**
`createBlocksFromOrderType` gives both legs of a dual-axis order type the same `label` and
puts them in the same cell, so the label plus the cell names neither of them: "Removed Stop
Loss Limit block from Entry column, primary row" was said identically for either leg, leaving
a screen-reader user unable to tell which leg they had destroyed and holding half an order.
The sentence is "Removed Stop Loss Limit trigger block from Entry column, primary row." The
leg appears **only where the cell really draws the block on a price axis** - a Market order in
a bulk cell keeps its plain name - and it comes from `legInCell` in `blockMapping.ts`, the one
owner of axis membership, asked by `removeBlock` for the `removed` outcome. It must not be
re-derived from `axis` or `axes`. The cell-clearing sentence needs no leg at all, because it
is about the cell: "Cleared Entry column, primary row. Removed Stop Loss Limit order." - the
label named ONCE, because both legs are one order and naming it twice would say two orders
went.

**Its unit is the ORDER, not the block and not the label, and the count is what makes that
true.** A bulk cell takes every order, so two INDEPENDENT orders can share a label there and
are two - while a dual-axis order's two blocks share one and are one. Deduping the cell's
blocks to distinct labels answered both the same way and said "Removed Market order." where
two went: a false number, about a press with no undo. So `clearCell` reports
`orders: { label, count }[]`, counted by `ordersHeldIn` as that label's blocks over its order
type's `axes.length` floored at one, rounded UP so a lone leg left by a keyboard Delete is
still the one order it is. `gridAnnouncements.ts` writes the sentence from those facts as
ever - each label once, with its count where that count is above one, pluralised on the
TOTAL: "Cleared Entry column, row 2. Removed Limit and 2 Market orders."

**Known and accepted: two blocks of the SAME order type on the same leg in one cell are
still named identically** by the slider - "Limit limit price, Entry column, row 2" twice
over, with only `aria-valuetext` differing. It is reachable: `isCellValidForPlacement`
returns `true` for every cell in the bulk pattern, so a deliberate double placement puts two
Limits in one cell. Two reasons it is left rather than patched, and the second decides it:

- Only the offset separates them, and folding a percentage into a control's accessible name
  makes that name change while the user drags the block. Voice control targets a control BY
  name, so an unstable name is worse for the users this would be for than an ambiguous one.
- It would not close the case anyway: two Market orders in one bulk cell carry no price at
  all, and nothing but an ordinal could tell them apart - which then shifts when a sibling is
  removed. It is filed as one item covering whether "Limit limit" is the wording wanted at
  all. The pointer no longer meets this ambiguity, because its removal names the cell.

What remains here is the SLIDER'S NAME alone. The clear sentence counts those two orders
correctly - "Removed 2 Limit orders." - so what is accepted is two orders named identically,
never two orders reported as one.

**What moving the control to the cell DELETED, recorded so nobody restores it.** A per-block
control had to be pinned inside its own 40px tile - overhanging it, a press on one block's
visible face destroyed a DIFFERENT block, measured in Chrome in both cell layouts - and
containment plus the 24px SC 2.5.8 floor then ENTAILED a covered centre: a 24px disc lying
wholly inside a 40px tile has its centre at most `sqrt(8^2 + 8^2) = 11.31px` from the tile's
centre, against its own radius of 12, so no placement avoided it. The control took 493 of the
tile's 1600 pixels and the block was draggable from its lower half alone; a later block on a
price axis could bury an earlier one's control. **All of that is gone with the control.**
Measured in Chrome at 1440x900 after the move, by sampling all 1600 pixels of a placed
block's tile with `elementFromPoint`: **1584 of 1600 hit-test to the tile itself**, the
remaining 16 being its own `rounded-md` corners, and a synthetic-but-real pointer sequence
beginning at the tile's top-right corner - the region the control used to own - starts a
vertical drag and re-prices the block from 10.00% to 0.00%. Do not reintroduce a control on
the tile: the geometry above is what it costs, and it was proved rather than merely observed.

`GridArea.dom.test.tsx` pins the wiring, under "GridArea, clearing a cell" for the cell's
control and "GridArea, removing a placed block" for the keyboard's. The tile's own geometry
is checkable only in a real browser - jsdom computes no layout and its `elementFromPoint` is
not layout-aware - so a coordinate test there would pass for the wrong reason and must not be
written. What CI holds instead is the token check on the control's 24px size and the
structural check that `Block`'s wrapper shrink-wraps its tile (`block.dom.test.tsx`, "keeps
the tile's wrapper the tile's own box") with its parent letting it -
`centeredContainer`'s flex row in an axis-less cell, and in an axis cell the
`flex justify-center` positioner from `getBlockPositionerProps` (`styles/grid.test.ts`, "the
positioner centres a shrink-wrapped child"). Those are what keep a tile drawn at the price it
says it is.

**The refusal is legible, not silent.** Three things say so together and none of them is
optional: the announcer's `moveRefused` sentences, a visible note under the grid
(`cellLockedNote`, ordinary text - never a second live region), and no cell drawing itself
as a target while a placed block is dragged (`getActiveAllowedRows` returns none for one).
A gesture that simply does nothing is indistinguishable from a broken control, which is what
D9 asks this to avoid. The note is shown for **both** refusals and both end in the same
correction, because both blocks have it - remove it and place a new one. Only the extra
clause differs, and it is the affordance that render really wires: the arrow keys exist for
a block on a price axis and for no other. The wordings were further apart while a priced
block had no removal at all, and the note promising a drag-off to the half of the grid that
had one is how it came to offer a removal the app could not perform.
**Its closing sentence names BOTH removals and says what each one takes**, rather than
offering them as alternatives: Delete takes the one order the note is about, and the cell's
clear control empties the cell, which in a bulk cell is orders the note is not about. A user
sent to the wrong one loses work the note never mentioned.

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
