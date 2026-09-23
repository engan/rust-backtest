<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FieldTooltip from '@/components/FieldTooltip.vue'
import { consumeResearchHandoff } from '@/services/researchHandoff'
import { createResearchAxes, includesCurrentValue, toggleResearchChoice, type ResearchAxis, type ValueResearchAxis } from '@/services/researchAxes'
import { numericAxisCount, numericAxisValues } from '@/services/researchGrid'
import { fetchBinanceKlines, fetchSymbolFilters } from '@/services/binanceAPI'
import {
  createResearchJob,
  downloadResearchReport,
  getResearchReport,
  researchServerHealth,
  unwrapResearchReport,
  waitForResearchJob,
  type ResearchJobSnapshot,
} from '@/services/researchAPI'

type CandidateRow = {
  rank: number
  candidateIndex: number
  label: string
  netProfit: number
  drawdown: number
  profitFactor: number
  eligible: boolean
  fullDatasetTrades: number
  selectedWindows: number
  selectedOosPnl: number
  selectedClosedOosPnl?: number
  selectedOosTrades: number
  parameters: Record<string, unknown>
}

type OptimizationReport = {
  optimization?: {
    evaluations?: Array<{
      candidate_index?: number
      parameters?: { params?: Record<string, unknown> } & Record<string, unknown>
      rejection_reasons?: string[]
      summary?: {
        net_profit?: number
        max_drawdown_percent?: number
        profit_factor?: number
        total_trades?: number
      }
    }>
  }
  walk_forward?: {
    total_validation_trades?: number
    compounded_out_of_sample_net_profit?: number
    profitable_windows?: number
    windows?: Array<{
      window_index?: number
      training_start?: number
      training_end_exclusive?: number
      validation_start?: number
      validation_end_exclusive?: number
      selected_candidate_index?: number
      selected_parameters?: { params?: Record<string, unknown> }
      training_summary?: { pnl_total?: number; total_trades?: number }
      validation_summary?: { pnl_total?: number; total_trades?: number; max_drawdown_percent?: number }
      validation_closed_trade_pnls?: number[]
    }>
  }
}

type ResearchEnvelope = {
  job?: { id?: string; createdAt?: string }
  reproducibility?: {
    dataset?: { symbol?: string; timeframe?: string; endBeforeUtc?: string | null; requestedBars?: number }
    fingerprint?: { bars?: number }
    parameterGrid?: {
      base?: { strategy?: string; params?: Record<string, unknown> }
      axes?: Array<{ parameter?: string; values?: unknown[] }>
      max_candidates?: number
    }
    config?: {
      commission_percent?: number
      slippage_ticks?: number
      enforce_margin?: boolean
      margin_long_percent?: number
      margin_short_percent?: number
    }
    initialCapital?: number
    flags?: { price_to_tick?: boolean }
    plan?: {
      optimization?: { min_trades?: number; max_drawdown_percent?: number; min_profit_factor?: number }
      walk_forward_optimization?: { min_trades?: number }
      walk_forward?: { training_bars?: number; validation_bars?: number; step_bars?: number; anchored_training?: boolean }
    }
  }
  report?: OptimizationReport
}

const router = useRouter()
const reportInput = ref<HTMLInputElement | null>(null)
const reportLabel = ref('Not run')
const reportMessage = ref('')
const selectedRank = ref(1)
const activeJob = ref<ResearchJobSnapshot | null>(null)
const activeReport = ref<ResearchEnvelope | null>(null)
const isRunning = ref(false)
const baseSettingsSource = ref('Optimize defaults')

const setup = reactive({
  strategy: 'EMA / VWAP',
  symbol: 'SOLUSDT',
  timeframe: '1h',
  dataset: 15095,
  endBefore: '2026-09-22T00:00',
  maxCandidates: 100000,
})

const execution = reactive({
  initialCapital: 10000,
  commissionPercent: 0.05,
  slippageTicks: 2,
  enforceMargin: false,
  marginLongPercent: 100,
  marginShortPercent: 100,
  priceToTick: false,
})

const validation = reactive({
  method: 'Rolling walk-forward',
  trainDays: 180,
  validateDays: 60,
  stepDays: 60,
  minimumTrades: 30,
  trainingMinimumTrades: 5,
  maximumDrawdown: 25,
  minimumProfitFactor: 1,
})

const axisHelp: Record<string, string> = {
  ema_length: 'EMA lengths to test. The imported Backtest value is always in the suggested range.',
  ema_source: 'Choose which EMA price sources to test, including HLC3.',
  vwap_anchor_period: 'Choose VWAP reset periods to compare.',
  vwap_source: 'Choose VWAP price sources to compare.',
  fashionably_late_mode: 'Choose which Fashionably Late entry modes to compare.',
  trailing_sl_percent: 'Trailing stop percentages for the selected SL/TP method.',
  static_tp_percent: 'Take-profit percentages paired with the trailing or combined stop.',
  dmi_threshold: 'The highest ADX pause value must not exceed the lowest ADX resume value.',
  adx_resume_threshold: 'ADX must reach this value before entries can resume. Keep it at or above every tested pause value.',
}

const axes = reactive<ResearchAxis[]>([])
const replaceAxes = () => axes.splice(0, axes.length, ...createResearchAxes(setup.strategy, baseParams.value))
const stopMethod = computed({
  get: () => String(baseParams.value.sl_tp_method ?? 'TrailingPercent'),
  set: (method: string) => {
    baseParams.value = { ...baseParams.value, sl_tp_method: method }
    baseSettingsSource.value = 'Edited in Optimize'
    replaceAxes()
    candidates.value = []
    activeReport.value = null
    reportLabel.value = 'Not run'
  },
})
const changeAxisChoice = (axis: ValueResearchAxis, choice: string, event: Event) => {
  toggleResearchChoice(axis, choice, (event.target as HTMLInputElement).checked)
}
const candidates = ref<CandidateRow[]>([])
const selectedCandidateRow = computed(() => candidates.value.find((candidate) => candidate.rank === selectedRank.value))
const walkForwardClosedPnl = computed(() => {
  const windows = activeReport.value?.report?.walk_forward?.windows
  if (!windows?.length || windows.some((window) => !Array.isArray(window.validation_closed_trade_pnls))) return null
  return windows.flatMap((window) => window.validation_closed_trade_pnls ?? []).reduce((sum, pnl) => sum + pnl, 0)
})
const singleCandidateSearch = computed(() => {
  const axes = activeReport.value?.reproducibility?.parameterGrid?.axes
  return Array.isArray(axes) && axes.reduce((count, axis) => count * (axis.values?.length ?? 0), 1) === 1
})

