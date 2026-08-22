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
order, rather than guessing a width: the invariants behind that, and the traps around them,
are in `AGENTS.md` under **Markets**.

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
Events, so one code path serves all three devices. Three details are load-bearing:

- The dragged element takes `setPointerCapture`, which is what delivers `pointerup` even
  when the button is released **outside the browser window**. The previous
  `window.addEventListener("mouseup")` implementation never saw that release, and the block
  stayed glued to the cursor.
- Blocks carry `touch-action: none`. Without it the browser claims a finger drag for page
  scrolling before the first `pointermove` arrives.
- A gesture has **three** exits: `pointerup`, `pointercancel`, and the element being
  unmounted under it. The first two are only ever delivered to the element the gesture
  started on, so the third is not optional: an element that goes away first leaves the
  gesture with no way to finish, the browser drops the capture without a word, and the
  release lands on whatever happens to be underneath. The builder reaches that state by an
  ordinary route - the whole strategy panel is keyed on `strategyKey`, so an Execute Trade
  whose simulated submit resolves while a drag is in flight replaces the tree and takes the
  dragged block with it - and because the drag overlay is module state, the ghost block then
  outlived the tree and followed the cursor for the rest of the session. `usePointerGesture`
  ends a live gesture on unmount, down the same path a `pointercancel` takes: nothing moved.

**Clicking away puts a block down.** A block can be in the user's hand two ways at once as far
as they can tell - carried by the command model, or left behind by a gesture that lost its
owner - so one gesture releases both: a click that lands **outside the placement surface**.
That surface is the element `GridArea` draws, the palette a block is picked up from together
with the cells it can be put down in, so the boundary is the thing that owns placement rather
than a panel outline or a coordinate, and a click on a legal target still places the block. It
is read on `pointerdown` in the capture phase; a drag that is genuinely in flight holds pointer
capture and every event it produces is retargeted to the dragged block, which is inside the
surface, so a live gesture can never be cancelled by it. Focus is left where the user clicked
rather than handed back, for the same reason Tab does not hand it back.

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
a reducer cannot supply: which outcome is reported to the announcer at each step, and where
focus lands afterwards. It chooses no wording of its own; see **Announcements have one
owner** below.

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
  and `moveBlockToCell` return a `PlacementResult` - `created`, `moved`, `unchanged`, `refused`
  or `gone` - produced by the code that actually mutated the grid, so a sentence cannot claim
  a move, a refusal or a removal that did not occur. Deriving it from a nullable id instead is
  how a release inside a block's own cell came to announce *"Entry column, primary row cannot
  take this order. Market block stayed in Entry column, primary row"*: the drop supplied a
  position, the same-cell no-op branch was skipped, and `isCellValidForPlacement` read the
  block's own occupied cell as illegal. What `moveBlockToCell` **reports** for a same-cell
  release is now decided independently of that validity check: a block can never be refused by
  the cell it is already sitting in, so every same-cell release is `unchanged` on the refused
  path and on the mutated path alike, and reads *"Market block stayed in Entry column, primary
  row."* `refused` is left to a genuinely different target cell and `moved` to a release that
  really did change cells. The bulk pattern never showed the defect, because every cell is a
  legal target there, so `GridArea.dom.test.tsx` pins it on the conditional pattern.
- **No sentence names a location the grid has not just confirmed.** A carry snapshots the
  block's cell at pick-up time, and the grid can move that block, or delete it, before the
  carry is committed. So a refusal carries `at` - where `moveBlockToCell` has just found the
  block - and the sentence uses that rather than the snapshot, which is what stops a refusal
  after **Reverse Blocks** naming the column the block was mirrored out of. And "the block is
  not on the grid" is `gone` rather than `refused`, with a sentence that names no cell at all
  (*"Market block is no longer on the grid."*), because after **Clear All** there is no cell
  that would be true. The same holds for a carry that simply ends: `cancel` and
  `releaseForDrag` each ask the grid where the block is at that moment and pass the answer on
  the outcome, so *"Cancelled. Market block left in Exit column, primary row."* after a reverse,
  and *"Cancelled. Market block is no longer on the grid."* after a clear. `restingPlace` never
  reads the snapshot at all: the rule is enforced by the shape of that function, which has
  nothing stale in scope to reach for. A palette order is unaffected: it has no origin, and
  its clause is already *"was not placed."*
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
owns the words and not to `bb3-mapping-owner`. `clearAll` and `setStrategyPattern` are plain
grid lifecycle; only `reverseBlocks` brushes the mapping lane at all.

The same rule decides one thing outside the announcer: `GridCell` wires its click handler
unconditionally rather than only while something is carried. Whether a click means anything is
the command model's decision, and a cell that drops the click on its own judgement is a second
opinion on the same question. With nothing carried a cell tap still places nothing - there is
nothing to place - and it says nothing, because a click on the page is not an action the user
started; what changed is that the reason is now the last thing the live region said.

Announcements go through `LiveAnnouncer`, which alternates between two live regions: a
screen reader only reads a region whose content **changed**, so two identical messages in a
row would otherwise be silent the second time.

**Known gap, bulk pattern only.** A bulk cell holding any axis-less block draws *every*
block in it without an axis: `getCellDisplayMode` returns `"no-axis"` as soon as one block
has no axes, and that decides the whole cell. Five things follow, and all are limited to
that case. They do not share a provenance, so they are listed apart - three inherited, two
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

*Inherited, deliberately left alone here, and owned by `bb3-mapping-owner`.* A same-cell
nudge in the bulk pattern still **mutates the grid**. Only the reported outcome above changed;
the mutation is unchanged from `main`. Because every bulk cell is a legal target, a release
inside a block's own cell falls through to the full move: it rewrites that order's `axis` and
`yPosition` from the drop coordinates, into the block and its order config, and its
remove-then-push reorders the cell array - so the cell header, which renders `blocks[0].label`,
can change from the order that was nudged to the one beside it. That is the cell-scale family
of defects, owned by `bb3-mapping-owner` under the ruling that direction belongs to the cell
and is stamped when the first block lands; reconciling it in the announcement lane as well
would be two lanes answering one question, which is how the display and the payload drifted
apart before. `GridArea.dom.test.tsx` pins the behaviour as it stands so a later change cannot
quietly settle it here instead.

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
├── App.tsx                        # Root component - providers, routing, drag overlay
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
│   ├── krakenWebSocket.ts         # WebSocket client for live data (refcounted subscriptions)
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
│   │   ├── MarketSelector.tsx     # The pair picker (native <select>) + live price readout
│   │   ├── MarketSelector.styles.ts # Market selector CVA styling
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
│       │   ├── OrderChart.styles.ts   # CVA styles (one variant for every toolbar toggle)
│       │   ├── useLightweightChart.ts # Chart instance lifecycle
│       │   ├── useIndicatorSeries.ts  # Line-series lifecycle, derived from the registry
│       │   ├── priceScale.ts          # Linear/logarithmic choice → PriceScaleMode. Nothing else
│       │   ├── orderPriceLines.ts     # Grid blocks → price lines, through calculatePrice
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
│   ├── useBlockCommand.ts         # Select-then-place command model (keyboard, taps)
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
│   ├── grid.ts                    # Grid manipulation helpers
│   ├── gridAnnouncements.ts       # Every sentence the grid speaks (pure)
│   ├── liveCandles.ts             # The one fold of closed bars + the forming bar
│   ├── marketFormat.ts            # The one owner of every price & quantity format
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