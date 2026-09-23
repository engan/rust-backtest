import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import MonteCarloView from './MonteCarloView.vue'

const distribution = { minimum: -1000, p05: -500, p50: 300, mean: 300, p95: 1000, maximum: 1500 }

beforeEach(() => sessionStorage.clear())

describe('Monte Carlo final holdout context', () => {
  it('does not call a result favorable after a negative untouched holdout', async () => {
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
        holdoutEvidence: { jobId: 'holdout-1', trades: 26, pnl: -460, drawdown: 8, profitFactor: 0.8 },
      },
      report: {
        monte_carlo: {
          simulations: 1000, source_trades: 49, probability_of_loss: 0.1, probability_of_ruin: 0,
          net_profit: distribution, max_drawdown_percent: { ...distribution, p95: 19.6 },
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

    expect(wrapper.text()).toContain('Untouched final holdout · 26 trades · -460 USDT')
    expect(wrapper.text()).toContain('Final holdout did not confirm the setup')
    expect(wrapper.text()).not.toContain('Favorable under these assumptions')
    expect(wrapper.text()).toContain('Selected candidate, research period')
  })
})
