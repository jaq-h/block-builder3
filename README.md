# Block Builder

A visual, grid-based strategy builder for assembling and managing crypto trading orders on the [Kraken](https://www.kraken.com/) exchange.

Built with **React 19** (with **React Compiler**), **TypeScript**, **Vite 7**, and **Tailwind CSS 4**.

---

## Features

- **Strategy Builder** - Grid interface for assembling multi-leg order strategies (conditional orders, bulk orders), driveable with a mouse, a finger or the keyboard alone
- **Active Orders** - View and manage submitted orders with real-time status tracking
- **Kraken API Integration** - REST and WebSocket clients for live market data, with all authenticated calls signed server-side
- **Simulation Mode** - Test strategies locally without connecting to the Kraken API. The default everywhere, and the only mode the public deployment offers
- **9 Order Types** - Limit, Market, Iceberg, Stop Loss, Stop Loss Limit, Take Profit, Take Profit Limit, Trailing Stop, Trailing Stop Limit

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) - the version used by CI is pinned in `.nvmrc` (`nvm use`).
  Vite 7 requires Node 20.19+ or 22.12+.
- npm

### Installation

```
npm install
```

### Development Server

```
npm run dev
```

The development server starts at **http://localhost:3002/**. Simulation mode is enabled automatically in development - no API keys required.

### Production Build

```
npm run build
```

### Preview Production Build

```
npm run preview
```

### Lint

```
npm run lint
```

### Tests

```
npm test              # run the suite once
npm run test:watch    # re-run on change
npm run test:coverage # run with a coverage report
```

