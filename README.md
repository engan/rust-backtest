# High-Performance Backtester

A Vue 3 and TypeScript interface for testing trading strategies against historical Binance Spot candles. The backtest runs in the browser through a bundled Rust/WebAssembly (Wasm) engine. Parameter optimization, walk-forward validation, and Monte Carlo analysis run as separate jobs in a local native Rust service.

The Rust strategy source and Pine scripts are maintained in the private `engan/rust-backtest-proprietary` repository. This public repository contains the frontend, a compiled Wasm build in `frontend/src/rust/pkg/`, and a Cloudflare Pages function for Binance data. Anyone who can load the browser app can also download its Wasm assets; bundling them does not conceal the strategy implementation.

## Current functionality

| Area | What works | Requirement |
| --- | --- | --- |
| Backtest | SMA Crossover and EMA / VWAP, configurable entries, exits, sizing, costs, safeguards, and optional leverage/margin-call simulation | Bundled Wasm and Binance candle data via `/binance-proxy` |
| Results | Equity and drawdown chart, recent trades, full trade list, report export, and Performance Analysis | A completed backtest in the current browser session |
| Optimize | One-click comparison of four SL/TP methods on shared data and walk-forward windows; manual bounded search, ranked candidates, report import/export | Private native Rust research server to start new jobs |
| Monte Carlo | Simulations using a candidate's closed trades, distribution charts, risk summary, report import/export | Private native Rust research server to start new jobs; at least 30 closed trades in each required evidence set |

The Optimize and Monte Carlo pages are functional with the private local service. Their presence in the frontend does **not** mean a public job service is deployed. See [research workflow and evidence requirements](docs/research-ui.md).

TradingView parity is a goal for matched strategy settings and data windows, not a guarantee for every symbol, timeframe, or configuration. Compare the same candles, cutoff, order settings, commission, slippage, and margin settings before evaluating differences. The chart uses [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/) for display; strategy calculations happen in Rust/Wasm.

### Historical parity examples

These captures show earlier comparisons for a particular setup. They do not validate every current setting or future engine change.

![Earlier equity and summary comparison with TradingView](https://github.com/user-attachments/assets/4de5b02b-c92d-4143-9b62-56496f0125c6)

![Earlier trade-list comparison with TradingView](https://github.com/user-attachments/assets/19c43a09-bdcf-4d01-9511-7fa9ff679734)

## Run locally

Use Node.js 22 and pnpm. The public frontend can run without the private Rust checkout:

```bash
git clone https://github.com/engan/rust-backtest.git
cd rust-backtest/frontend
pnpm install
pnpm run dev:vite
```

Open the URL printed by Vite, normally `http://localhost:5173/`. Backtest uses the bundled Wasm and Vite's local `/binance-proxy` to reach Binance Spot. Internet access to Binance is needed to fetch candles and symbol filters. Optimize and Monte Carlo cannot start new jobs in this frontend-only mode, although previously exported reports can be imported.

To run research jobs locally, place the private `rust-backtest-proprietary` checkout beside this repository and install a working Rust/Cargo toolchain. From `rust-backtest/frontend`, run:

```bash
pnpm run dev
# If Corepack selects another package manager from a parent directory, use: npm run dev
```

That script starts Vite and the native research server together. Vite forwards `/research-api` to the server on `127.0.0.1:8787`. The server stores job reports in the private checkout; no database is required for this local single-user workflow.

The frontend has a manual **Dataset** candle limit and an optional **End before (UTC)** cutoff. Binance responses are fetched in chunks when the requested limit exceeds the per-request limit. A TradingView preset JSON can be pasted into the optional preset control for supported data-window matching; it does not replace checking that the actual fetched candles and strategy settings agree.

## Build and checks

From `rust-backtest/frontend`:

```bash
pnpm run type-check
pnpm exec vitest run
pnpm run build
```

The build writes static assets to `frontend/dist/`. `pnpm run preview` serves those assets, but it does not provide the Vite development proxies or the native research server. A working deployed backtest also needs a production `/binance-proxy` endpoint.

## Repository layout

```text
rust-backtest/
├── README.md
├── docs/
│   ├── research-ui.md                 # Research workflow and design references
│   └── plans/                         # Plans that have not been activated
├── frontend/
│   ├── src/
│   │   ├── components/PnlChart.vue    # Results chart
│   │   ├── composables/useBacktest.ts  # Loads and invokes the Wasm engine
│   │   ├── rust/pkg/                   # Bundled compiled engine
│   │   ├── services/                   # Binance, reports, and research API client
│   │   └── views/                      # Backtest, Optimize, Monte Carlo, Performance
│   ├── vite.config.ts                  # Development-only API proxies
│   └── package.json
└── functions/binance-proxy/[[path]].ts # Cloudflare Pages function
```

The browser routes are `/`, `/optimize`, `/monte-carlo`, and `/performance`. The full trade list opens from the Backtest page. Directly opening a browser route on a static host requires an SPA fallback to `index.html`.

## Deployment status

This repository is not yet configured as a complete Vercel deployment. The Vite proxies only work during local development, and `functions/binance-proxy/[[path]].ts` is a Cloudflare Pages function, not a Vercel function. The local research service is also not a public API. The proposed steps for a first public version on `trade.neoweb.no` are in the [inactive publication plan](docs/plans/trade-neoweb-publication-plan-2026-09-22.md). That plan has not been executed.

## Licensing

There is currently no `LICENSE.md` in this repository. The licensing terms for the public frontend and the bundled proprietary Wasm build need to be clarified by the owner before a new public distribution channel is launched.
