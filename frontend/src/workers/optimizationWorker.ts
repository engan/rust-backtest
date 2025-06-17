// Importer init-funksjonen og den spesifikke Wasm-funksjonen vi trenger
import init, {run_sma_crossover_backtest } from '../rust/pkg/rust_backtest_proprietary.js';
import type { BacktestResult } from '../types/common_strategy_types'; // Resultat fra Wasm

// Importer sentrale typer for worker
import type {
  OptimizationStrategyInfo, // Info mottatt fra Controls
  SmaBestParams,
  RsiBestParams,
  TopResultItem, // Resultat som sendes tilbake
  Kline, // Behøver Kline-typen
  BacktestConfig // Konfigurasjon for backtest (kostnader)
} from '../types/common_strategy_types'; // <-- Nå importerer vi alt fra common_strategy_types!

console.log('Optimization Worker (TypeScript) Loaded');

declare const self: DedicatedWorkerGlobalScope;

let wasmInitialized = false;
const TOP_N_RESULTS = 5; // Antall toppresultater

// Hjelpefunksjon for å oppdatere topp N resultater
function updateTopResults(topResults: TopResultItem[], currentResult: TopResultItem) {
  if (topResults.length < TOP_N_RESULTS) {
    topResults.push(currentResult);
    topResults.sort((a, b) => b.score - a.score); // Sort descending by score
  } else if (currentResult.score > topResults[TOP_N_RESULTS - 1].score) {
    topResults[TOP_N_RESULTS - 1] = currentResult;
    topResults.sort((a, b) => b.score - a.score); // Sort descending by score
  }
}

// Hoved Worker Logikk
self.onmessage = async (event: MessageEvent<{ type: string; payload: any }>) => {
  const { type, payload } = event.data;

  if (type === 'startOptimization') {
    console.log('Optimization Worker (TS) received startOptimization:', payload);

    if (!wasmInitialized) {
      try {
        await init();
        wasmInitialized = true;
        self.postMessage({ type: 'progress', payload: { message: 'Wasm module initialized.' } });
      } catch (err) {
        console.error('Opt Worker (TS): Wasm initialization failed:', err);
        self.postMessage({ type: 'error', payload: { message: `Wasm init failed: ${err}` } });
        return;
      }
    }

    const { historicalKlines, strategyInfo } = payload as { historicalKlines: Kline[], strategyInfo: OptimizationStrategyInfo };
    const { strategy, params } = strategyInfo;

    const topResults: TopResultItem[] = [];
    let combinationsTested: number = 0;
    let totalCombinations: number = 0;

    // Utpakk kostnader
    const backtestConfig: BacktestConfig = {
      commission_percent: params.commissionPct,
      slippage_ticks: params.slippageAmount,
      tick_size: 0.01 // TODO: Denne bør være dynamisk basert på symbol, men hardkodet for nå
    };

    if (strategy === 'smaCross') {
      const paramShort = strategyInfo.params.shortSma;
      const paramLong = strategyInfo.params.longSma;
      
      totalCombinations = Math.max(1, Math.floor((paramShort.max - paramShort.min) / paramShort.step) + 1) *
                          Math.max(1, Math.floor((paramLong.max - paramLong.min) / paramLong.step) + 1);

      self.postMessage({ type: 'progress', payload: { message: `Starting SMA Grid Search. Total combinations: ~${Math.round(totalCombinations)}` } });

      for (let shortP = paramShort.min; shortP <= paramShort.max; shortP += paramShort.step) {
        for (let longP = paramLong.min; longP <= paramLong.max; longP += paramLong.step) {
          if (shortP >= longP) continue;
          
          let backtestResultWasm: BacktestResult | null = null;
          try {
            backtestResultWasm = run_sma_crossover_backtest(
              historicalKlines, // Rust forventer Vec<Kline> som JsValue
              10000,            // Initial Capital - TODO: Gjør dynamisk
              shortP,
              longP,
              backtestConfig.commission_percent,
              backtestConfig.slippage_ticks,
              backtestConfig.tick_size
            );

            if (!backtestResultWasm || !backtestResultWasm.summary) {
              continue; // Skip if Wasm result is null or missing summary
            }
            
            const currentResult: SmaBestParams = {
              type: 'smaCross',
              short: shortP,
              long: longP,
              score: backtestResultWasm.summary.profit_factor,
              trades: backtestResultWasm.summary.total_trades,
            };

            updateTopResults(topResults, currentResult);

          } catch (wasmError) {
            console.error(`Wasm backtest failed for SMA ${shortP}/${longP}:`, wasmError);
          } finally {
            // backtestResultWasm.free(); // Ikke nødvendig hvis returnert data er JS-primitiver
          }

          combinationsTested++;
          if (combinationsTested % (Math.floor(totalCombinations / 50) + 1) === 0 || combinationsTested >= totalCombinations) {
            const bestScoreSoFar = topResults.length > 0 ? topResults[0].score : -Infinity;
            self.postMessage({ type: 'progress', payload: { message: `SMA Tested ${combinationsTested} / ~${Math.round(totalCombinations)}. Best score: ${bestScoreSoFar.toFixed(3)}` } });
          }
        }
      }
    } else if (strategy === 'rsi') {
      // TODO: Implement RSI Optimization with Rust/Wasm
      // Dette vil kreve en ny Wasm-funksjon for RSI og tilsvarende logikk her.
      self.postMessage({ type: 'progress', payload: { message: 'RSI optimization not yet implemented with Rust.' } });
    } else {
      self.postMessage({ type: 'error', payload: { message: `Unsupported strategy: ${strategy}` } });
      return;
    }

    console.log(`Optimization Worker (TS) finished ${strategy} optimization. Top ${topResults.length} results:`, topResults);
    self.postMessage({ type: 'result', payload: { topResults } });
  }
};

export type {}