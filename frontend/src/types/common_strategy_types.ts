// Definerer felles datastrukturer (Kline, Trade, EquityPoint) for både Rust og Frontend.

// Tilsvarende src/types.rs, men i TypeScript. 
// Dette sikrer at datastrukturene som sendes mellom frontend og Wasm er konsistente.

// --- Grunnleggende typer for Backtest-motoren (Rust -> Frontend) ---
export interface Kline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  entry_bar_index: number;
  exit_bar_index?: number;
  entry_price: number;
  exit_price?: number;
  direction: 'long' | 'short';
  qty: number;
  pnl?: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

export interface BacktestConfig {
  commission_percent: number;
  slippage_ticks: number;
  tick_size: number;
}

export interface BacktestSummary {
  final_equity: number;
  total_pnl: number;
  max_drawdown_percent: number;
  profit_factor: number;
  total_trades: number;
  profitable_trades: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity_curve: EquityPoint[];
  summary: BacktestSummary;
}


// --- Typer for Optimalisering (Frontend -> optimizationWorker) ---
export interface ParameterRange {
  min: number;
  max: number;
  step: number;
}

interface CostParams {
  commissionPct: number;
  slippageAmount: number;
}

export interface SmaOptimizationParams extends CostParams {
  shortSma: ParameterRange;
  longSma: ParameterRange;
}

export interface RsiOptimizationParams extends CostParams {
  period: ParameterRange;
  buyLevel: number;
  sellLevel: number;
}

export type OptimizationStrategyInfo =
  | { strategy: 'smaCross'; params: SmaOptimizationParams }
  | { strategy: 'rsi'; params: RsiOptimizationParams };


// --- Typer for Optimaliseringsresultater (optimizationWorker -> Frontend) ---
export interface BestParamsBase {
  score: number;
  trades: number;
}

export interface SmaBestParams extends BestParamsBase {
  type: 'smaCross';
  short: number;
  long: number;
}

export interface RsiBestParams extends BestParamsBase {
  type: 'rsi';
  period: number;
}

export type TopResultItem = SmaBestParams | RsiBestParams;


// --- Typer for Monte Carlo (Frontend -> mcValidationWorker -> Frontend) ---
export interface McSettings {
  iterations: number;
  barsPerSim: number;
}

export interface DataSourceInfo {
  symbol: string;
  timeframe: string;
  limit: number;
}

export interface StartMcValidationPayload {
  mcSettings: McSettings;
  dataSource: DataSourceInfo;
  selectedStrategyParams: TopResultItem;
  strategy: 'smaCross' | 'rsi';
  historicalKlines: Kline[];
  costs: CostParams;
}

export interface DataInfo {
  symbol: string;
  timeframe: string;
  count: number;
  startTime: number;
  endTime: number;
}

export interface McSummaryStats {
  numIterations: number;
  numBarsPerSim: number;
  averagePL_pct?: number;
  medianPL_pct?: number;
  pnl_05_percentile_pct?: number;
  pnl_10_percentile_pct?: number;
  averageMaxDD?: number;
  medianMaxDD?: number;
  maxDD_95_percentile?: number;
}

export interface McResultData {
  allPnLs_pct: number[];
  allMaxDrawdowns: number[];
  summaryStats: McSummaryStats;
  dataInfo?: DataInfo;
}