watch(
  () => setup.strategy,
  (strategy) => {
    baseParams.value = defaultParamsForStrategy(strategy)
    replaceAxes()
    baseSettingsSource.value = 'Optimize defaults'
    candidates.value = []
    activeReport.value = null
    reportLabel.value = 'Not run'
  },
  { flush: 'sync' },
)

const axisCount = (axis: ResearchAxis): number => {
  if (!axis.enabled) return 1
  if (axis.type === 'values') return axis.values.length
  return numericAxisCount(axis.min, axis.max, axis.step)
}

const candidateCount = computed(() =>
  axes.reduce((total, axis) => total * axisCount(axis), 1),
)
const enabledAxesCount = computed(() => axes.filter((axis) => axis.enabled).length)
const excludedCurrentAxes = computed(() => axes.filter((axis) => !includesCurrentValue(axis)).map((axis) => axis.label))
const invalidWholeNumberAxis = computed(() => axes.find((axis) => axis.enabled && axis.type === 'numeric'
  && axis.wholeNumbers && (![axis.min, axis.max, axis.step].every(Number.isSafeInteger))))

const estimatedSeconds = computed(() => Math.max(1, Math.ceil(candidateCount.value / 125)))

const candidatePoints = computed(() => {
  if (!candidates.value.length) return []
  const maxDrawdown = Math.max(...candidates.value.map((candidate) => candidate.drawdown), 1)
  const profits = candidates.value.map((candidate) => candidate.netProfit)
  const minProfit = Math.min(...profits)
  const maxProfit = Math.max(...profits)
  const profitRange = Math.max(maxProfit - minProfit, 1)
  return candidates.value.map((candidate) => ({
    ...candidate,
    x: 55 + (candidate.drawdown / maxDrawdown) * 480,
    y: 215 - ((candidate.netProfit - minProfit) / profitRange) * 190,
  }))
})

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

const selectCandidate = (rank: number) => {
  selectedRank.value = rank
  cacheSelectedCandidate()
}

const describeParameters = (parameters: Record<string, unknown>): string => {
  const signal = 'fast_period' in parameters
    ? `SMA ${parameters.fast_period}/${parameters.slow_period}`
    : `EMA ${parameters.ema_length}, ${parameters.ema_source} · VWAP ${parameters.vwap_anchor_period}/${parameters.vwap_source}`
  const method = parameters.sl_tp_method
  const exit = method === 'RiskBased'
    ? `ATR×${parameters.atr_mult_rb} · R/R ${parameters.reward_mult_rb}`
    : method === 'FixedPercent'
      ? `Fixed SL ${parameters.fixed_sl_perc}% · TP ${parameters.fixed_tp_perc}%`
      : method === 'Combined'
        ? `Combined ${parameters.fixed_sl_perc}%/${parameters.trailing_sl_perc}% · TP ${parameters.fixed_tp_for_trailing_perc}%`
        : `Trailing SL ${parameters.trailing_sl_perc}% · TP ${parameters.fixed_tp_for_trailing_perc}%`
  return `${signal} · ${exit}`
}

