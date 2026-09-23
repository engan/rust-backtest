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

  it.each([
    ['RiskBased', ['atr_length', 'risk_percent', 'atr_multiplier', 'reward_risk_ratio']],
    ['FixedPercent', ['fixed_sl_percent', 'fixed_tp_percent']],
    ['TrailingPercent', ['trailing_sl_percent', 'static_tp_percent']],
    ['Combined', ['fixed_sl_percent', 'trailing_sl_percent', 'static_tp_percent']],
  ])('shows exactly the relevant Risk & exits fields for %s', (method, expected) => {
    const axes = createResearchAxes('EMA / VWAP', { ...base, sl_tp_method: method })
    expect(axes.filter((axis) => axis.group === 'Risk & exits').map((axis) => axis.id))
      .toEqual([...expected, 'risk_gearing'])
    expect(axes.find((axis) => axis.id === 'atr_length')?.group)
      .toBe(method === 'RiskBased' ? 'Risk & exits' : undefined)
    expect(axes.filter((axis) => axis.group === 'ADX filter').map((axis) => axis.id))
      .toEqual(['dmi_length', 'dmi_smoothing', 'dmi_threshold', 'adx_resume_threshold', 'adx_resume_bars'])
    expect(axes.find((axis) => axis.id === 'adx_resume_threshold')?.baseValue).toBe(16)
  })

  it('uses the Entry group for ATR length when only Fashionably Late needs it', () => {
    const axes = createResearchAxes('SMA Crossover', {
      ...base, sl_tp_method: 'TrailingPercent', fashionably_late_mode: 'Atr',
    })
    expect(axes.find((axis) => axis.id === 'atr_length')?.group).toBe('Entry')
    expect(axes.map((axis) => axis.id)).not.toContain('ema_source')
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
