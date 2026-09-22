<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FieldTooltip from '@/components/FieldTooltip.vue'
import { fetchBinanceKlines, fetchSymbolFilters } from '@/services/binanceAPI'
import {
  createResearchJob,
  downloadResearchReport,
  getResearchReport,
  unwrapResearchReport,
  waitForResearchJob,
  type ResearchJobSnapshot,
} from '@/services/researchAPI'

type NumericAxis = {
  id: string
  label: string
  type: 'numeric'
  enabled: boolean
  min: number
  max: number
  step: number
}

type ValueAxis = {
  id: string
  label: string
  type: 'values'
  enabled: boolean
  values: string[]
}

type ResearchAxis = NumericAxis | ValueAxis

type CandidateRow = {
  rank: number
  label: string
  netProfit: number
  drawdown: number
  profitFactor: number
  eligible: boolean
  fullDatasetTrades: number
  parameters: Record<string, unknown>
}

type OptimizationReport = {
  optimization?: {
    evaluations?: Array<{
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
    windows?: unknown[]
  }
}

type ResearchEnvelope = {
  job?: { id?: string; createdAt?: string }
  reproducibility?: {
    dataset?: { symbol?: string; timeframe?: string; endBeforeUtc?: string | null }
    fingerprint?: { bars?: number }
    parameterGrid?: {
      base?: { strategy?: string }
      axes?: Array<{ parameter?: string; values?: unknown[] }>
      max_candidates?: number
    }
    plan?: {
      optimization?: { min_trades?: number; max_drawdown_percent?: number; min_profit_factor?: number }
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

const setup = reactive({
  strategy: 'EMA / VWAP',
  symbol: 'SOLUSDT',
  timeframe: '1h',
  dataset: 15095,
  endBefore: '2026-09-22T00:00',
  maxCandidates: 100000,
})

const validation = reactive({
  method: 'Rolling walk-forward',
  trainDays: 180,
  validateDays: 60,
  stepDays: 60,
  minimumTrades: 30,
  maximumDrawdown: 25,
  minimumProfitFactor: 1,
})

const axisHelp: Record<string, string> = {
  ema_length: 'EMA lookback values that will be evaluated as separate optimization candidates.',
  ema_source: 'Price sources included as discrete EMA-source candidates.',
  trailing_sl_percent: 'Trailing stop percentages included in the parameter search.',
  static_tp_percent: 'Static take-profit percentages included in the parameter search.',
  dmi_threshold: 'ADX pause thresholds included when this optimization axis is enabled.',
}

const emaAxes = (): ResearchAxis[] => [
  {
    id: 'ema_length',
    label: 'EMA Length',
    type: 'numeric',
    enabled: true,
    min: 80,
    max: 160,
    step: 4,
  },
  { id: 'ema_source', label: 'EMA Source', type: 'values', enabled: true, values: ['High', 'Low'] },
  {
    id: 'trailing_sl_percent',
    label: 'Trailing SL %',
    type: 'numeric',
    enabled: true,
    min: 2,
    max: 4,
    step: 0.5,
  },
  {
    id: 'static_tp_percent',
    label: 'Static TP %',
    type: 'numeric',
    enabled: true,
    min: 4,
    max: 7,
    step: 0.5,
  },
  {
    id: 'dmi_threshold',
    label: 'ADX pause below',
    type: 'numeric',
    enabled: false,
    min: 14.05,
    max: 14.05,
    step: 0.5,
  },
]

const smaAxes = (): ResearchAxis[] => [
  { id: 'sma_fast_period', label: 'Fast SMA Period', type: 'numeric', enabled: true, min: 8, max: 14, step: 1 },
  { id: 'sma_slow_period', label: 'Slow SMA Period', type: 'numeric', enabled: true, min: 60, max: 90, step: 5 },
  { id: 'trailing_sl_percent', label: 'Trailing SL %', type: 'numeric', enabled: true, min: 2, max: 4, step: 0.5 },
  { id: 'static_tp_percent', label: 'Static TP %', type: 'numeric', enabled: true, min: 4, max: 7, step: 0.5 },
  { id: 'dmi_threshold', label: 'ADX pause below', type: 'numeric', enabled: false, min: 14.05, max: 14.05, step: 0.5 },
]

const axes = reactive<ResearchAxis[]>(emaAxes())
const candidates = ref<CandidateRow[]>([])

watch(
  () => setup.strategy,
  (strategy) => {
    axes.splice(0, axes.length, ...(strategy === 'EMA / VWAP' ? emaAxes() : smaAxes()))
    candidates.value = []
    activeReport.value = null
    reportLabel.value = 'Not run'
  },
  { flush: 'sync' },
)

const axisCount = (axis: ResearchAxis): number => {
  if (!axis.enabled) return 1
  if (axis.type === 'values') return Math.max(1, axis.values.length)
  if (axis.step <= 0 || axis.max < axis.min) return 0
  return Math.floor((axis.max - axis.min) / axis.step + 1e-9) + 1
}

const candidateCount = computed(() =>
  axes.reduce((total, axis) => total * Math.max(1, axisCount(axis)), 1),
)

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
  if ('fast_period' in parameters) {
    return `SMA ${parameters.fast_period}/${parameters.slow_period} · SL ${parameters.trailing_sl_perc}% · TP ${parameters.fixed_tp_for_trailing_perc}%`
  }
  const ema = parameters.ema_length ?? '—'
  const source = parameters.ema_source ?? '—'
  const sl = parameters.trailing_sl_perc ?? '—'
  const tp = parameters.fixed_tp_for_trailing_perc ?? '—'
  return `EMA ${ema}, ${source} · SL ${sl}% · TP ${tp}%`
}

const applyReport = (value: unknown, label: string) => {
  const envelope = value as ResearchEnvelope
  const report = unwrapResearchReport<OptimizationReport>(value)
  const evaluations = report.optimization?.evaluations
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    throw new Error('The file does not contain optimization.evaluations.')
  }
  candidates.value = evaluations.slice(0, 10).map((evaluation, index) => {
    const parameters = evaluation.parameters?.params ?? {}
    return {
      rank: index + 1,
      label: describeParameters(parameters),
      netProfit: evaluation.summary?.net_profit ?? 0,
      drawdown: evaluation.summary?.max_drawdown_percent ?? 0,
      profitFactor: evaluation.summary?.profit_factor ?? 0,
      eligible: (evaluation.rejection_reasons?.length ?? 0) === 0,
      fullDatasetTrades: evaluation.summary?.total_trades ?? 0,
      parameters: evaluation.parameters ?? {},
    }
  })
  selectedRank.value = candidates.value.find((candidate) => candidate.eligible)?.rank ?? 1
  activeReport.value = 'report' in envelope ? envelope : ({ report } as ResearchEnvelope)
  const definition = envelope.reproducibility
  if (definition) {
    const strategy = definition.parameterGrid?.base?.strategy === 'sma_crossover' ? 'SMA Crossover' : 'EMA / VWAP'
    setup.strategy = strategy
    setup.symbol = definition.dataset?.symbol ?? setup.symbol
    setup.timeframe = definition.dataset?.timeframe ?? setup.timeframe
    setup.endBefore = definition.dataset?.endBeforeUtc?.replace(/:00Z$/, '') ?? setup.endBefore
    setup.dataset = definition.fingerprint?.bars ?? setup.dataset
    setup.maxCandidates = definition.parameterGrid?.max_candidates ?? setup.maxCandidates
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
    validation.maximumDrawdown = optimization?.max_drawdown_percent ?? validation.maximumDrawdown
    validation.minimumProfitFactor = optimization?.min_profit_factor ?? validation.minimumProfitFactor
    const walkForward = definition.plan?.walk_forward
    const barsPerDay = 1440 / ({ '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[setup.timeframe] ?? 60)
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
      initialCapital: 10000,
      evidencePreview: {
        fullDatasetTrades: selected.fullDatasetTrades,
        outOfSampleTrades: activeReport.value.report?.walk_forward?.total_validation_trades ?? 0,
        walkForwardWindows: activeReport.value.report?.walk_forward?.windows?.length ?? 0,
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
            windows: report.walk_forward.windows?.map(() => ({})),
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
  const values: number[] = []
  for (let value = axis.min; value <= axis.max + axis.step * 1e-9; value += axis.step) {
    values.push(Number(value.toFixed(8)))
  }
  return values
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

const intervalMinutes = computed(() => ({ '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[setup.timeframe] ?? 60))
const daysToBars = (days: number) => Math.max(1, Math.round((days * 1440) / intervalMinutes.value))

const prepareRun = async () => {
  if (candidateCount.value < 1) return
  if (candidateCount.value > setup.maxCandidates) {
    reportMessage.value = `${number(candidateCount.value)} combinations exceed the job safety limit of ${number(setup.maxCandidates)}.`
    return
  }
  isRunning.value = true
  reportMessage.value = 'Fetching the fixed market dataset…'
  candidates.value = []
  try {
    const endTime = setup.endBefore ? Date.parse(`${setup.endBefore}:00Z`) : undefined
    const [klines, filters] = await Promise.all([
      fetchBinanceKlines(setup.symbol, setup.timeframe, setup.dataset, endTime),
      fetchSymbolFilters(setup.symbol),
    ])
    const common = baseCommon()
    const parameterGrid = {
      base:
        setup.strategy === 'EMA / VWAP'
          ? { strategy: 'ema_vwap', params: { ...common, ema_length: 122, ema_source: 'High', vwap_anchor_period: 'Week', vwap_source: 'Open', trade_direction: 'Long' } }
          : { strategy: 'sma_crossover', params: { ...common, fast_period: 10, slow_period: 73, trade_direction: 'Both' } },
      axes: axes.filter((axis) => axis.enabled).map((axis) => ({ parameter: axis.id, values: valuesForAxis(axis) })),
      max_candidates: setup.maxCandidates,
    }
    const job = await createResearchJob({
      klines,
      config: { commission_percent: 0.05, slippage_ticks: 2, tick_size: filters.tickSize, step_size: filters.stepSize },
      initialCapital: 10000,
      flags: { price_to_tick: false, quantity_step: true, sl_tp_tick: false },
      parameterGrid,
      plan: {
        optimization: { min_trades: validation.minimumTrades, max_drawdown_percent: validation.maximumDrawdown, min_profit_factor: validation.minimumProfitFactor, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward_optimization: { min_trades: Math.max(1, Math.floor(validation.minimumTrades / 6)), max_drawdown_percent: validation.maximumDrawdown, min_profit_factor: null, score_metric: { composite: { drawdown_weight: 1, profit_factor_weight: 2 } } },
        walk_forward: { training_bars: daysToBars(validation.trainDays), validation_bars: daysToBars(validation.validateDays), step_bars: daysToBars(validation.stepDays), anchored_training: validation.method === 'Anchored walk-forward', max_windows: 100 },
        monte_carlo: null,
        monte_carlo_top_candidates: 1,
      },
      dataset: { symbol: setup.symbol, timeframe: setup.timeframe, endBeforeUtc: setup.endBefore || null },
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
  if (!cached) return
  try {
    applyReport(JSON.parse(cached), 'Saved native report')
  } catch {
    sessionStorage.removeItem('research-report')
  }
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
                <option>15m</option>
                <option>1h</option>
                <option>4h</option>
                <option>1d</option>
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
              <label for="minimum-trades">Minimum trades</label>
              <input
                id="minimum-trades"
                v-model.number="validation.minimumTrades"
                type="number"
                min="0"
              />
              <FieldTooltip label="Minimum trades" text="Rejects candidates with too few completed trades for a meaningful comparison." />
            </div>
            <div class="research-field">
              <label for="maximum-drawdown">Maximum DD %</label>
              <input
                id="maximum-drawdown"
                v-model.number="validation.maximumDrawdown"
                type="number"
                min="0"
              />
              <FieldTooltip label="Maximum drawdown" text="Eligibility ceiling for out-of-sample maximum equity drawdown, expressed as a percentage." />
            </div>
            <div class="research-field">
              <label for="minimum-pf">Minimum PF</label>
              <input
                id="minimum-pf"
                v-model.number="validation.minimumProfitFactor"
                type="number"
                min="0"
                step="0.1"
              />
              <FieldTooltip label="Minimum profit factor" text="Rejects candidates whose out-of-sample gross-profit-to-gross-loss ratio is below this value." />
            </div>
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
            <div class="axis-table">
              <div class="axis-row axis-head">
                <div class="axis-cell">Parameter</div>
                <div class="axis-cell">Optimize</div>
                <div class="axis-cell">Values / Range</div>
                <div class="axis-cell">Count</div>
              </div>

              <div v-for="axis in axes" :key="axis.id" class="axis-row">
                <div class="axis-cell axis-name axis-name-with-help">
                  {{ axis.label }}
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
                  <div v-if="axis.type === 'numeric'" class="axis-range">
                    <input v-model.number="axis.min" type="number" :disabled="!axis.enabled" />
                    <span>to</span>
                    <input v-model.number="axis.max" type="number" :disabled="!axis.enabled" />
                    <span>step</span>
                    <input
                      v-model.number="axis.step"
                      type="number"
                      min="0.0001"
                      :disabled="!axis.enabled"
                    />
                  </div>
                  <div v-else class="axis-values">
                    <span v-for="value in axis.values" :key="value" class="axis-chip">{{
                      value
                    }}</span>
                  </div>
                </div>
                <div class="axis-cell">{{ axisCount(axis) }}</div>
              </div>
            </div>

            <div class="research-summary-line">
              <span
                ><strong>{{ number(candidateCount) }}</strong> combinations</span
              >
              <span>Estimated {{ estimatedSeconds }} s</span>
            </div>

            <div class="research-button-row">
              <button class="research-primary" type="button" :disabled="isRunning" @click="prepareRun">
                {{ isRunning ? 'Running optimization…' : '▶ Run optimization' }}
              </button>
            </div>

            <div class="research-inline-notice">
              Search values are sent as job data to the native Rust runner; changing them does not require source-code changes.
            </div>
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
            <small>{{ reportLabel }}</small>
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
                  @click="selectCandidate(candidate.rank)"
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
          <h2 class="research-card-title">Return vs Drawdown <small>Candidate frontier</small></h2>
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
        </section>
      </div>
    </div>
  </div>
</template>
