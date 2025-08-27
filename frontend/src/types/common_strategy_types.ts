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
  quantity: number;
  pnl?: number;
}

export interface TradeEvent {
  trade_id: number;
  bar_index: number;
  timestamp: number;
  event_type: string; // 'Entry' | 'Exit'
  direction: 'long' | 'short'; 
  signal: string;
  price: number;
  quantity: number;
  pnl?: number;
  run_up_amount?: number;
  drawdown_amount?: number;  
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

export interface PnlPoint {
  timestamp: number;
  pnlPercent: number;
}

// Legg til denne nye enum-en
export const OrderSizeMode = {
  PercentOfEquity: 'percentOfEquity',
  FixedQuantity:   'fixedQuantity',
  FixedValue:      'fixedValue',
  ExplicitQty:     'explicitQty',
} as const;
export type OrderSizeMode = typeof OrderSizeMode[keyof typeof OrderSizeMode];

export interface BacktestConfig {
  commission_percent: number;
  slippage_ticks: number;
  tick_size: number;
  step_size: number;
}

export interface BacktestSummary {
  equity_final: number;
  pnl_total: number;
  max_drawdown_percent: number;
  profit_factor: number;
  total_trades: number;
  profitable_trades: number;
  max_drawdown_amount: number;
  net_profit: number;
  pnl_open: number;
}

export interface BacktestResult {
  trade_log: TradeEvent[]; 
  equity_curve: EquityPoint[];
  pnl_curve: PnlPoint[]; 
  summary: BacktestSummary;
  bar_log: any[]; // Eller BarLogEntry[]
}

// Typer for SMA Crossover Strategi ---
export interface SmaParams {
  fast_period: number;
  slow_period: number;
  order_size_mode: OrderSizeMode;
  order_size_value: number;
  sl_tp_method: SlTpMethod;
  atr_length: number;
  reward_mult_rb: number;
  atr_mult_rb: number;
  fixed_sl_perc: number;
  fixed_tp_perc: number;
  trailing_sl_perc: number;
  fixed_tp_for_trailing_perc: number;
  risk_gearing: number,
  risk_perc: number;
  trade_direction: TradeDirectionFilter;   // new
}

// NYTT: Definer typen for de minimale parameterne.
export interface MiniSmaParams {
  fast_period: number;
  slow_period: number;
  order_size_mode: OrderSizeMode;
  order_size_value: number;  
}

export interface RoundingFlags {
  price_to_tick: boolean
  quantity_step: boolean
  sl_tp_tick: boolean
}

// --- Typer for EMA/VWAP Strategi ---

export enum EmaSource {
  Open = 'Open',
  High = 'High',
  Low = 'Low',
  Close = 'Close',
  HLC3 = 'HLC3',
}

export enum VwapAnchorPeriod {
  Session = 'Session',
  Day = 'Day',
  Week = 'Week',
  Month = 'Month',
}

export enum TradeDirectionFilter {
  Both = 'Both',
  Long = 'Long',
  Short = 'Short',
}

export enum FashionablyLateMode {
  Off = 'Off',
  OnClose = 'OnClose',
  OnHighLow = 'OnHighLow',
  ATR = 'ATR',
}

export enum SlTpMethod {
  RiskBased = 'RiskBased',
  FixedPercent = 'FixedPercent',
  TrailingPercent = 'TrailingPercent',
  Combined = 'Combined',
}

export interface EmaVwapParams {
  ema_length: number;
  ema_source: EmaSource;
  vwap_anchor_period: VwapAnchorPeriod;
  vwap_source: EmaSource;
  trade_direction: TradeDirectionFilter;
  fashionably_late_mode: FashionablyLateMode;
  atr_threshold_fl: number;
  atr_length_pos: number;
  risk_gearing: number;
  risk_perc: number;
  sl_tp_method: SlTpMethod;
  reward_mult_rb: number;
  atr_mult_rb: number;
  fixed_sl_perc: number;
  fixed_tp_perc: number;
  trailing_sl_perc: number;
  fixed_tp_for_trailing_perc: number;
  enable_max_drawdown: boolean;
  max_drawdown_perc: number;
  enable_max_consecutive_losses: boolean;
  max_consecutive_losses: number;
  enable_dmi_filter: boolean;
  dmi_length: number;
  dmi_smoothing: number;
  dmi_threshold: number;
}

// --- Typer for Frontend-spesifikk prosessering og visning ---

export interface ProcessedTrade {
  entry: TradeEvent;
  exit?: TradeEvent; // Kan være undefined for åpne handler

  positionValue: number; // NYTT 
  
  // Nye, beregnede egenskaper (valgfrie siden de kun gjelder lukkede handler)
  returnPercent?: number;
  pnlPercent?: number;
  runUpPercent?: number;
  drawdownPercent?: number;
  cumulativePnl?: number;
  cumulativePnlPercent?: number;
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