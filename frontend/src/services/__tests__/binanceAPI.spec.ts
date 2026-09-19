import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBinanceKlines } from '../binanceAPI'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const rawBar = (timestamp: number) => [timestamp, '100', '101', '99', '100', '1']

describe('fixed backtest window', () => {
  it('keeps an exclusive cutoff while paginating backwards', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [rawBar(3000), rawBar(4000)] })
      .mockResolvedValueOnce({ ok: true, json: async () => [rawBar(2000)] })
    vi.stubGlobal('fetch', fetch)
    const pending = fetchBinanceKlines('SOLUSDT', '1h', 3, 5000)
    await vi.runAllTimersAsync()
    const result = await pending
    expect(fetch.mock.calls[0]?.[0]).toContain('endTime=4999')
    expect(fetch.mock.calls[1]?.[0]).toContain('endTime=2999')
    expect(result.map(bar => bar.timestamp)).toEqual([2000, 3000, 4000])
  })

  it('still requests the latest bars when no cutoff is supplied', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [rawBar(4000)] })
    vi.stubGlobal('fetch', fetch)
    await fetchBinanceKlines('SOLUSDT', '1h', 1)
    expect(fetch.mock.calls[0]?.[0]).not.toContain('endTime')
  })

  it('rejects an invalid cutoff before sending a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchBinanceKlines('SOLUSDT', '1h', 1, NaN)).rejects.toThrow('Invalid')
    expect(fetch).not.toHaveBeenCalled()
  })
})
