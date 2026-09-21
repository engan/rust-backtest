import { ref } from 'vue';
import { useKlines } from '@/composables/useKlines';
import type { BacktestResult, BacktestConfig } from '@/types/common_strategy_types';
import type { EmaVwapParams, SmaParams } from '@/types/common_strategy_types';
import type { RoundingFlags } from '@/types/common_strategy_types'
import wasmUrl from '@/rust/pkg/rust_backtest_proprietary_bg.wasm?url'


type WasmModule = typeof import('@/rust/pkg/rust_backtest_proprietary');
let wasm: WasmModule | undefined;

/* ------------------------------------------------------------------ */
/* 1)  getWasm  – laster & cacher wasm-modulen                        */
/* ------------------------------------------------------------------ */
const getWasm = async (): Promise<WasmModule> => {
  if (!wasm) {
    // NB: identisk sti som i type-aliaset, men .js i runtime-importen
    const mod = await import('@/rust/pkg/rust_backtest_proprietary.js');

    // Let Vite track the binary as an asset. Production gets a content hash,
    // and the dev server invalidates the URL after each WASM rebuild.
    await mod.default({ module_or_path: wasmUrl });

    wasm = mod;            // legg i cache
  }
  return wasm!;
};

/* ------------------------------------------------------------------ */
/* 1)  initWasm                                                       */
/* ------------------------------------------------------------------ */
/* const initWasm = async (): Promise<WasmModule> => {
  if (!wasm) {
    // NB: identisk sti som i type-aliaset (men .js-suffiks fordi det er runtime)
    const mod = await import('@/rust/pkg/rust_backtest_proprietary.js');
    await mod.default();           // intialiser wasm-bindingene
    wasm = mod;                    // husk i modul-cache
  }
  return wasm!;                    // non-null assertion ✔
}; */

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
    endTimeExclusive?: number;
    initialCapital: number;
    config: BacktestConfig;
    params: SmaParams;
    priceToTick: boolean;
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInst = await getWasm();
      await loadKlines(opt.symbol, opt.interval, opt.limit, opt.endTimeExclusive);

      if (error.value) throw new Error(error.value);
      if (!klines.value.length) throw new Error('No klines returned from API.');

      const flags: RoundingFlags = {
        price_to_tick: opt.priceToTick,
        quantity_step: false,
        sl_tp_tick: false,
      };

      return wasmInst.run_sma_crossover_backtest(
        klines.value,
        opt.config,
        opt.initialCapital,
        opt.params,
        flags,
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
    endTimeExclusive?: number;
    initialCapital: number;
    config: BacktestConfig;
    params: EmaVwapParams;
    priceToTick: boolean;
  }): Promise<BacktestResult> => {
    isLoading.value = true;
    try {
      const wasmInst = await getWasm();
      await loadKlines(opt.symbol, opt.interval, opt.limit, opt.endTimeExclusive);

      if (error.value) throw new Error(error.value);
      if (!klines.value.length) throw new Error('No klines returned from API.');

      const flags: RoundingFlags = {
        price_to_tick: opt.priceToTick,
        quantity_step: false,
        sl_tp_tick: false,
      };

      return wasmInst.run_ema_vwap_backtest(
        klines.value,
        opt.config,
        opt.initialCapital,
        opt.params,
        flags,
      ) as BacktestResult;
    } finally {
      isLoading.value = false;
    }
  };

  return { 
    isLoading, 
    runSmaCrossoverBacktest, 
    runEmaVwapBacktest,
  };
}
