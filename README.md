# High-Performance Trading Backtester (Rust/Wasm)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

This repository hosts a high-performance web-based dashboard for backtesting trading strategies, built with Vue.js (frontend) and a powerful Rust/WebAssembly (Wasm) computation engine. It aims to provide accurate backtesting, robust validation, and efficient parameter optimization capabilities.

### About the Engine's Core Logic

The core backtesting, strategy implementations, and advanced quantitative analysis logic for this dashboard are developed and maintained in a separate, **private repository**: [`engan/rust-backtest-proprietary`](https://github.com/engan/rust-backtest-proprietary). This separation protects the intellectual property of the engine's core algorithms.

![Image](https://github.com/user-attachments/assets/4de5b02b-c92d-4143-9b62-56496f0125c6)

![Image](https://github.com/user-attachments/assets/19c43a09-bdcf-4d01-9511-7fa9ff679734)

_Image: TradingView (bottom) vs. Rust/Wasm engine (top).  
All metrics — Total P&L, Max equity drawdown, Profit factor — **and** every trade-level value (Qty, Net P&L, Run-up, Drawdown, Cumulative P&L) match **exactly** (cent & percent)._

#### Result Fidelity (100% Parity)

The engine has been validated against TradingView’s Strategy Tester and achieves **100% numerical parity** for the validated setup.  
Every figure in the **Overview** and **List of trades** (including MFE/MAE and Cumulative P&L) is identical to TradingView’s output.

## What's new (Aug 2025)

- Two-column control panel with compact spacing
- Fused *Backtest Results* + chart (TradingView-style)
- TradingView-like trades table (P&L, run-up, drawdown, cumulative)
- Tick-rounding toggle, Risk Gearing dropdown, improved fieldsets
<details>
<summary>July 2025 → August 2025</summary>

- Removed section underlines; compact headers placed tight to their content
- “Backtest Results” metrics fused with the chart into a single card
- Tighter spacing and consistent label column widths
- More legible trade table with TV-style open/exit grouping
- Small hints/tooltips for order sizing modes
</details>

## What's new (Sep 2025)

- **100% TradingView parity** across Overview & List of trades  
  (Net P&L, Max equity drawdown, Profit factor, Qty, Run-up, Drawdown, **Cumulative P&L**)
- Cumulative P&L display adjusted to exact “cent & percent” parity
- TV-exact MDD calculation (peak-before-trade + MAE without entry fee)
- Polished trades table (rounding/display), small UI improvements

## Features ✨

-   **High-Performance Backtesting:** Utilizes a Rust/Wasm engine for rapid and accurate strategy execution.
-   **Parameter Optimization:** Efficiently identifies effective parameter sets for chosen strategies via grid search.
-   **Robustness Validation:** Evaluates strategy performance through Monte Carlo simulations over numerous price paths.
-   **Data Fetching:** Loads historical K-line (candlestick) data from Binance Spot API, including extended history and rate-limit handling.
-   **Configurable Costs:** Includes realistic simulation of commission and slippage.
-   **Responsive UI:** Interactive dashboard built with Vue 3 (Composition API) and TypeScript.
-   **Visualization:** Displays P/L and Max Drawdown histograms via ApexCharts.
-   **Web Worker Integration:** Offloads intensive computations to Web Workers for a smooth user experience.

## Technology Stack 🛠️

-   **Frontend:** [Vue 3](https://vuejs.org/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [pnpm](https://pnpm.io/), [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/)
-   **Core Engine:** [Rust](https://www.rust-lang.org/), [WebAssembly (Wasm)](https://webassembly.org/), [wasm-pack](https://rustwasm.github.io/wasm-pack/), [Serde](https://serde.rs/)
-   **Data Source:** [Binance API](https://binance-docs.github.io/apidocs/spot/en/) (via Cloudflare Pages Function proxy)

## Project Structure 📁

This repository primarily contains the frontend application and deployment-related functions.

```text
rust-backtest/
├── frontend/             # The Vue.js Frontend Application
│   ├── public/           # Static assets
│   ├── src/              # Frontend source code (Vue components, Composables, Services, Types, Router, etc.)
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── assets/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── router/
│   │   ├── rust/pkg/     # Compiled Wasm module artifacts from the private engine
│   │   ├── services/
│   │   ├── types/
│   │   ├── views/
│   │   └── workers/
│   ├── index.html
│   ├── package.json      # Frontend-specific package manifest
│   ├── vite.config.ts    # Vite build & dev server config
│   └── ...               # Other frontend config files (tsconfig, eslint, etc.)
│
├── functions/            # Cloudflare Pages Functions (e.g., API proxy)
│   └── binance-proxy/
│       └── [[path]].ts   # Proxy logic for Binance API
│
├── .gitignore            # Git ignore rules for this repository
├── package.json          # Root package manifest (for pnpm workspaces)
├── pnpm-lock.yaml        # pnpm lockfile
└── README.md             # This documentation file
```

Getting Started 🚀
------------------

### Prerequisites

*   [Node.js](https://www.google.com/url?sa=E&q=https://nodejs.org/) (LTS version recommended) and [pnpm](https://www.google.com/url?sa=E&q=https://pnpm.io/installation)
    
*   Basic understanding of [Rust](https://www.google.com/url?sa=E&q=https://www.rust-lang.org/) and [Vue 3](https://www.google.com/url?sa=E&q=https://vuejs.org/)
    

### Installation & Running (Local Development)

1.  Clone this repository:
     ```bash
    git clone https://github.com/engan/rust-backtest.git
    cd rust-backtest
    ```
    
2.  **Build the Rust/Wasm Engine (from the private repository):**
    
    *   First, clone the private engine repository to a sibling directory:
        ```bash
        cd .. # Go up to the 'trading' directory
        git clone https://github.com/engan/rust-backtest-proprietary.git # This will require authentication
        cd rust-backtest-proprietary
        ```
    *   Build the Wasm package from the private engine:
        ```bash
        wasm-pack build --target web
        ```
        
    *   Copy the compiled Wasm artifacts into this frontend project:
        ```bash
        cp ./pkg/*.{js,wasm,d.ts} ../rust-backtest/frontend/src/rust/pkg/
        ```
        
    *   Go back to the root of this project:
        ```bash
        cd ../rust-backtest
        ```
        
3.  Install Frontend Dependencies:
    ```bash
    pnpm install
    ```
    
4.  Run the Frontend Development Server:
    ```bash
    pnpm run dev # Or 'pnpm --filter frontend run dev' if you prefer specifying the workspace filter
    ```
    Open your browser and navigate to the local URL provided by Vite (typically http://localhost:5173). The Vite proxy will handle Binance API calls during development.
    

Deployment (Cloudflare Pages)
-----------------------------

The project is configured for automatic deployment via GitHub Actions upon pushing to the main branch.

*   **Static Assets:** Built by Vite (using base: '/') and placed in frontend/dist.
    
*   **SPA Routing:** Handled by the frontend/public/\_routes.json file.
    
*   **API Proxy:** The Cloudflare Pages Function (functions/binance-proxy/\[[path]]\.ts) acts as a proxy, routing requests to the official Binance API and adding necessary CORS headers.
    

License 📄
----------

This project is licensed under the MIT License - see the [LICENSE](https://www.google.com/url?sa=E&q=LICENSE.md) file for details.

----------

Feel free to contribute or report issues!
