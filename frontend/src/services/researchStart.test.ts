import { describe, it, expect } from 'vitest'
import { historyBars, makeProfile, readProfile, PROFILE_KEY } from './researchStart'

describe('research start', () => {
  it('counts calendar history using only closed candles and clamps month ends', () => {
    expect(historyBars(12, '1h', '2026-09-25T10:27')).toBe(365 * 24)
    expect(historyBars(1, '1d', '2026-03-31T00:00')).toBe(31)
    expect(historyBars(12, '1M', '2026-09-25T10:00')).toBe(12)
    expect(() => historyBars(24, '1s', '')).toThrow('limit')
  })
  it('persists fixed constraints and exact comparison dates, without strategy tuning', () => {
    const profile = makeProfile('Test', {
      strategy: 'emaVwap', parameters: { risk_gearing: 2, max_drawdown_perc: 12, ema_length: 999, enable_dmi_filter: false },
      market: { symbol: 'SOLUSDT', timeframe: '1h', dataLimit: 15179, endBeforeUtc: '2026-09-25T10:00' },
      execution: { initialCapital: 10000, commissionPercent: 0.05, slippageTicks: 2, quoteCurrency: 'USDT' },
    }, 'exact')
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    expect(readProfile()?.settings.market).toEqual(profile.settings.market)
    expect(readProfile()?.settings.parameters.risk_gearing).toBe(2)
    expect(readProfile()?.settings.parameters).not.toHaveProperty('ema_length')
    expect(readProfile()?.settings.parameters).not.toHaveProperty('enable_dmi_filter')
    localStorage.setItem(PROFILE_KEY, '{broken')
    expect(readProfile()).toBeNull()
    localStorage.removeItem(PROFILE_KEY)
  })
})
