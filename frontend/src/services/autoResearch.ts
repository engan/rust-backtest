import { createResearchAxes, type ResearchAxis } from './researchAxes'

export const AUTO_STOP_METHODS = ['RiskBased', 'FixedPercent', 'TrailingPercent', 'Combined'] as const
export type AutoStopMethod = typeof AUTO_STOP_METHODS[number]

export const autoMethodLabel = (method: AutoStopMethod): string => ({
  RiskBased: 'Risk-based',
  FixedPercent: 'Fixed %',
  TrailingPercent: 'Trailing %',
  Combined: 'Combined',
})[method]

export type AutoFamilyGrid = {
  method: AutoStopMethod
  candidateCount: number
  parameterGrid: {
    base: { strategy: 'ema_vwap' | 'sma_crossover'; params: Record<string, unknown> }
    axes: Array<{ parameter: string; values: Array<number | string | boolean> }>
    max_candidates: number
  }
}

export const AUTO_REFINEMENT = {
  top_seeds: 6,
  exit_factors: [0.5, 1, 2],
  length_offsets: [-4, 0, 4],
  max_refined_candidates: 2048,
  rounds: 5,
  broad_exits: true,
} as const

const unique = <T>(values: T[]): T[] => [...new Set(values)]
/** Broad structural search. Exit values are refined *inside each training window*
 * by the native runner, so no validation bars choose search ranges or seeds. */
export const createAutoFamilyGrids = (
  strategy: string,
  base: Record<string, unknown>,
): AutoFamilyGrid[] => AUTO_STOP_METHODS.map((method) => {
  const params = { ...base, sl_tp_method: method,
    fixed_sl_perc: 2, fixed_tp_perc: 6, trailing_sl_perc: 3,
    fixed_tp_for_trailing_perc: 6, atr_mult_rb: 1.5, reward_mult_rb: 2,
  }
  const relevant = createResearchAxes(strategy, params)
  const chosen = strategy === 'EMA / VWAP'
    ? ['ema_length', 'ema_source', 'vwap_anchor_period', 'vwap_source', 'fashionably_late_mode']
    : ['sma_fast_period', 'sma_slow_period', 'fashionably_late_mode']
  const axes = chosen.map((id) => {
    const axis = relevant.find((item) => item.id === id)
    if (!axis) throw new Error(`Automatic search cannot find ${id} for ${method}.`)
    let values: Array<number | string | boolean>
    if (axis.type === 'numeric') {
      values = unique([axis.baseValue, ...(id === 'sma_fast_period' ? [5, 10, 20, 40] : [40, 80, 120, 180, 240])]).sort((a, b) => a - b)
    } else {
      values = unique([axis.baseValue, ...axis.options])
      values = values.filter((value) => axis.options.includes(String(value)))
    }
    if (!values.length || values.some((value) => typeof value === 'number' && (!Number.isFinite(value) || value <= 0))) {
      throw new Error(`Automatic search needs a positive, finite ${axis.label} value.`)
    }
    return { parameter: id, values }
  })
  axes.push({ parameter: 'enable_dmi_filter', values: [false, true] })
  const candidateCount = axes.reduce((count, axis) => count * axis.values.length, 1)
  return {
    method,
    candidateCount,
    parameterGrid: {
      base: { strategy: strategy === 'EMA / VWAP' ? 'ema_vwap' : 'sma_crossover', params },
      axes,
      max_candidates: candidateCount,
    },
  }
})

export type AutoFamilyEvidence = {
  method: AutoStopMethod
  candidateCount: number
  oosPnl: number
  oosTrades: number
  worstOosDrawdown: number
  profitableWindows: number
  windows: number
  eligible: boolean
  reason: string
  score: number
}

export const assessAutoFamily = (
  method: AutoStopMethod,
  candidateCount: number,
  walkForward: {
    compounded_out_of_sample_net_profit?: number
    total_validation_trades?: number
    worst_validation_drawdown_percent?: number
    profitable_windows?: number
    windows?: unknown[]
  },
  initialCapital: number,
  minimumTrades: number,
  maximumDrawdown: number,
): AutoFamilyEvidence => {
  const oosPnl = walkForward.compounded_out_of_sample_net_profit ?? 0
  const oosTrades = walkForward.total_validation_trades ?? 0
  const worstOosDrawdown = walkForward.worst_validation_drawdown_percent ?? 0
  const profitableWindows = walkForward.profitable_windows ?? 0
  const windows = walkForward.windows?.length ?? 0
  const reasons = [
    ...(oosTrades < minimumTrades ? [`${oosTrades} OOS trades; need ${minimumTrades}`] : []),
    ...(worstOosDrawdown > maximumDrawdown ? [`OOS DD ${worstOosDrawdown.toFixed(1)}% exceeds ${maximumDrawdown}%`] : []),
    ...(oosPnl <= 0 ? ['OOS P&L is not positive'] : []),
    ...(windows < 2 || profitableWindows < Math.ceil(windows / 2) ? ['Too few profitable OOS windows'] : []),
  ]
  return {
    method, candidateCount, oosPnl, oosTrades, worstOosDrawdown, profitableWindows, windows,
    eligible: reasons.length === 0,
    reason: reasons.join(' · ') || 'Passes OOS evidence checks',
    score: initialCapital > 0 ? (oosPnl / initialCapital * 100) / Math.max(worstOosDrawdown, 5) : 0,
  }
}

export const rankAutoFamilies = <T extends AutoFamilyEvidence>(families: T[]): T[] =>
  [...families].sort((left, right) =>
    Number(right.eligible) - Number(left.eligible)
      || right.score - left.score
      || right.oosTrades - left.oosTrades
      || AUTO_STOP_METHODS.indexOf(left.method) - AUTO_STOP_METHODS.indexOf(right.method),
  )

/** Exclusive start of the current candle. Automatic runs use closed candles only. */
export const closedCandleCutoff = (timestamp: number, timeframe: string): number => {
  const match = /^(\d+)(s|m|h|d|w|M)$/.exec(timeframe)
  if (!match || !Number.isFinite(timestamp)) throw new Error('Invalid candle timeframe or cutoff.')
  const size = Number(match[1])
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid candle timeframe size.')
  if (match[2] === 'M') {
    const date = new Date(timestamp)
    const month = Math.floor((date.getUTCFullYear() * 12 + date.getUTCMonth()) / size) * size
    return Date.UTC(Math.floor(month / 12), month % 12, 1)
  }
  const duration = size * ({ s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[match[2]] ?? 0)
  const anchor = match[2] === 'w' ? Date.UTC(1970, 0, 5) : 0 // Binance weeks start Monday UTC.
  return anchor + Math.floor((timestamp - anchor) / duration) * duration
}
