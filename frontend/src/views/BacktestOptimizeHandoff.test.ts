import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import DashboardView from './DashboardView.vue'
import OptimizeView from './OptimizeView.vue'
import { consumeResearchHandoff, saveResearchHandoff } from '@/services/researchHandoff'

const mocks = vi.hoisted(() => ({
  runBacktest: vi.fn(),
  fetchSymbolFilters: vi.fn(),
}))

vi.mock('@/composables/useBacktest', () => ({
  useBacktest: () => ({
    isLoading: ref(false),
    runSmaCrossoverBacktest: mocks.runBacktest,
    runEmaVwapBacktest: mocks.runBacktest,
  }),
}))
vi.mock('@/services/binanceAPI', () => ({
  fetchSymbolFilters: mocks.fetchSymbolFilters,
  fetchBinanceKlines: vi.fn(),
}))

const result = {
  trade_log: [], equity_curve: [], pnl_curve: [], bar_log: [],
  summary: {
    equity_final: 10000, pnl_total: 0, max_drawdown_percent: 0,
    profit_factor: 0, total_trades: 0, profitable_trades: 0,
    max_drawdown_amount: 0, net_profit: 0, pnl_open: 0,
  },
}

beforeEach(() => {
  sessionStorage.clear()
  mocks.runBacktest.mockResolvedValue(result)
  mocks.fetchSymbolFilters.mockResolvedValue({ tickSize: 0.01, stepSize: 0.001 })
})
afterEach(() => vi.clearAllMocks())

describe('Open in Optimize', () => {
  it('transfers every current Backtest field after an older run', async () => {
    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          RouterLink: { template: '<a @click="$emit(\'click\')"><slot /></a>' },
          PnlChart: true,
          FieldTooltip: true,
        },
      },
    })

    await wrapper.get('.backtest-run-button').trigger('click')
    await flushPromises()
    expect(mocks.runBacktest).toHaveBeenCalledOnce()

    await wrapper.get('#strategy').setValue('emaVwap')
    await wrapper.get('#symbol').setValue('BTCUSDT')
    await wrapper.get('#timeframe').setValue('4h')
    await wrapper.get('#limit').setValue('4321')
    await wrapper.get('#end-before').setValue('2026-08-31T12:00')
    await wrapper.get('#trade-direction').setValue('Short')
    await wrapper.get('#ema_length').setValue('137')
    await wrapper.get('#ema_source').setValue('Low')
    await wrapper.get('#vwap_anchor').setValue('Month')
    await wrapper.get('#vwap_source').setValue('Close')
    await wrapper.get('#trailing-sl').setValue('3.5')
    await wrapper.get('input[aria-label="Maximum drawdown percent"]').setValue('9')
    await wrapper.get('#initial-capital').setValue('25000')
    await wrapper.get('#commission').setValue('0.08')
    await wrapper.get('#slippage').setValue('3')
    await wrapper.get('#enforce-margin').setValue(true)
    await wrapper.get('#margin-long').setValue('50')
    await wrapper.get('#margin-short').setValue('25')
    await wrapper.get('.open-optimize-link').trigger('click')

    const handoff = consumeResearchHandoff()
    expect(handoff?.strategy).toBe('emaVwap')
    expect(handoff?.market).toEqual({
      symbol: 'BTCUSDT', timeframe: '4h', dataLimit: 4321,
      endBeforeUtc: '2026-08-31T12:00',
    })
    expect(handoff?.parameters).toMatchObject({
      trade_direction: 'Short', ema_length: 137, ema_source: 'Low',
      vwap_anchor_period: 'Month', vwap_source: 'Close',
      trailing_sl_perc: 3.5, max_drawdown_perc: 9,
    })
    expect(handoff?.execution).toMatchObject({
      initialCapital: 25000, commissionPercent: 0.08, slippageTicks: 3,
      marginEnforcementEnabled: true, marginLongPercent: 50,
      marginShortPercent: 25, priceToTick: false,
    })
    wrapper.unmount()
  })

  it('shows the received market, execution and base strategy fields in Optimize', async () => {
    saveResearchHandoff({
      strategy: 'emaVwap',
      market: { symbol: 'BTCUSDT', timeframe: '4h', dataLimit: 4321, endBeforeUtc: '2026-08-31T12:00' },
      parameters: {
        ema_length: 137, ema_source: 'Low', trade_direction: 'Short',
        enable_max_drawdown: true, max_drawdown_perc: 9,
      },
      execution: {
        initialCapital: 25000, commissionPercent: 0.08, slippageTicks: 3,
        quoteCurrency: 'USDT', marginEnforcementEnabled: true,
        marginLongPercent: 50, marginShortPercent: 25, priceToTick: true,
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/optimize', component: OptimizeView }],
    })
    await router.push('/optimize')
    await router.isReady()
    const host = defineComponent({
      setup: () => () => h(KeepAlive, null, { default: () => h(OptimizeView) }),
    })
    const wrapper = mount(host, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await flushPromises()

    expect((wrapper.get('#research-strategy').element as HTMLSelectElement).value).toBe('EMA / VWAP')
    expect((wrapper.get('#research-symbol').element as HTMLInputElement).value).toBe('BTCUSDT')
    expect((wrapper.get('#research-timeframe').element as HTMLSelectElement).value).toBe('4h')
    expect((wrapper.get('#research-bars').element as HTMLInputElement).value).toBe('4321')
    expect((wrapper.get('#research-cutoff').element as HTMLInputElement).value).toBe('2026-08-31T12:00')
    expect((wrapper.get('#research-capital').element as HTMLInputElement).value).toBe('25000')
    expect((wrapper.get('#research-commission').element as HTMLInputElement).value).toBe('0.08')
    expect((wrapper.get('#research-slippage').element as HTMLInputElement).value).toBe('3')
    expect((wrapper.get('#research-margin').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('#research-long-margin').element as HTMLInputElement).value).toBe('50')
    expect((wrapper.get('#research-short-margin').element as HTMLInputElement).value).toBe('25')
    expect((wrapper.get('#research-round-tick').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.base-settings-details').text()).toContain('max drawdown perc')
    expect(wrapper.get('.base-settings-details').text()).toContain('Current Backtest form')
    expect(wrapper.find('input[aria-label="Optimize VWAP Anchor"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="Optimize EMA Length"]').exists()).toBe(true)
    await wrapper.get('.research-axis-toggle').trigger('click')
    await wrapper.get('input[aria-label="Optimize VWAP Anchor"]').setValue(true)
    await wrapper.get('.research-axis-toggle').trigger('click')
    expect((wrapper.get('input[aria-label="Optimize VWAP Anchor"]').element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('restores requested candles separately from the actual report bar count', async () => {
    sessionStorage.setItem('research-report', JSON.stringify({
      reproducibility: {
        dataset: { symbol: 'BTCUSDT', timeframe: '4h', endBeforeUtc: null, requestedBars: 4321 },
        fingerprint: { bars: 4000 },
        parameterGrid: { base: { strategy: 'ema_vwap', params: { ema_length: 137 } }, axes: [] },
      },
      report: {
        optimization: {
          evaluations: [{ candidate_index: 0, parameters: { params: { ema_length: 137 } }, summary: {} }],
        },
      },
    }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/optimize', component: OptimizeView }],
    })
    await router.push('/optimize')
    await router.isReady()
    const host = defineComponent({
      setup: () => () => h(KeepAlive, null, { default: () => h(OptimizeView) }),
    })
    const wrapper = mount(host, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await flushPromises()
    expect((wrapper.get('#research-bars').element as HTMLInputElement).value).toBe('4321')
    wrapper.unmount()
  })
})
