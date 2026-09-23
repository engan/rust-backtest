import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OptimizeView from './OptimizeView.vue'

const mocks = vi.hoisted(() => ({
  createResearchJob: vi.fn(),
  createMonteCarloJob: vi.fn(),
  getResearchReport: vi.fn(),
  waitForResearchJob: vi.fn(),
  fetchBinanceKlines: vi.fn(),
  fetchSymbolFilters: vi.fn(),
}))

vi.mock('@/services/researchAPI', () => ({
  createResearchJob: mocks.createResearchJob,
  createMonteCarloJob: mocks.createMonteCarloJob,
  getResearchReport: mocks.getResearchReport,
  waitForResearchJob: mocks.waitForResearchJob,
  researchServerHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
  downloadResearchReport: vi.fn(),
  unwrapResearchReport: (value: { report?: unknown }) => value.report ?? value,
}))
vi.mock('@/services/binanceAPI', () => ({
  fetchBinanceKlines: mocks.fetchBinanceKlines,
  fetchSymbolFilters: mocks.fetchSymbolFilters,
}))

const evidence: Record<string, { pnl: number; trades: number; dd: number; wins: number }> = {
  RiskBased: { pnl: 300, trades: 40, dd: 12, wins: 2 },
  FixedPercent: { pnl: 1000, trades: 55, dd: 10, wins: 3 },
  TrailingPercent: { pnl: 800, trades: 45, dd: 12, wins: 2 },
  Combined: { pnl: 4000, trades: 10, dd: 30, wins: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mocks.fetchBinanceKlines.mockResolvedValue(Array.from({ length: 1000 }, () => ({})))
  mocks.fetchSymbolFilters.mockResolvedValue({ tickSize: 0.01, stepSize: 0.001 })
  mocks.createResearchJob.mockImplementation(async (request) => ({
    id: request.parameterGrid ? `research-${request.parameterGrid.base.params.sl_tp_method}` : 'holdout',
    status: 'queued', stage: 'queued', completed: 0, total: 0, percent: 0, message: 'Queued', createdAt: '',
  }))
  mocks.createMonteCarloJob.mockResolvedValue({
    id: 'monte', status: 'queued', stage: 'queued', completed: 0, total: 0, percent: 0, message: 'Queued', createdAt: '',
  })
  mocks.waitForResearchJob.mockImplementation(async (id) => ({
    id, status: 'completed', stage: 'complete', completed: 1, total: 1, percent: 100, message: 'Complete', createdAt: '',
  }))
  mocks.getResearchReport.mockImplementation(async (id) => {
    if (id === 'holdout') return { job: { id }, report: { optimization: { evaluations: [{ summary: { net_profit: -200, total_trades: 4, max_drawdown_percent: 4, profit_factor: 0.8 } }] } } }
    if (id === 'monte') return { job: { id }, report: { monte_carlo: { source_trades: 52, probability_of_loss: 0.1, net_profit: { p05: -100 }, max_drawdown_percent: { p95: 15 } } } }
    const method = String(id).replace('research-', '')
    const request = mocks.createResearchJob.mock.calls.find(([value]) => value.parameterGrid.base.params.sl_tp_method === method)?.[0]
    const result = evidence[method]!
    return {
      job: { id },
      reproducibility: { parameterGrid: request.parameterGrid, dataset: request.dataset, initialCapital: 10000 },
      report: {
        optimization: { evaluations: [{ candidate_index: 0, parameters: request.parameterGrid.base, rejection_reasons: [], summary: { net_profit: result.pnl, total_trades: 50, max_drawdown_percent: result.dd, profit_factor: 1.5 } }] },
        final_selection: { seed_candidate_index: 0, selected_parameters: request.parameterGrid.base, summary: { net_profit: result.pnl, total_trades: 50, max_drawdown_percent: result.dd, profit_factor: 1.5 }, evaluated_candidates: 40 },
        walk_forward: {
          compounded_out_of_sample_net_profit: result.pnl,
          total_validation_trades: result.trades,
          worst_validation_drawdown_percent: result.dd,
          profitable_windows: result.wins,
          windows: [0, 1, 2, 3].map((window_index) => ({ window_index, selected_candidate_index: 0, validation_summary: { pnl_total: result.pnl / 4, total_trades: result.trades / 4 }, validation_closed_trade_pnls: Array.from({ length: Math.floor(result.trades / 4) }, () => result.pnl / result.trades) })),
        },
      },
    }
  })
})

