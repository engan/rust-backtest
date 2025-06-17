// Importer init-funksjonen og de spesifikke Wasm-funksjonene vi trenger
import init, {run_sma_crossover_backtest} from '../rust/pkg/rust_backtest_proprietary.js';
import type { BacktestResult } from '../types/common_strategy_types'; // Resultat fra Wasm

// Importer sentrale typer for worker
import type {
  Kline,
  StartMcValidationPayload,
  SmaBestParams,
  RsiBestParams,
  McResultData,
  McSummaryStats,
  BacktestConfig // Konfigurasjon for backtest (kostnader)
} from '../types/common_strategy_types'; 

console.log('MC Validation Worker (TypeScript) Loaded');

declare const self: DedicatedWorkerGlobalScope;

let wasmInitializedMc = false;
const START_EQUITY = 10000.0; // Startkapital for Monte Carlo

// --- Bootstrapping Funksjoner (fra tidligere svar) ---
function calculatePercentageChanges(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) changes.push(prices[i] / prices[i - 1] - 1.0);
    else changes.push(0.0);
  }
  return changes;
}

function generateSimulatedPricePath(
  historicalChanges: number[],
  numBars: number,
  startPrice: number,
): Kline[] { // Returnerer nå Kline[]
  if (historicalChanges.length === 0 || numBars <= 0) return []; // Retunerer tom om ingen data
  
  const simulatedKlines: Kline[] = [];
  let currentPrice = startPrice;
  let currentTimestamp = Date.now(); // Start med nåværende tid for simulering

  // Anta et fast intervall for timestamps (f.eks. 1 time = 3600000 ms)
  // Dette må matche intervallet du simulerer for
  const intervalMs = 3600000; 

  for (let i = 0; i < numBars; i++) {
    const randomIndex = Math.floor(Math.random() * historicalChanges.length);
    const randomChange = historicalChanges[randomIndex];
    currentPrice = Math.max(0, currentPrice * (1.0 + randomChange)); // Pris kan ikke være negativ

    // For simulert K-line, bruk currentPrice for open, high, low, close for enkelhet
    // I en ekte sim, ville man randomisert OHLC også
    simulatedKlines.push({
      timestamp: currentTimestamp + (i * intervalMs),
      open: currentPrice,
      high: currentPrice * 1.005, // Litt random high for realisme
      low: currentPrice * 0.995,  // Litt random low for realisme
      close: currentPrice,
      volume: 1000.0 // Dummy volume
    });
  }
  return simulatedKlines;
}