const applyReport = (value: unknown, label: string) => {
  const envelope = value as ResearchEnvelope
  const report = unwrapResearchReport<OptimizationReport>(value)
  const evaluations = report.optimization?.evaluations
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    throw new Error('The file does not contain optimization.evaluations.')
  }
  const definition = envelope.reproducibility
  if (definition) {
    setup.strategy = definition.parameterGrid?.base?.strategy === 'sma_crossover'
      ? 'SMA Crossover' : 'EMA / VWAP'
  }
  const windows = report.walk_forward?.windows ?? []
  candidates.value = evaluations.slice(0, 10).map((evaluation, index) => {
    const parameters = evaluation.parameters?.params ?? {}
    const candidateIndex = evaluation.candidate_index ?? index
    const selectedWindows = windows.filter((window) => window.selected_candidate_index === candidateIndex)
    return {
      rank: index + 1,
      candidateIndex,
      label: describeParameters(parameters),
      netProfit: evaluation.summary?.net_profit ?? 0,
      drawdown: evaluation.summary?.max_drawdown_percent ?? 0,
      profitFactor: evaluation.summary?.profit_factor ?? 0,
      eligible: (evaluation.rejection_reasons?.length ?? 0) === 0,
      fullDatasetTrades: evaluation.summary?.total_trades ?? 0,
      selectedWindows: selectedWindows.length,
      selectedOosPnl: selectedWindows.reduce((sum, window) => sum + (window.validation_summary?.pnl_total ?? 0), 0),
      selectedClosedOosPnl: selectedWindows.every((window) => Array.isArray(window.validation_closed_trade_pnls))
        ? selectedWindows.flatMap((window) => window.validation_closed_trade_pnls ?? []).reduce((sum, pnl) => sum + pnl, 0)
        : undefined,
      selectedOosTrades: selectedWindows.reduce((sum, window) => sum + (window.validation_summary?.total_trades ?? 0), 0),
      parameters: evaluation.parameters ?? {},
    }
  })
  selectedRank.value = candidates.value.find((candidate) => candidate.eligible)?.rank ?? 1
  activeReport.value = 'report' in envelope ? envelope : ({ report } as ResearchEnvelope)
  if (definition) {
    setup.symbol = definition.dataset?.symbol ?? setup.symbol
    setup.timeframe = definition.dataset?.timeframe ?? setup.timeframe
    setup.endBefore = definition.dataset?.endBeforeUtc?.replace(/:00Z$/, '') ?? setup.endBefore
    setup.dataset = definition.dataset?.requestedBars ?? definition.fingerprint?.bars ?? setup.dataset
    setup.maxCandidates = definition.parameterGrid?.max_candidates ?? setup.maxCandidates
    baseParams.value = definition.parameterGrid?.base?.params
      ? { ...definition.parameterGrid.base.params }
      : defaultParamsForStrategy(setup.strategy)
    replaceAxes()
    baseSettingsSource.value = label
    execution.initialCapital = definition.initialCapital ?? execution.initialCapital
    execution.commissionPercent = definition.config?.commission_percent ?? execution.commissionPercent
    execution.slippageTicks = definition.config?.slippage_ticks ?? execution.slippageTicks
    execution.enforceMargin = definition.config?.enforce_margin ?? execution.enforceMargin
    execution.marginLongPercent = definition.config?.margin_long_percent ?? execution.marginLongPercent
    execution.marginShortPercent = definition.config?.margin_short_percent ?? execution.marginShortPercent
    execution.priceToTick = definition.flags?.price_to_tick ?? execution.priceToTick
    const gridAxes = definition.parameterGrid?.axes ?? []
    for (const axis of axes) {
      const saved = gridAxes.find((candidate) => candidate.parameter === axis.id)
      axis.enabled = Boolean(saved)
      if (!saved?.values?.length) continue
      if (axis.type === 'values') {
        axis.values = saved.values.map(String)
      } else {
        const values = saved.values.map(Number).filter(Number.isFinite)
        if (values.length) {
          axis.min = Math.min(...values)
          axis.max = Math.max(...values)
          axis.step = values.length > 1 ? values[1] - values[0] : axis.step
        }
      }
    }
    const optimization = definition.plan?.optimization
    validation.minimumTrades = optimization?.min_trades ?? validation.minimumTrades
    validation.trainingMinimumTrades = definition.plan?.walk_forward_optimization?.min_trades ?? validation.trainingMinimumTrades
    validation.maximumDrawdown = optimization?.max_drawdown_percent ?? validation.maximumDrawdown
    validation.minimumProfitFactor = optimization?.min_profit_factor ?? validation.minimumProfitFactor
    const walkForward = definition.plan?.walk_forward
    const barsPerDay = 1440 / intervalMinutes.value
    if (walkForward) {
      validation.trainDays = Math.round((walkForward.training_bars ?? 0) / barsPerDay)
      validation.validateDays = Math.round((walkForward.validation_bars ?? 0) / barsPerDay)
      validation.stepDays = Math.round((walkForward.step_bars ?? 0) / barsPerDay)
      validation.method = walkForward.anchored_training ? 'Anchored walk-forward' : 'Rolling walk-forward'
    }
  }
  activeJob.value = envelope.job?.id
    ? {
        id: envelope.job.id,
        kind: 'optimization',
        status: 'completed',
        stage: 'complete',
        completed: evaluations.length,
        total: evaluations.length,
        percent: 100,
        message: 'Loaded saved research report',
        createdAt: envelope.job.createdAt ?? '',
        reportUrl: null,
        error: null,
      }
    : activeJob.value
  reportLabel.value = label
  cacheSelectedCandidate()
}

const cacheSelectedCandidate = () => {
  const selected = candidates.value.find((candidate) => candidate.rank === selectedRank.value)
  if (!selected || !activeReport.value) return
  sessionStorage.setItem(
    'selected-research-candidate',
    JSON.stringify({
      sourceResearchJobId: activeReport.value.job?.id,
      candidate: selected.parameters,
      description: selected.label,
      strategy: setup.strategy,
      dataset: { symbol: setup.symbol, timeframe: setup.timeframe, endBeforeUtc: setup.endBefore || null },
      initialCapital: activeReport.value.reproducibility?.initialCapital ?? execution.initialCapital,
      evidencePreview: {
        fullDatasetTrades: selected.fullDatasetTrades,
        outOfSampleTrades: activeReport.value.report?.walk_forward?.total_validation_trades ?? 0,
        walkForwardWindows: activeReport.value.report?.walk_forward?.windows?.length ?? 0,
        selectedWindows: selected.selectedWindows,
      },
    }),
  )
}

const cacheResearchReport = (value: unknown) => {
  const envelope = value as ResearchEnvelope
  const report = unwrapResearchReport<OptimizationReport>(value)
  const compactEnvelope: ResearchEnvelope = {
    ...envelope,
    report: {
      optimization: {
        ...report.optimization,
        evaluations: report.optimization?.evaluations?.slice(0, 10),
      },
      walk_forward: report.walk_forward
        ? {
            total_validation_trades: report.walk_forward.total_validation_trades,
            compounded_out_of_sample_net_profit: report.walk_forward.compounded_out_of_sample_net_profit,
            profitable_windows: report.walk_forward.profitable_windows,
            windows: report.walk_forward.windows?.map((window) => ({
              window_index: window.window_index,
              training_start: window.training_start,
              training_end_exclusive: window.training_end_exclusive,
              validation_start: window.validation_start,
              validation_end_exclusive: window.validation_end_exclusive,
              selected_candidate_index: window.selected_candidate_index,
              selected_parameters: window.selected_parameters,
              training_summary: window.training_summary,
              validation_summary: window.validation_summary,
              validation_closed_trade_pnls: window.validation_closed_trade_pnls,
            })),
          }
        : undefined,
    },
  }
  const serialized = JSON.stringify(compactEnvelope)
  try {
    sessionStorage.setItem('research-report', serialized)
  } catch {
    sessionStorage.removeItem('research-report')
    try {
      sessionStorage.setItem('research-report', serialized)
    } catch {
      // The native report remains available for export and on disk even if browser caching is unavailable.
    }
  }
}

const openReportPicker = () => reportInput.value?.click()

const importReport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    applyReport(parsed, 'Imported report')
    reportMessage.value = `${file.name} loaded successfully.`
    cacheResearchReport(parsed)
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Could not read the report.'
  } finally {
    input.value = ''
  }
}

const valuesForAxis = (axis: ResearchAxis): unknown[] => {
  if (axis.type === 'values') return axis.values
  return numericAxisValues(axis.min, axis.max, axis.step, setup.maxCandidates)
}

