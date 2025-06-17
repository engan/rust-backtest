import { ref } from 'vue';
import { useKlines } from '@/composables/useKlines';
import type { BacktestResult, BacktestConfig } from '@/types/common_strategy_types';

let wasm: typeof import('@/rust/pkg/rust_backtest_proprietary'); // Justert for det nye repo-navnet

// Endre navnet på funksjonen
export function useBacktest() { 
  const isLoading = ref(false);
  const { klines, isLoading: klinesAreLoading, error, loadKlines } = useKlines();

  const initWasm = async () => {
    if (!wasm) {
      // Pass på at denne stien stemmer med navnet på wasm-filene
      wasm = await import('@/rust/pkg/rust_backtest_proprietary.js'); 
      await wasm.default();
    }
    return wasm;
  };

  const runSmaCrossoverBacktest = async (options: {
    symbol: string;
    interval: string;
    limit: number;
    initialCapital: number;
    config: BacktestConfig;
    fastPeriod: number;
    slowPeriod: number;
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInstance = await initWasm();
      await loadKlines(options.symbol, options.interval, options.limit);
      
      if (klinesAreLoading.value || !klines.value || klines.value.length === 0 || error.value) {
        throw new Error('Could not fetch klines from Binance API or an error occurred.');
      }

      const results = wasmInstance.run_sma_crossover_backtest(
        klines.value,
        options.initialCapital,
        options.fastPeriod,
        options.slowPeriod,
        options.config.commission_percent,
        options.config.slippage_ticks,
        options.config.tick_size
      );
      return results as BacktestResult;
    } catch (e) {
      console.error('Error in runBacktest:', e);
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    isLoading,
    runSmaCrossoverBacktest,
  };
}