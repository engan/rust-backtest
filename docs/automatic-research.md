# Automatic strategy research

Choose the strategy, symbol, timeframe and dataset, then use **Find robust setups**.
**Open in Optimize** carries the current Backtest settings and starts this process.
The native research service must be running (`npm run dev`). Its first optimized
Rust build can take a few minutes; subsequent starts reuse that build.

## What one run does

1. Fetch one dataset and reserve its last validation-length period as a final holdout.
2. Compare all four exit methods. EMA searches broad lengths, every supported price
   source, VWAP anchor/source and entry mode. SMA searches broad fast/slow periods and
   entry modes. Standard exit starting values avoid depending on a hand-tuned starting
   stop or target. The exact existing setup remains a separate benchmark.
3. Within each training window, select diverse structures, explore coarse exit values,
   and run five bounded refinement rounds. Later rounds keep earlier improvements while
   adjusting signal lengths, exits and relevant entry/filter values. Final beam
   selection favors the median neighboring training score over a single peak. No validation data
   chooses these parameters. Costs, sizing, direction, drawdown and loss-pause rules remain inherited; active
   ADX and entry filter values can be refined.
4. Evaluate each selection on its following validation window. Rank methods on these
   results; this method comparison is model selection, not a final independent test.
   Compare the existing setup on exactly the same windows, with the same costs and
   flat starts. Previously hand-tuned settings are a retrospective benchmark.
5. Calibrate the selected method on the last training-length slice **before** the
   holdout. Evaluate it and the existing setup on the same holdout. Keep the verdict
   visible even if a subsequent Monte Carlo simulation looks favorable.
6. If source samples are large enough, run Monte Carlo on walk-forward closed trades
   (primary) and the selected candidate's research-period trades (supplementary).
7. Finally refit the chosen method on the newest training-length slice, including the
   former holdout. This is a separate **next-period setup**, without later validation.
   It never replaces the earlier candidate or its holdout evidence in the report.

## Inspecting the result

- Research ranking: broad candidates over the research period, excluding holdout.
- Calibrated setup: refined parameters selected on the latest pre-holdout training slice.
- Nearby settings: profitability and eligibility of local neighbors on that same
  training slice. This measures sensitivity, not out-of-sample performance.
- Existing setup comparison: walk-forward totals and final-period results on matching
  dates. A larger historical P&L alone does not establish that replacement is justified.
- **All selected parameters** exposes the complete executable parameter object.
- **Open selected setup in Backtest** transfers parameters, market, exact candle count,
  exclusive cutoff, capital, costs and margin flags, then runs the Backtest.
- **Inspect latest setup in Backtest** uses the separate latest calibration period.
  Its return is training performance and must not be presented as future validation.

The grid and five-round beam search are bounded heuristics, not an exhaustive search
of every possible combination or a guarantee of the highest return. Small samples,
negative holdout results and unstable neighborhoods should remain visible. Repeating
search design changes after inspecting holdout data also consumes its independence.

Repeat with new closed candles at the selected step interval to assess changing
market conditions. There is no background trading or scheduled recalibration.
Export the comparison to retain the methods, calibration dates, benchmark, holdout,
Monte Carlo references and separate next-period calibration.
