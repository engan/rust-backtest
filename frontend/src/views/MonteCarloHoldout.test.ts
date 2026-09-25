import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import MonteCarloView from './MonteCarloView.vue'

const distribution = { minimum: -1000, p05: -500, p50: 300, mean: 300, p95: 1000, maximum: 1500 }

beforeEach(() => sessionStorage.clear())

describe('Monte Carlo final holdout context', () => {
  it.each([
    { holdout: true, median: 300, loss: 0.1, verdict: 'Final holdout did not confirm the setup' },
    { holdout: false, median: -601, loss: 0.65, verdict: 'Unfavorable simulated outcome' },
    { holdout: false, median: 250, loss: 0.44, verdict: 'Substantial simulated loss risk' },
  ])('keeps the assessment consistent: $verdict', async ({ holdout, median, loss, verdict }) => {
    const candidate = { strategy: 'sma_crossover', params: { fast_period: 10, slow_period: 73 } }
    sessionStorage.setItem('selected-research-candidate', JSON.stringify({
      sourceResearchJobId: 'research-1', candidate, description: 'SMA 10 / 73',
      strategy: 'SMA Crossover', fixedCandidateScope: 'research_period',
      dataset: { symbol: 'SOLUSDT', timeframe: '1h' }, initialCapital: 10000,
    }))
    sessionStorage.setItem('monte-carlo-report', JSON.stringify({
      job: { id: 'monte-1' },
      reproducibility: {
        sourceResearchJobId: 'research-1', candidate, fixedCandidateScope: 'research_period',
        holdoutEvidence: holdout ? { jobId: 'holdout-1', trades: 26, pnl: -460, drawdown: 8, profitFactor: 0.8 } : null,
      },
      report: {
        monte_carlo: {
          simulations: 1000, source_trades: 49, probability_of_loss: loss, probability_of_ruin: 0,
          net_profit: { ...distribution, p50: median }, max_drawdown_percent: { ...distribution, p95: 19.6 },
        },
        evidence: { primary: 'walk_forward_oos', minimum_source_trades: 30, walk_forward_windows: 2 },
      },
    }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/monte-carlo', component: MonteCarloView }] })
    await router.push('/monte-carlo')
    await router.isReady()
    const host = defineComponent({ render: () => h(KeepAlive, null, h(MonteCarloView)) })
    const wrapper = mount(host, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await flushPromises()

    if (holdout) expect(wrapper.text()).toContain('Untouched final holdout · 26 trades · -460 USDT')
    expect(wrapper.text()).toContain(verdict)
    expect(wrapper.find('.verdict--warning').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Favorable under these assumptions')
    expect(wrapper.text()).toContain('Selected candidate, research period')
  })
})
