import { describe, expect, it } from 'vitest'
import { buildPeriodEndChanges } from './performancePeriods'

const time = (date: string) => Date.parse(`${date}T00:00:00Z`)
const month = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 7)

describe('period-end performance', () => {
  it('includes the first period from initial capital and uses previous period ends thereafter', () => {
    const equity = [
      { timestamp: time('2026-01-02'), equity: 10500 },
      { timestamp: time('2026-01-31'), equity: 11000 },
      { timestamp: time('2026-02-28'), equity: 9000 },
      { timestamp: time('2026-03-31'), equity: 12000 },
    ]
    const bars = [
      { timestamp: time('2026-01-01'), close: 100 },
      { timestamp: time('2026-01-31'), close: 100 },
      { timestamp: time('2026-02-28'), close: 110 },
      { timestamp: time('2026-03-31'), close: 105 },
    ]
    const rows = buildPeriodEndChanges(equity, bars, 10000, month)
    expect(rows.map((row) => row.strategy)).toEqual([1000, -2000, 3000])
    expect(rows.map((row) => row.benchmark)).toEqual([0, 1000, -500])
    expect(rows[1].strategyReturn).toBeCloseTo(-2000 / 11000)
    expect(rows[2].benchmarkReturn).toBeCloseTo(-500 / 11000)
  })
})