Tests run on [Vitest](https://vitest.dev/), configured in the `test` block of
`vite.config.ts` so they share the app's plugins and path aliases. Component tests use
React Testing Library against jsdom. See `AGENTS.md` for the conventions the suite follows.

---

## Continuous Integration

Every pull request, and every push to `main`, runs four independent checks via GitHub
Actions (`.github/workflows/ci.yml`): **Typecheck**, **Lint**, **Unit tests** and
**Production build**. They run in parallel and report separately, so a red check names the
gate that broke. Dependencies are installed from the lockfile with `npm ci` and cached
between runs, and no job requires any Kraken credential.

---

## Deployment

The app is a single-page bundle plus a small set of serverless functions, hosted on
[Vercel](https://vercel.com/) at <https://block-builder3.vercel.app/>. Everything the platform
needs is declared in `vercel.json`; the build is plain `npm run build`.

**No environment variable is set on the deployment, and none may be.** The public deployment is
simulation only, and setting a Kraken credential on it is refused rather than honoured - see
[Trading modes](#trading-modes).

### Serverless functions

Each file under `api/` is a function. They are written against Node's own
`IncomingMessage`/`ServerResponse` rather than a framework request object, so the identical
module runs on Vercel, on the Vite dev server (`vite/krakenApiDevServer.ts`) and under a plain
stub in the tests. Files prefixed with `_` are shared code, not routes.

### SPA rewrite

Vercel checks the filesystem before it applies a rewrite, so real files still win and every
other path falls through to `/index.html`. `/api/` and `/assets/` are excluded explicitly.
`/api/` because a request that reaches a function must never be answered with the SPA shell,
and `/assets/` because those filenames are content-hashed: a request for one that no longer
exists is a stale client asking for a superseded build. It should get an honest 404 rather
than a page of HTML served under a JavaScript content type.

### Security headers

| Header | Why |
|---|---|
| `Content-Security-Policy` | See below. |
| `X-Content-Type-Options: nosniff` | Stops a browser second-guessing a declared content type. |
| `X-Frame-Options: DENY` | Legacy backstop for the CSP's `frame-ancestors 'none'`. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Sends the origin, never the path, to a third party. |
| `Permissions-Policy` | Denies every powerful device API. The app uses none of them. |
| `Cross-Origin-Opener-Policy: same-origin` | Severs `window.opener` from anything the page opens. |

The CSP is:

```
default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none';
form-action 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self';
connect-src 'self' https://api.kraken.com wss://ws.kraken.com wss://ws-auth.kraken.com
```

Two entries need explaining:

- **`connect-src` names every host the app talks to**: `'self'` for this app's own
  `/api/kraken/*` endpoints, `api.kraken.com` for the *public* REST ticker and OHLC candles,
  `ws.kraken.com` for the public feed and `ws-auth.kraken.com` for the private one. Authenticated
  REST calls no longer appear here because the browser no longer makes any. A new endpoint has to
  be added here as well as in the code, or the request is blocked at runtime with nothing in the
  source to explain why.
- **`style-src` allows `'unsafe-inline'`** because React writes inline `style` attributes and
  `lightweight-charts` injects a stylesheet of its own once the chart mounts. A static deploy has
  no way to issue a per-response nonce, and pinning a hash of a minified third-party stylesheet
  would break silently on the next dependency bump. `script-src` stays `'self'` with neither
  `'unsafe-inline'` nor `'unsafe-eval'`, which is the directive that actually gates code execution.

`npm run preview` serves the build *without* these headers, because they live in `vercel.json`
rather than in the app. To exercise a CSP change locally, run the deployment itself with
`npx vercel dev`.

### Caching

`/assets/*` is content-hashed by Vite, so it is served `public, max-age=31536000, immutable`.
Everything else, `index.html` included, keeps Vercel's revalidate-on-every-request default, so a
new deploy is picked up immediately.

### Code splitting

`lightweight-charts` is only reachable from the chart panel, so the panel is exported through a
`lazy()` boundary in `components/widgets/orderChart/LazyOrderChart.tsx` and the library never
enters the initial payload. The barrel re-exports the boundary rather than the implementation, so
no import can pull it back in by accident.

---

## Trading modes

The app runs in one of two modes, and **which one it is in is decided on the server, never
in the browser**. No Kraken credential is compiled into the bundle, and the bundle contains
no request-signing code at all: an authenticated call is a request to this app's own
`/api/kraken/*` endpoints, which hold the key, sign, and call the exchange.

| | Simulation | Live |
|---|---|---|
| Where it runs | Anywhere, including the public deployment | The operator's own machine, on loopback |
| Credentials | None, and none are accepted | Yours, in your own server-side environment |
| Orders | Saved locally in the browser | Sent to Kraken |
| Configuration | The default | `KRAKEN_TRADING_MODE=live`, `KRAKEN_ALLOW_LOCAL_LIVE=1`, and both key variables |

### The public deployment is simulation only

<https://block-builder3.vercel.app/> is reachable by anyone. A credential there would let
any anonymous visitor trade on the operator's Kraken account, so the split is enforced in
code rather than left to configuration:

- On a hosted deployment (`VERCEL_ENV` of `production` or `preview`), `KRAKEN_TRADING_MODE=live`
  is **refused**.
- On a hosted deployment, merely *setting* `KRAKEN_API_KEY` or `KRAKEN_API_PRIVATE_KEY` puts
  the deployment into a `misconfigured` state that signs nothing and says why.
- Any hosting signal at all - `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT`, or any
  `VERCEL_ENV` - refuses live mode, because `VERCEL_ENV` is a system variable a project can be
  configured not to expose and its absence therefore proves nothing.
- Live mode additionally requires `KRAKEN_ALLOW_LOCAL_LIVE=1`, the operator's positive statement
  that this process is their own machine. An environment that has not said so is never assumed
  to be local.

Adding a credential to the hosting dashboard therefore cannot switch the public site to live
trading. It breaks that deployment, loudly, which is the intended behaviour. The rule lives in
`api/_lib/serverConfig.ts` and is covered by `api/_lib/serverConfig.test.ts`.

### Live mode is loopback only, and unauthenticated

A live server signs Kraken requests for **whoever can reach it**. It authenticates the
deployment, not the caller, and it deliberately ships no authentication layer: no shared
secret, no token, nothing. Anyone who can open `POST /api/kraken/ws-token` gets a Kraken
WebSocket token carrying the key's permissions, and anyone who can open
`GET /api/kraken/balance` reads the account.

Live mode is therefore confined to loopback, twice over:

- **The bind.** A dev server configured for live trading and bound to anything but loopback
  **fails to start** with an error naming the problem (`vite/krakenApiDevServer.ts`). Any other
  hosting must apply the same rule: bind live mode to `127.0.0.1`, never `0.0.0.0`.
- **The request.** Independently of the bind, `/api/kraken/balance` and `/api/kraken/ws-token`
  answer `403` to any peer that is not `127.0.0.0/8` or `::1` (`api/_lib/loopback.ts`), so a
  permissive bind cannot expose them either. `/api/kraken/status` answers the same way round:
  a non-loopback caller is told the deployment simulates, because that is what it will get.

**Exposing this beyond loopback is the operator's own responsibility.** If you put a live
instance behind a proxy, on a LAN, or on a tunnel, you must add your own authentication in
front of it. We provide none, on purpose.

### Running live, locally or self-hosted

1. Log in to your [Kraken](https://www.kraken.com/) account and go to **Settings > API**.
2. Create a key with the narrowest permissions you need. The authenticated calls this app makes
   today are reads: **Query funds** covers `/api/kraken/balance`, and **Access WebSockets API**
   is required for `/api/kraken/ws-token`, because Kraken's `GetWebSocketsToken` is gated on it.
   Without that permission the endpoint answers `502` carrying Kraken's
   `EGeneral:Permission denied`. Order placement is not wired up, so an order-create permission
   is not required and should not be granted yet.
3. Copy `local.env.example` to `local.env` and fill it in:

```
KRAKEN_TRADING_MODE=live
KRAKEN_ALLOW_LOCAL_LIVE=1
KRAKEN_API_KEY=your_api_key_here
KRAKEN_API_PRIVATE_KEY=your_api_private_key_here
```

4. Run `npm run dev`, which mounts the same `api/` handlers Vercel runs (see
   `vite/krakenApiDevServer.ts`) and binds to loopback. Do not add `--host`: the dev server
   refuses to start in live mode on any other interface. `npx vercel dev` sets `VERCEL`, which
   is a hosting signal, so it runs in simulation - use it to exercise the deployment's own
   headers, not to trade.

Check `GET /api/kraken/status` to see what the server decided:

```
$ curl -s localhost:3002/api/kraken/status
{"mode":"live","liveAvailable":true,"errors":[]}
```

Anything ambiguous is refused rather than guessed. `KRAKEN_TRADING_MODE=live` with a missing
or half-supplied credential pair, without `KRAKEN_ALLOW_LOCAL_LIVE=1`, in an environment
carrying a hosting signal, or with a mode string the server does not recognise, answers
`503` with `"mode":"misconfigured"` and an explanation; the UI stays in simulation.

> **Never commit your `local.env` file.** It is already in `.gitignore`.

### Server endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/kraken/status` | GET | Which mode the server is in. Carries no credential, ever. |
| `/api/kraken/balance` | GET | Account balances. The authenticated read that exercises the boundary. Loopback only. |
| `/api/kraken/ws-token` | POST | Mints a Kraken WebSocket token, which is short-lived and scoped, unlike the key that produced it. Loopback only. |

The private endpoints are an **allowlist, not a proxy** (`api/_lib/krakenClient.ts`). A generic
"sign whatever the browser asks" endpoint would be a signing oracle, which is the failure this
boundary exists to prevent. Adding an operation is a deliberate, reviewable change.

---

## Architecture

### Split Context Pattern

The Strategy Assembly widget uses **four specialized React Contexts**, split by update frequency to minimize unnecessary re-renders:

| Context | Purpose | Update Frequency |
|---|---|---|
| `StaticContext` | Refs & immutable data (grid ref, callbacks) | Never (after mount) |
| `GridDataContext` | Business state (cell data, order config) | Low |
| `DragContext` | Drag UI state (active drag, source cell) | Medium |
| `HoverContext` | Hover UI state (hovered row/col) | High |

Components subscribe only to the context(s) they need, so a hover event doesn't re-render the entire grid.

### Drag Overlay Layer

Drag visuals are rendered via a **React Portal** into a dedicated `<div id="drag-overlay">` outside the `#root` tree. Position updates bypass React entirely:

- A **module-level store** (`dragOverlayStore.ts`) holds mutable `{ x, y }` coordinates
- A `requestAnimationFrame` loop stamps `transform` directly on the DOM node
- `useSyncExternalStore` triggers only two React renders per drag: **start** and **stop**

This keeps the grid completely decoupled from pointer-move events during a drag.

### Reducer-Based Store

The Orders Store uses a `useReducer` pattern with a clean separation:

- **`ordersReducer.ts`** - Pure reducer function with typed action discriminated union
- **`OrdersStoreContext.ts`** - Context definition, types, and initial state factory
- **`useOrdersStore.ts`** - Hook + memoized selectors (`useActiveOrdersCount`, `useLiveOrdersCount`, etc.)
- **`OrdersStore.tsx`** - Provider component wiring reducer + side effects

### Tailwind CVA Styling

All component styles use **[CVA (Class Variance Authority)](https://cva.style/)** for variant-driven styling, combined with `clsx` + `tailwind-merge` (via a `cn()` utility). Style definitions are co-located in `*.styles.ts` files next to their components.

### React Compiler

The project enables the **React Compiler** (`babel-plugin-react-compiler`) via Vite's React plugin. The compiler automatically memoizes components and values at build time, so manual `useMemo` and `useCallback` are unnecessary in most cases and have been removed from the codebase.

### Split Hooks

Interaction logic is split into purpose-specific hooks:

- **`usePointerGesture`** - The pointer primitive underneath both drag hooks: capture, tap-versus-drag, cancel
- **`useFreeDrag`** - Free-form drag for moving blocks between grid cells (integrates with the drag overlay portal)
- **`useVerticalDrag`** - Constrained vertical drag for sliding blocks along the price-scale axis
- **`useBlockCommand`** - The select-then-place command model layered over the drag
- **`useTradeExecution`** - Order configuration management, submission flow, simulation mode toggle

---

## Interaction model

The builder has one interaction model, reached three ways. All of them end up calling the
same two placement functions in `GridArea`, expressed in terms of a target **cell** rather
than a pointer coordinate, so the input methods cannot drift apart.

**Pointer: mouse, touch and pen.** `usePointerGesture` handles the raw gesture on Pointer
Events, so one code path serves all three devices. Two details are load-bearing:

- The dragged element takes `setPointerCapture`, which is what delivers `pointerup` even
  when the button is released **outside the browser window**. The previous
  `window.addEventListener("mouseup")` implementation never saw that release, and the block
  stayed glued to the cursor.
- Blocks carry `touch-action: none`. Without it the browser claims a finger drag for page
  scrolling before the first `pointermove` arrives.

A release that never travelled more than a few pixels is a **tap**, not a zero-length drop,
and is handed to the command model instead of the drop handler.

**Command model: keyboard, screen readers and taps.** Focus a block and press Enter - or
Space, which a button answers to as well - to pick it up; the arrow keys choose a target
cell; Enter places it; Escape returns it. Tab is never swallowed - it abandons the carry
and moves focus on, so a carried block cannot trap the keyboard. On touch the same model
is driven by taps: tap a block, tap a cell.

The arrow keys step only between cells that were **legal when the carry began**, so the
target under the arrows is always one the grid has accepted; `commit` re-checks at the
moment of placing and says the order was not placed if the grid has changed since. They
prefer a cell straight ahead and otherwise take the nearest legal cell in that direction,
which is what makes the diagonal placement rule reachable at all: with one block placed, the
only other legal cells are its diagonals, and a strictly orthogonal step could never leave
the cell it started in.

The pure half of that model - the transitions and the target arithmetic - lives in
`src/utils/blockCommand.ts` and is directly testable. `useBlockCommand` adds the two things
a reducer cannot supply: what gets announced, and where focus lands afterwards.

**What moves between cells, and what does not.** A block the cell draws **on a price axis**
stays in its cell. That is not an accessibility shortfall: a mouse cannot move one either -
`Block` routes anything rendered on an axis to the vertical drag, so the free drag never
applies to it - and every input method is held to the same capability. Palette placement and
moving an **axis-less** block between cells are offered by pointer, keyboard and tap alike.
`activateBlock` decides this from the cell's display mode, the same value the renderer uses,
so the offer and the drawing can never disagree.

**Removing a single block is pointer-only today.** It happens by dragging a block out of the
grid: `removeBlock` is reached from one place, the `else` branch of `handleDragEnd`, which
only a free drag that released outside every cell can get to. The command model has no
delete transition at all - `blockCommand.ts` is pickUp, moveTarget, place and cancel - and
`activateCell` can only name a grid cell, so a keyboard or a tap cannot remove one block.
A keyboard user's removal path is **Clear All**. That is missing capability rather than a
defect: a keyboard user can still assemble and price a complete strategy, and a delete
transition - which needs its own confirmation and announcement design - is filed as its own
work rather than bolted onto this lane.

Enter or a tap on a priced block is therefore refused rather than silent, and the refusal
names what that render does wire: the arrow keys, which move the block along its axis. The
rule is the whole axis and not just paired legs - a lone Limit, a lone Stop Loss and two
independent Limits sharing a bulk cell are all drawn on an axis, so all are refused, and all
are equally immovable with a mouse. Only in a cell that draws **no** axis at all - a bulk
cell holding an axis-less block - is the separate dual-axis refusal reached, and there it
promises no arrow keys, because none are wired.

Moving a placed priced block between cells is a real capability worth having for every
input method, and it is **sequenced rather than abandoned**: a cell's scale is currently
its first block's `direction`, so moving a block out of a mixed cell would silently re-price
the ones left behind. It is filed with the lane that gives the block-to-price mapping a
single owner, because doing it safely needs that authority to exist first.

**The price axis** is a block's most important property, so it is reachable every way too: a
pointer drags the block up and down its axis, and on the keyboard it behaves as a real
vertical slider - `role="slider"` with arrow keys (Shift for a larger step, Page Up/Down
larger still, Home/End for the ends of the axis). Its `aria-valuenow` is the **signed** offset
from the market price, positive above and negative below, so the value always moves the same
way the block does on screen whichever direction the cell's scale runs.

**A drag supersedes a carry.** Starting a real pointer drag - the move that crosses the tap
slop, not the pointer-down that might still be a tap - cancels whatever the command model is
carrying. Without that, the click the browser appends to every gesture bubbles from the
dragged block into its cell, which is a live placement target while anything is carried, and
the carried block is placed somewhere the user never chose. Cancelling at pointer-down
instead would break the tap that places a carried block into another block's cell, which is
why `usePointerGesture` reports drag recognition as its own moment.

That release is **silent** (`cancel({ silent: true })`), and the drag announces its own
outcome when it ends instead. A cancellation message names a resting place - "left in Entry
column, row 2" - and the very gesture that triggered it is about to move, remove or place
that block, so the last thing said would contradict the grid. A **free drag of a placed block that
ends on a cell or off the grid**, and a **palette drag that resolves to a cell**, therefore
say what they did: moved to a named cell, stayed where it was, removed from the grid, or
placed from the palette into a named cell, using `describeCell` and `describeSource` so the pointer path and the keyboard path sound like one
interaction. The vertical price drag is deliberately left silent: a placed block is a
`role="slider"`, and assistive technology already speaks its `aria-valuetext` on every
change.

**Known announcement gap, shipping deliberately.** Not every path through the announcement
layer is correct yet. These are gaps in this change, not limits of the platform or of
assistive technology, and each is deterministic rather than occasional:

- A **vertical price drag releases an active carry silently.** It crosses the same tap slop
  as any other drag, so it supersedes the carry, but it never reaches the drop handler and
  nothing is announced. The carry is gone with no word said - and the next tap on a cell
  then does nothing at all, because `GridCell` attaches its click handler only while
  something is carried. A **`pointercancel`** ends the same way: `endDrag` alone, no message.
- A **palette drag released outside every cell announces nothing.** `handleProviderDragEnd`
  speaks only when the release resolves to a cell.
- On the **conditional pattern - the default - a same-cell release announces a refusal that
  contradicts where the block is.** The drop supplies a position, so `moveBlockToCell` skips
  its same-cell no-op branch and asks `isCellValidForPlacement`, which reads the block's own
  occupied cell as an illegal target. The live region then says "Entry column, primary row
  cannot take this order. Market block stayed in Entry column, primary row." Nudging a block
  a few pixels and letting go is enough to hear it. The bulk pattern does not show it,
  because every cell is a legal target there.

All three are sequenced to the lane that gives the block-to-price mapping and the
announcement layer a single owner. The plan is that this branch waits for that lane rather
than merging ahead of it.

Announcements go through `LiveAnnouncer`, which alternates between two live regions: a
screen reader only reads a region whose content **changed**, so two identical messages in a
row would otherwise be silent the second time.

**Known gap, bulk pattern only.** A bulk cell holding any axis-less block draws *every*
block in it without an axis: `getCellDisplayMode` returns `"no-axis"` as soon as one block
has no axes, and that decides the whole cell. Four things follow, and all are limited to
that case. They do not share a provenance, so they are listed apart - two inherited, two
introduced here.

*Inherited, and present before the pointer/keyboard work.* Mouse free drag reaches a paired
dual-axis leg in such a cell and can split the order across cells, because the cell draws
that leg without an axis and `Block` sends anything drawn without one to the free drag.

*Also inherited.* That same drop path writes `yPosition` through `calculateYPosition`, which
returns 0-100 against a scale whose maximum is 50, so a block can render pinned at the 50%
end while its label reads the raw value.

*Introduced by the pointer/keyboard work.* Keyboard and tap pick-up of a paired dual-axis
leg is refused in such a cell - there was no keyboard or tap pick-up at all before this
change, so the refusal could not have been inherited - and it deliberately does not offer
the arrow keys, because that render wires none.

*Introduced by the pointer/keyboard work, and now contained.* Unifying the track geometry
made the vertical drag resolve its track by the block's own `axis` field, which can disagree
with the axis column the renderer actually drew it in - a Limit stamped `axis: 1` by a drop
in the left half of a cell is still drawn in that cell's limit column. A miss left the drag
silently dead, so the order could not be re-priced by mouse or by finger while the arrow
keys still worked. `handleBlockVerticalDrag` now falls back to whichever axis track the cell
did render, restoring the property the earlier implementation had of always finding a track.
The keying disagreement itself remains.

The conditional pattern cannot reach any of it, because an occupied cell is never a valid
target. The real fix is to give the block-to-price mapping one owner instead of several
consumers that have to agree, and that is filed as its own piece of work.

Each of the three input methods driving the running app is captured in
[`docs/screenshots/interaction/`](docs/screenshots/interaction/), which records the commit
every shot was taken against.

### Error Boundaries

Two `ErrorBoundary` instances stop a single throw from blanking the page:

- **Root** - wraps `<App/>` in `main.tsx`, so an uncaught render error anywhere shows a
  recoverable fallback instead of a white screen.
- **Chart** - wraps `<OrderChart/>` in `App.tsx`, so a chart-library failure or a malformed
  candle payload cannot take the strategy builder down with it.

Each fallback offers a **Try again** that re-mounts the subtree, and accepts an `onError`
callback for forwarding the error to real error reporting.

---

## Project Structure

```
api/                               # Serverless functions - the credential lives here, not in the bundle
├── _lib/
│   ├── serverConfig.ts            # Decides simulation vs live; refuses ambiguity
│   ├── krakenSigning.ts           # HMAC-SHA512 request signing (server only)
│   ├── krakenClient.ts            # Allowlisted private Kraken calls
│   ├── runtime.ts                 # The one path that hands out a credential
│   └── http.ts                    # JSON + method plumbing
└── kraken/
    ├── status.ts                  # GET  - which mode the server is in
    ├── balance.ts                 # GET  - authenticated read
    └── ws-token.ts                # POST - mints a WebSocket token

vite/                              # Dev-server tooling (never bundled)
├── krakenApiDevServer.ts          # Mounts api/ on `npm run dev`
└── localEnv.ts                    # Reads local.env into the dev server's environment

src/
├── App.tsx                        # Root component - providers, routing, drag overlay
├── App.styles.ts                  # App-level CVA variants & layout classes
├── main.tsx                       # Application entry point
├── index.css                      # Global styles & Tailwind theme tokens
│
├── api/                           # Kraken API integration (browser side, credential-free)
│   ├── config.ts                  # Endpoint configuration. Holds no credential
│   ├── tradingMode.ts             # The server's simulation/live answer, cached for the page
│   ├── krakenServer.ts            # Calls this app's own /api/kraken/* endpoints
│   ├── krakenRest.ts              # Public REST API client
│   ├── krakenWebSocket.ts         # WebSocket client for live data
│   ├── orderMapper.ts             # Maps internal order config → Kraken API format
│   ├── tickerUpdate.ts            # Parses & merges v2 ticker WebSocket frames
│   ├── types.ts                   # API-specific type definitions
│   └── index.ts                   # Barrel export
│
├── components/
│   ├── blocks/                    # Draggable order block components
│   │   ├── block.tsx              # Core block component (CVA variants)
│   │   ├── action-placeholder.tsx # Placeholder for action slots
│   │   └── trigger-placeholder.tsx# Placeholder for trigger slots
│   │
│   ├── common/
│   │   ├── DragOverlay.tsx        # Portal-rendered drag ghost (rAF-driven positioning)
│   │   ├── dragOverlayStore.ts    # Module-level drag state (useSyncExternalStore)
│   │   ├── LiveAnnouncer.tsx      # Two alternating live regions for announcements
│   │   ├── ErrorBoundary.tsx      # Recoverable fallback UI in place of a blank page
│   │   ├── NavBar.tsx             # Navigation bar with live order badge
│   │   └── grid/                  # Shared grid components
│   │       ├── GridCell.tsx       # Interactive grid cell (Strategy Builder)
│   │       ├── GridCell.styles.ts # Grid cell CVA styling
│   │       ├── ReadOnlyGridCell.tsx # Read-only grid cell (Active Orders)
│   │       ├── ProviderColumn.tsx # Order-type provider sidebar column
│   │       └── index.ts          # Barrel export
│   │
│   └── widgets/
│       ├── strategyAssembly/      # Strategy Builder widget
│       │   ├── strategyAssembly.tsx            # Main component & context provider
│       │   ├── strategyAssembly.styles.ts      # CVA styles
│       │   ├── StrategyAssemblyContext.tsx      # Provider wiring (split contexts)
│       │   ├── useStrategyAssembly.ts          # Business logic hook
│       │   │
│       │   ├── contexts/          # Split contexts (by update frequency)
│       │   │   ├── StaticContext.ts   # Refs & immutable data (never changes)
│       │   │   ├── GridDataContext.ts # Grid/order state (low frequency)
│       │   │   ├── DragContext.ts     # Drag UI state (medium frequency)
│       │   │   ├── HoverContext.ts    # Hover UI state (high frequency)
│       │   │   └── index.ts          # Barrel export
│       │   │
│       │   └── components/        # Extracted sub-components
│       │       ├── GridArea.tsx        # Grid rendering & cell interaction
│       │       ├── ExecuteTradePanel.tsx # Trade submission UI
│       │       ├── PatternSelector.tsx # Order pattern presets
│       │       ├── UtilityButtons.tsx  # Clear / reset controls
│       │       ├── DebugPanel.tsx      # Debug state inspector
│       │       └── index.ts           # Barrel export
│       │
│       ├── orderChart/            # Price chart widget (code-split)
│       │   ├── LazyOrderChart.tsx     # lazy() boundary + loading fallback
│       │   ├── OrderChart.tsx         # Chart panel - the only lightweight-charts importer
│       │   ├── useLightweightChart.ts # Chart instance lifecycle
│       │   └── index.ts               # Barrel export (re-exports the lazy boundary)
│       │
│       └── activeOrders/          # Active Orders widget
│           ├── ActiveOrders.tsx                # Main component
│           ├── ActiveOrders.styles.ts          # CVA styles
│           ├── ActiveOrdersContext.tsx          # Provider wiring
│           ├── ActiveOrdersContextDef.ts       # Context creation (separate for Fast Refresh)
│           ├── OrderCard.tsx                   # Single submitted-order card
│           ├── useActiveOrders.ts              # Consumer hook
│           └── index.ts                        # Barrel export
│
├── data/                          # Static data & configuration
│   ├── orderTypes.ts              # Order type definitions, grid config, helpers
│   └── index.ts
│
├── hooks/                         # Custom React hooks
│   ├── usePointerGesture.ts       # Pointer primitive (capture, tap vs drag, cancel)
│   ├── useFreeDrag.ts             # Free-form drag (provider → grid cell)
│   ├── useVerticalDrag.ts         # Vertical-axis drag (price scale sliding)
│   ├── useBlockCommand.ts         # Select-then-place command model (keyboard, taps)
│   ├── useAnnouncer.ts            # Live-region message state
│   ├── useKrakenAPI.ts            # Kraken API hook (prices, order management)
│   ├── useTradingMode.ts          # Subscribes the UI to the server's trading mode
│   ├── useOHLCData.ts             # OHLC candle fetching for the chart
│   ├── useTradeExecution.ts       # Trade config, submission & simulation flow
│   └── index.ts
│
├── lib/
│   └── utils.ts                   # Utility (cn - clsx + tailwind-merge)
│
├── store/                         # Application state
│   ├── OrdersStore.tsx            # Provider component (reducer + side effects)
│   ├── OrdersStoreContext.ts      # Context definition & TypeScript types
│   ├── useOrdersStore.ts          # Hook + derived-data selectors
│   ├── ordersReducer.ts           # Pure reducer & action types
│   └── index.ts                   # Barrel export
│
├── styles/                        # Shared style constants
│   ├── theme.ts                   # Design tokens / theme values
│   ├── grid.ts                    # Grid style helpers & the axis track geometry
│   ├── shared.ts                  # Shared style strings
│   └── index.ts
│
├── types/                         # TypeScript type definitions
│   ├── grid.ts                    # Grid, block, cell, order config types
│   ├── orders.ts                  # Kraken order types & validators
│   ├── activeOrders.ts            # Active orders state types
│   ├── strategyAssembly.ts        # Strategy assembly state types (split context types)
│   ├── svg.d.ts                   # SVG import declarations (vite-plugin-svgr)
│   └── index.ts                   # Barrel export
│
├── utils/                         # Pure utility functions
│   ├── blockCommand.ts            # Select-then-place state machine (pure half)
│   ├── blockFactory.ts            # Factory for creating block data
│   ├── grid.ts                    # Grid manipulation helpers
│   ├── price.ts                   # Percentage-offset-from-market price formula
│   └── index.ts
│
└── assets/
    └── icons/                     # SVG icons (imported as React components via svgr)
```

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| [react](https://react.dev/) | ^19.2.0 | UI framework |
| [react-dom](https://react.dev/) | ^19.2.0 | React DOM renderer |
| [react-router-dom](https://reactrouter.com/) | ^7.12.0 | Client-side routing (Strategy Builder ↔ Active Orders) |
| [tailwindcss](https://tailwindcss.com/) | ^4.1.18 | Utility-first CSS framework |
| [@tailwindcss/vite](https://tailwindcss.com/docs/installation/vite) | ^4.1.18 | Tailwind CSS Vite plugin |
| [class-variance-authority](https://cva.style/) | ^0.7.1 | Variant-driven component styling (CVA) |
| [clsx](https://github.com/lukeed/clsx) | ^2.1.1 | Conditional className builder |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | ^3.4.0 | Merge Tailwind classes without conflicts |

### Development

| Package | Version | Purpose |
|---|---|---|
| [vite](https://vite.dev/) | ^7.2.4 | Build tool & dev server |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | ^5.1.1 | React Fast Refresh for Vite |
| [babel-plugin-react-compiler](https://react.dev/learn/react-compiler) | ^1.0.0 | React Compiler - automatic memoization |
| [vite-plugin-svgr](https://github.com/pd4d10/vite-plugin-svgr) | ^4.5.0 | Import SVGs as React components |
| [typescript](https://www.typescriptlang.org/) | ~5.9.3 | Static type checking |
| [eslint](https://eslint.org/) | ^9.39.1 | Linting |
| [@eslint/js](https://eslint.org/) | ^9.39.1 | ESLint core JS rules |
| [typescript-eslint](https://typescript-eslint.io/) | ^8.14.0 | TypeScript-aware ESLint rules |
| [eslint-plugin-react-hooks](https://www.npmjs.com/package/eslint-plugin-react-hooks) | ^7.0.1 | React Hooks lint rules |
| [eslint-plugin-react-refresh](https://www.npmjs.com/package/eslint-plugin-react-refresh) | ^0.4.24 | React Refresh lint rules |
| [globals](https://github.com/sindresorhus/globals) | ^16.5.0 | Global variable definitions for ESLint |
| [@types/node](https://www.npmjs.com/package/@types/node) | ^24.10.1 | Node.js type definitions |
| [@types/react](https://www.npmjs.com/package/@types/react) | ^19.2.5 | React type definitions |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | ^19.2.3 | ReactDOM type definitions |

---

## Path Aliases

Configured in `vite.config.ts` for cleaner imports:

| Alias | Path |
|---|---|
| `@` | `src/` |
| `@components` | `src/components/` |
| `@widgets` | `src/components/widgets/` |
| `@common` | `src/components/common/` |
| `@hooks` | `src/hooks/` |
| `@utils` | `src/utils/` |
| `@store` | `src/store/` |
| `@data` | `src/data/` |
| `@assets` | `src/assets/` |
| `@api` | `src/api/` |
| `@styles` | `src/styles/` |

---

## License

[MIT](./LICENSE) - Jacques Hebert, 2025