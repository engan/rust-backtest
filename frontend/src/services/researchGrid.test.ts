import { describe, expect, it } from 'vitest'
import { numericAxisCount, numericAxisValues } from './researchGrid'

describe('numeric research axes', () => {
  it('expands decimal ranges without drifting past the upper bound', () => {
    expect(numericAxisValues(2, 4, 0.5, 10)).toEqual([2, 2.5, 3, 3.5, 4])
    expect(numericAxisCount(2, 4, 0.5)).toBe(5)
  })

  it('rejects a zero step, reversed bounds, non-finite values and excessive ranges', () => {
    expect(numericAxisCount(2, 4, 0)).toBe(0)
    expect(numericAxisCount(4, 2, 1)).toBe(0)
    expect(numericAxisCount(1, Infinity, 1)).toBe(0)
    expect(() => numericAxisValues(2, 4, 0, 100)).toThrow(/positive step/)
    expect(() => numericAxisValues(1, 100, 1, 10)).toThrow(/safety limit/)
  })
})
