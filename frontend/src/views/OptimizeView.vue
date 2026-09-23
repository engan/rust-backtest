<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FieldTooltip from '@/components/FieldTooltip.vue'
import { consumeResearchHandoff } from '@/services/researchHandoff'
import { AUTO_REFINEMENT, AUTO_STOP_METHODS, assessAutoFamily, autoMethodLabel, createAutoFamilyGrids, rankAutoFamilies, type AutoFamilyEvidence, type AutoStopMethod } from '@/services/autoResearch'
import { createResearchAxes, includesCurrentValue, toggleResearchChoice, type ResearchAxis, type ValueResearchAxis } from '@/services/researchAxes'
import { numericAxisCount, numericAxisValues } from '@/services/researchGrid'
import { fetchBinanceKlines, fetchSymbolFilters } from '@/services/binanceAPI'
import {
  createResearchJob,
  createMonteCarloJob,
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
  final_selection?: {
    seed_candidate_index?: number
    selected_parameters?: { params?: Record<string, unknown> } & Record<string, unknown>
    summary?: { net_profit?: number; max_drawdown_percent?: number; profit_factor?: number; total_trades?: number }
    evaluated_candidates?: number
  }
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
    worst_validation_drawdown_percent?: number
    windows?: Array<{
      window_index?: number
      training_start?: number
      training_end_exclusive?: number
      validation_start?: number
      validation_end_exclusive?: number
      selected_candidate_index?: number
      refined_candidates_evaluated?: number
      was_refined?: boolean
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
      refinement?: { top_seeds?: number; max_refined_candidates?: number }
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
type AutoHoldout = { method: AutoStopMethod; trades: number; pnl: number; drawdown: number; profitFactor: number; jobId: string }
type AutoMonte = { jobId: string; sourceTrades: number; p05: number; lossProbability: number; p95Drawdown: number }
const autoHoldout = ref<AutoHoldout | null>(null)
const autoMonte = ref<AutoMonte | null>(null)
const autoWorkflowStage = ref('Ready')
const baseSettingsSource = ref('Optimize defaults')
const researchMode = ref<'automatic' | 'manual'>('automatic')
type AutoFamilyRun = { method: AutoStopMethod; candidateCount: number; status: 'queued' | 'running' | 'completed' | 'failed'; evidence?: AutoFamilyEvidence; envelope?: ResearchEnvelope; error?: string }
const autoFamilies = ref<AutoFamilyRun[]>([])
const selectedAutoMethod = ref<AutoStopMethod | null>(null)
const rankedAutoFamilies = computed(() => {
  const completed = autoFamilies.value.filter((family): family is AutoFamilyRun & { evidence: AutoFamilyEvidence } => Boolean(family.evidence))
  return rankAutoFamilies(completed.map((family) => family.evidence))
    .map((evidence) => completed.find((family) => family.method === evidence.method)!)
})
const recommendedAutoFamily = computed(() => rankedAutoFamilies.value.find((family) => family.evidence.eligible) ?? null)
const autoCandidateTotal = computed(() => {
  try { return createAutoFamilyGrids(setup.strategy, baseParams.value).reduce((sum, family) => sum + family.candidateCount, 0) }
  catch { return 0 }
})

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
    autoFamilies.value = []
    selectedAutoMethod.value = null
    sessionStorage.removeItem('auto-research-comparison')
  },
})
const changeAxisChoice = (axis: ValueResearchAxis, choice: string, event: Event) => {
  toggleResearchChoice(axis, choice, (event.target as HTMLInputElement).checked)
}
const candidates = ref<CandidateRow[]>([])
const selectedCandidateRow = computed(() => candidates.value.find((candidate) => candidate.rank === selectedRank.value))
const recommendedAutoSelection = computed(() => researchMode.value === 'automatic' && selectedRank.value === 0
  ? activeReport.value?.report?.final_selection : null)
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
    autoFamilies.value = []
    selectedAutoMethod.value = null
    sessionStorage.removeItem('auto-research-comparison')
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
  const final = researchMode.value === 'automatic' ? activeReport.value?.report?.final_selection : null
  const refined = final?.summary && final.selected_parameters
    ? [{ rank: 0, label: `Refined current setup: ${describeParameters(final.selected_parameters.params ?? {})}`,
        netProfit: final.summary.net_profit ?? 0, drawdown: final.summary.max_drawdown_percent ?? 0, eligible: true }]
    : []
  const plotted = [...candidates.value, ...refined]
  const maxDrawdown = Math.max(...plotted.map((candidate) => candidate.drawdown), 1)
  const profits = plotted.map((candidate) => candidate.netProfit)
  const minProfit = Math.min(...profits)
  const maxProfit = Math.max(...profits)
  const profitRange = Math.max(maxProfit - minProfit, 1)
  return plotted.map((candidate) => ({
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
    // A family report records its own per-job cap. Keep the user's overall
    // four-family safety limit when inspecting one automatic result.
    if (researchMode.value === 'manual') {
      setup.maxCandidates = definition.parameterGrid?.max_candidates ?? setup.maxCandidates
    }
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
  const refined = researchMode.value === 'automatic' && selectedRank.value === 0
    ? activeReport.value?.report?.final_selection
    : null
  if ((!selected && !refined?.selected_parameters) || !activeReport.value) return
  const parameters = refined?.selected_parameters ?? selected!.parameters
  const description = refined?.selected_parameters
    ? describeParameters(refined.selected_parameters.params ?? {})
    : selected!.label
  sessionStorage.setItem(
    'selected-research-candidate',
    JSON.stringify({
      sourceResearchJobId: activeReport.value.job?.id,
      candidate: parameters,
      description,
      strategy: setup.strategy,
      fixedCandidateScope: researchMode.value === 'automatic' ? 'research_period' : 'full_dataset',
      dataset: { symbol: setup.symbol, timeframe: setup.timeframe, endBeforeUtc: setup.endBefore || null },
      initialCapital: activeReport.value.reproducibility?.initialCapital ?? execution.initialCapital,
      evidencePreview: {
        fullDatasetTrades: refined?.summary?.total_trades ?? selected?.fullDatasetTrades ?? 0,
        outOfSampleTrades: activeReport.value.report?.walk_forward?.total_validation_trades ?? 0,
        walkForwardWindows: activeReport.value.report?.walk_forward?.windows?.length ?? 0,
        selectedWindows: selected?.selectedWindows ?? 0,
      },
      holdoutEvidence: researchMode.value === 'automatic' && selectedAutoMethod.value === autoHoldout.value?.method
        ? autoHoldout.value : null,
    }),
  )
}

const cacheResearchReport = (value: unknown) => {
  const envelope = value as ResearchEnvelope
  const report = unwrapResearchReport<OptimizationReport>(value)
  const compactEnvelope: ResearchEnvelope = {
    ...envelope,
    report: {
      final_selection: report.final_selection,
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
              refined_candidates_evaluated: window.refined_candidates_evaluated,
              was_refined: window.was_refined,
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

const cacheAutoComparison = () => {
  try {
    sessionStorage.setItem('auto-research-comparison', JSON.stringify({
      schemaVersion: 'rust-backtest-auto-comparison-v2',
      selectedMethod: selectedAutoMethod.value,
      holdout: autoHoldout.value,
      monteCarlo: autoMonte.value,
      verdictLabel: reportLabel.value,
      verdictMessage: reportMessage.value,
      families: autoFamilies.value.map((family) => ({
        ...family,
        envelope: family.envelope ? {
          ...family.envelope,
          report: {
            ...family.envelope.report,
            optimization: {
              ...family.envelope.report?.optimization,
              evaluations: family.envelope.report?.optimization?.evaluations?.slice(0, 10),
            },
          },
        } : undefined,
      })),
    }))
  } catch {
    sessionStorage.removeItem('auto-research-comparison')
  }
}

const showAutoFamily = (method: AutoStopMethod) => {
  const family = autoFamilies.value.find((row) => row.method === method)
  if (!family?.envelope) return
  selectedAutoMethod.value = method
  applyReport(family.envelope, `${autoMethodLabel(method)} report`)
  if (family.envelope.report?.final_selection?.selected_parameters) {
    selectedRank.value = 0
    cacheSelectedCandidate()
  }
  cacheResearchReport(family.envelope)
  cacheAutoComparison()
}

const restoreAutoComparison = (value: unknown): boolean => {
  const bundle = value as { schemaVersion?: string; selectedMethod?: AutoStopMethod; families?: AutoFamilyRun[]; holdout?: AutoHoldout; monteCarlo?: AutoMonte; verdictLabel?: string; verdictMessage?: string }
  if (!['rust-backtest-auto-comparison-v1', 'rust-backtest-auto-comparison-v2'].includes(bundle?.schemaVersion ?? '') || !Array.isArray(bundle.families)) return false
  const restored = bundle.families.filter((family) => AUTO_STOP_METHODS.includes(family.method))
  const firstReport = restored.find((family) => family.envelope)?.envelope
  if (firstReport?.reproducibility?.parameterGrid?.base?.strategy === 'sma_crossover') setup.strategy = 'SMA Crossover'
  else if (firstReport) setup.strategy = 'EMA / VWAP'
  autoFamilies.value = restored
  autoHoldout.value = bundle.holdout ?? null
  autoMonte.value = bundle.monteCarlo ?? null
  researchMode.value = 'automatic'
  const chosen = autoFamilies.value.find((family) => family.method === bundle.selectedMethod && family.envelope)
    ?? rankedAutoFamilies.value.find((family) => family.envelope)
  if (chosen) showAutoFamily(chosen.method)
  if (bundle.verdictLabel) reportLabel.value = bundle.verdictLabel
  if (bundle.verdictMessage) reportMessage.value = bundle.verdictMessage
  if (bundle.verdictLabel || bundle.verdictMessage) cacheAutoComparison()
  return true
}

const exportAutoComparison = () => {
  if (!autoFamilies.value.length) return
  downloadResearchReport({
    schemaVersion: 'rust-backtest-auto-comparison-v2',
    selectedMethod: selectedAutoMethod.value,
    holdout: autoHoldout.value,
    monteCarlo: autoMonte.value,
    verdictLabel: reportLabel.value,
    verdictMessage: reportMessage.value,
    families: autoFamilies.value,
  }, `auto-comparison-${setup.symbol}-${setup.timeframe}.json`)
}

const openReportPicker = () => reportInput.value?.click()

const importReport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!restoreAutoComparison(parsed)) {
      researchMode.value = 'manual'
      autoFamilies.value = []
      selectedAutoMethod.value = null
      sessionStorage.removeItem('auto-research-comparison')
      applyReport(parsed, 'Imported report')
      cacheResearchReport(parsed)
    }
    reportMessage.value = `${file.name} loaded successfully.`
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

const runAutomaticResearch = async () => {
  if (!setup.symbol.trim() || !Number.isSafeInteger(setup.dataset) || setup.dataset < 100
      || !Number.isSafeInteger(setup.maxCandidates) || setup.maxCandidates < 1
      || (setup.endBefore && !Number.isFinite(Date.parse(`${setup.endBefore}Z`)))) {
    reportMessage.value = 'Check the research setup: symbol, dataset, candidate limit or UTC cutoff is invalid.'
    return
  }
  if (![validation.trainDays, validation.validateDays, validation.stepDays].every((days) => Number.isFinite(days) && days > 0)
      || !Number.isFinite(validation.maximumDrawdown) || validation.maximumDrawdown <= 0
      || !Number.isSafeInteger(validation.minimumTrades) || validation.minimumTrades < 1) {
    reportMessage.value = 'Check validation settings: windows, minimum trades and maximum drawdown must be positive.'
    return
  }
  if (![execution.initialCapital, execution.commissionPercent, execution.slippageTicks, execution.marginLongPercent, execution.marginShortPercent].every(Number.isFinite)
      || execution.initialCapital <= 0 || execution.commissionPercent < 0 || execution.slippageTicks < 0
      || execution.marginLongPercent < 0 || execution.marginShortPercent < 0) {
    reportMessage.value = 'Check execution assumptions: capital must be positive and costs and margin requirements cannot be negative.'
    return
  }
  let grids
  try { grids = createAutoFamilyGrids(setup.strategy, baseParams.value) }
  catch (error) { reportMessage.value = error instanceof Error ? error.message : 'Could not create automatic search ranges.'; return }
  const total = grids.reduce((sum, family) => sum + family.candidateCount, 0)
  if (total > setup.maxCandidates) {
    reportMessage.value = `Automatic search needs ${number(total)} candidates across four methods, above the ${number(setup.maxCandidates)} safety limit.`
    return
  }

  const currentSetup = { ...setup }
  const currentExecution = { ...execution }
  const currentValidation = { ...validation }
  const trainBars = daysToBars(currentValidation.trainDays)
  const validateBars = daysToBars(currentValidation.validateDays)
  const stepBars = daysToBars(currentValidation.stepDays)
  if (stepBars < validateBars) {
    reportMessage.value = 'Automatic comparison requires Step to be at least Validate, so OOS windows do not overlap and count the same trades twice.'
    return
  }
  isRunning.value = true
  researchMode.value = 'automatic'
  autoWorkflowStage.value = 'Loading market data'
  autoHoldout.value = null
  autoMonte.value = null
  selectedAutoMethod.value = null
  autoFamilies.value = grids.map(({ method, candidateCount }) => ({ method, candidateCount, status: 'queued' }))
  candidates.value = []
  activeReport.value = null
  activeJob.value = null
  reportLabel.value = 'Running'
  reportMessage.value = 'Fetching one fixed market dataset for all four methods…'
  sessionStorage.removeItem('auto-research-comparison')
  sessionStorage.removeItem('research-report')
  sessionStorage.removeItem('selected-research-candidate')
  sessionStorage.removeItem('monte-carlo-report')

  try {
    await researchServerHealth().catch(() => {
      throw new Error('The local Rust research service is unavailable on port 8787. Start npm run dev:research and retry.')
    })
    const endTime = currentSetup.endBefore ? Date.parse(`${currentSetup.endBefore}Z`) : undefined
    const [klines, filters] = await Promise.all([
      fetchBinanceKlines(currentSetup.symbol, currentSetup.timeframe, currentSetup.dataset, endTime),
      fetchSymbolFilters(currentSetup.symbol),
    ])
    const minimumBars = trainBars + 2 * validateBars + stepBars
    if (klines.length < minimumBars) {
      throw new Error(`The dataset has ${number(klines.length)} candles; at least ${number(minimumBars)} are needed for two walk-forward windows and a separate final holdout. Increase Dataset or shorten the windows.`)
    }
    const researchKlines = klines.slice(0, -validateBars)
    const holdoutKlines = klines.slice(-validateBars)
    const largestWarmup = Math.max(...grids.map((family) => {
      const params = family.parameterGrid.base.params
      const period = family.parameterGrid.axes.find((axis) => axis.parameter === (currentSetup.strategy === 'EMA / VWAP' ? 'ema_length' : 'sma_slow_period'))
      return Math.max(Number(params.atr_length) || 0, ...((period?.values ?? []).map(Number))) + 1
    }))
    const refinedWarmup = largestWarmup + Math.max(...AUTO_REFINEMENT.length_offsets)
    if (validateBars <= refinedWarmup) {
      throw new Error(`Validation and holdout have ${number(validateBars)} candles; they must exceed the largest refined-candidate warmup of ${number(refinedWarmup)} candles.`)
    }
    if (trainBars <= largestWarmup) {
      throw new Error(`The training window has ${number(trainBars)} candles; it must exceed the largest candidate warmup of ${number(largestWarmup)} candles. Increase Train or use a shorter timeframe.`)
    }
    const commonRequest = {
      klines: researchKlines,
      config: {
        commission_percent: currentExecution.commissionPercent,
        slippage_ticks: currentExecution.slippageTicks,
        tick_size: filters.tickSize,
        step_size: filters.stepSize,
        enforce_margin: currentExecution.enforceMargin,
        margin_long_percent: currentExecution.marginLongPercent,
        margin_short_percent: currentExecution.marginShortPercent,
      },
      initialCapital: currentExecution.initialCapital,
      flags: { price_to_tick: currentExecution.priceToTick, quantity_step: false, sl_tp_tick: false },
      plan: {
        optimization: { min_trades: currentValidation.minimumTrades, max_drawdown_percent: currentValidation.maximumDrawdown, min_profit_factor: currentValidation.minimumProfitFactor, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward_optimization: { min_trades: currentValidation.trainingMinimumTrades, max_drawdown_percent: currentValidation.maximumDrawdown, min_profit_factor: null, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward: { training_bars: trainBars, validation_bars: validateBars, step_bars: stepBars, anchored_training: currentValidation.method === 'Anchored walk-forward', max_windows: 100 },
        refinement: AUTO_REFINEMENT,
        monte_carlo: null,
        monte_carlo_top_candidates: 1,
      },
      dataset: { symbol: currentSetup.symbol, timeframe: currentSetup.timeframe, endBeforeUtc: currentSetup.endBefore || null, requestedBars: currentSetup.dataset },
    }
    for (const [index, family] of grids.entries()) {
      autoWorkflowStage.value = `Broad search and refinement · ${index + 1}/4`
      autoFamilies.value[index] = { method: family.method, candidateCount: family.candidateCount, status: 'running' }
      reportMessage.value = `Testing ${autoMethodLabel(family.method)} (${index + 1}/4)…`
      try {
        const job = await createResearchJob({ ...commonRequest, parameterGrid: family.parameterGrid })
        activeJob.value = job
        await waitForResearchJob(job.id, (progress) => {
          activeJob.value = progress
          autoWorkflowStage.value = `${autoMethodLabel(family.method)} · ${progress.stage.replaceAll('_', ' ')}`
          reportMessage.value = `${autoMethodLabel(family.method)}: ${progress.message}`
        })
        const envelope = await getResearchReport<ResearchEnvelope>(job.id)
        const walkForward = envelope.report?.walk_forward
        if (!walkForward?.windows?.length) throw new Error('The native report has no complete walk-forward windows.')
        const evidence = assessAutoFamily(family.method, family.candidateCount, walkForward,
          currentExecution.initialCapital, currentValidation.minimumTrades, currentValidation.maximumDrawdown)
        autoFamilies.value[index] = { method: family.method, candidateCount: family.candidateCount, status: 'completed', evidence, envelope }
      } catch (error) {
        autoFamilies.value[index] = { method: family.method, candidateCount: family.candidateCount, status: 'failed', error: error instanceof Error ? error.message : 'Research job failed.' }
      }
      cacheAutoComparison()
    }
    const first = recommendedAutoFamily.value ?? rankedAutoFamilies.value[0]
    if (first) showAutoFamily(first.method)
    if (!recommendedAutoFamily.value) {
      reportLabel.value = 'No robust candidate'
      reportMessage.value = 'No method passed the walk-forward evidence checks. Inspect the methods; no final holdout or Monte Carlo recommendation was made.'
      autoWorkflowStage.value = 'Needs review'
    } else {
      const leader = recommendedAutoFamily.value
      const selected = leader.envelope?.report?.final_selection
      const selectedParams = selected?.selected_parameters
      const sourceJobId = leader.envelope?.job?.id
      reportLabel.value = 'Checking holdout'
      if (!selectedParams || !sourceJobId) throw new Error('The selected method has no refined final candidate or native source job.')
      autoWorkflowStage.value = 'Checking untouched final period'
      reportMessage.value = `Testing ${autoMethodLabel(leader.method)} on the reserved final ${currentValidation.validateDays}-day period…`
      const holdoutJob = await createResearchJob({
        ...commonRequest,
        klines: holdoutKlines,
        candidates: [selectedParams],
        plan: {
          optimization: { min_trades: 0, max_drawdown_percent: null, min_profit_factor: null, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
          walk_forward: null, refinement: null, monte_carlo: null, monte_carlo_top_candidates: 1,
        },
        dataset: { symbol: currentSetup.symbol, timeframe: currentSetup.timeframe, endBeforeUtc: currentSetup.endBefore || null, requestedBars: validateBars },
      })
      activeJob.value = holdoutJob
      await waitForResearchJob(holdoutJob.id, (progress) => { activeJob.value = progress })
      const holdoutReport = await getResearchReport<ResearchEnvelope>(holdoutJob.id)
      const holdoutSummary = holdoutReport.report?.optimization?.evaluations?.[0]?.summary
      if (!holdoutSummary) throw new Error('The final holdout report has no candidate summary.')
      autoHoldout.value = {
        method: leader.method, jobId: holdoutJob.id,
        trades: holdoutSummary.total_trades ?? 0,
        pnl: holdoutSummary.net_profit ?? 0,
        drawdown: holdoutSummary.max_drawdown_percent ?? 0,
        profitFactor: holdoutSummary.profit_factor ?? 0,
      }
      cacheSelectedCandidate()
      cacheAutoComparison()
      const closedOosTrades = leader.envelope?.report?.walk_forward?.windows
        ?.reduce((total, window) => total + (window.validation_closed_trade_pnls?.length ?? 0), 0) ?? 0
      if (closedOosTrades < 30 || (selected.summary?.total_trades ?? 0) < 30) {
        reportLabel.value = 'Limited trade sample'
        reportMessage.value = `Final holdout is complete with ${autoHoldout.value.trades} trades. Automatic Monte Carlo needs at least 30 closed walk-forward and research-period trades; this run has ${closedOosTrades} walk-forward trades.`
      } else {
        autoWorkflowStage.value = 'Stress-testing walk-forward trades'
        reportMessage.value = 'Running Monte Carlo on the walk-forward selection and refined final candidate…'
        const monteJob = await createMonteCarloJob({
          closedTradePnls: [], initialCapital: currentExecution.initialCapital,
          config: {
            simulations: 100000, seed: 42, sampling: { mode: 'block_bootstrap', block_size: 5 },
            skip_probability: 0.15, pnl_jitter_fraction: 0.2,
            max_additional_cost_per_trade: 0.05, ruin_equity_percent_of_initial: 50,
          },
          dataset: { symbol: currentSetup.symbol, timeframe: currentSetup.timeframe, endBeforeUtc: currentSetup.endBefore || null },
          candidate: selectedParams, sourceResearchJobId: sourceJobId,
          fixedCandidateScope: 'research_period',
          holdoutEvidence: autoHoldout.value,
        })
        activeJob.value = monteJob
        await waitForResearchJob(monteJob.id, (progress) => {
          activeJob.value = progress
          reportMessage.value = progress.message
        })
        const monteReport = await getResearchReport<{ report?: { monte_carlo?: { source_trades?: number; probability_of_loss?: number; net_profit?: { p05?: number }; max_drawdown_percent?: { p95?: number } } } }>(monteJob.id)
        const monte = monteReport.report?.monte_carlo
        if (!monte) throw new Error('The Monte Carlo report has no simulation results.')
        autoMonte.value = {
          jobId: monteJob.id, sourceTrades: monte.source_trades ?? 0,
          p05: monte.net_profit?.p05 ?? 0,
          lossProbability: monte.probability_of_loss ?? 0,
          p95Drawdown: monte.max_drawdown_percent?.p95 ?? 0,
        }
        sessionStorage.setItem('monte-carlo-report', JSON.stringify(monteReport))
        cacheAutoComparison()
        reportLabel.value = autoHoldout.value.pnl <= 0 ? 'Holdout needs review' : autoHoldout.value.trades < 30 ? 'Limited holdout' : 'Research run complete'
        reportMessage.value = `Broad search, refinement, walk-forward, untouched holdout and Monte Carlo are complete. The final period had ${autoHoldout.value.trades} trades and ${autoHoldout.value.pnl >= 0 ? 'positive' : 'negative'} P&L${autoHoldout.value.trades < 30 ? '; its small sample cannot establish robustness' : ''}.`
      }
      autoWorkflowStage.value = 'Complete'
    }
    cacheAutoComparison()
  } catch (error) {
    const partial = autoFamilies.value.some((family) => family.status === 'completed')
    reportLabel.value = partial ? 'Follow-up incomplete' : 'Failed'
    autoWorkflowStage.value = partial ? 'Needs review' : 'Failed'
    reportMessage.value = `${partial ? 'The completed method reports remain available. ' : ''}${error instanceof Error ? error.message : 'Automatic research failed.'}`
    cacheAutoComparison()
  } finally {
    isRunning.value = false
  }
}

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
  autoFamilies.value = []
  selectedAutoMethod.value = null
  activeReport.value = null
  activeJob.value = null
  selectedRank.value = 1
  sessionStorage.removeItem('research-report')
  sessionStorage.removeItem('auto-research-comparison')
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
  const autoCached = sessionStorage.getItem('auto-research-comparison')
  if (autoCached) {
    try {
      if (restoreAutoComparison(JSON.parse(autoCached))) return
    } catch {
      sessionStorage.removeItem('auto-research-comparison')
    }
  }
  const cached = sessionStorage.getItem('research-report')
  if (cached) {
    try {
      applyReport(JSON.parse(cached), 'Saved native report')
      researchMode.value = 'manual'
    } catch {
      sessionStorage.removeItem('research-report')
    }
  }
})

onActivated(() => {
  const handoff = consumeResearchHandoff()
  if (!handoff) return
  researchMode.value = 'automatic'
  autoFamilies.value = []
  autoHoldout.value = null
  autoMonte.value = null
  selectedAutoMethod.value = null
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
  reportMessage.value = 'Loaded the current Backtest setup. Starting automatic research…'
  sessionStorage.removeItem('research-report')
  sessionStorage.removeItem('auto-research-comparison')
  sessionStorage.removeItem('selected-research-candidate')
  sessionStorage.removeItem('monte-carlo-report')
  void runAutomaticResearch()
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

    <div class="research-mode-switch" role="group" aria-label="Optimization mode">
      <button type="button" :class="{ active: researchMode === 'automatic' }" :disabled="isRunning" @click="researchMode = 'automatic'">Automatic comparison</button>
      <button type="button" :class="{ active: researchMode === 'manual' }" :disabled="isRunning" @click="researchMode = 'manual'">Manual search</button>
    </div>

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
              <FieldTooltip label="Candidate safety limit" text="Maximum combinations in one manual job or across the four automatic method families." />
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
              <label for="minimum-trades">{{ researchMode === 'automatic' ? 'Min research/OOS trades' : 'Min full-period trades' }}</label>
              <input
                id="minimum-trades"
                v-model.number="validation.minimumTrades"
                type="number"
                min="0"
              />
              <FieldTooltip label="Minimum trades" :text="researchMode === 'automatic' ? 'Minimum closed trades for research-period eligibility and for the automatic OOS family evidence check.' : 'Eligibility threshold for the full-dataset ranking. It does not reject out-of-sample results.'" />
            </div>
            <div class="research-field"><label for="minimum-train-trades">Min train trades</label><input id="minimum-train-trades" v-model.number="validation.trainingMinimumTrades" type="number" min="0" /><FieldTooltip label="Minimum training trades" text="Eligibility threshold when selecting one candidate within each walk-forward training window." /></div>
            <div class="research-field">
              <label for="maximum-drawdown">{{ researchMode === 'automatic' ? 'Max DD %' : 'Max full/train DD %' }}</label>
              <input
                id="maximum-drawdown"
                v-model.number="validation.maximumDrawdown"
                type="number"
                min="0"
              />
              <FieldTooltip label="Maximum drawdown" :text="researchMode === 'automatic' ? 'Research-period and training candidates must stay below this ceiling; the automatic family comparison also checks worst OOS window drawdown.' : 'Eligibility ceiling for full-dataset ranking and training-window selection. Out-of-sample drawdown is reported without filtering.'" />
            </div>
            <div class="research-field">
              <label for="minimum-pf">{{ researchMode === 'automatic' ? 'Min research-period PF' : 'Min full-period PF' }}</label>
              <input
                id="minimum-pf"
                v-model.number="validation.minimumProfitFactor"
                type="number"
                min="0"
                step="0.1"
              />
              <FieldTooltip label="Minimum profit factor" :text="researchMode === 'automatic' ? 'Eligibility threshold for the research-period ranking only. Walk-forward validation results remain untouched.' : 'Eligibility threshold for the full-dataset ranking only. Walk-forward validation results remain untouched.'" />
            </div>
            <div class="research-inline-notice">Walk-forward windows stay untouched during each training selection. {{ researchMode === 'automatic' ? 'Automatic comparison also checks OOS trades and drawdown after the run, so its leading method remains provisional.' : 'Manual thresholds select candidates on full-period and training data only.' }}</div>
          </div>
        </section>
      </div>

      <div class="research-column">
        <section v-if="researchMode === 'automatic'" class="research-card">
          <h2 class="research-card-title">Automatic strategy comparison <small>Four SL/TP methods</small></h2>
          <div class="research-card-body">
            <p class="research-axis-intro">One run compares four SL/TP methods. Within each training window it explores the strategy's signal and entry choices, then refines the best diverse setups and method-specific exits. The latest period is reserved for a final check; Monte Carlo follows automatically when there are enough trades.</p>
            <p class="research-axis-intro">{{ number(autoCandidateTotal) }} broad candidates in total, plus bounded training-only refinements · starting settings from {{ baseSettingsSource }}. Costs, gearing and safeguards stay fixed.</p>
            <div class="research-button-row">
              <button class="research-primary" type="button" :disabled="isRunning || autoCandidateTotal < 1" @click="runAutomaticResearch">
                {{ isRunning ? 'Running automatic comparison…' : '▶ Find robust setups' }}
              </button>
            </div>
            <div v-if="autoFamilies.length" class="auto-family-list">
              <div v-for="family in autoFamilies" :key="family.method" class="auto-family-progress">
                <span>{{ autoMethodLabel(family.method) }}</span>
                <span>{{ family.candidateCount }} candidates · {{ family.status }}</span>
              </div>
            </div>
            <p v-if="isRunning" class="research-axis-intro">Current stage: {{ autoWorkflowStage }}</p>
            <div v-if="reportMessage" class="research-inline-notice">{{ reportMessage }}</div>
            <p class="research-axis-intro auto-evidence-note">Methods are ranked on walk-forward evidence. The final holdout is checked once after a method is chosen and never feeds back into the search. Monte Carlo stresses the observed trades; it does not certify future returns.</p>
          </div>
        </section>

        <section v-if="researchMode === 'manual'" class="research-card">
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
        <section v-if="researchMode === 'automatic'" class="research-card">
          <h2 class="research-card-title">Walk-forward comparison <small>Provisional OOS ranking</small></h2>
          <p class="research-axis-intro auto-ranking-note">Methods that pass the evidence checks come first. Within each group, higher compounded OOS return relative to drawdown ranks first (5% drawdown floor).</p>
          <div v-if="rankedAutoFamilies.length" class="results-table-wrap">
            <table class="results-table auto-results-table">
              <thead><tr><th>Method</th><th>OOS P&amp;L</th><th>Trades</th><th>Worst DD</th><th>Positive windows</th><th>Evidence</th></tr></thead>
              <tbody>
                <tr v-for="family in rankedAutoFamilies" :key="family.method" :class="{ selected: selectedAutoMethod === family.method }" :aria-selected="selectedAutoMethod === family.method" tabindex="0" @click="showAutoFamily(family.method)" @keydown.enter="showAutoFamily(family.method)" @keydown.space.prevent="showAutoFamily(family.method)">
                  <td>{{ autoMethodLabel(family.method) }}</td>
                  <td :class="family.evidence.oosPnl > 0 ? 'metric-positive' : 'metric-negative'">{{ family.evidence.oosPnl > 0 ? '+' : '' }}{{ number(family.evidence.oosPnl) }}</td>
                  <td>{{ family.evidence.oosTrades }}</td>
                  <td>{{ number(family.evidence.worstOosDrawdown, 1) }}%</td>
                  <td>{{ family.evidence.profitableWindows }}/{{ family.evidence.windows }}</td>
                  <td :class="family.evidence.eligible ? 'metric-positive' : 'metric-negative'">{{ family.evidence.eligible ? 'Pass' : 'Review' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="research-card-body research-axis-intro">Run automatic comparison to see walk-forward evidence for all four methods.</div>
          <div v-if="rankedAutoFamilies.length" class="research-card-body">
            <div v-if="recommendedAutoFamily" class="research-inline-notice">Provisional leader: {{ autoMethodLabel(recommendedAutoFamily.method) }}. It passed the OOS evidence checks. Select a row to inspect its research-period candidates and validation windows.</div>
            <div v-else class="research-inline-notice">No method passed every OOS evidence check. The rows are still available for inspection; none is recommended.</div>
            <p v-if="selectedAutoMethod" class="research-axis-intro">{{ autoFamilies.find((family) => family.method === selectedAutoMethod)?.evidence?.reason }}</p>
            <div v-if="autoHoldout" class="research-inline-notice">
              Untouched final period · {{ autoMethodLabel(autoHoldout.method) }}: {{ autoHoldout.trades }} trades, {{ autoHoldout.pnl >= 0 ? '+' : '' }}{{ number(autoHoldout.pnl) }} USDT, {{ number(autoHoldout.drawdown, 1) }}% max DD. This result did not choose the method.
            </div>
            <div v-if="autoMonte" class="research-inline-notice">
              Automatic Monte Carlo · {{ autoMonte.sourceTrades }} walk-forward trades: 5th percentile {{ autoMonte.p05 >= 0 ? '+' : '' }}{{ number(autoMonte.p05) }} USDT, simulated loss share {{ number(autoMonte.lossProbability * 100, 1) }}%, 95th-percentile drawdown {{ number(autoMonte.p95Drawdown, 1) }}%.
              <button class="research-secondary" type="button" @click="openMonteCarlo">View Monte Carlo</button>
            </div>
            <button class="research-secondary" type="button" @click="exportAutoComparison">Export comparison</button>
          </div>
          <div v-if="autoFamilies.some((family) => family.status === 'failed')" class="research-card-body">
            <p v-for="family in autoFamilies.filter((row) => row.status === 'failed')" :key="family.method" class="research-axis-intro metric-negative">{{ autoMethodLabel(family.method) }} failed: {{ family.error }}</p>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">
            Best Candidates
            <small>{{ researchMode === 'automatic' ? 'Research-period' : 'Full-period' }} ranking {{ selectedAutoMethod && researchMode === 'automatic' ? `within ${autoMethodLabel(selectedAutoMethod)}` : '' }} · {{ reportLabel }}</small>
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
            <div v-if="researchMode === 'automatic' && recommendedAutoSelection?.selected_parameters && candidates.every((candidate) => !candidate.eligible)" class="research-inline-notice">
              None of the broad starting points passed the research-period filters. Refinement found the current setup shown below; the numbered rows remain visible as starting-point evidence.
            </div>
            <div v-if="recommendedAutoSelection?.selected_parameters" class="research-inline-notice">
              <strong>Current setup selected after refinement:</strong> {{ describeParameters(recommendedAutoSelection.selected_parameters.params ?? {}) }}. It was chosen on the research period; the separate final-period result above checks it on later data. Click a numbered row to inspect another research-period candidate.
            </div>
            <div class="research-summary-line">
              <span>Walk-forward selection · compounded OOS equity P&amp;L</span>
              <strong>{{ number(activeReport.report.walk_forward.compounded_out_of_sample_net_profit ?? 0) }} USDT · {{ activeReport.report.walk_forward.total_validation_trades ?? 0 }} trades / {{ activeReport.report.walk_forward.windows?.length ?? 0 }} windows</strong>
            </div>
            <div v-if="walkForwardClosedPnl != null" class="research-summary-line">
              <span>Closed-trade OOS P&amp;L used by Monte Carlo</span>
              <strong>{{ number(walkForwardClosedPnl) }} USDT</strong>
            </div>
            <div v-if="selectedCandidateRow" class="research-inline-notice">
              Candidate #{{ selectedCandidateRow.rank }} seeded {{ selectedCandidateRow.selectedWindows }} training windows; their refined setups had {{ number(selectedCandidateRow.selectedOosPnl) }} USDT in summed OOS equity P&amp;L and {{ selectedCandidateRow.selectedClosedOosPnl == null ? '—' : number(selectedCandidateRow.selectedClosedOosPnl) }} USDT from closed trades across {{ selectedCandidateRow.selectedOosTrades }} trades. The headline compounds window equity returns. Monte Carlo samples closed-trade P&amp;L only, so its source differs when a window ends with an open position.
              <span v-if="singleCandidateSearch">Only one candidate was tested, so its settings stayed fixed across all windows. These windows are not independent evidence if the candidate was originally chosen by looking at the same history.</span>
              <span v-else>This is not an OOS test of the same fixed candidate in every window; automatic refinement can change a seed's settings inside each training period.</span>
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
              <p class="walk-forward-note">Bar ranges are zero-based; end indices are exclusive. Each OOS window starts flat and follows its own untouched broad search and refinement on training data.</p>
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
              {{ autoMonte && selectedRank === 0 && selectedAutoMethod === autoHoldout?.method ? 'View Monte Carlo' : 'Run Monte Carlo' }}
            </button>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Return vs Drawdown <small>{{ researchMode === 'automatic' ? 'Top 10 broad candidates + refined setup' : 'Top 10 full-period candidates' }}</small></h2>
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
                  :fill="selectedRank === point.rank ? '#2699ff' : point.rank === 0 ? '#a9b7ff' : point.eligible ? '#46dd89' : '#72869b'"
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
          <p class="scatter-caption">Up means higher return in the ranking period; left means lower drawdown. Blue marks the selected setup; violet marks the refined setup when another row is selected. Neither point proves out-of-sample performance.</p>
        </section>
      </div>
    </div>
  </div>
</template>
