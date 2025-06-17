# Proprietary Backtesting & Strategy Engine for mc-simulations

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE.md)

This repository contains the proprietary core logic for high-performance backtesting, strategy implementations, and advanced quantitative analysis. Written in Rust and compiled to WebAssembly (Wasm), this engine delivers robust and accurate computations for trading strategy simulations.

This engine serves as the high-performance "brain" for the public [mc-simulations](https://github.com/engan/mc-simulations) frontend dashboard. The source code herein is private and considered intellectual property.

## Overview

The primary purpose of this project is to provide a powerful, accurate, and extensible engine to:

1.  **Backtest** complex, quantitative trading strategies against extensive historical data with high precision.
2.  **Optimize** strategy parameters to identify the most promising and effective settings.
3.  **Validate** the robustness and statistical significance of strategies through advanced methods, including Monte Carlo simulations.

The system is built on a modular and maintainable architecture, designed to facilitate the seamless addition of new indicators, diverse trading strategies, and sophisticated risk management modules.

![Image](https://github.com/user-attachments/assets/9e0f3b50-84e5-49d7-a0f8-cca0decf3f41)

_Image: Performance validation of the Minimal SMA Crossover strategy, showcasing the Rust/Wasm engine's results against TradingView. Key metrics like Total P&L, Total Trades, Profitable Trades, and Profit Factor demonstrate near-identical replication, affirming the engine's accuracy and reliability._

### Note on Result Fidelity

While core metrics like Total P&L, Total Trades, Profitable Trades (%), and Profit Factor consistently show near-identical or exact matches with TradingView's Strategy Tester, minor discrepancies in "Max Drawdown" (typically within ~1-5 percentage points) are observed. These marginal differences are attributed to:

*   **Intra-bar Calculation Nuances:** TradingView may employ highly granular, undocumented calculations for peak and trough equity within a single bar's price action.
*   **Floating-Point Arithmetic:** Inherent precision differences and accumulated rounding errors across disparate programming languages (Pine Script vs. Rust) over thousands of calculations.

Despite these minor deviations, the engine's core trade execution, P&L attribution, and overall strategy performance metrics are validated to be highly accurate, providing a reliable foundation for strategy development and analysis.

## Technology Stack 🛠️

-   **Core Language:** [Rust](https://www.rust-lang.org/) (stable toolchain) - Chosen for its performance, memory safety, and concurrency features.
-   **Compilation Target:** [WebAssembly (Wasm)](https://webassembly.org/) - Enables near-native execution speeds directly in the web browser.
-   **Build Tool:** [wasm-pack](https://rustwasm.github.io/wasm-pack/) - Facilitates the creation of Wasm packages compatible with JavaScript environments.
-   **Package Manager:** [Cargo](https://doc.rust-lang.org/cargo/) - Rust's official build system and package manager.
-   **JS Interop:** [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) - Provides seamless interoperability between Rust and JavaScript.
-   **Serialization:** [Serde](https://serde.rs/) - A powerful framework for serializing and deserializing Rust data structures efficiently.

## Project Structure 📁

The architectural design emphasizes modularity and separation of concerns, ensuring a maintainable and scalable codebase.

```text
mc-simulations-proprietary/
├── src/
│   ├── lib.rs                  # Main entry point for the Wasm module; exposes core functions to JavaScript.
│   ├── types.rs                # Defines fundamental data structures for market data (Kline), trade records (Trade), and simulation results (BacktestResult, BacktestSummary).
│   │
│   ├── indicators/             # Contains implementations of various technical indicators, designed for reusability.
│   │   ├── mod.rs              # Module declaration file for indicators.
│   │   ├── sma.rs              # Simple Moving Average (SMA) calculation.
│   │   ├── ema.rs              # Exponential Moving Average (EMA) calculation.
│   │   ├── vwap.rs             # Volume Weighted Average Price (VWAP) calculation.
│   │   ├── atr.rs              # Average True Range (ATR) calculation.
│   │   └── dmi.rs              # Directional Movement Index (DMI) calculation.
│   │
│   ├── strategies/                   # Houses the logic for specific trading strategies.
│   │   ├── mod.rs                    # Module declaration file for strategies.
│   │   ├── sma_crossover_strategy.rs # Implementation of the SMA Crossover strategy.
│   │   ├── ema_vwap_strategy.rs      # Future implementation for the EMA/VWAP Crossover strategy.
│   │   ├── risk_management.rs        # Core logic for universal risk management rules (e.g., stop-loss, position sizing).
│   │   └── other_strategy.rs         # Placeholder for additional proprietary trading strategies.
│   │
│   ├── simulation_engine/      # Contains the core backtesting and simulation machinery.
│   │   ├── mod.rs              # Module declaration file for the simulation engine.
│   │   ├── backtest.rs         # Implements the bar-by-bar backtesting algorithm.
│   │   └── monte_carlo.rs      # Logic for generating simulated price paths and running Monte Carlo validations.
│   │
│   └── optimization/           # Dedicated module for parameter optimization algorithms.
│       ├── mod.rs              # Module declaration file for optimization.
│       ├── grid_search.rs      # Implements grid search for parameter optimization.
│       └── genetic_algo.rs     # (Optional) Future implementation for more advanced genetic algorithms.
│
├── pkg/                        # Automatically generated directory by `wasm-pack`, containing the compiled Wasm module and JavaScript bindings.
├── tests/                      # Rust's integration tests to ensure the correctness and integrity of the core logic.
├── Cargo.toml                  # Rust project manifest, detailing package information and dependencies.
└── README.md                   # This documentation file.
```

## Build and Development Workflow

This engine is designed to be compiled into a WebAssembly module, which is then consumed by a separate frontend application (specifically, the mc-simulations project).

### 1\. Build the Wasm Package

To compile the Rust code into a WebAssembly package that can be used in a web environment, navigate to the root directory of this repository and run the following command:

```bash
wasm-pack build --target web 
```
This command will generate a pkg/ directory. This directory will contain the essential .wasm binary, along with .js and .d.ts files that serve as JavaScript bindings and TypeScript declarations for the Wasm module.

### 2\. Integrate with the Frontend

Once the Wasm package is built, its compiled artifacts need to be integrated into the frontend project (mc-simulations).

1. Copy the essential artifacts: Transfer only the necessary .js, .wasm, and .d.ts files from mc-simulations-proprietary/pkg/ to the designated asset directory within the frontend project. This approach ensures that only compiled binaries, not the private source code, are exposed.
```bash
# From the root of mc-simulations-proprietary/
cp ./pkg/*.{js,wasm,d.ts} ../mc-simulations/frontend/src/rust/pkg/
```
2. Import and consume in TypeScript/JavaScript:
The Wasm module can then be initialized and its exposed functions can be called from within the frontend's TypeScript/JavaScript code (e.g., in Web Workers or Vue Composables):
```bash
// Replace 'run_backtest_function_name' with actual function
import init, { run_backtest_function_name } from '@/rust/pkg/mc_simulations_proprietary.js'; 

await init(); // Initialize the Wasm module; this must be called once.
const results = run_backtest_function_name(...); // Invoke Rust logic
```

## License 📄

This source code is proprietary and is licensed privately. All use, distribution, or copying without explicit permission is prohibited. See LICENSE.md for details.
