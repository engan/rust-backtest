import { describe, expect, it } from 'vitest'
import { AUTO_REFINEMENT, closedCandleCutoff, assessAutoFamily, createAutoFamilyGrids, rankAutoFamilies } from './autoResearch'

const base = {
  ema_length: 122, ema_source: 'High', vwap_anchor_period: 'Week', vwap_source: 'Open',
  fast_period: 10, slow_period: 73, fashionably_late_mode: 'Atr', atr_length: 14,
  sl_tp_method: 'TrailingPercent', fixed_sl_perc: 1, fixed_tp_perc: 2,
  trailing_sl_perc: 3, fixed_tp_for_trailing_perc: 5, risk_perc: 1,
  atr_mult_rb: 1.5, reward_mult_rb: 2, risk_gearing: 1,
  enable_dmi_filter: true, dmi_threshold: 14.05, adx_resume_threshold: 16,
  enable_max_drawdown: true, max_drawdown_perc: 22,
}

describe('automatic strategy research', () => {
  it.each(['EMA / VWAP', 'SMA Crossover'])('builds four bounded, method-specific families for %s', (strategy) => {
    const families = createAutoFamilyGrids(strategy, base)
    expect(families.map((family) => family.method))
      .toEqual(['RiskBased', 'FixedPercent', 'TrailingPercent', 'Combined'])
    expect(families.every((family) => family.candidateCount > 1 && family.candidateCount <= 3000)).toBe(true)
    for (const family of families) {
      expect(family.parameterGrid.base.params.sl_tp_method).toBe(family.method)
      expect(family.parameterGrid.base.params.risk_gearing).toBe(1)
      expect(family.parameterGrid.base.params.max_drawdown_perc).toBe(22)
      expect(family.parameterGrid.max_candidates).toBe(family.candidateCount)
      expect(family.parameterGrid.axes.map((axis) => axis.parameter)).not.toContain('risk_gearing')
      expect(family.parameterGrid.axes.map((axis) => axis.parameter)).not.toContain('risk_percent')
      for (const axis of family.parameterGrid.axes) expect(axis.values.length).toBeGreaterThan(1)
      expect(family.parameterGrid.axes.map((axis) => axis.parameter)).toContain('fashionably_late_mode')
    }
    expect(families[0]?.parameterGrid.axes.map((axis) => axis.parameter))
      .toContain(strategy === 'EMA / VWAP' ? 'ema_length' : 'sma_fast_period')
    expect(families[0]?.parameterGrid.axes.map((axis) => axis.parameter)).not.toContain('fixed_sl_percent')
    expect(families[3]?.parameterGrid.axes.map((axis) => axis.parameter))
      .not.toContain('trailing_sl_percent')
    if (strategy === 'EMA / VWAP') {
      const axes = families[0]!.parameterGrid.axes
      expect(axes.find((axis) => axis.parameter === 'ema_source')?.values).toContain('HLC3')
      expect(axes.find((axis) => axis.parameter === 'vwap_source')?.values).toContain('Low')
      expect(axes.find((axis) => axis.parameter === 'fashionably_late_mode')?.values).toContain('OnHighLow')
    }
  })

  it('covers independent broad ranges and exits even from a narrow starting setup', () => {
    const families = createAutoFamilyGrids('EMA / VWAP', { ...base, ema_length: 126, trailing_sl_perc: 2.8, fixed_tp_for_trailing_perc: 6.9 })
    expect(families[2]!.parameterGrid.base.params.trailing_sl_perc).toBe(3)
    expect(families[2]!.parameterGrid.base.params.fixed_tp_for_trailing_perc).toBe(6)
    expect(families[2]!.parameterGrid.axes.find(a => a.parameter === 'ema_length')!.values).toEqual([40, 80, 120, 126, 180, 240])
    expect(families[2]!.parameterGrid.axes.find(a => a.parameter === 'ema_source')!.values).toEqual(expect.arrayContaining(['Open', 'Close', 'HLC3']))
    expect(AUTO_REFINEMENT.rounds).toBe(5)
  })

  it('does not recommend a high-return family that fails OOS evidence checks', () => {
    const weak = assessAutoFamily('Combined', 162, {
      compounded_out_of_sample_net_profit: 4000, total_validation_trades: 10,
      worst_validation_drawdown_percent: 30, profitable_windows: 1, windows: [1, 2, 3],
    }, 10000, 30, 25)
    const stable = assessAutoFamily('TrailingPercent', 54, {
      compounded_out_of_sample_net_profit: 1000, total_validation_trades: 45,
      worst_validation_drawdown_percent: 12, profitable_windows: 3, windows: [1, 2, 3, 4],
    }, 10000, 30, 25)
    expect(weak.eligible).toBe(false)
    expect(stable.eligible).toBe(true)
    expect(rankAutoFamilies([weak, stable])[0]?.method).toBe('TrailingPercent')
  })
})

describe('closed-candle research snapshots', () => {
  it('pins hourly, weekly and calendar-month runs to completed candles', () => {
    const now = Date.parse('2026-09-25T13:27:18Z')
    expect(new Date(closedCandleCutoff(now, '1h')).toISOString()).toBe('2026-09-25T13:00:00.000Z')
    expect(new Date(closedCandleCutoff(now, '1w')).toISOString()).toBe('2026-09-21T00:00:00.000Z')
    expect(new Date(closedCandleCutoff(now, '1M')).toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})
