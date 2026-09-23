import { describe, expect, it } from 'vitest'
import { createResearchAxes, includesCurrentValue, toggleResearchChoice } from './researchAxes'
import { numericAxisValues } from './researchGrid'

const base = {
  ema_length: 126, ema_source: 'HLC3', vwap_anchor_period: 'Week', vwap_source: 'Low',
  fast_period: 10, slow_period: 73, fashionably_late_mode: 'OnHighLow', fl_expiry_bars: 48,
  sl_tp_method: 'TrailingPercent', trailing_sl_perc: 3, fixed_tp_for_trailing_perc: 6.5,
  fixed_sl_perc: 1, fixed_tp_perc: 2, atr_length: 14, risk_perc: 1,
  atr_mult_rb: 1.5, reward_mult_rb: 2, risk_gearing: 1,
  enable_max_drawdown: true, max_drawdown_perc: 12,
  enable_max_consecutive_losses: true, max_consecutive_losses: 5, cooldown_bars: 48,
  enable_dmi_filter: true, dmi_length: 6, dmi_smoothing: 24,
  dmi_threshold: 14.05, adx_resume_threshold: 16, adx_resume_bars: 3,
}

describe('strategy-aware optimization axes', () => {
  it('includes imported EMA/HLC3 and trailing/TP baseline values in the proposed search', () => {
    const axes = createResearchAxes('EMA / VWAP', base)
    const length = axes.find((axis) => axis.id === 'ema_length')
    const source = axes.find((axis) => axis.id === 'ema_source')
    const stop = axes.find((axis) => axis.id === 'trailing_sl_percent')
    const target = axes.find((axis) => axis.id === 'static_tp_percent')
    expect(length?.type).toBe('numeric')
    if (length?.type === 'numeric') expect(numericAxisValues(length.min, length.max, length.step, 100)).toContain(126)
    expect(source?.type).toBe('values')
    if (source?.type === 'values') expect(source.values).toContain('HLC3')
    expect(stop?.baseValue).toBe(3)
    expect(target?.baseValue).toBe(6.5)
    expect(axes.map((axis) => axis.id)).not.toContain('fixed_tp_percent')
  })

  it('shows only the active stop family and strategy signal family', () => {
    const fixed = createResearchAxes('SMA Crossover', { ...base, sl_tp_method: 'FixedPercent' })
    const risk = createResearchAxes('EMA / VWAP', { ...base, sl_tp_method: 'RiskBased' })
    expect(fixed.map((axis) => axis.id)).toContain('fixed_sl_percent')
    expect(fixed.map((axis) => axis.id)).not.toContain('trailing_sl_percent')
    expect(fixed.map((axis) => axis.id)).not.toContain('ema_source')
    expect(risk.map((axis) => axis.id)).toContain('atr_multiplier')
    expect(risk.map((axis) => axis.id)).toContain('risk_percent')
    expect(risk.map((axis) => axis.id)).not.toContain('static_tp_percent')
  })

  it('hides inactive safeguards and applies selected categorical values', () => {
    const axes = createResearchAxes('EMA / VWAP', {
      ...base, enable_dmi_filter: false, enable_max_drawdown: false,
      enable_max_consecutive_losses: false,
    })
    expect(axes.map((axis) => axis.id)).not.toContain('dmi_threshold')
    expect(axes.map((axis) => axis.id)).not.toContain('max_drawdown_percent')
    const source = axes.find((axis) => axis.id === 'vwap_source')
    if (source?.type !== 'values') throw new Error('VWAP source axis missing')
    toggleResearchChoice(source, 'HLC3', true)
    expect(source.values).toEqual(['Low', 'HLC3'])
    toggleResearchChoice(source, 'Low', false)
    expect(source.values).toEqual(['HLC3'])
  })

  it('detects when a user-edited range skips the imported Backtest setting', () => {
    const length = createResearchAxes('EMA / VWAP', base).find((axis) => axis.id === 'ema_length')
    if (length?.type !== 'numeric') throw new Error('EMA length axis missing')
    expect(includesCurrentValue(length)).toBe(true)
    length.min = 80
    length.max = 160
    length.step = 4
    expect(includesCurrentValue(length)).toBe(false) // 126 is not on the 80, 84, …, 160 grid.
  })
})
