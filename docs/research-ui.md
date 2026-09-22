# Research UI and native job workflow

The mockups below remain visual references. The Optimize and Monte Carlo pages
now run real jobs through the native Rust research server.

## Workflow

1. Configure the strategy, dataset and parameter search space in **Optimize**.
2. Run bounded candidate searches and rank them with walk-forward
   out-of-sample results as the primary evidence.
3. Inspect stability, drawdown and the return/drawdown frontier before loading
   a candidate into the normal backtest view.
4. Run Monte Carlo with the candidate's realized walk-forward out-of-sample
   trades as the primary evidence. The same seeded simulation is also run on
   the full-dataset closed trades as a supplementary comparison.
5. Save the complete job definition, seed and summary report so a result can be
   reproduced later.

Monte Carlo requires at least 30 closed trades in both evidence sets. A shorter
walk-forward sample is shown in the UI but cannot be simulated, because its
percentiles and tail-risk estimates would be too unstable for a useful
robustness decision. The report keeps the OOS and full-dataset summaries
separate and records their trade counts and walk-forward window count.

The browser edits and displays research jobs. Candidate searches, walk-forward
validation, and Monte Carlo run in the native Rust runner instead of blocking
the browser or relying on JavaScript workers. The local API exposes job status
and report endpoints under `/research-api`. Vite proxies those requests to the
loopback-only server on `127.0.0.1:8787`.

Every job writes `request.json` and `report.json` below the private engine's
ignored `research-results/<job-id>/` directory. Reports include the engine
version, complete configuration, parameter grid, seed, dataset timestamps, bar
count, and SHA-256 dataset fingerprint. They can also be exported or imported
from the browser. A database is unnecessary for this single-user phase.

Parameter values belong to each job definition. The optimization engine should
receive a complete base configuration plus explicitly selected axes, so adding
or changing a parameter does not require changing numeric constants in engine
code.

## Local development

`pnpm run dev` starts both Vite and the native research server. The private
engine repository must be available as the sibling directory
`../rust-backtest-proprietary`.

## Design references

### Backtest

![Backtest dashboard concept](ui-mockups/backtest-dashboard.png)

### Parameter optimization

![Parameter optimization concept](ui-mockups/parameter-optimization.png)

### Monte Carlo robustness

![Monte Carlo robustness concept](ui-mockups/monte-carlo-robustness.png)

## Generation prompts

The images were generated as product-design references with the following
prompts.

### Backtest prompt

> Create a high-fidelity desktop web application UI mockup for the Backtest
> screen of the same quantitative crypto backtesting product. Use a wide 16:9
> desktop canvas and the same dark engineering-tool design as the Optimize and
> Monte Carlo concepts. Header: High-Performance Backtester. Tabs: Backtest,
> Optimize, Monte Carlo, with Backtest active. Show Strategy & Market and Signal
> & Entry cards in the left column; Risk & Exits, Safeguards and Execution Costs
> in the middle column; and a results-focused right column with Net P&L, Max
> drawdown, Profit factor and Trades cards, an Equity & Drawdown chart and a
> Recent Trades table. Keep the current SMA, Fashionably Late, SL/TP, position
> sizing, safeguard, data source, parity and cost settings. Include TradingView
> parity status, Run backtest, Export report and Open in Optimize actions. Make
> text legible, alignment precise, and omit logos, people, watermarks and device
> frames.

### Parameter optimization prompt

> Create a high-fidelity desktop web application UI mockup for a quantitative
> crypto backtesting tool. This is a product design concept, not a marketing
> image. Use a wide 16:9 desktop canvas and a dark engineering-tool theme with
> charcoal backgrounds, lighter cards, thin gray borders, muted light-blue
> section headings, white text, gray secondary text, blue actions and green/red
> chart accents. Header: High-Performance Backtester. Tabs: Backtest, Optimize,
> Monte Carlo, with Optimize active. Show Parameter Optimization with Research
> Setup and rolling walk-forward Validation on the left; an editable Parameter
> Search Space table, combination estimate, Run optimization button and progress
> in the center; and ranked Best Candidates plus a Return vs Drawdown scatter
> plot and Pareto frontier on the right. Use EMA / VWAP, SOLUSDT, 1h, 15,095
> bars, and editable axes for EMA Length, EMA Source, Trailing SL %, Static TP %
> and ADX pause below. Include Load in Backtest and Run Monte Carlo actions. Make
> text legible, alignment precise, and omit logos, people, watermarks and device
> frames.

### Monte Carlo prompt

> Create a high-fidelity desktop web application UI mockup for the Monte Carlo
> screen of the same quantitative crypto backtesting tool, using the same wide
> dark engineering-tool design. Header: High-Performance Backtester. Tabs:
> Backtest, Optimize, Monte Carlo, with Monte Carlo active. Show Monte Carlo
> Robustness. On the left, show the selected EMA / VWAP candidate, walk-forward
> OOS evidence and editable settings for block bootstrap, 100,000 simulations,
> block size, skip probability, P&L jitter, extra cost, ruin threshold and seed.
> In the main area show KPI cards, an Equity Path Percentiles fan chart, a Final
> Net P&L Distribution histogram, a Maximum Drawdown Distribution chart and a
> Risk Summary with probability of ruin and drawdown percentiles. Include Save
> report and Compare candidates actions. Make text legible, alignment precise,
> and omit logos, people, watermarks and device frames.
