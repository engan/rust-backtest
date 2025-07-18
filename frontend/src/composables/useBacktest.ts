import { ref } from 'vue';
import { useKlines } from '@/composables/useKlines';
import type { BacktestResult, BacktestConfig } from '@/types/common_strategy_types';
import type { EmaVwapParams, SmaParams, MiniSmaParams } from '@/types/common_strategy_types';

type WasmModule = typeof import('@/rust/pkg/rust_backtest_proprietary');
let wasm: WasmModule | undefined;

/* ------------------------------------------------------------------ */
/* 1)  initWasm                                                       */
/* ------------------------------------------------------------------ */
const initWasm = async (): Promise<WasmModule> => {
  if (!wasm) {
    // NB: identisk sti som i type-aliaset (men .js-suffiks fordi det er runtime)
    const mod = await import('@/rust/pkg/rust_backtest_proprietary.js');
    await mod.default();           // intialiser wasm-bindingene
    wasm = mod;                    // husk i modul-cache
  }
  return wasm!;                    // non-null assertion ✔
};

/* ------------------------------------------------------------------ */
/* 2)  composable-API                                                 */
/* ------------------------------------------------------------------ */
export function useBacktest() {
  const isLoading = ref(false);
  const { klines, isLoading: klinesAreLoading, error, loadKlines } = useKlines();

  /* ------------ SMA (Full) ---------------------------------------- */
  const runSmaCrossoverBacktest = async (opt: {
    symbol: string;
    interval: string;
    limit: number;
    initialCapital: number;
    config: BacktestConfig;
    params: SmaParams;
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInst = await initWasm();
      await loadKlines(opt.symbol, opt.interval, opt.limit);

      if (error.value) throw new Error(error.value);
      if (!klines.value.length) throw new Error('No klines returned from API.');

      return wasmInst.run_sma_crossover_backtest(
        klines.value,
        opt.config,
        opt.initialCapital,
        opt.params,
      ) as BacktestResult;
    } finally {
      isLoading.value = false;
    }
  };

    /* ------------ SMA (Mini) - NYTT ------------------------------ */
  const runSmaCrossoverMiniBacktest = async (opt: {
    symbol: string;
    interval: string;
    limit: number;
    initialCapital: number;
    config: BacktestConfig;
    params: MiniSmaParams; // Bruker den nye, enkle typen
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInst = await initWasm();
      await loadKlines(opt.symbol, opt.interval, opt.limit);

      if (error.value) throw new Error(error.value);
      if (!klines.value?.length) throw new Error('No klines returned from API.');

      // Kaller den nye Wasm-funksjonen
      return wasmInst.run_sma_crossover_mini_backtest(
        klines.value,
        opt.config,
        opt.initialCapital,
        opt.params,
      ) as BacktestResult;
    } finally {
      isLoading.value = false;
    }
  };

  /* ------------ EMA/VWAP ------------------------------------------ */
  const runEmaVwapBacktest = async (opt: {
    symbol: string;
    interval: string;
    limit: number;
    initialCapital: number;
    config: BacktestConfig;
    params: EmaVwapParams;
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInst = await initWasm();
      await loadKlines(opt.symbol, opt.interval, opt.limit);

      if (error.value) throw new Error(error.value);
      if (!klines.value.length) throw new Error('No klines returned from API.');

      return wasmInst.run_ema_vwap_strategy(
        klines.value,
        opt.config,
        opt.initialCapital,
        opt.params,
      ) as BacktestResult;
    } finally {
      isLoading.value = false;
    }
  };

  return { 
    isLoading, 
    runSmaCrossoverBacktest, 
    runEmaVwapBacktest, 
    runSmaCrossoverMiniBacktest
  };
}