// Hoved Worker Logikk
self.onmessage = async (event: MessageEvent<{ type: string; payload: any }>) => {
  const { type, payload } = event.data;

  if (type === 'startMcValidation') {
    console.log('MC Worker (TS) received startMcValidation:', payload);

    if (!wasmInitializedMc) {
      try {
        await init();
        wasmInitializedMc = true;
        console.log('MC Worker (TS): Wasm initialized.');
      } catch (err) {
        console.error('MC Worker (TS): Wasm initialization failed:', err);
        self.postMessage({ type: 'mcError', payload: { message: `Wasm init failed: ${err}` } });
        return;
      }
    }

    const mcPayload = payload as StartMcValidationPayload;
    const { mcSettings, selectedStrategyParams, strategy, historicalKlines, costs } = mcPayload;
    const { iterations: numIterations, barsPerSim: numBarsPerSim } = mcSettings;

    console.log('MC Worker Received Strategy:', strategy);
    console.log('MC Worker Historical Klines Length:', historicalKlines?.length);

    if (!historicalKlines || historicalKlines.length < 2) {
      self.postMessage({ type: 'mcError', payload: { message: 'Not enough historical data for bootstrapping.' } });
      return;
    }

    self.postMessage({ type: 'mcProgress', payload: { message: `Starting ${numIterations} MC iterations for ${strategy}...` } });

    const historicalClosePrices: number[] = historicalKlines.map((k: Kline) => k.close);
    const priceChanges = calculatePercentageChanges(historicalClosePrices);
    const startPrice = historicalClosePrices[historicalClosePrices.length - 1] || 100;

    const allPnLs_pct: number[] = [];
    const allMaxDrawdowns: number[] = [];

    // Bygg BacktestConfig for å sende til Rust
    const backtestConfig: BacktestConfig = {
      commission_percent: costs.commissionPct,
      slippage_ticks: costs.slippageAmount,
      tick_size: 0.01 // TODO: Denne bør være dynamisk basert på symbol
    };

    for (let i = 0; i < numIterations; i++) {
      const simulatedKlines: Kline[] = generateSimulatedPricePath(priceChanges, numBarsPerSim, startPrice);
      
      let backtestResultWasm: BacktestResult | null = null;
      try {
        if (strategy === 'smaCross') {
          const params = selectedStrategyParams as SmaBestParams;
          backtestResultWasm = run_sma_crossover_backtest(
            simulatedKlines, // Send simulated Klines
            START_EQUITY,
            params.short,
            params.long,
            backtestConfig.commission_percent,
            backtestConfig.slippage_ticks,
            backtestConfig.tick_size
          );
        } else if (strategy === 'rsi') {
          // TODO: Implement RSI Monte Carlo with Rust/Wasm
          // const params = selectedStrategyParams as RsiBestParams;
          // backtestResultWasm = run_rsi_strategy_backtest(simulatedKlines, START_EQUITY, params.period, ...);
        } else {
          console.error(`MC Iteration ${i + 1}: Unsupported strategy: ${strategy}`);
        }

        if (!backtestResultWasm || !backtestResultWasm.summary) {
          allPnLs_pct.push(0); // Assuming 0 PnL for failed iterations
          allMaxDrawdowns.push(100); // Assuming 100% DD for failed iterations
          continue;
        }

        allPnLs_pct.push(backtestResultWasm.summary.total_pnl); // Bruk direkte P&L fra Rust
        allMaxDrawdowns.push(backtestResultWasm.summary.max_drawdown_percent);

      } catch (wasmError) {
        console.error(`MC Iteration ${i + 1}: Wasm backtest failed for ${strategy}:`, wasmError);
        allPnLs_pct.push(0);
        allMaxDrawdowns.push(100);
      }
    }

    // --- Beregn Sammendragsstatistikk (som før, men nå basert på McSummaryStats type) ---
    const summaryStats: McSummaryStats = {
      numIterations: numIterations,
      numBarsPerSim: numBarsPerSim,
      averagePL_pct: undefined, // Initialiser som undefined
      medianPL_pct: undefined,
      pnl_05_percentile_pct: undefined,
      pnl_10_percentile_pct: undefined,
      averageMaxDD: undefined,
      medianMaxDD: undefined,
      maxDD_95_percentile: undefined,
    };

    // Konverter PnL til prosent her for oppsummering
    const pnlInPercentages = allPnLs_pct.map(pnl => (pnl / START_EQUITY) * 100.0);

    if (pnlInPercentages.length > 0) {
      const sortedPnLs = [...pnlInPercentages].sort((a, b) => a - b);
      summaryStats.averagePL_pct = pnlInPercentages.reduce((a, b) => a + b, 0) / pnlInPercentages.length;
      summaryStats.medianPL_pct = sortedPnLs[Math.floor(pnlInPercentages.length / 2)];
      summaryStats.pnl_05_percentile_pct = sortedPnLs[Math.floor(pnlInPercentages.length * 0.05)];
      summaryStats.pnl_10_percentile_pct = sortedPnLs[Math.floor(pnlInPercentages.length * 0.1)];
    }

    if (allMaxDrawdowns.length > 0) {
      const validDrawdowns = allMaxDrawdowns.filter(dd => dd < 100); // Filter out 100% DD if they represent errors
      if (validDrawdowns.length > 0) {
        const sortedDDs = [...validDrawdowns].sort((a, b) => a - b);
        summaryStats.averageMaxDD = validDrawdowns.reduce((a, b) => a + b, 0) / validDrawdowns.length;
        summaryStats.medianMaxDD = sortedDDs[Math.floor(sortedDDs.length / 2)];
        summaryStats.maxDD_95_percentile = sortedDDs[Math.floor(sortedDDs.length * 0.95)];
      } else {
        summaryStats.averageMaxDD = 100;
        summaryStats.medianMaxDD = 100;
        summaryStats.maxDD_95_percentile = 100;
      }
    }

    console.log('MC Worker: Sending final result payload:', { allPnLs_pct: pnlInPercentages, allMaxDrawdowns, summaryStats });
    const resultPayload: Omit<McResultData, 'dataInfo'> = { allPnLs_pct: pnlInPercentages, allMaxDrawdowns, summaryStats };
    self.postMessage({ type: 'mcResult', payload: resultPayload });
  }
};
export type {}