import { afterEach, describe, expect, it, vi } from 'vitest'
import { researchServerHealth } from './researchAPI'

afterEach(() => vi.unstubAllGlobals())

describe('research service responses', () => {
  it('reports a stopped proxy without a JSON parse exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    await expect(researchServerHealth()).rejects.toThrow('Research service returned HTTP 500')
  })

  it('rejects an invalid successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 200 })))
    await expect(researchServerHealth()).rejects.toThrow('empty or invalid response')
  })
})
