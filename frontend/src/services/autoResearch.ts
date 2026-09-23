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
    axes: Array<{ parameter: string; values: Array<number | string> }>
    max_candidates: number
  }
}

const unique = <T>(values: T[]): T[] => [...new Set(values)]
const rounded = (value: number, whole: boolean): number => whole ? Math.round(value) : Number(value.toFixed(4))

const around = (axis: ResearchAxis): number[] => {
  if (axis.type !== 'numeric') return []
  const floor = axis.wholeNumbers ? 1 : 0.01
  return unique([0.8, 1, 1.2].map((factor) => Math.max(floor, rounded(axis.baseValue * factor, axis.wholeNumbers))))
}

/** A deliberately bounded first pass. Risk limits, gearing, ADX and costs remain fixed. */
export const createAutoFamilyGrids = (
  strategy: string,
  base: Record<string, unknown>,
): AutoFamilyGrid[] => AUTO_STOP_METHODS.map((method) => {
  const params = { ...base, sl_tp_method: method }
  const relevant = createResearchAxes(strategy, params)
  const chosen = strategy === 'EMA / VWAP'
    ? ['ema_length', 'ema_source']
    : ['sma_fast_period', 'sma_slow_period']
  const exits = method === 'RiskBased'
    ? ['atr_multiplier', 'reward_risk_ratio']
    : method === 'FixedPercent'
      ? ['fixed_sl_percent', 'fixed_tp_percent']
      : method === 'Combined'
        ? ['fixed_sl_percent', 'trailing_sl_percent', 'static_tp_percent']
        : ['trailing_sl_percent', 'static_tp_percent']
  const axes = [...chosen, ...exits].map((id) => {
    const axis = relevant.find((item) => item.id === id)
    if (!axis) throw new Error(`Automatic search cannot find ${id} for ${method}.`)
    let values: Array<number | string>
    if (axis.type === 'numeric') {
      values = around(axis)
      if (id === 'sma_slow_period') values = unique([axis.baseValue, values[2] ?? axis.baseValue])
    } else {
      values = unique([axis.baseValue, axis.baseValue === 'High' ? 'Low' : 'High'])
    }
    if (!values.length || values.some((value) => typeof value === 'number' && (!Number.isFinite(value) || value <= 0))) {
      throw new Error(`Automatic search needs a positive, finite ${axis.label} value.`)
    }
    return { parameter: id, values }
  })
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