const baseCommon = () => ({
  behavior_mode: 'Improved', atr_threshold_percent: false, atr_threshold_fl_percent: 1,
  reset_fl_on_opposite: true, fl_expiry_bars: 48, cooldown_bars: 48,
  adx_resume_threshold: 16, adx_resume_bars: 3, order_size_mode: 'percentOfEquity',
  order_size_value: 100, sl_tp_method: 'TrailingPercent', fixed_sl_perc: 1,
  fixed_tp_perc: 2, trailing_sl_perc: 3, fixed_tp_for_trailing_perc: 5,
  atr_length: 14, risk_perc: 1, risk_gearing: 1, atr_mult_rb: 1.5,
  reward_mult_rb: 2, close_on_opposite: true, parity_mode: true,
  fashionably_late_mode: 'Atr', atr_threshold_fl: 1.3, enable_max_drawdown: true,
  max_drawdown_perc: 22, enable_max_consecutive_losses: true,
  max_consecutive_losses: 5, enable_dmi_filter: true, dmi_length: 6,
  dmi_smoothing: 24, dmi_threshold: 14.05,
})

const defaultParamsForStrategy = (strategy: string): Record<string, unknown> => ({
  ...baseCommon(),
  ...(strategy === 'EMA / VWAP'
    ? { ema_length: 122, ema_source: 'High', vwap_anchor_period: 'Week', vwap_source: 'Open', trade_direction: 'Long' }
    : { fast_period: 10, slow_period: 73, trade_direction: 'Both' }),
})
const baseParams = ref<Record<string, unknown>>(defaultParamsForStrategy(setup.strategy))
axes.push(...createResearchAxes(setup.strategy, baseParams.value))
const baseParameterEntries = computed(() => Object.entries(baseParams.value).sort(([left], [right]) => left.localeCompare(right)))
const formatBaseValue = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value ?? '—')
}
const choiceLabel = (value: string): string => ({
  OnClose: 'On Close', OnHighLow: 'On High/Low', Atr: 'ATR', HLC3: 'HLC3',
}[value] ?? value)

const intervalMinutes = computed(() => {
  const match = /^(\d+)(s|m|h|d|w|M)$/.exec(setup.timeframe)
  if (!match) return 60
  const value = Number(match[1])
  return value * ({ s: 1 / 60, m: 1, h: 60, d: 1440, w: 10080, M: 43200 }[match[2]] ?? 60)
})
const daysToBars = (days: number) => Math.max(1, Math.round((days * 1440) / intervalMinutes.value))

