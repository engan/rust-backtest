import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import DashboardView from './DashboardView.vue'
import OptimizeView from './OptimizeView.vue'
import { consumeResearchHandoff, saveResearchHandoff, saveBacktestHandoff } from '@/services/researchHandoff'

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

  it('loads and runs a selected native candidate with the exact frozen market and costs', async () => {
    saveBacktestHandoff({
      strategy: 'emaVwap',
      parameters: { ema_length: 126, ema_source: 'HLC3', vwap_anchor_period: 'Week', vwap_source: 'Low',
        trailing_sl_perc: 2.8, fixed_tp_for_trailing_perc: 6.9, max_drawdown_perc: 12,
        atr_threshold_fl: 1.5, parity_mode: true, behavior_mode: 'Improved' },
      market: { symbol: 'SOLUSDT', timeframe: '1h', dataLimit: 4320, endBeforeUtc: '2026-09-25T10:00' },
      execution: { initialCapital: 12000, commissionPercent: 0.08, slippageTicks: 3, quoteCurrency: 'USDT',
        marginEnforcementEnabled: true, marginLongPercent: 50, marginShortPercent: 25, priceToTick: true },
    })
    const host = defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => h(DashboardView) }) })
    const wrapper = mount(host, { global: { stubs: { RouterLink: true, PnlChart: true, FieldTooltip: true } } })
    await flushPromises()
    expect(mocks.runBacktest).toHaveBeenCalledOnce()
    expect(mocks.runBacktest.mock.calls[0]?.[0]).toMatchObject({
      params: { ema_length: 126, ema_source: 'HLC3', trailing_sl_perc: 2.8, fixed_tp_for_trailing_perc: 6.9, max_drawdown_perc: 12 },
    })
    expect((wrapper.get('#limit').element as HTMLInputElement).value).toBe('4320')
    expect((wrapper.get('#end-before').element as HTMLInputElement).value).toBe('2026-09-25T10:00')
    expect((wrapper.get('#commission').element as HTMLInputElement).value).toBe('0.08')
    expect((wrapper.get('#margin-short').element as HTMLInputElement).value).toBe('25')
    expect(sessionStorage.getItem('research-to-backtest')).toBeNull()
    wrapper.unmount()
  })

  it('shows the received market, execution and base strategy fields in Optimize', async () => {
    saveResearchHandoff({
      strategy: 'emaVwap',
      market: { symbol: 'BTCUSDT', timeframe: '4h', dataLimit: 4321, endBeforeUtc: '2026-08-31T12:00' },
      parameters: {
        ema_length: 137, ema_source: 'Low', vwap_anchor_period: 'Month', trade_direction: 'Short',
        enable_max_drawdown: true, max_drawdown_perc: 9,
        enable_dmi_filter: true, dmi_length: 8, dmi_threshold: 13,
        adx_resume_threshold: 17,
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
    expect(wrapper.text()).toContain('Automatic strategy comparison')
    await wrapper.get('.research-mode-switch button:nth-child(2)').trigger('click')

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
    expect(wrapper.find('input[aria-label="Optimize VWAP Anchor"]').exists()).toBe(true)
    expect(wrapper.find('input[aria-label="Optimize EMA Length"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Fixed at Month')
    expect(wrapper.text()).toContain('Fixed at 9')
    expect(wrapper.text()).toContain('ADX filter')
    expect(wrapper.text()).toContain('Fixed at 17')
    expect(wrapper.find('input[aria-label="Optimize ADX resume at"]').exists()).toBe(true)
    expect(wrapper.find('.research-axis-toggle').exists()).toBe(false)
    await wrapper.get('input[aria-label="Optimize VWAP Anchor"]').setValue(true)
    expect((wrapper.get('input[aria-label="Optimize VWAP Anchor"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('input[aria-label="VWAP Anchor: Month"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('changes the visible exit controls when the SL/TP method changes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/optimize', component: OptimizeView }],
    })
    await router.push('/optimize')
    await router.isReady()
    const wrapper = mount(OptimizeView, { global: { plugins: [router], stubs: { FieldTooltip: true } } })
    await wrapper.get('.research-mode-switch button:nth-child(2)').trigger('click')
    const has = (label: string) => wrapper.find(`input[aria-label="Optimize ${label}"]`).exists()

    expect(has('Trailing SL %')).toBe(true)
    expect(has('Static TP %')).toBe(true)
    expect(has('Fixed SL %')).toBe(false)

    await wrapper.get('#research-stop-method').setValue('Combined')
    expect(has('Fixed SL %')).toBe(true)
    expect(has('Trailing SL %')).toBe(true)

    await wrapper.get('#research-stop-method').setValue('FixedPercent')
    expect(has('Fixed SL %')).toBe(true)
    expect(has('Fixed TP %')).toBe(true)
    expect(has('Trailing SL %')).toBe(false)

    await wrapper.get('#research-stop-method').setValue('RiskBased')
    expect(has('Risk per trade %')).toBe(true)
    expect(has('ATR stop multiplier')).toBe(true)
    expect(has('Reward / risk')).toBe(true)
    expect(has('Fixed SL %')).toBe(false)
    expect(has('ADX resume at')).toBe(true)
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