describe('one-click automatic optimization', () => {
  it('runs all four methods on shared data and selects the eligible OOS leader', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/optimize', component: OptimizeView }] })
    await router.push('/optimize')
    await router.isReady()
    const wrapper = mount(OptimizeView, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await wrapper.get('#train-days').setValue('8')
    await wrapper.get('#validate-days').setValue('7')
    await wrapper.get('#step-days').setValue('7')
    await wrapper.get('.research-column:nth-child(2) button.research-primary').trigger('click')
    await flushPromises()

    expect(mocks.fetchBinanceKlines).toHaveBeenCalledOnce()
    expect(mocks.createResearchJob).toHaveBeenCalledTimes(5)
    const requests = mocks.createResearchJob.mock.calls.slice(0, 4).map(([request]) => request)
    expect(requests.map((request) => request.parameterGrid.base.params.sl_tp_method))
      .toEqual(['RiskBased', 'FixedPercent', 'TrailingPercent', 'Combined'])
    expect(requests.every((request) => request.klines === requests[0].klines && request.config.commission_percent === 0.05)).toBe(true)
    expect(requests[0].klines).toHaveLength(832)
    expect(mocks.createResearchJob.mock.calls[4]?.[0].klines).toHaveLength(168)
    expect(mocks.createMonteCarloJob).toHaveBeenCalledOnce()
    expect(mocks.createMonteCarloJob.mock.calls[0]?.[0].sourceResearchJobId).toBe('research-FixedPercent')
    expect(mocks.createMonteCarloJob.mock.calls[0]?.[0].fixedCandidateScope).toBe('research_period')
    expect(mocks.createMonteCarloJob.mock.calls[0]?.[0].holdoutEvidence)
      .toMatchObject({ jobId: 'holdout', trades: 4, pnl: -200 })
    expect(wrapper.get('.auto-results-table').text()).toContain('Fixed %')
    expect(wrapper.get('.auto-results-table').text()).toContain('Combined')
    expect(wrapper.text()).toContain('Provisional leader: Fixed %')
    expect(wrapper.text()).toContain('Untouched final period')
    expect(wrapper.text()).toContain('Holdout needs review')
    expect(wrapper.text()).toContain('small sample cannot establish robustness')
    expect((wrapper.get('#candidate-limit').element as HTMLInputElement).value).toBe('100000')
    expect(JSON.parse(sessionStorage.getItem('selected-research-candidate') ?? '{}').sourceResearchJobId)
      .toBe('research-FixedPercent')
    expect(JSON.parse(sessionStorage.getItem('selected-research-candidate') ?? '{}').fixedCandidateScope)
      .toBe('research_period')
    wrapper.unmount()

    const restored = mount(OptimizeView, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await flushPromises()
    expect(restored.text()).toContain('Holdout needs review')
    expect(restored.text()).toContain('Untouched final period')
    restored.unmount()
  })

  it('explains a too-short validation window before submitting any jobs', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/optimize', component: OptimizeView }] })
    await router.push('/optimize')
    await router.isReady()
    const wrapper = mount(OptimizeView, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await wrapper.get('#train-days').setValue('8')
    await wrapper.get('#validate-days').setValue('1')
    await wrapper.get('#step-days').setValue('1')
    await wrapper.get('.research-column:nth-child(2) button.research-primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('must exceed the largest refined-candidate warmup')
    expect(mocks.createResearchJob).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows per-method failures even when none produces a report', async () => {
    mocks.createResearchJob.mockRejectedValue(new Error('Native failure'))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/optimize', component: OptimizeView }] })
    await router.push('/optimize')
    await router.isReady()
    const wrapper = mount(OptimizeView, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await wrapper.get('#train-days').setValue('8')
    await wrapper.get('#validate-days').setValue('7')
    await wrapper.get('#step-days').setValue('7')
    await wrapper.get('.research-column:nth-child(2) button.research-primary').trigger('click')
    await flushPromises()

    expect(mocks.createResearchJob).toHaveBeenCalledTimes(4)
    expect(wrapper.text()).toContain('Risk-based failed: Native failure')
    expect(wrapper.text()).toContain('Combined failed: Native failure')
    wrapper.unmount()
  })
})
