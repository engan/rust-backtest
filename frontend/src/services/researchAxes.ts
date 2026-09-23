export type NumericResearchAxis = {
  id: string
  label: string
  group: string
  type: 'numeric'
  enabled: boolean
  baseValue: number
  min: number
  max: number
  step: number
  wholeNumbers: boolean
}

export type ValueResearchAxis = {
  id: string
  label: string
  group: string
  type: 'values'
  enabled: boolean
  baseValue: string
  values: string[]
  options: string[]
}

export type ResearchAxis = NumericResearchAxis | ValueResearchAxis

const priceSources = ['Open', 'High', 'Low', 'Close', 'HLC3']
const vwapAnchors = ['Session', 'Day', 'Week', 'Month']
const lateModes = ['Off', 'OnClose', 'OnHighLow', 'Atr']

const numeric = (
  id: string,
  label: string,
  group: string,
  base: unknown,
  step: number,
  stepsEachSide: number,
  enabled = false,
  lowerBound = 0,
  wholeNumbers = false,
): NumericResearchAxis => {
  const baseValue = Number(base)
  const value = Number.isFinite(baseValue) ? baseValue : lowerBound
  const lowerSteps = Math.min(stepsEachSide, Math.max(0, Math.floor((value - lowerBound) / step)))
  return {
    id, label, group, type: 'numeric', enabled, baseValue: value,
    min: Number((value - lowerSteps * step).toFixed(8)),
    max: Number((value + stepsEachSide * step).toFixed(8)),
    step, wholeNumbers,
  }
}

const choices = (
  id: string,
  label: string,
  group: string,
  base: unknown,
  options: string[],
  enabled = false,
  includeAlternatives = false,
): ValueResearchAxis => {
  const baseValue = String(base ?? options[0])
  const available = [...new Set([...options, baseValue])]
  const values = includeAlternatives
    ? [...new Set([baseValue, 'High', 'Low'])].filter((value) => available.includes(value))
    : [baseValue]
  return { id, label, group, type: 'values', enabled, baseValue, values, options: available }
}

