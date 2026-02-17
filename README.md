# Block Builder

A visual, grid-based strategy builder for assembling and managing crypto trading orders on the [Kraken](https://www.kraken.com/) exchange.

Built with **React 19**, **TypeScript**, **Vite 7**, and **Tailwind CSS 4**.

---

## Features

- **Strategy Builder** — Drag-and-drop grid interface for assembling multi-leg order strategies (conditional orders, bulk orders)
- **Active Orders** — View and manage submitted orders with real-time status tracking
- **Kraken API Integration** — REST and WebSocket clients for authentication, order placement, and live market data
- **Simulation Mode** — Test strategies locally without connecting to the Kraken API (always active in development)
- **9 Order Types** — Limit, Market, Iceberg, Stop Loss, Stop Loss Limit, Take Profit, Take Profit Limit, Trailing Stop, Trailing Stop Limit

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```
npm install
```

### Development Server

```
npm run dev
```

The development server starts at **http://localhost:3002/**. Simulation mode is enabled automatically in development — no API keys required.

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

---

## Kraken API Setup (Optional)

To enable live market data and real order placement:

1. Log in to your [Kraken](https://www.kraken.com/) account
2. Go to **Settings → API**
3. Create a new API key with **"Orders and trades – Create & modify orders"** permission
4. Copy `local.env.example` to `local.env` and fill in your credentials:

```
KRAKEN_API_KEY=your_api_key_here
KRAKEN_API_PRIVATE_KEY=your_api_private_key_here
```

> **⚠️ Never commit your `local.env` file.** It is already included in `.gitignore`.

---

## Project Structure

```
src/
├── App.tsx                        # Root component — navigation, route layout, execute trade flow
├── main.tsx                       # Application entry point
├── index.css                      # Global styles
│
├── api/                           # Kraken API integration
│   ├── config.ts                  # API configuration & credential loading
│   ├── krakenAuth.ts              # Authentication helpers
│   ├── krakenRest.ts              # REST API client
│   ├── krakenWebSocket.ts         # WebSocket client for live data
│   ├── orderMapper.ts             # Maps internal order config → Kraken API format
│   ├── types.ts                   # API-specific type definitions
│   └── index.ts                   # Barrel export
│
├── components/
│   ├── blocks/                    # Draggable order block components
│   │   ├── block.tsx              # Core block component
│   │   ├── action-placeholder.tsx # Placeholder for action slots
│   │   └── trigger-placeholder.tsx# Placeholder for trigger slots
│   │
│   ├── common/
│   │   └── grid/                  # Shared grid components
│   │       ├── GridCell.tsx        # Interactive grid cell (Strategy Builder)
│   │       ├── GridCell.styles.ts  # Grid cell styling
│   │       ├── ReadOnlyGridCell.tsx# Read-only grid cell (Active Orders)
│   │       ├── ProviderColumn.tsx  # Order-type provider sidebar column
│   │       └── index.ts           # Barrel export
│   │
│   └── widgets/
│       ├── strategyAssembly/      # Strategy Builder widget
│       │   ├── strategyAssembly.tsx            # Main component
│       │   ├── strategyAssembly.styles.ts      # Styles
│       │   ├── StrategyAssemblyContext.tsx      # React Context provider
│       │   └── useStrategyAssembly.ts          # Business logic hook
│       │
│       └── activeOrders/          # Active Orders widget
│           ├── ActiveOrders.tsx                # Main component
│           ├── ActiveOrders.styles.ts          # Styles
│           ├── ActiveOrdersContext.tsx          # React Context provider
│           └── index.ts                        # Barrel export
│
├── data/                          # Static data & configuration
│   ├── orderTypes.ts              # Order type definitions, grid config, helpers
│   └── index.ts
│
├── hooks/                         # Custom React hooks
│   ├── useDraggable.ts            # Drag-and-drop logic
│   ├── useKrakenAPI.ts            # Kraken API hook
│   └── index.ts
│
├── lib/
│   └── utils.ts                   # Utility (cn — clsx + tailwind-merge)
│
├── store/                         # Application state
│   ├── OrdersStore.tsx            # Orders context provider & hook (submit, cancel, simulation)
│   └── index.ts
│
├── styles/                        # Shared style constants
│   ├── theme.ts                   # Design tokens / theme values
│   ├── grid.ts                    # Grid-specific style helpers
│   ├── shared.ts                  # Shared style strings
│   └── index.ts
│
├── types/                         # TypeScript type definitions
│   ├── grid.ts                    # Grid, block, cell, order config types
│   ├── orders.ts                  # Kraken order types & validators
│   ├── activeOrders.ts            # Active orders state types
│   ├── strategyAssembly.ts        # Strategy assembly state types
│   ├── svg.d.ts                   # SVG import declarations (vite-plugin-svgr)
│   └── index.ts                   # Barrel export
│
├── utils/                         # Pure utility functions
│   ├── blockFactory.ts            # Factory for creating block data
│   ├── grid.ts                    # Grid manipulation helpers
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
| [vite-plugin-svgr](https://github.com/pd4d10/vite-plugin-svgr) | ^4.5.0 | Import SVGs as React components |
| [typescript](https://www.typescriptlang.org/) | ~5.9.3 | Static type checking |
| [eslint](https://eslint.org/) | ^9.39.1 | Linting |
| [@eslint/js](https://eslint.org/) | ^9.39.1 | ESLint core JS rules |
| [typescript-eslint](https://typescript-eslint.io/) | ^8.46.4 | TypeScript-aware ESLint rules |
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

[MIT](./LICENSE) — Jacques Hebert, 2025
