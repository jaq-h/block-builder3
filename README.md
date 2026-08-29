# Block Builder

A visual, grid-based strategy builder for assembling and managing crypto trading orders on the [Kraken](https://www.kraken.com/) exchange.

Built with **React 19** (with **React Compiler**), **TypeScript**, **Vite 7**, and **Tailwind CSS 4**.

---

## Features

- **Strategy Builder** - Grid interface for assembling multi-leg order strategies (conditional orders, bulk orders), driveable with a mouse, a finger or the keyboard alone
- **5 Markets** - BTC, ETH, SOL, ARB and OP against USD, picked with a selector above the grid; the price feed, the chart, the grid and the order payload all follow the selection, and each pair's precision, tick size and minimum order come from Kraken's own asset metadata rather than a guess
- **Price Chart** - Live Kraken candles with the grid's order levels drawn on them, a linear/logarithmic price scale and moving-average overlays (SMA 20, SMA 50, EMA 20)
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

The development server starts at **http://localhost:3002/**. It simulates unless live trading is
configured server-side in `local.env`, so no Kraken credential is required to run it - see
[Trading modes](#trading-modes).

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
needs is declared in `vercel.json` and `.vercelignore`; the build is plain `npm run build`.

**No environment variable is set on the deployment, and none may be.** The public deployment is
simulation only, and setting a Kraken credential on it is refused rather than honoured - see
[Trading modes](#trading-modes).

### Serverless functions

Each file under `api/` is a function. They are written against Node's own
`IncomingMessage`/`ServerResponse` rather than a framework request object, so the identical
module runs on Vercel, on the Vite dev server (`vite/krakenApiDevServer.ts`) and under a plain
stub in the tests. Files prefixed with `_` are shared code, not routes.

That rule is mechanical and it applies to *every* file, which is what `.vercelignore` is for:
without it a colocated test under `api/kraken/` would be published as an endpoint, so
`api/kraken/handlers.test.ts` would deploy as `/api/kraken/handlers.test`, importing `vitest`
and exporting no handler. The single entry `api/**/*.test.ts` covers the next such test too,
and `api/_lib/deploymentSurface.test.ts` asserts the route list a deploy would actually
publish, so an accidental endpoint fails the suite rather than the site.

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
  `/api/kraken/*` endpoints, `api.kraken.com` for the *public* REST ticker, OHLC candles and
  per-pair asset metadata, `ws.kraken.com` for the public feed and `ws-auth.kraken.com` for the
  private one. Authenticated REST calls no longer appear here because the browser no longer makes
  any. A new endpoint has to be added here as well as in the code, or the request is blocked at
  runtime with nothing in the source to explain why.
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

One module crosses that boundary deliberately: `ChartHeader.tsx`, which the real panel and the
loading placeholder both render, so the two are the same markup and the swap costs no layout
shift. That puts it in the eager chunk, so **nothing it reaches may import `lightweight-charts`
as a value** - which is why the enum mapping lives in `priceScaleMode.ts`, imported only from
the lazy side, while `priceScale.ts` holds the library-free vocabulary. That rule is enforced
rather than documented: `vite/eagerChunk.test.ts` runs a production build and fails if the
eager chunk carries the library.

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

- **The bind.** A dev server configured for live trading and bound to anything but
  `localhost`, `127.0.0.1` or `::1` **fails to start**, with an error naming the bind it
  refused and the three it serves (`vite/krakenApiDevServer.ts`). An empty `--host` is
  refused with the rest: it reads like the default but listens on every interface. That
  list is the same one the per-request `Host` check uses, so a bind that would start a
  server refusing its own operator is caught at startup rather than becoming a live server
  that answers every request as though it simulated. Any other hosting must apply the same
  rule: bind live mode to `127.0.0.1`, never `0.0.0.0`.
- **The request.** Independently of the bind, `/api/kraken/balance`, `/api/kraken/ws-token`
  and `/api/kraken/status` serve a caller only when all four of these hold
  (`api/_lib/loopback.ts`):
  1. the peer address is in `127.0.0.0/8` or is `::1`;
  2. the `Host` header is `localhost`, `127.0.0.1` or `[::1]`, with any port. Missing or
     malformed is refused. Without this a DNS rebind reaches a server bound exactly as
     instructed: an attacker's page re-resolves its own hostname to `127.0.0.1`, so the peer
     address is loopback while the page reading the Kraken token is not yours;
  3. the request carries this app's own header, `X-Block-Builder-App: 1`. It is not a secret
     and carries no credential; it is the thing a page on another site cannot get permission
     to send. An `<img src>` or a form post cannot set a header at all, and a cross-origin
     `fetch` with a header outside the CORS safelist has to win a preflight first. Deployed,
     the function answers that `OPTIONS` itself with a `405` and no `Access-Control-Allow-*`
     header. Under `npm run dev`, Vite's own `cors` middleware answers it before ours runs,
     with a `204`, but its default allowed origins are loopback only, so a foreign origin is
     sent no `Access-Control-Allow-Origin` and the browser drops the real request. A page on
     *another loopback origin* does pass that preflight, and is refused by check 4 instead,
     which is why this is one check of four. The app sends the header on every call, and a
     script or a `curl` invocation sends it by hand;
  4. no foreign origin is declared, by `Sec-Fetch-Site` or `Origin`. Without this any site the
     operator visits while running live can `POST /api/kraken/ws-token` with CORS-safelisted
     headers only, which sends no preflight. It could not read the reply, but it would have
     burned a Kraken nonce and a slice of the account's rate limit.

  Checks 1, 2 and 4 all *infer* who the caller is from headers that a request may simply
  omit, and each was bypassed in turn by a shape that omits them. Check 3 is the affirmative
  one, and the reason the absence of `Sec-Fetch-Site` and `Origin` is no longer read as
  "this must be curl": on a browser predating Fetch Metadata (Safari below 16.4) an `<img>`
  or a form post from an attacker's page sends neither, and looked identical to a script.

  A request that fails any of them is answered exactly as a simulating deployment answers
  everyone: `503`, `"mode":"simulation"`. `/api/kraken/status` applies the same test and tells
  such a caller the deployment simulates. The three agree on purpose, so a remote caller cannot
  learn from one what the others decline to say.

That guard establishes that a request came from this machine and from this app. It does **not**
establish who is at the keyboard, and it is not authentication.

**Exposing this beyond loopback is the operator's own responsibility.** If you put a live
instance behind a proxy, on a LAN, or on a tunnel, you must add your own authentication in
front of it. We provide none, on purpose. A reverse proxy in particular defeats the peer-address
half of the guard by design, since every request then arrives from the proxy.

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
   `vite/krakenApiDevServer.ts`) and binds to loopback. Do not add `--host` unless it names
   `localhost`, `127.0.0.1` or `::1`: the dev server refuses to start in live mode on any
   other bind, including the rest of `127.0.0.0/8`. `npx vercel dev` sets `VERCEL`, which
   is a hosting signal, so it runs in simulation - use it to exercise the deployment's own
   headers, not to trade.

Check `GET /api/kraken/status` to see what the server decided:

```
$ curl -s -H 'X-Block-Builder-App: 1' localhost:3002/api/kraken/status
{"mode":"live","liveAvailable":true,"errors":[]}
```

Every endpoint needs that header, and every scripted caller has to send it - without it the
server answers as it answers a stranger, `{"mode":"simulation","liveAvailable":false,...}`:

```
$ curl -s -H 'X-Block-Builder-App: 1' localhost:3002/api/kraken/balance
$ curl -s -X POST -H 'X-Block-Builder-App: 1' localhost:3002/api/kraken/ws-token
```

Anything ambiguous is refused rather than guessed. `KRAKEN_TRADING_MODE=live` with a missing
or half-supplied credential pair, without `KRAKEN_ALLOW_LOCAL_LIVE=1`, in an environment
carrying a hosting signal, or with a mode string the server does not recognise, answers
`503` with `"mode":"misconfigured"` and an explanation; the UI stays in simulation.

> **Never commit your `local.env` file.** It is already in `.gitignore`.

### Server endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/kraken/status` | GET | Which mode the server is in. Carries no credential, ever. Answers `simulation` to any caller the other two would refuse. |
| `/api/kraken/balance` | GET | Account balances. The authenticated read that exercises the boundary. Operator's own page on loopback only. |
| `/api/kraken/ws-token` | POST | Mints a Kraken WebSocket token, which is short-lived and scoped, unlike the key that produced it. Operator's own page on loopback only. |

A caller that omits the `X-Block-Builder-App: 1` header described above is never treated as
the operator by any of the three: `/api/kraken/status` reports `simulation`, and the other two
refuse exactly as a simulating deployment refuses everyone. A `misconfigured` deployment still
says so to every caller, header or not.

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

Two things put a ghost on the cursor: a pointer drag, and a mouse carry between the click that
picks a block up and the click that puts it down. They overlap by design, and in both
directions - dragging the very block being carried starts the drag's ghost before the carry
ends, and a click that lands on some other block runs a whole gesture inside a carry that
outlives it. So the store keeps every live ghost as a stack and draws the newest one:
`startDragOverlay` returns a handle, and `stopDragOverlay(handle)` takes away that holder's
own ghost, uncovering whatever is still live underneath. Called with no handle it empties the
stack, which is what the dismissal hatch means - it is putting down everything in hand. What
the stack does not do is notice a holder that goes away without stopping its ghost; ending a
hold stays the holder's own job.

### Reducer-Based Store

The Orders Store uses a `useReducer` pattern with a clean separation:

- **`ordersReducer.ts`** - Pure reducer function with typed action discriminated union
- **`OrdersStoreContext.ts`** - Context definition, types, and initial state factory
- **`useOrdersStore.ts`** - Hook + memoized selectors (`useActiveOrdersCount`, `useLiveOrdersCount`, etc.)
- **`OrdersStore.tsx`** - Provider component wiring reducer + side effects

### Market Selection

`MarketProvider` holds the pair the user picked and the rules Kraken publishes for it, and
every consumer - the grid, the price feed, the chart and the order path - reads it through
`useMarket` rather than naming a pair of its own. The catalogue (`src/data/markets.ts`) is
static and shipped in the bundle, so the selector renders before any network call resolves;
the *rules* - price decimals, tick size, lot decimals and the minimum order - are fetched
from Kraken's `/0/public/AssetPairs`, because they differ per pair and none of them is
derivable from a symbol string. `src/utils/marketFormat.ts` turns those rules into every
price and quantity the app writes, on screen and in the payload alike, so the two cannot
disagree. Until a pair's rules arrive the app draws no price for it and refuses to build an
order, rather than guessing a width.

Whether they have arrived is one value with three states, and it has a single owner:
`src/utils/priceFormatReadiness.ts` folds "the rules for this pair, or nothing" and "has the
request answered" into `pending`, `ready` or `unavailable`. `MarketProvider` performs that
fold and puts the result on the context; the two facts it is folded from stay inside that
file, so no surface can reach them and form a second opinion. That matters because "not
known yet" and "known to have no rules" look identical to a consumer holding only a missing
precision, and every surface that told them apart for itself eventually told them apart
differently. The guard against that is repository-wide rather than a list of today's
surfaces: `eslint.config.js` puts the two ingredients out of reach of every module in
`src/`, and `src/utils/priceFormatReadiness.test.ts` pins the context value's own shape. The invariants behind all
of this, and the traps around them, are in `AGENTS.md` under **Markets**.

### Tailwind CVA Styling

All component styles use **[CVA (Class Variance Authority)](https://cva.style/)** for variant-driven styling, combined with `clsx` + `tailwind-merge` (via a `cn()` utility). Style definitions are co-located in `*.styles.ts` files next to their components.

### React Compiler

The project enables the **React Compiler** (`babel-plugin-react-compiler`) via Vite's React plugin. The compiler automatically memoizes components and values at build time, so manual `useMemo` and `useCallback` are unnecessary in most cases and have been removed from the codebase.

### Split Hooks

Interaction logic is split into purpose-specific hooks:

- **`usePointerGesture`** - The pointer primitive underneath both drag hooks: capture, tap-versus-drag, cancel
- **`useFreeDrag`** - Free-form drag carrying a palette order onto a grid cell; on a placed block its only outcome is removal, when the release lands clear of every cell (see **Interaction model**; integrates with the drag overlay portal)
- **`useVerticalDrag`** - Constrained vertical drag for sliding blocks along the price-scale axis
- **`useBlockCommand`** - The select-then-place command model layered over the drag
- **`useTradeExecution`** - Order configuration management, submission flow, simulation mode toggle

---

## Interaction model

The builder has one interaction model, reached three ways. All of them end up calling the
same two placement functions in `GridArea`, expressed in terms of a target **cell** rather
than a pointer coordinate, so the input methods cannot drift apart.

**Pointer: mouse, touch and pen.** `usePointerGesture` handles the raw gesture on Pointer
Events, so one code path serves all three devices. It reports which device opened each
gesture, because a mouse is the one pointer that keeps a cursor on screen between contacts
and the model owes it different words and a different drawing; see **The mouse carries a
block between two clicks** below. Four details are load-bearing:

- **A gesture starts on an element and ends on the window.** Only `pointerdown` is listened
  for on the element, because it is the only thing that has to know *which* element this is.
  `pointermove`, `pointerup` and `pointercancel` are listened for on the window for the life
  of the gesture, keyed on the pointer id. A captured pointer's events are retargeted to the
  element and *then* bubble to the window, so the window is a superset of what the element
  sees rather than a second mechanism - one delivery path, and one place a gesture ends.
- The dragged element still takes `setPointerCapture`, but for what it is actually for:
  holding hit-testing still for the duration, so the cell under the cursor cannot steal a
  hover and `GridArea` can read the drag off events bubbling through the placement surface.
  Be precise about the division of labour, because getting it wrong is what produced the bug
  below. **Inside the page the capture is not what delivers the release** - the window hears
  it wherever it lands and whatever handlers the element is wearing by then. **Outside the
  window the capture is the only thing that delivers it at all**, since nothing else
  retargets an off-window pointer into the page; a release let go out there with no capture
  in force reaches neither the element nor the window, exactly as a `mouseup` never did. That
  leaves one hole the listeners cannot close, so the exits are worth listing exactly: a
  gesture ends on a release the window heard, on a `pointercancel`, on unmount, on a fresh
  `pointerdown` on the element while it still carries that hook instance's handlers, on a
  `pointermove` carrying `buttons === 0`, and on the shared `blockInHand` register being
  emptied - which is what a click away from the placement surface does. The last three
  notice that unheard release from the three directions a user can reach it: pressing the
  same block again, moving the mouse anywhere, or clicking somewhere that means *put this
  down*. Only the second covers the handler swap -
  `Block` wires `useFreeDrag` or `useVerticalDrag` by the block's axis, so a block that gained
  one since sends its next `pointerdown` to a hook holding no stale gesture, while the stale
  hook still hears every move on its own window listeners. `buttons === 0` is a platform fact rather
  than a heuristic - a held pointer reports its pressed-button bitmask on every move, and only
  a move made after the button came up reports 0 - and it is what stops a gesture nobody ended
  from intercepting an unrelated click: the listeners match on pointer id alone, a mouse's id
  is a constant 1, so the next `pointerup` anywhere in the page would otherwise be resolved as
  this gesture's drop at that point and delete the block. Only a mouse can reach that at all,
  since touch and pen are implicitly captured to the element they went down on and their
  release is always delivered. Between an unheard release and the next of those three events
  the gesture is still live and the ghost is still on the cursor; nothing here watches the
  capture, because a capture the hook never got is not something it can watch. The register
  is a boundary rather than a detector - it ends a stale gesture when the user acts, and it
  has no opinion about when a gesture went stale - which is why `buttons === 0` stays: it is
  the platform-level backstop for a user who never clicks away.
  The distinction is load-bearing, because listening only on the element made the capture the
  single point of failure for every exit:
  `setPointerCapture` can be refused, the browser can drop a capture mid-gesture, and an
  element can stop carrying a hook's handlers without unmounting - `Block` swaps its whole
  handler set the moment a block gains or loses a price axis. Any of those and `onUp` never
  ran: nothing called `stopDragOverlay`, nothing reported an outcome, and because the drag
  overlay is module state that follows the pointer from its own window listener, the ghost
  block was welded to the cursor for the rest of the session. Silently, and with the builder
  unusable until a reload.
- Blocks carry `touch-action: none`. Without it the browser claims a finger drag for page
  scrolling before the first `pointermove` arrives.
- Unmount is still an exit and still has to be taken by hand: the window listeners come off
  with the component. The builder reaches that state by an ordinary route - the whole
  strategy panel is keyed on `strategyKey`, so an Execute Trade whose simulated submit
  resolves while a drag is in flight replaces the tree and takes the dragged block with it.
  `usePointerGesture` ends a live gesture on unmount, down the same path a `pointercancel`
  takes: nothing moved.

**"A block is in hand" has one owner.** Two mechanisms can put one there, and they are
genuinely different things rather than two spellings of one: a **pointer gesture**, live only
while the button or finger is down, and a **command carry**, live between a pick-up and a
place and outliving the pointer coming off the block. The user cannot tell them apart - what
they see either way is a block that is not where it was - so `src/hooks/blockInHand.ts` is the
one register both of them report to, and `releaseBlockInHand()` is the one call that ends
whatever is held. A third mechanism means registering it there, not adding a third thing for
every release site to remember.

That register is what the dismissal hatch empties. **Clicking outside the placement surface
puts a block down**, whichever mechanism has it. The surface is the element `GridArea` draws -
the palette a block is picked up from together with the cells it can be put down in - so the
boundary is the thing that owns placement rather than a panel outline or a coordinate, and a
click on a legal target still places the block. It is read on `pointerdown` in the capture
phase; a drag that is genuinely in flight holds pointer capture and every event it produces is
retargeted to the dragged block, which is inside the surface, so a live gesture is not
cancelled by it. That rests on the capture, which is not guaranteed. Focus is left where the
user clicked rather than handed back, for the same reason Tab does not hand it back.

One dismissal is one sentence, however many mechanisms it ends. Each of them reports its own
outcome and each is a settled fact, but a live region holds one message, so two writes in one
event means the second replaces the first before it has been read. `useGridAnnouncer`'s
`asOneEvent` collects everything reported while the register is being emptied and speaks once,
with the facts joined by `describeOutcomes` in the announcement owner - no call site ranks them
and no call site composes a sentence. Reporting once is unaffected, which is the common case.

The two owners this replaced were not merely untidy. The hatch cleared its own carry while a
stale gesture kept its window listeners, and those listeners match on pointer id alone; a
mouse's id is a constant 1, so the `pointerup` completing the very click meant to dismiss the
ghost was resolved as that gesture's drop, at coordinates on no cell - and `handleDragEnd`'s
off-grid branch removes the block. A dismissal click silently deleted a block. What the single
boundary buys, stated exactly: a `pointerdown` the hatch treats as a dismissal takes the stale
gesture's window listeners off before that click's own release arrives, so nothing later
resolves as its drop. What it does not buy is noticing an unheard release on its own; that is
what the gesture's other exits above are for.

A press and release that never travelled more than `TAP_SLOP_PX` (4px) is a **click or a
tap**, not a zero-length drop, and is handed to the command model instead of the drop handler.
One threshold for every device, deliberately: it is the same fact - *did this gesture travel* -
and a second per-device number would be a second derivation of it, which is the shape of most
of this file's history. A gesture that crosses it is a drag for the rest of its life, even if
it comes back; a pick-up is only ever resolved at the release, so a single gesture can never be
a pick-up *and* a drag.

**A drop is decided by the block's edges, not by the pointer.** The user aims the 40px tile on
the cursor, so that tile's rectangle is what is hit-tested against the cells:
`src/utils/dropTarget.ts` is the one owner of *which cell did this land in*, and the palette
drag, the free drag of a placed block and the target highlight all ask it. Testing the pointer
alone - which is what the app did until this rule - left a dead band half a tile wide around
every cell, plus the entire gutter between two of them. Measured in Chrome at 1440x900 the
columns sit 24px apart and the rows 15px, so there was a 24px-wide strip of the grid in which a
release showed the block plainly overlapping a cell and dropped it nowhere, announcing
*"Released outside the grid"*. The band was never speed-dependent - a slow drag released there
failed identically - but the same point test drove the highlight, so a slow user watched the
highlight go out and corrected while a fast one had already let go. That is why it was reported
as a fast-drag defect.

Widening the target means a tile can straddle a gutter and overlap two cells or four, so the
order is fixed and total and the same release always resolves to the same cell:

1. the greatest overlap **area** wins;
2. tied, the cell **containing the pointer** wins;
3. still tied, the lowest `(col, row)` wins - sorted in the resolver rather than taken from the
   order `querySelectorAll` happens to return.

Two areas within a square pixel of each other count as tied, because client rects are
fractional and a hundredth of a square pixel of rounding deciding the cell instead of the
pointer is arbitrary rather than deterministic.

What the resolver deliberately does **not** decide is whether the cell will take the order.
Geometry stops there; `isCellValidForPlacement` and the placement primitives answer the rules,
and a drop onto a cell that refuses is still refused. Folding validity in would let a block
released squarely over a cell that says no be silently placed in a neighbour it merely brushed,
which is the substitution the order path exists to prevent. It does not weaken decision D9
either: a wider target is a wider target for the drop that *places* an order, and a placed
block released over a cell its edge overlaps still gets the rule's refusal rather than a move.

**The mouse carries a block between two clicks.** Click a block to pick it up, click a cell to
place it - the same command model the keyboard and a finger drive, reached a third way rather
than reimplemented. Hold-to-drag is untouched; this is a second way in, not a replacement.

Two things are true for a mouse carry and for no other, and both follow from the mouse being
the only pointer with a cursor on screen while nothing is pressed:

- **The block follows the cursor.** It is the same ghost `useFreeDrag` puts up, from the same
  `dragOverlayStore`, because a second cursor-following block would be a second answer to
  *where is the block the user is holding*. A finger and a pen leave nothing on screen between
  contacts, so a ghost pinned where they last touched would be an artefact; the keyboard has no
  pointer position at all. `CarriedBlock.origin` records which device started the carry, held
  on the carry rather than re-derived from whatever moved last.
- **The cell under the cursor is the cell the next click places into.** `pointToTarget` moves
  the carry's target on hover, so the highlight and `aria-current="location"` name the cell the
  click will actually use. It is silent by design: it fires for every cell a cursor crosses, so
  announcing would be a live region talking over itself for the length of one sweep, and the
  user it fires for is watching the cursor. The arrow keys still report every target they
  reach. It ignores anything that is not a live mouse carry - a tap synthesises `mouseenter`
  too, and a stray cursor must not move a target the arrow keys are stepping through.

The transitions where the two ways in overlap:

- **A click on the carried block itself puts it back**, and so does a click outside the
  placement surface. Escape works too, since a pointer down focuses the block it lands on, but
  neither cancellation depends on a keyboard.
- **A click on a cell the carry never offered is refused and says so**, and the block stays in
  hand - *"Exit column, upper conditional row cannot take this order. Still carrying Market
  block."*
- **A drag started on the block being carried takes the interaction over**, silently, with the
  news folded into the drag's own outcome; see **A drag supersedes a carry** below. The drag
  puts its own ghost up *before* the carry it supersedes ends, so `startDragOverlay` hands back
  a handle and `stopDragOverlay(handle)` takes away that holder's own ghost and no other -
  otherwise the ending carry would wipe the ghost of the gesture that replaced it, and the
  press of a click on any other block would take the carry's ghost off the cursor and never
  put it back.
- **A click on any placed block is refused**, exactly as it is for the keyboard and a finger:
  a placed block never changes cells, whatever is driving (decision D9 below).

**Command model: keyboard, screen readers, taps and clicks.** Focus a block and press Enter - or
Space, which a button answers to as well - to pick it up; the arrow keys choose a target
cell; Enter places it; Escape returns it. Tab is never swallowed - it abandons the carry
and moves focus on, so a carried block cannot trap the keyboard. On touch the same model
is driven by taps: tap a block, tap a cell. On a mouse, by clicks: see above.

The arrow keys step only between cells that were **legal when the carry began**, so the
target under the arrows is always one the grid has accepted; `commit` re-checks at the
moment of placing and says the order was not placed if the grid has changed since. They
prefer a cell straight ahead and otherwise take the nearest legal cell in that direction,
which is what makes the diagonal placement rule reachable at all: with one block placed, the
only other legal cells are its diagonals, and a strictly orthogonal step could never leave
the cell it started in.

The pure half of that model - the transitions and the target arithmetic - lives in
`src/utils/blockCommand.ts` and is directly testable. `useBlockCommand` adds the two things
a reducer cannot supply: which outcome is reported to the announcer at each step, and where
focus lands afterwards. It chooses no wording of its own; see **Announcements have one
owner** below.

**What moves between cells, and what does not.** A **placed block never changes cells** -
every block, by every input method, with no per-type carve-out. That is captain decision D9,
asked directly and answered "every block": a cell owns the scale its blocks are priced on,
stamped when the first one lands, so a block that changed cells would be silently re-priced
by the one it arrived in. Only a **palette order** is ever carried, which
`CarriedBlock.source: ProviderSource` states in the type rather than in a comment, and
`keepBlockInItsCell` in `GridArea` is the whole of the rule on the pointer side: it reports
`unchanged` for a release in the block's own cell and `refused` for any other, and mutates
nothing.

**A misplaced order is corrected by removing it and placing a new one**, so removal is D9's
other half rather than a convenience, and it is **one operation with one owner**:
`removeBlock` on the command model. Three affordances reach it and there is no fourth -
**Delete or Backspace** on a focused block, that block's own **Remove control**, and a free
drag released clear of every cell. Every input method has all the removal it needs, which is
the point: it used to be the `else` branch of `handleDragEnd` and nothing else, and `Block`
routes a block whose cell draws a price axis to the vertical price drag instead of the free
drag - so a placed Limit, Stop Loss or Take Profit could not be removed by *any* input
method, mouse included, and **Clear All**, which destroys the whole strategy, was the only
way out.

Since a drop is decided by the block's edges, "clear of every cell" means the released tile
overlaps none of them, so the gutters between cells do not remove a block - the deliberate
cost of one hit-testing rule for both drags rather than two.

The Remove control is **rendered rather than revealed on hover**: a control shown on
`:hover` exists for a mouse and for nothing else, and parity across mouse, keyboard and
touch is what this affordance is for. It is a 24px target (WCAG 2.2 SC 2.5.8), quiet at rest
and red under the cursor or the focus ring, and it names the order, its leg and its cell
("Remove Limit limit order, Entry column, primary row") so two orders of one type are told
apart - and so are the **two legs of one order**, which share a label *and* a cell and which
nothing else could separate. The removal sentence carries the same leg ("Removed Stop Loss
Limit trigger block from Entry column, primary row."). The leg appears only where the cell
really draws the block on a price axis, and it comes from `legInCell` - the same owner the
slider's name takes it from, so what was pressed and what is then heard are one fact. A
Market order in a bulk cell keeps "Remove Market order, Entry column, row 2".

**It is pinned inside the tile it belongs to and never overhangs it**, which is what keeps a
press on one block from destroying another. While it hung 8px out it covered the NEIGHBOUR in
both of the grid's layouts: two flush tiles in a cell that draws no price axis put it over
the next tile's top-left corner, and in a cell that *draws* an axis - where a block's position
**is** its price, so no spacing exists to separate two blocks at all - two Limits 16px apart
put the lower block's control over the upper block's visible face. Both were measured in
Chrome, and in both a click removed the block the user was not aiming at. One geometry answers
both layouts, and containment is the whole of the guarantee - no spacing between sibling tiles
is needed for it, and none could have answered the axis layout.
The deliberate price is that the control owns 30.8% of its own tile's face, measured in
Chrome, and that this reaches the tile's geometric centre - which no placement can avoid, since
a 24px disc contained in a 40px tile is always within 11.31px of the centre against a 12px
radius. `AGENTS.md` carries the proof and what it costs a drag.

It removes on **`click`** and on no pointer event. The control overlaps the tile's top-right
corner, so a press aimed at starting a drag can land on it - and a browser fires `click` at
the nearest common ancestor of the pointer-down and pointer-up targets, so a press that
travels away fires none and destroys nothing. That press is inert in the other direction
too: the control is a sibling drawn over the tile rather than a descendant, so no drag
starts either. A *tap* on that corner does remove the block, which is the accepted cost of a
routine operation D9 makes the correction path; the block destroyed is the block aimed at,
which is what separates it from the neighbour case above. See `AGENTS.md` for both in full.

Removal writes through `removeBlockFromGrid` in `src/utils/grid.ts`, which takes the block
out **and clears every `linkedBlockId` that named it**, in one function. That pairing is not
tidiness: `mapGridToOrders` refuses a grid whose link names a block that is not on it rather
than emitting the primary order with its protective close silently gone, and reachable
removal is precisely what could otherwise have produced that state. Focus then lands on the
palette entry the order came from - the element that was focused is the one being removed,
and the palette is where "place a new one" begins.

**The refusal is legible rather than silent**, because a press that does nothing is
indistinguishable from a broken control. Three things say so together: the announcer's
`moveRefused` sentence, a visible note under the grid (ordinary text - never a second live
region), and no cell drawing itself as a target while a placed block is dragged. The note and
the sentence are worded per case, and the case is decided by `cellDrawsPriceAxis` - the same
owner the renderer uses to decide whether to draw an axis at all, so the affordance a refusal
names is one that render really wired. Both cases now end in the same correction - remove it
and place a new one - because both blocks now have one; what differs is the extra clause, and
a block on a price axis is additionally pointed at the **arrow keys**, which move it along
that axis and which no other block has.

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

**How** that release is spoken is decided in exactly one place, `releaseForDrag`, on one
question: is the drag about the block being carried? Dragging anything else - a vertical price
drag, a palette drag while holding a placed block - and the drag's outcome says nothing about
the carry at all, so the release gets its own sentence: *"Take Profit order returned to the
palette: a drag took over."* Dragging the block you just tapped, and nothing is said as the
gesture begins, because anything said then would be made false a moment later by that very
gesture. Instead `releaseForDrag` reports back that it released the carry silently, and the
clause is folded into the one sentence the gesture's outcome produces once it is settled fact:
*"Market block stayed in Entry column, primary row, and is no longer picked up."* It is added
only where the base sentence describes nothing happening to that block - `unchanged`, `refused`,
`gone` and both `dragEnded` reasons - since *"Moved"*, *"Placed"* and *"Removed"* already say the
block left the user's hand. One outcome, one sentence: two live-region writes in quick succession
risk the first being cut off. Leaving any of it silent lost the carry with no word said, and
the next tap on a cell then did nothing the user could explain.

The **keyboard and tap commit path** says the same thing for the same reason, because a commit
always ends the carry too: placing a block back in its own cell reads *"Market block stayed in
Entry column, primary row, and is no longer picked up."* rather than the bare *"stayed in"* a
nudge with nothing carried produces. Silence there would not merely omit a cue - the sibling
refusal below says *"Still carrying X."* whenever the carry does survive, so saying nothing
about it reads as *you are still holding it*.

A refused **pick-up** says the same thing for the same reason: reaching for a second order type
while holding one is a swap, and when the new order has nowhere legal to go the first is still
in hand - *"Take Profit order cannot be placed anywhere in the grid right now. Still carrying
Market block."*

Every other way a gesture can end speaks too: a **free drag of a placed block** that lands on a
cell, stays in its own cell or leaves the grid; a **palette drag** that resolves to a cell or is
released outside every one of them (*"Released outside the grid. Market order was not placed."*);
and a **`pointercancel`** after a real drag (*"Drag cancelled. Market block stayed in Entry
column, primary row."*). A `pointercancel` that interrupts what was still only a tap says
nothing, because nothing happened. The **vertical price drag** stays silent about the price
itself: a placed block is a `role="slider"`, and assistive technology speaks its
`aria-valuetext` on every change.

**Announcements have one owner.** `src/utils/gridAnnouncements.ts` writes every sentence the
grid speaks, and `useGridAnnouncer` is the only thing that reaches the live region. No call
site composes a message: the carry, the free drag, the palette drag and the vertical drag each
*report an outcome* - a fact about what just happened - and the owner turns it into words.
`useBlockCommand` is handed that announcer rather than owning one, and exposes no `announce`,
so there is no way to invent wording next to the code that acts. Two invariants are what this
buys, and each had been violated:

- **An outcome is what happened, not what was about to be attempted.** `placeProviderInCell`
  and `keepBlockInItsCell` return a `PlacementResult` - `created`, `unchanged`, `refused` or
  `gone` - produced by the code that actually looked at the grid, so a sentence cannot claim
  a move, a refusal or a removal that did not occur. Deriving it from a nullable id instead is
  how a release inside a block's own cell came to announce *"Entry column, primary row cannot
  take this order. Market block stayed in Entry column, primary row"*: the drop supplied a
  position, the same-cell no-op branch was skipped, and `isCellValidForPlacement` read the
  block's own occupied cell as illegal. A block can never be refused by the cell it is already
  sitting in, so every same-cell release is `unchanged` and reads *"Market block stayed in
  Entry column, primary row."* A release over a **different** cell is `refused` with
  `reason: "staysInCell"`, and its sentence is about the rule rather than about the cell -
  no cell will take a placed block, so naming one would send the user hunting for a cell that
  says yes.
- **No sentence names a location the grid has not just confirmed.** A refusal carries `at` -
  where `keepBlockInItsCell` has just found the block - and the sentence uses that rather than
  any snapshot taken when the gesture began, which is what stops a refusal after **Reverse
  Blocks** naming the column the block was mirrored out of. And "the block is not on the grid"
  is `gone` rather than `refused`, with a sentence that names no cell at all (*"Market block
  is no longer on the grid."*), because after **Clear All** there is no cell that would be
  true. `restingPlace` never reads a snapshot at all: the rule is enforced by the shape of
  that function, which has nothing stale in scope to reach for. A palette order - the only
  thing that is ever *carried* - has no origin, and its clause is already *"was not placed."*
- **A sentence has to still be true after the operation that triggered it.** This is the trap
  the three earlier point fixes fell into: cancelling a carry when a drag began made the
  cancellation silent, and announcing the drag's outcome instead made that announcement false.
  It is why `releaseForDrag` turns on the same-block question above rather than on a `silent`
  flag passed in by whoever happened to be calling.

Not every outcome is a gesture. Changing the market reprices every block on the grid, and the
`<select>` speaks only its own new value, so `GridArea` reports the consequence once the grid
holds the new market. Loading a saved strategy is reported the same way, as **one** sentence
carrying both facts - the strategy is on the grid, and the market did or did not move with it -
because two live-region writes in quick succession cut the first one off. A strategy saved on a
pair the catalogue no longer offers is refused rather than repriced, and says so.

**Known gap, deferred and filed as its own item: a carry can outlive the grid it was started
against.** Clear All, Reverse Blocks and a pattern switch each replace the grid without ending
an active carry, so the cells the carry offered stay highlighted - `aria-current="location"` -
even though the grid beneath them has changed. That is misleading rather than false: the
highlight says *you could drop here*, which is not an assertion about where any block is, and
the moment the user acts on one of those cells the announcement is correct and the carry ends.
Making it *not misleading* means ending the carry when the grid is replaced under it, and that
is **carry lifecycle** - it belongs to the command model, not to the announcement layer that
owns the words. It is narrower than it was: only a palette order is carried now, and a palette
order cannot be cleared away, so the carry can no longer name a block the grid has lost.

The same rule decides one thing outside the announcer: `GridCell` wires its click handler
unconditionally rather than only while something is carried. Whether a click means anything is
the command model's decision, and a cell that drops the click on its own judgement is a second
opinion on the same question. With nothing carried a cell tap still places nothing - there is
nothing to place - and it says nothing, because a click on the page is not an action the user
started; what changed is that the reason is now the last thing the live region said.

Announcements go through `LiveAnnouncer`, which alternates between two live regions: a
screen reader only reads a region whose content **changed**, so two identical messages in a
row would otherwise be silent the second time.

**The bulk pattern's family of defects, and how it was closed.** A bulk cell holding any
axis-less block draws *every* block in it without an axis: `cellDrawsPriceAxis` returns false
as soon as one block has no axes, and that decides the whole cell. Five things used to follow
from that, and every one of them was the same shape - one fact derived in more than one place.
They are recorded because the shape recurs, not because any of them is still live.

- *A paired dual-axis leg could be split across cells by a mouse free drag*, because the cell
  drew that leg without an axis while `Block` worked out for itself, from `axis` and `axes`,
  that it was on one. `legInCell` is now the single answer and the cell hands it down; and
  under decision D9 no placed block changes cells by any input method anyway.
- *That drop path wrote `yPosition` through `calculateYPosition`*, which returned 0-100
  against a scale whose maximum is 50 - so a block could render pinned at the 50% end while
  its label read the raw value, and a 100% offset was a price of exactly zero. The reader is
  deleted, and every position is now bounded to the range the axis can draw on every path -
  clamped where it is read rather than where it is stored, so a position that is not a number
  at all still reaches `validateOrder` to be refused rather than being quietly answered with
  the market price. `AGENTS.md` under "Prices and order types" is the authority on that split.
- *Keyboard and tap pick-up of a paired leg was refused there without offering the arrow
  keys*, because that render wires none. Still true, and now decided by the same
  `cellDrawsPriceAxis` the renderer uses, so the two cannot disagree about it.
- *A same-cell nudge still mutated the grid*: every bulk cell is a legal target, so a release
  inside a block's own cell fell through to the full move, rewrote `axis` and `yPosition` from
  the drop coordinates, and reordered the cell array - which changed the cell header, since it
  renders `blocks[0].label`. Nothing is rewritten or reordered now.
- *The vertical drag resolved its track by the block's own `axis` field*, which could disagree
  with the axis column the renderer drew it in. Nothing rewrites `axis` after a block is
  built, so the two cannot disagree; the fallback that made a miss survivable is kept.

The conditional pattern could never reach any of it, because an occupied cell is never a valid
target. The fix was the one named at the time: give the block-to-price mapping a single owner
(`src/utils/blockMapping.ts`) rather than several consumers that have to agree.

Each of the three input methods driving the running app is captured in
[`docs/screenshots/interaction/`](docs/screenshots/interaction/), which records the commit
every shot was taken against - including the mouse driving the command model rather than a
drag, with a block on the cursor between the two clicks.

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
│   ├── loopback.ts                # The per-request operator check (peer, Host, header, origin)
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
├── App.tsx                        # Root component - providers, panel tabs, drag overlay
├── App.styles.ts                  # App-level CVA variants & layout classes
├── main.tsx                       # Application entry point
├── index.css                      # Global styles & Tailwind theme tokens
│
├── api/                           # Kraken API integration (browser side, credential-free)
│   ├── config.ts                  # Endpoint configuration. Holds no credential
│   ├── tradingMode.ts             # The server's simulation/live answer, cached for the page
│   ├── krakenServer.ts            # Calls this app's own /api/kraken/* endpoints
│   ├── appRequestHeader.ts        # The header those calls carry (server's copy: api/_lib/loopback.ts)
│   ├── krakenRest.ts              # Public REST API client
│   ├── assetMetadata.ts           # Kraken's per-pair rules (precision, tick, lot, minimum)
│   ├── krakenWebSocket.ts         # WebSocket client for live data - the seam between the two below
│   ├── socketLifecycle.ts         # Live connection state, as one state machine per socket
│   ├── subscriptionRegistry.ts    # Registered subscription intent, refcounted, socket-agnostic
│   ├── orderMapper.ts             # Maps internal order config → Kraken API format
│   ├── tickerUpdate.ts            # Parses & merges v2 ticker WebSocket frames
│   ├── types.ts                   # API-specific type definitions
│   └── index.ts                   # Barrel export
│
├── components/
│   ├── blocks/                    # Draggable order block components
│   │   ├── block.tsx              # Core block component (CVA variants)
│   │   ├── blockTile.ts           # The tile's shape (shared with DragOverlay) and its Remove control's, colour-free
│   │   ├── action-placeholder.tsx # Placeholder for action slots
│   │   └── trigger-placeholder.tsx# Placeholder for trigger slots
│   │
│   ├── common/
│   │   ├── DragOverlay.tsx        # Portal-rendered drag ghost (rAF-driven positioning)
│   │   ├── dragOverlayStore.ts    # Module-level drag state (useSyncExternalStore)
│   │   ├── LiveAnnouncer.tsx      # Two alternating live regions for announcements
│   │   ├── ErrorBoundary.tsx      # Recoverable fallback UI in place of a blank page
│   │   ├── MarketSelector.tsx     # The pair picker (native <select>) + live price readout
│   │   ├── MarketSelector.styles.ts # Market selector CVA styling
│   │   └── grid/                  # Shared grid components
│   │       ├── GridCell.tsx       # Interactive grid cell (Strategy Builder)
│   │       ├── GridCell.styles.ts # Grid cell CVA styling
│   │       ├── ReadOnlyGridCell.tsx # Read-only grid cell (Active Orders)
│   │       ├── ProviderColumn.tsx # Order-type palette - a lane, a band when stacked
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
│       │   ├── OrderChart.tsx         # Chart panel - the chart body and its data wiring
│       │   ├── ChartHeader.tsx        # Both header rows. Eager: the placeholder renders it too
│       │   ├── OrderChart.styles.ts   # CVA styles (one variant for every toolbar toggle)
│       │   ├── useLightweightChart.ts # Chart instance lifecycle
│       │   ├── useIndicatorSeries.ts  # Line-series lifecycle, derived from the registry
│       │   ├── timeframes.ts          # The timeframes offered, and the default
│       │   ├── priceScale.ts          # Linear/logarithmic vocabulary. No library import
│       │   ├── priceScaleMode.ts      # That choice → PriceScaleMode. Lazy side only
│       │   ├── orderPriceLines.ts     # Grid blocks → price lines, through blockMapping
│       │   ├── orderAutoscale.ts      # Keeps the order levels inside the visible range
│       │   ├── indicators/            # Overlay indicators - a pure compute plus a registry entry
│       │   │   ├── registry.ts            # The one list the toolbar and the series derive from
│       │   │   ├── movingAverage.ts       # SMA & EMA (pinned against published vectors)
│       │   │   ├── types.ts               # The shape every price-pane overlay has
│       │   │   └── index.ts               # Barrel export
│       │   └── index.ts               # Barrel export (re-exports the lazy boundary)
│       │
│       └── activeOrders/          # Active Orders widget
│           ├── ActiveOrders.tsx                # Main component
│           ├── ActiveOrders.styles.ts          # CVA styles
│           ├── ActiveOrdersContext.tsx          # Provider wiring
│           ├── ActiveOrdersContextDef.ts       # Context creation (separate for Fast Refresh)
│           ├── OrderCard.tsx                   # Single submitted-order card
│           ├── orderAxes.ts                    # Which leg a submitted order is, through blockMapping
│           ├── useActiveOrders.ts              # Consumer hook
│           └── index.ts                        # Barrel export
│
├── data/                          # Static data & configuration
│   ├── orderTypes.ts              # Order type definitions, grid config, helpers
│   ├── markets.ts                 # The pair catalogue & DEFAULT_MARKET. No trading rules
│   └── index.ts
│
├── hooks/                         # Custom React hooks
│   ├── usePointerGesture.ts       # Pointer primitive (capture, tap vs drag, cancel)
│   ├── useFreeDrag.ts             # Free-form drag (provider → grid cell)
│   ├── useVerticalDrag.ts         # Vertical-axis drag (price scale sliding)
│   ├── useBlockCommand.ts         # Select-then-place command model (keyboard, taps, clicks)
│   ├── blockInHand.ts             # The one register of "a block is in hand"
│   ├── useAnnouncer.ts            # Live-region message state
│   ├── useGridAnnouncer.ts        # The grid's one voice: outcomes in, sentences out
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
│   ├── MarketProvider.tsx         # Selected pair + its Kraken metadata (bounded retry)
│   ├── MarketContext.ts           # Context definition & TypeScript types
│   ├── useMarket.ts               # Hook for the selected market
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
│   ├── markets.ts                 # Market & MarketPrecision (a pair, and Kraken's rules for it)
│   ├── strategyAssembly.ts        # Strategy assembly state types (split context types)
│   ├── svg.d.ts                   # SVG import declarations (vite-plugin-svgr)
│   └── index.ts                   # Barrel export
│
├── utils/                         # Pure utility functions
│   ├── blockCommand.ts            # Select-then-place state machine (pure half)
│   ├── blockFactory.ts            # Factory for creating block data
│   ├── blockMapping.ts            # The one owner of axis, position, direction, cell scale
│   ├── dropTarget.ts              # The one owner of which cell a released block lands in
│   ├── grid.ts                    # Grid structure & placement rules
│   ├── gridAnnouncements.ts       # Every sentence the grid speaks (pure)
│   ├── liveCandles.ts             # The one fold of closed bars + the forming bar, and what a new list appends
│   ├── marketFormat.ts            # The one owner of every price & quantity format
│   ├── priceFormatReadiness.ts    # The one owner of whether a pair's prices can be written yet
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
| [lightweight-charts](https://tradingview.github.io/lightweight-charts/) | ^5.1.0 | Price chart rendering (code-split, chart panel only) |
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