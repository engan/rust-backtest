/* tslint:disable */
/* eslint-disable */
export function calculate_ema_debug(data_js: any, period: number): any;
export function run_sma_crossover_backtest(klines_js: any, config_js: any, initial_capital: number, params_js: any): any;
export function run_sma_crossover_mini_backtest(klines_js: any, config_js: any, initial_capital: number, params_js: any, flags_js: any): any;
export function run_ema_vwap_strategy(klines_js: any, config_js: any, initial_capital: number, params_js: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly calculate_ema_debug: (a: any, b: number) => any;
  readonly run_sma_crossover_backtest: (a: any, b: any, c: number, d: any) => [number, number, number];
  readonly run_sma_crossover_mini_backtest: (a: any, b: any, c: number, d: any, e: any) => [number, number, number];
  readonly run_ema_vwap_strategy: (a: any, b: any, c: number, d: any) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