/** Build only axes that affect the selected strategy and its current execution method. */
export const createResearchAxes = (strategy: string, base: Record<string, unknown>): ResearchAxis[] => {
  const axes: ResearchAxis[] = []
  if (strategy === 'EMA / VWAP') {
    axes.push(
      numeric('ema_length', 'EMA Length', 'Signal', base.ema_length, 4, 6, true, 1, true),
      choices('ema_source', 'EMA Source', 'Signal', base.ema_source, priceSources, true, true),
      choices('vwap_anchor_period', 'VWAP Anchor', 'Signal', base.vwap_anchor_period, vwapAnchors),
      choices('vwap_source', 'VWAP Source', 'Signal', base.vwap_source, priceSources),
    )
  } else {
    axes.push(
      numeric('sma_fast_period', 'Fast SMA Period', 'Signal', base.fast_period, 1, 3, true, 1, true),
      numeric('sma_slow_period', 'Slow SMA Period', 'Signal', base.slow_period, 5, 3, true, 1, true),
    )
  }

  const lateMode = String(base.fashionably_late_mode ?? 'Off')
  axes.push(choices('fashionably_late_mode', 'Fashionably Late', 'Entry', lateMode, lateModes))
  if (lateMode !== 'Off') {
    axes.push(numeric('fl_expiry_bars', 'Maximum FL wait', 'Entry', base.fl_expiry_bars, 6, 2, false, 1, true))
  }
  if (lateMode === 'Atr') {
    if (base.atr_threshold_percent === true) {
      axes.push(numeric('atr_threshold_fl_percent', 'ATR threshold %', 'Entry', base.atr_threshold_fl_percent, 0.2, 2))
    } else {
      axes.push(numeric('atr_threshold_fl', 'ATR threshold', 'Entry', base.atr_threshold_fl, 0.2, 2))
    }
  }

  const method = String(base.sl_tp_method ?? 'TrailingPercent')
  if (method === 'RiskBased' || lateMode === 'Atr') {
    axes.push(numeric('atr_length', 'ATR Length', method === 'RiskBased' ? 'Risk & exits' : 'Entry', base.atr_length, 2, 2, false, 1, true))
  }
  if (method === 'RiskBased') {
    axes.push(
      numeric('risk_percent', 'Risk per trade %', 'Risk & exits', base.risk_perc, 0.25, 2),
      numeric('atr_multiplier', 'ATR stop multiplier', 'Risk & exits', base.atr_mult_rb, 0.25, 2),
      numeric('reward_risk_ratio', 'Reward / risk', 'Risk & exits', base.reward_mult_rb, 0.25, 2),
    )
  } else if (method === 'FixedPercent') {
    axes.push(
      numeric('fixed_sl_percent', 'Fixed SL %', 'Risk & exits', base.fixed_sl_perc, 0.5, 2, true),
      numeric('fixed_tp_percent', 'Fixed TP %', 'Risk & exits', base.fixed_tp_perc, 0.5, 2, true),
    )
  } else {
    if (method === 'Combined') {
      axes.push(numeric('fixed_sl_percent', 'Fixed SL %', 'Risk & exits', base.fixed_sl_perc, 0.5, 2, false))
    }
    axes.push(
      numeric('trailing_sl_percent', 'Trailing SL %', 'Risk & exits', base.trailing_sl_perc, 0.5, 2, true),
      numeric('static_tp_percent', 'Static TP %', 'Risk & exits', base.fixed_tp_for_trailing_perc, 0.5, 2, true),
    )
  }
  axes.push(numeric('risk_gearing', 'Position gearing', 'Risk & exits', base.risk_gearing, 1, 2, false, 1, true))

  if (base.enable_max_drawdown === true) {
    axes.push(numeric('max_drawdown_percent', 'Safeguard drawdown %', 'Safeguards', base.max_drawdown_perc, 1, 2, false, 1))
  }
  if (base.enable_max_consecutive_losses === true) {
    axes.push(numeric('max_consecutive_losses', 'Consecutive losses', 'Safeguards', base.max_consecutive_losses, 1, 2, false, 1, true))
  }
  if (base.enable_max_drawdown === true || base.enable_max_consecutive_losses === true) {
    axes.push(numeric('cooldown_bars', 'Cooldown bars', 'Safeguards', base.cooldown_bars, 6, 2, false, 1, true))
  }
  if (base.enable_dmi_filter === true) {
    const pause = numeric('dmi_threshold', 'ADX pause below', 'ADX filter', base.dmi_threshold, 0.5, 2, false)
    const resume = Number(base.adx_resume_threshold)
    if (Number.isFinite(resume)) pause.max = Math.min(pause.max, resume)
    axes.push(
      numeric('dmi_length', 'DMI Length', 'ADX filter', base.dmi_length, 1, 2, false, 1, true),
      numeric('dmi_smoothing', 'ADX Smoothing', 'ADX filter', base.dmi_smoothing, 2, 2, false, 1, true),
      pause,
      numeric('adx_resume_threshold', 'ADX resume at', 'ADX filter', base.adx_resume_threshold, 0.5, 2),
      numeric('adx_resume_bars', 'ADX confirmation bars', 'ADX filter', base.adx_resume_bars, 1, 2, false, 1, true),
    )
  }
  return axes
}

export const toggleResearchChoice = (axis: ValueResearchAxis, choice: string, checked: boolean): void => {
  axis.values = axis.options.filter((option) =>
    option === choice ? checked : axis.values.includes(option),
  )
}

export const includesCurrentValue = (axis: ResearchAxis): boolean => {
  if (!axis.enabled) return true
  if (axis.type === 'values') return axis.values.includes(axis.baseValue)
  if (![axis.min, axis.max, axis.step].every(Number.isFinite) || axis.step <= 0
      || axis.baseValue < axis.min || axis.baseValue > axis.max) return false
  const steps = (axis.baseValue - axis.min) / axis.step
  return Math.abs(steps - Math.round(steps)) < 1e-7
}
