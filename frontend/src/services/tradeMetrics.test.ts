import { describe, expect, it } from 'vitest'
import type { MarginCallEvent, TradeEvent } from '@/types/common_strategy_types'
import { exitSignalName, tradeCommission } from './tradeMetrics'

const entry = { trade_id: 1, price: 100, quantity: 10 } as TradeEvent
const exit = { trade_id: 1, price: 120, quantity: 4 } as TradeEvent

describe('trade metrics', () => {
  it('charges entry, every partial liquidation, and only the remaining final exit', () => {
    const calls = [
      { trade_id: 1, price: 90, quantity_liquidated: 4, quantity_remaining: 6 },
      { trade_id: 1, price: 80, quantity_liquidated: 2, quantity_remaining: 4 },
      { trade_id: 2, price: 50, quantity_liquidated: 100, quantity_remaining: 0 },
    ] as MarginCallEvent[]
    expect(tradeCommission(entry, exit, calls, 1)).toBeCloseTo((1000 + 360 + 160 + 480) * 0.01)
  })

  it('uses the full quantity on an ordinary exit and names opposite closes consistently', () => {
    expect(tradeCommission(entry, exit, [], 1)).toBeCloseTo((1000 + 1200) * 0.01)
    expect(exitSignalName('Reversal')).toBe('Close Opposite')
    expect(exitSignalName('Close Opposite')).toBe('Close Opposite')
    expect(exitSignalName('SlTrailing')).toBe('SL Trailing')
    expect(exitSignalName('Tp')).toBe('TP')
  })
})