const prepareRun = async () => {
  if (!setup.symbol.trim() || !Number.isSafeInteger(setup.dataset) || setup.dataset < 100
      || !Number.isSafeInteger(setup.maxCandidates) || setup.maxCandidates < 1
      || (setup.endBefore && !Number.isFinite(Date.parse(`${setup.endBefore}Z`)))) {
    reportMessage.value = 'Check the research setup: enter a symbol, at least 100 candles, a positive candidate limit and a valid UTC cutoff.'
    return
  }
  if (!enabledAxesCount.value) {
    reportMessage.value = 'Enable at least one parameter axis, even if it has only one value.'
    return
  }
  if (candidateCount.value < 1 || !Number.isSafeInteger(candidateCount.value)) {
    reportMessage.value = 'Check the enabled parameter ranges: each needs finite bounds, a positive step, and at least one value.'
    return
  }
  if (invalidWholeNumberAxis.value) {
    reportMessage.value = `${invalidWholeNumberAxis.value.label} needs whole-number start, end and step values.`
    return
  }
  const adxPause = axes.find((axis) => axis.id === 'dmi_threshold')
  const adxResume = axes.find((axis) => axis.id === 'adx_resume_threshold')
  const highestPause = adxPause?.type === 'numeric' && adxPause.enabled ? adxPause.max : Number(baseParams.value.dmi_threshold)
  const lowestResume = adxResume?.type === 'numeric' && adxResume.enabled ? adxResume.min : Number(baseParams.value.adx_resume_threshold)
  if (baseParams.value.enable_dmi_filter === true && highestPause > lowestResume) {
    reportMessage.value = 'The highest ADX pause value must not exceed the lowest ADX resume value.'
    return
  }
  if (![validation.trainDays, validation.validateDays, validation.stepDays].every((days) => Number.isFinite(days) && days > 0)) {
    reportMessage.value = 'Train, Validate and Step must be positive numbers of days.'
    return
  }
  if (![execution.initialCapital, execution.commissionPercent, execution.slippageTicks, execution.marginLongPercent, execution.marginShortPercent].every(Number.isFinite)
      || execution.initialCapital <= 0 || execution.commissionPercent < 0 || execution.slippageTicks < 0
      || execution.marginLongPercent < 0 || execution.marginShortPercent < 0) {
    reportMessage.value = 'Check execution assumptions: capital must be positive and costs and margin requirements cannot be negative.'
    return
  }
  if (candidateCount.value > setup.maxCandidates) {
    reportMessage.value = `${number(candidateCount.value)} combinations exceed the job safety limit of ${number(setup.maxCandidates)}.`
    return
  }
  isRunning.value = true
  activeReport.value = null
  activeJob.value = null
  selectedRank.value = 1
  sessionStorage.removeItem('research-report')
  sessionStorage.removeItem('selected-research-candidate')
  sessionStorage.removeItem('monte-carlo-report')
  reportLabel.value = 'Running'
  reportMessage.value = 'Fetching the fixed market dataset…'
  candidates.value = []
  try {
    await researchServerHealth().catch(() => {
      throw new Error('The local Rust research service is unavailable on port 8787. From frontend, start it with npm run dev:research (or start both services with npm run dev), then retry.')
    })
    const endTime = setup.endBefore ? Date.parse(`${setup.endBefore}Z`) : undefined
    const [klines, filters] = await Promise.all([
      fetchBinanceKlines(setup.symbol, setup.timeframe, setup.dataset, endTime),
      fetchSymbolFilters(setup.symbol),
    ])
    const parameterGrid = {
      base:
        setup.strategy === 'EMA / VWAP'
          ? { strategy: 'ema_vwap', params: { ...baseParams.value } }
          : { strategy: 'sma_crossover', params: { ...baseParams.value } },
      axes: axes.filter((axis) => axis.enabled).map((axis) => ({ parameter: axis.id, values: valuesForAxis(axis) })),
      max_candidates: setup.maxCandidates,
    }
    const job = await createResearchJob({
      klines,
      config: {
        commission_percent: execution.commissionPercent,
        slippage_ticks: execution.slippageTicks,
        tick_size: filters.tickSize,
        step_size: filters.stepSize,
        enforce_margin: execution.enforceMargin,
        margin_long_percent: execution.marginLongPercent,
        margin_short_percent: execution.marginShortPercent,
      },
      initialCapital: execution.initialCapital,
      flags: { price_to_tick: execution.priceToTick, quantity_step: false, sl_tp_tick: false },
      parameterGrid,
      plan: {
        optimization: { min_trades: validation.minimumTrades, max_drawdown_percent: validation.maximumDrawdown, min_profit_factor: validation.minimumProfitFactor, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward_optimization: { min_trades: validation.trainingMinimumTrades, max_drawdown_percent: validation.maximumDrawdown, min_profit_factor: null, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward: { training_bars: daysToBars(validation.trainDays), validation_bars: daysToBars(validation.validateDays), step_bars: daysToBars(validation.stepDays), anchored_training: validation.method === 'Anchored walk-forward', max_windows: 100 },
        monte_carlo: null,
        monte_carlo_top_candidates: 1,
      },
      dataset: { symbol: setup.symbol, timeframe: setup.timeframe, endBeforeUtc: setup.endBefore || null, requestedBars: setup.dataset },
    })
    activeJob.value = job
    reportLabel.value = 'Running'
    await waitForResearchJob(job.id, (progress) => {
      activeJob.value = progress
      reportMessage.value = progress.message
    })
    const envelope = await getResearchReport<ResearchEnvelope>(job.id)
    activeReport.value = envelope
    applyReport(envelope, 'Native Rust report')
    cacheResearchReport(envelope)
    reportMessage.value = `Completed and saved as ${job.id}.`
  } catch (error) {
    reportLabel.value = 'Failed'
    reportMessage.value = error instanceof Error ? error.message : 'Optimization failed.'
  } finally {
    isRunning.value = false
  }
}

const exportReport = () => {
  if (!activeReport.value) return
  downloadResearchReport(activeReport.value, `${activeReport.value.job?.id ?? 'research-report'}.json`)
}

const openMonteCarlo = () => {
  cacheSelectedCandidate()
  void router.push('/monte-carlo')
}

onMounted(() => {
  const cached = sessionStorage.getItem('research-report')
  if (cached) {
    try {
      applyReport(JSON.parse(cached), 'Saved native report')
    } catch {
      sessionStorage.removeItem('research-report')
    }
  }
})

onActivated(() => {
  const handoff = consumeResearchHandoff()
  if (!handoff) return
  setup.strategy = handoff.strategy === 'smaCross' ? 'SMA Crossover' : 'EMA / VWAP'
  setup.symbol = handoff.market.symbol
  setup.timeframe = handoff.market.timeframe
  setup.dataset = handoff.market.dataLimit
  setup.endBefore = handoff.market.endBeforeUtc ?? ''
  baseParams.value = { ...defaultParamsForStrategy(setup.strategy), ...handoff.parameters }
  replaceAxes()
  baseSettingsSource.value = 'Current Backtest form'
  execution.initialCapital = handoff.execution.initialCapital
  execution.commissionPercent = handoff.execution.commissionPercent
  execution.slippageTicks = handoff.execution.slippageTicks
  execution.enforceMargin = handoff.execution.marginEnforcementEnabled ?? false
  execution.marginLongPercent = handoff.execution.marginLongPercent ?? 100
  execution.marginShortPercent = handoff.execution.marginShortPercent ?? 100
  execution.priceToTick = handoff.execution.priceToTick ?? false
  candidates.value = []
  activeReport.value = null
  activeJob.value = null
  reportLabel.value = 'Not run'
  reportMessage.value = 'Loaded the current Backtest setup. Fixed values and active search ranges are shown below; review them or run optimization.'
  sessionStorage.removeItem('research-report')
  sessionStorage.removeItem('selected-research-candidate')
  sessionStorage.removeItem('monte-carlo-report')
})
</script>

<template>
  <div class="research-view">
    <header class="research-page-header">
      <div>
        <h1>Parameter Optimization</h1>
        <p>Define a bounded search, validate out of sample, and inspect stable candidates.</p>
      </div>
      <span class="research-status-badge">{{ reportLabel }}</span>
    </header>

    <div class="research-layout optimize-layout">
      <div class="research-column">
        <section class="research-card">
          <h2 class="research-card-title">Research Setup</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="research-strategy">Strategy</label>
              <select id="research-strategy" v-model="setup.strategy">
                <option>EMA / VWAP</option>
                <option>SMA Crossover</option>
              </select>
              <FieldTooltip label="Strategy" text="Strategy whose parameters will be searched and validated." />
            </div>
            <div class="research-field">
              <label for="research-symbol">Symbol</label>
              <input id="research-symbol" v-model="setup.symbol" />
              <FieldTooltip label="Symbol" text="Market dataset used for every candidate in this optimization job." />
            </div>
            <div class="research-field">
              <label for="research-timeframe">Timeframe</label>
              <select id="research-timeframe" v-model="setup.timeframe">
                <option v-for="interval in ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']" :key="interval">{{ interval }}</option>
              </select>
              <FieldTooltip label="Timeframe" text="Candle interval used to evaluate all candidates. Bar-based parameters represent different real time when this changes." />
            </div>
            <div class="research-field">
              <label for="research-bars">Dataset</label>
              <input id="research-bars" v-model.number="setup.dataset" type="number" min="100" />
              <FieldTooltip label="Dataset" text="Number of historical candles available to the optimization and walk-forward windows." />
            </div>
            <div class="research-field">
              <label for="research-cutoff">End before (UTC)</label>
              <input id="research-cutoff" v-model="setup.endBefore" type="datetime-local" />
              <FieldTooltip label="End before" text="Exclusive UTC cutoff for the optimization dataset. Fix this value to make research runs reproducible." />
            </div>
            <div class="research-field">
              <label for="candidate-limit">Candidate safety limit</label>
              <input id="candidate-limit" v-model.number="setup.maxCandidates" type="number" min="1" step="1000" />
              <FieldTooltip label="Candidate safety limit" text="Maximum number of parameter combinations this job may expand. Increase it deliberately for very large native searches." />
            </div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Execution Assumptions</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field"><label for="research-capital">Initial capital</label><input id="research-capital" v-model.number="execution.initialCapital" type="number" min="0.01" /><FieldTooltip label="Initial capital" text="Starting equity used for every candidate. Carried over from Backtest when opened there." /></div>
            <div class="research-field"><label for="research-commission">Commission %</label><input id="research-commission" v-model.number="execution.commissionPercent" type="number" min="0" step="0.01" /><FieldTooltip label="Commission" text="Percentage charged on executed notional, matching the selected Backtest setup." /></div>
            <div class="research-field"><label for="research-slippage">Slippage ticks</label><input id="research-slippage" v-model.number="execution.slippageTicks" type="number" min="0" /><FieldTooltip label="Slippage" text="Additional adverse ticks on fills." /></div>
            <div class="research-field"><label for="research-margin">Simulate margin calls</label><input id="research-margin" v-model="execution.enforceMargin" class="research-compact-checkbox" type="checkbox" /><FieldTooltip label="Margin calls" text="Apply the same long and short margin requirements as the Backtest setup." /></div>
            <div v-if="execution.enforceMargin" class="research-field"><label for="research-long-margin">Long margin %</label><input id="research-long-margin" v-model.number="execution.marginLongPercent" type="number" min="0" max="100" /><FieldTooltip label="Long margin" text="Initial and maintenance margin requirement for long positions." /></div>
            <div v-if="execution.enforceMargin" class="research-field"><label for="research-short-margin">Short margin %</label><input id="research-short-margin" v-model.number="execution.marginShortPercent" type="number" min="0" max="100" /><FieldTooltip label="Short margin" text="Initial and maintenance margin requirement for short positions." /></div>
            <div class="research-field"><label for="research-round-tick">Round to exchange tick</label><input id="research-round-tick" v-model="execution.priceToTick" class="research-compact-checkbox" type="checkbox" /><FieldTooltip label="Exchange tick" text="Carries the Backtest rounding flag into native research jobs." /></div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Validation</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="validation-method">Method</label>
              <select id="validation-method" v-model="validation.method">
                <option>Rolling walk-forward</option>
                <option>Anchored walk-forward</option>
              </select>
              <FieldTooltip label="Validation method" text="Rolling uses a moving training window; anchored keeps the original start and expands the training history over time." />
            </div>
            <div class="research-field">
              <label for="train-days">Train</label>
              <input id="train-days" v-model.number="validation.trainDays" type="number" min="1" />
              <FieldTooltip label="Train" text="Calendar days used to fit and rank parameter candidates in each walk-forward fold." />
            </div>
            <div class="research-field">
              <label for="validate-days">Validate</label>
              <input
                id="validate-days"
                v-model.number="validation.validateDays"
                type="number"
                min="1"
              />
              <FieldTooltip label="Validate" text="Calendar days kept out of sample to test candidates selected by the training window." />
            </div>
            <div class="research-field">
              <label for="step-days">Step</label>
              <input id="step-days" v-model.number="validation.stepDays" type="number" min="1" />
              <FieldTooltip label="Step" text="Calendar days the walk-forward window advances between consecutive folds." />
            </div>
            <div class="research-divider" />
            <div class="research-field">
              <label for="minimum-trades">Min full-period trades</label>
              <input
                id="minimum-trades"
                v-model.number="validation.minimumTrades"
                type="number"
                min="0"
              />
              <FieldTooltip label="Minimum full-period trades" text="Eligibility threshold for the full-dataset ranking. It does not reject out-of-sample results." />
            </div>
            <div class="research-field"><label for="minimum-train-trades">Min train trades</label><input id="minimum-train-trades" v-model.number="validation.trainingMinimumTrades" type="number" min="0" /><FieldTooltip label="Minimum training trades" text="Eligibility threshold when selecting one candidate within each walk-forward training window." /></div>
            <div class="research-field">
              <label for="maximum-drawdown">Max full/train DD %</label>
              <input
                id="maximum-drawdown"
                v-model.number="validation.maximumDrawdown"
                type="number"
                min="0"
              />
              <FieldTooltip label="Maximum drawdown" text="Eligibility ceiling for full-dataset ranking and training-window selection. Out-of-sample drawdown is reported without filtering." />
            </div>
            <div class="research-field">
              <label for="minimum-pf">Min full-period PF</label>
              <input
                id="minimum-pf"
                v-model.number="validation.minimumProfitFactor"
                type="number"
                min="0"
                step="0.1"
              />
              <FieldTooltip label="Minimum profit factor" text="Eligibility threshold for the full-dataset ranking only. Walk-forward validation results remain untouched." />
            </div>
            <div class="research-inline-notice">Walk-forward results are evaluated on untouched validation windows and shown as evidence; these thresholds select candidates on full-period and training data only.</div>
          </div>
        </section>
      </div>

      <div class="research-column">
        <section class="research-card">
          <h2 class="research-card-title">
            Parameter Search Space
            <small>Values belong to this job</small>
          </h2>
          <div class="research-card-body">
            <div class="research-field research-method-field">
              <label for="research-stop-method">SL/TP method</label>
              <select id="research-stop-method" v-model="stopMethod">
                <option value="RiskBased">Risk-based</option>
                <option value="FixedPercent">Fixed %</option>
                <option value="TrailingPercent">Trailing %</option>
                <option value="Combined">Combined</option>
              </select>
              <FieldTooltip label="SL/TP method" text="The selected method determines which stop and target parameters actually affect the strategy. Changing it here changes the base strategy for this research job." />
            </div>
            <p class="research-axis-intro">Current strategy values · {{ baseSettingsSource }}. Checked parameters vary between candidates; unchecked parameters stay fixed at the shown value. You can run now or adjust the search.</p>
            <p v-if="stopMethod !== 'RiskBased'" class="research-axis-intro">Order size stays fixed at {{ formatBaseValue(baseParams.order_size_value) }} {{ { percentOfEquity: '% equity', fixedQuantity: 'units', fixedValue: 'USDT' }[String(baseParams.order_size_mode) as 'percentOfEquity' | 'fixedQuantity' | 'fixedValue'] ?? String(baseParams.order_size_mode) }} for this job.</p>
            <p v-else class="research-axis-intro">Risk-based position size is calculated from Risk per trade and Position gearing; the Backtest order-size field does not apply.</p>
            <div class="axis-table">
              <div class="axis-row axis-head">
                <div class="axis-cell">Parameter</div>
                <div class="axis-cell">Optimize</div>
                <div class="axis-cell">Values / Range</div>
                <div class="axis-cell">Count</div>
              </div>

              <template v-for="(axis, index) in axes" :key="axis.id">
              <div v-if="index === 0 || axis.group !== axes[index - 1]?.group" class="axis-group-row">{{ axis.group }}</div>
              <div class="axis-row">
                <div class="axis-cell axis-name axis-name-with-help">
                  <span>{{ axis.label }}<small>Current: {{ axis.type === 'values' ? choiceLabel(axis.baseValue) : number(axis.baseValue, Number.isInteger(axis.baseValue) ? 0 : 2) }}</small></span>
                  <FieldTooltip :label="axis.label" :text="axisHelp[axis.id] ?? 'Parameter values included in the optimization search.'" />
                </div>
                <div class="axis-cell axis-check">
                  <input
                    v-model="axis.enabled"
                    type="checkbox"
                    :aria-label="`Optimize ${axis.label}`"
                  />
                </div>
                <div class="axis-cell">
                  <div v-if="!axis.enabled" class="axis-fixed-value">Fixed at {{ axis.type === 'values' ? choiceLabel(axis.baseValue) : number(axis.baseValue, Number.isInteger(axis.baseValue) ? 0 : 2) }}</div>
                  <div v-else-if="axis.type === 'numeric'" class="axis-range">
                    <input v-model.number="axis.min" type="number" :step="axis.wholeNumbers ? 1 : 'any'" />
                    <span>to</span>
                    <input v-model.number="axis.max" type="number" :step="axis.wholeNumbers ? 1 : 'any'" />
                    <span>step</span>
                    <input
                      v-model.number="axis.step"
                      type="number"
                      :min="axis.wholeNumbers ? 1 : 0.0001"
                      :step="axis.wholeNumbers ? 1 : 'any'"
                    />
                  </div>
                  <div v-else class="axis-values">
                    <label v-for="option in axis.options" :key="option" class="axis-choice">
                      <input type="checkbox" :checked="axis.values.includes(option)" :aria-label="`${axis.label}: ${choiceLabel(option)}`" @change="changeAxisChoice(axis, option, $event)" />
                      {{ choiceLabel(option) }}
                    </label>
                  </div>
                </div>
                <div class="axis-cell">{{ axisCount(axis) }}</div>
              </div>
              </template>
            </div>
            <div class="research-summary-line">
              <span
                ><strong>{{ number(candidateCount) }}</strong> combinations</span
              >
              <span>Estimated {{ estimatedSeconds }} s</span>
            </div>
            <div v-if="excludedCurrentAxes.length" class="research-inline-notice research-axis-warning">
              Current Backtest settings are excluded by: {{ excludedCurrentAxes.join(', ') }}. Adjust these selections if you want the exact current setup among the candidates.
            </div>

            <div class="research-button-row">
              <button class="research-primary" type="button" :disabled="isRunning || candidateCount < 1 || !enabledAxesCount" @click="prepareRun">
                {{ isRunning ? 'Running optimization…' : '▶ Run optimization' }}
              </button>
            </div>

            <div class="research-inline-notice">
              Search values are sent as job data to the native Rust runner; changing them does not require source-code changes.
            </div>
            <details class="base-settings-details">
              <summary>Base strategy settings · {{ baseSettingsSource }} ({{ baseParameterEntries.length }} fields)</summary>
              <p>These values are carried into the job. Enabled search ranges replace the corresponding base value for each candidate.</p>
              <dl class="base-settings-grid">
                <div v-for="[key, value] in baseParameterEntries" :key="key">
                  <dt>{{ key.replaceAll('_', ' ') }}</dt>
                  <dd>{{ formatBaseValue(value) }}</dd>
                </div>
              </dl>
            </details>
            <div v-if="reportMessage" class="research-inline-notice">{{ reportMessage }}</div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">
            Execution Progress <small>{{ activeJob?.stage ?? 'Ready' }}</small>
          </h2>
          <div class="research-card-body">
            <div class="research-summary-line">
              <span>Candidate progress</span>
              <span>{{ number(activeJob?.completed ?? 0) }} / {{ number(activeJob?.total || candidateCount) }}</span>
            </div>
            <div class="research-progress-track">
              <div class="research-progress-bar" :style="{ width: `${activeJob?.percent ?? 0}%` }" />
            </div>
          </div>
        </section>
      </div>

      <div class="research-column">
        <section class="research-card">
          <h2 class="research-card-title">
            Best Candidates
            <small>Full-period ranking · {{ reportLabel }}</small>
          </h2>
          <div class="results-table-wrap">
            <table class="results-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Parameters</th>
                  <th>Net P&amp;L</th>
                  <th>Max DD</th>
                  <th>PF</th>
                  <th>Eligible</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="candidate in candidates"
                  :key="candidate.rank"
                  :class="{ selected: selectedRank === candidate.rank }"
                  :aria-selected="selectedRank === candidate.rank"
                  :tabindex="0"
                  @click="selectCandidate(candidate.rank)"
                  @keydown.enter="selectCandidate(candidate.rank)"
                  @keydown.space.prevent="selectCandidate(candidate.rank)"
                >
                  <td>{{ candidate.rank }}</td>
                  <td>{{ candidate.label }}</td>
                  <td :class="candidate.netProfit >= 0 ? 'metric-positive' : 'metric-negative'">
                    {{ candidate.netProfit >= 0 ? '+' : '' }}{{ number(candidate.netProfit) }}
                  </td>
                  <td>{{ number(candidate.drawdown, 1) }}%</td>
                  <td>{{ number(candidate.profitFactor, 3) }}</td>
                  <td>
                    <span :class="candidate.eligible ? 'status-check' : 'metric-negative'">{{
                      candidate.eligible ? '✓' : '×'
                    }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="activeReport?.report?.walk_forward" class="research-card-body">
            <div class="research-summary-line">
              <span>Walk-forward selection · compounded OOS equity P&amp;L</span>
              <strong>{{ number(activeReport.report.walk_forward.compounded_out_of_sample_net_profit ?? 0) }} USDT · {{ activeReport.report.walk_forward.total_validation_trades ?? 0 }} trades / {{ activeReport.report.walk_forward.windows?.length ?? 0 }} windows</strong>
            </div>
            <div v-if="walkForwardClosedPnl != null" class="research-summary-line">
              <span>Closed-trade OOS P&amp;L used by Monte Carlo</span>
              <strong>{{ number(walkForwardClosedPnl) }} USDT</strong>
            </div>
            <div v-if="selectedCandidateRow" class="research-inline-notice">
              Candidate #{{ selectedCandidateRow.rank }} was selected in {{ selectedCandidateRow.selectedWindows }} training windows; their subsequent OOS windows had {{ number(selectedCandidateRow.selectedOosPnl) }} USDT in summed equity P&amp;L and {{ selectedCandidateRow.selectedClosedOosPnl == null ? '—' : number(selectedCandidateRow.selectedClosedOosPnl) }} USDT from closed trades across {{ selectedCandidateRow.selectedOosTrades }} trades. The headline compounds window equity returns. Monte Carlo samples closed-trade P&amp;L only, so its source differs when a window ends with an open position.
              <span v-if="singleCandidateSearch">Only one candidate was tested, so its settings stayed fixed across all windows. These windows are not independent evidence if the candidate was originally chosen by looking at the same history.</span>
              <span v-else>This is not an OOS test of the same fixed candidate in every window.</span>
            </div>
            <details v-if="activeReport.report.walk_forward.windows?.length" class="walk-forward-details">
              <summary>Inspect {{ activeReport.report.walk_forward.windows.length }} walk-forward windows</summary>
              <div class="results-table-wrap walk-forward-table-wrap">
                <table class="results-table">
                  <thead><tr><th>Window</th><th>Selected in training</th><th>Train bars</th><th>OOS bars</th><th>Train trades</th><th>OOS trades</th><th>OOS equity P&amp;L</th><th>Closed P&amp;L</th><th>OOS DD</th></tr></thead>
                  <tbody>
                    <tr v-for="window in activeReport.report.walk_forward.windows" :key="window.window_index" :class="{ selected: window.selected_candidate_index === selectedCandidateRow?.candidateIndex }">
                      <td>{{ (window.window_index ?? 0) + 1 }}</td>
                      <td>{{ describeParameters(window.selected_parameters?.params ?? {}) }}</td>
                      <td>{{ window.training_start ?? '—' }}–{{ window.training_end_exclusive ?? '—' }}</td>
                      <td>{{ window.validation_start ?? '—' }}–{{ window.validation_end_exclusive ?? '—' }}</td>
                      <td>{{ window.training_summary?.total_trades ?? '—' }}</td>
                      <td>{{ window.validation_summary?.total_trades ?? '—' }}</td>
                      <td :class="(window.validation_summary?.pnl_total ?? 0) >= 0 ? 'metric-positive' : 'metric-negative'">{{ number(window.validation_summary?.pnl_total ?? 0) }}</td>
                      <td>{{ window.validation_closed_trade_pnls ? number(window.validation_closed_trade_pnls.reduce((sum, pnl) => sum + pnl, 0)) : '—' }}</td>
                      <td>{{ number(window.validation_summary?.max_drawdown_percent ?? 0, 1) }}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="walk-forward-note">Bar ranges are zero-based; end indices are exclusive. Each OOS window starts flat and follows its own untouched training window.</p>
            </details>
          </div>
          <div class="research-card-body research-button-row">
            <input
              ref="reportInput"
              hidden
              type="file"
              accept="application/json,.json"
              @change="importReport"
            />
            <button class="research-secondary" type="button" @click="openReportPicker">
              Import report
            </button>
            <button class="research-secondary" type="button" :disabled="!activeReport" @click="exportReport">
              Export report
            </button>
            <button class="research-primary" type="button" :disabled="!candidates.length" @click="openMonteCarlo">
              Run Monte Carlo
            </button>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Return vs Drawdown <small>Top 10 full-period candidates</small></h2>
          <div class="chart-frame">
            <svg viewBox="0 0 560 255" role="img" aria-label="Return versus drawdown scatter plot">
              <g>
                <line
                  v-for="x in [55, 155, 255, 355, 455, 535]"
                  :key="`x${x}`"
                  :x1="x"
                  y1="18"
                  :x2="x"
                  y2="215"
                  class="chart-grid-line"
                />
                <line
                  v-for="y in [18, 67, 116, 165, 215]"
                  :key="`y${y}`"
                  x1="55"
                  :y1="y"
                  x2="535"
                  :y2="y"
                  class="chart-grid-line"
                />
              </g>
              <g>
                <circle
                  v-for="point in candidatePoints"
                  :key="point.rank"
                  :cx="point.x"
                  :cy="point.y"
                  :r="selectedRank === point.rank ? 7 : 4.5"
                  :fill="selectedRank === point.rank ? '#2699ff' : point.eligible ? '#46dd89' : '#72869b'"
                  :stroke="selectedRank === point.rank ? '#d8eeff' : 'none'"
                  stroke-width="2"
                >
                  <title>{{ point.label }} · P&amp;L {{ number(point.netProfit) }} · DD {{ number(point.drawdown, 1) }}%</title>
                </circle>
              </g>
              <text v-if="!candidatePoints.length" x="295" y="120" text-anchor="middle" class="chart-axis-label">
                Run or import an optimization report
              </text>
              <text x="270" y="247" text-anchor="middle" class="chart-axis-label">
                Maximum Drawdown
              </text>
              <text
                transform="translate(14,135) rotate(-90)"
                text-anchor="middle"
                class="chart-axis-label"
              >
                Net Return
              </text>
            </svg>
          </div>
          <p class="scatter-caption">Up means higher full-period return; left means lower drawdown. Blue marks the selected candidate, not a proven out-of-sample winner.</p>
        </section>
      </div>
    </div>
  </div>
</template>
