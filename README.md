# High-Performance Trading Backtester (Rust/Wasm)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

This repository hosts a high-performance web-based dashboard for backtesting trading strategies, built with Vue.js (frontend) and a powerful Rust/WebAssembly (Wasm) computation engine. It aims to provide accurate backtesting, robust validation, and efficient parameter optimization capabilities.

### About the Engine's Core Logic

The core backtesting, strategy implementations, and advanced quantitative analysis logic for this dashboard are developed and maintained in a separate, **private repository**: [`engan/rust-backtest-proprietary`](https://github.com/engan/rust-backtest-proprietary). This separation protects the intellectual property of the engine's core algorithms.

![Image](https://github.com/user-attachments/assets/9e0f3b50-84e5-49d7-a0f8-cca0decf3f41)

_Image: Performance validation of the Minimal SMA Crossover strategy, showcasing the Rust/Wasm engine's results against TradingView. Key metrics like Total P&L, Total Trades, Profitable Trades, and Profit Factor demonstrate near-identical replication, affirming the engine's accuracy and reliability._

#### Note on Result Fidelity

While core metrics like Total P&L, Total Trades, Profitable Trades (%), and Profit Factor consistently show near-identical or exact matches with TradingView's Strategy Tester, minor discrepancies in "Max Drawdown" (typically within ~1-5 percentage points) are observed. These marginal differences are attributed to:

*   **Intra-bar Calculation Nuances:** TradingView may employ highly granular, undocumented calculations for peak and trough equity within a single bar's price action.
*   **Floating-Point Arithmetic:** Inherent precision differences and accumulated rounding errors across disparate programming languages (Pine Script vs. Rust) over thousands of calculations.

Despite these minor deviations, the engine's core trade execution, P&L attribution, and overall strategy performance metrics are validated to be highly accurate, providing a reliable foundation for strategy development and analysis.

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

-   **Frontend:** [Vue 3](https://vuejs.org/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Vue3 ApexCharts](https://github.com/apexcharts/vue3-apexcharts), [pnpm](https://pnpm.io/)
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