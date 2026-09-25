<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import FieldTooltip from '@/components/FieldTooltip.vue'
import {
  createMonteCarloJob,
  downloadResearchReport,
  getResearchReport,
  unwrapResearchReport,
  waitForResearchJob,
  type ResearchJobSnapshot,
} from '@/services/researchAPI'

type Distribution = {
  minimum: number
  p05: number
  p50: number
  mean: number
  p95: number
  maximum: number
}

type HistogramBin = {
  lower_bound: number
  upper_bound: number
  count: number
}

type MonteCarloSummary = {
  simulations: number
  sourceTrades: number
  probabilityOfLoss: number
  probabilityOfRuin: number
  netProfit: Distribution
  drawdown: Distribution
  netProfitHistogram: HistogramBin[]
  drawdownHistogram: HistogramBin[]
}

type EvidenceSummary = {
  primary: string
  minimumSourceTrades: number
  walkForwardWindows: number
  outOfSampleTrades: number
  fullDatasetTrades: number
}

type HoldoutEvidence = {
  jobId: string
  trades: number
  pnl: number
  drawdown: number
  profitFactor: number
}

type MonteCarloReportResult = {
  simulations?: number
  source_trades?: number
  probability_of_loss?: number
  probability_of_ruin?: number
  net_profit?: Distribution
  max_drawdown_percent?: Distribution
  net_profit_histogram?: HistogramBin[]
  max_drawdown_percent_histogram?: HistogramBin[]
}

const emptyDistribution = (): Distribution => ({
  minimum: 0,
  p05: 0,
  p50: 0,
  mean: 0,
  p95: 0,
  maximum: 0,
})

const emptySummary = (): MonteCarloSummary => ({
  simulations: 0,
  sourceTrades: 0,
  probabilityOfLoss: 0,
  probabilityOfRuin: 0,
  netProfit: emptyDistribution(),
  drawdown: emptyDistribution(),
  netProfitHistogram: [],
  drawdownHistogram: [],
})

const router = useRouter()
const reportInput = ref<HTMLInputElement | null>(null)
const reportLabel = ref('No simulation')
const reportMessage = ref('')
const candidateDescription = ref('—')
const selectedCandidate = ref<{
  sourceResearchJobId?: string
  candidate: Record<string, unknown>
  description: string
  strategy: string
  fixedCandidateScope?: 'research_period' | 'full_dataset'
  holdoutEvidence?: HoldoutEvidence | null
  dataset: { symbol: string; timeframe: string; endBeforeUtc?: string | null }
  initialCapital: number
  evidencePreview?: {
    fullDatasetTrades?: number
    outOfSampleTrades?: number
    walkForwardWindows?: number
  }
} | null>(null)
const activeJob = ref<ResearchJobSnapshot | null>(null)
const activeReport = ref<unknown>(null)
const isRunning = ref(false)

const settings = reactive({
  sampling: 'Block bootstrap',
  simulations: 100000,
  blockSize: 5,
  skipProbability: 15,
  pnlJitter: 0.2,
  extraCost: 0.05,
  ruinThreshold: 50,
  seed: 42,
})

const summary = reactive<MonteCarloSummary>(emptySummary())
const fullDatasetSummary = reactive<MonteCarloSummary>(emptySummary())
const evidence = reactive<EvidenceSummary>({
  primary: 'none',
  minimumSourceTrades: 30,
  walkForwardWindows: 0,
  outOfSampleTrades: 0,
  fullDatasetTrades: 0,
})
const hasFullDatasetComparison = ref(false)
const fixedCandidateScope = ref<'research_period' | 'full_dataset'>('full_dataset')
const holdoutEvidence = ref<HoldoutEvidence | null>(null)
const fixedCandidateScopeLabel = computed(() => fixedCandidateScope.value === 'research_period' ? 'research period' : 'full dataset')
const candidateIdentity = (sourceJobId: string | undefined, candidate: Record<string, unknown> | undefined) =>
  JSON.stringify([sourceJobId, candidate ? Object.entries(candidate).sort(([left], [right]) => left.localeCompare(right)) : null])

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`

const drawdownVerdict = computed(() => {
  if (holdoutEvidence.value && holdoutEvidence.value.pnl <= 0)
    return 'Final holdout did not confirm the setup'
  if (holdoutEvidence.value && holdoutEvidence.value.trades < 30)
    return 'Limited final holdout evidence'
  if (summary.sourceTrades < evidence.minimumSourceTrades) return 'Insufficient trade evidence'
  if (evidence.primary !== 'walk_forward_oos') return 'Re-run with walk-forward evidence'
  if (summary.netProfit.p50 <= 0 || summary.probabilityOfLoss >= 0.5)
    return 'Unfavorable simulated outcome'
  if (summary.probabilityOfRuin >= 0.05 || summary.drawdown.p95 >= 40)
    return 'Tail risk requires changes'
  if (summary.probabilityOfLoss >= 0.3 || summary.drawdown.p95 >= 25)
    return 'Substantial simulated loss risk — review required'
  if (fixedCandidateScope.value === 'research_period' && !holdoutEvidence.value)
    return 'Simulation favorable; final validation not established'
  return 'Favorable under these assumptions'
})

const evidenceQuality = computed(() => {
  const trades = evidence.primary === 'walk_forward_oos'
    ? summary.sourceTrades
    : (selectedCandidate.value?.evidencePreview?.outOfSampleTrades ?? 0)
  if (!trades) return { label: 'Not simulated', tone: 'neutral' }
  if (trades < evidence.minimumSourceTrades)
    return { label: 'Insufficient sample', tone: 'danger' }
  if (trades < 50) return { label: 'Limited OOS sample', tone: 'warning' }
  return { label: '50+ OOS trades', tone: 'success' }
})

const displayedOutOfSampleTrades = computed(() =>
  evidence.primary === 'walk_forward_oos'
    ? summary.sourceTrades
    : (selectedCandidate.value?.evidencePreview?.outOfSampleTrades ?? 0),
)

const displayedFullDatasetTrades = computed(() => {
  if (hasFullDatasetComparison.value) return fullDatasetSummary.sourceTrades
  if (evidence.primary === 'legacy_full_dataset') return summary.sourceTrades
  return selectedCandidate.value?.evidencePreview?.fullDatasetTrades ?? 0
})

const displayedWalkForwardWindows = computed(() =>
  evidence.walkForwardWindows
    || selectedCandidate.value?.evidencePreview?.walkForwardWindows
    || 0,
)

const hasInsufficientPreview = computed(() => {
  const trades = selectedCandidate.value?.evidencePreview?.outOfSampleTrades
  return typeof trades === 'number' && trades < evidence.minimumSourceTrades
})

const primaryEvidenceLabel = computed(() =>
  evidence.primary === 'legacy_full_dataset' ? 'Full dataset' : 'Walk-forward selection OOS',
)

const initialCapitalForChart = computed(() => selectedCandidate.value?.initialCapital ?? 10000)

const equityY = (pnl: number) => {
  const values = [
    0,
    summary.netProfit.minimum,
    summary.netProfit.p05,
    summary.netProfit.p50,
    summary.netProfit.p95,
    summary.netProfit.maximum,
  ].map((value) => initialCapitalForChart.value + value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = Math.max(maximum - minimum, 1)
  return 252 - ((initialCapitalForChart.value + pnl - minimum) / range) * 220
}

const fanPath = (pnl: number) => {
  const startY = equityY(0)
  const endY = equityY(pnl)
  return `M55 ${startY} C250 ${startY}, 520 ${endY}, 705 ${endY}`
}

const fanAreaPath = computed(() => {
  const startY = equityY(0)
  return `${fanPath(summary.netProfit.p95)} L705 ${equityY(summary.netProfit.p05)} C520 ${equityY(summary.netProfit.p05)}, 250 ${startY}, 55 ${startY} Z`
})

const distributionX = (value: number, distribution: Distribution) => {
  const range = Math.max(distribution.maximum - distribution.minimum, 1e-9)
  return 55 + ((value - distribution.minimum) / range) * 480
}

const histogramMax = (bins: HistogramBin[]) => Math.max(1, ...bins.map((bin) => bin.count))
const histogramBarX = (bin: HistogramBin, distribution: Distribution) =>
  distributionX(bin.lower_bound, distribution)
const histogramBarWidth = (bin: HistogramBin, distribution: Distribution) =>
  Math.max(1, distributionX(bin.upper_bound, distribution) - histogramBarX(bin, distribution) - 1)
const histogramBarY = (bin: HistogramBin, bins: HistogramBin[]) =>
  200 - (bin.count / histogramMax(bins)) * 150
const histogramBarHeight = (bin: HistogramBin, bins: HistogramBin[]) =>
  200 - histogramBarY(bin, bins)
const distributionTicks = (distribution: Distribution) =>
  Array.from({ length: 5 }, (_, index) =>
    distribution.minimum + ((distribution.maximum - distribution.minimum) * index) / 4,
  )

const drawdownCdfPath = computed(() => {
  const bins = summary.drawdownHistogram
  const total = bins.reduce((sum, bin) => sum + bin.count, 0)
  if (!bins.length || !total) return ''
  let cumulative = 0
  return bins
    .map((bin, index) => {
      cumulative += bin.count
      const x = distributionX((bin.lower_bound + bin.upper_bound) / 2, summary.drawdown)
      const y = 200 - (cumulative / total) * 150
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const describeParameters = (parameters: Record<string, unknown>) => {
  if (parameters.fast_period != null || parameters.slow_period != null)
    return `SMA ${parameters.fast_period ?? '—'} / ${parameters.slow_period ?? '—'} · SL ${parameters.trailing_sl_perc ?? '—'}% · TP ${parameters.fixed_tp_for_trailing_perc ?? '—'}%`
  const ema = parameters.ema_length ?? '—'
  const source = parameters.ema_source ?? '—'
  const sl = parameters.trailing_sl_perc ?? '—'
  const tp = parameters.fixed_tp_for_trailing_perc ?? '—'
  return `EMA ${ema} · ${source} · SL ${sl}% · TP ${tp}%`
}

const applyMonteCarloResult = (
  target: MonteCarloSummary,
  result: MonteCarloReportResult,
) => {
  target.simulations = result.simulations ?? 0
  target.sourceTrades = result.source_trades ?? 0
  target.probabilityOfLoss = result.probability_of_loss ?? 0
  target.probabilityOfRuin = result.probability_of_ruin ?? 0
  Object.assign(target.netProfit, result.net_profit ?? emptyDistribution())
  Object.assign(target.drawdown, result.max_drawdown_percent ?? emptyDistribution())
  target.netProfitHistogram = result.net_profit_histogram ?? []
  target.drawdownHistogram = result.max_drawdown_percent_histogram ?? []
}

const applyReport = (text: string, label: string) => {
  const parsed = JSON.parse(text)
  const report = unwrapResearchReport<{
    monte_carlo?: MonteCarloReportResult | Array<{ parameters?: { params?: Record<string, unknown> } }>
    full_dataset_monte_carlo?: MonteCarloReportResult | null
    walk_forward_monte_carlo?: MonteCarloReportResult
    evidence?: {
      primary?: string
      minimum_source_trades?: number
      walk_forward_windows?: number
      out_of_sample_trades?: number
      full_dataset_trades?: number | null
    }
  }>(parsed)

  const result = (Array.isArray(report.monte_carlo) ? undefined : report.monte_carlo) ?? report.walk_forward_monte_carlo
  if (!result?.net_profit || !result.max_drawdown_percent) {
    throw new Error('The file does not contain walk_forward_monte_carlo results.')
  }

  applyMonteCarloResult(summary, result)
  if (report.full_dataset_monte_carlo?.net_profit && report.full_dataset_monte_carlo.max_drawdown_percent) {
    applyMonteCarloResult(fullDatasetSummary, report.full_dataset_monte_carlo)
    hasFullDatasetComparison.value = true
  } else {
    applyMonteCarloResult(fullDatasetSummary, {})
    hasFullDatasetComparison.value = false
  }
  evidence.primary = report.evidence?.primary ?? (
    report.walk_forward_monte_carlo ? 'walk_forward_oos' : 'legacy_full_dataset'
  )
  evidence.minimumSourceTrades = report.evidence?.minimum_source_trades ?? 30
  evidence.walkForwardWindows = report.evidence?.walk_forward_windows ?? 0
  evidence.outOfSampleTrades = report.evidence?.out_of_sample_trades ?? summary.sourceTrades
  evidence.fullDatasetTrades = report.evidence?.full_dataset_trades
    ?? fullDatasetSummary.sourceTrades

  const reportCandidate = parsed?.reproducibility?.candidate
  const reportScope = parsed?.reproducibility?.fixedCandidateScope
  fixedCandidateScope.value = reportScope === 'research_period' ? 'research_period' : selectedCandidate.value?.fixedCandidateScope ?? 'full_dataset'
  const reportHoldout = parsed?.reproducibility?.holdoutEvidence
  holdoutEvidence.value = reportHoldout && typeof reportHoldout.trades === 'number' && typeof reportHoldout.pnl === 'number'
    ? reportHoldout as HoldoutEvidence
    : selectedCandidate.value?.holdoutEvidence ?? null
  const reportDataset = parsed?.reproducibility?.dataset
  const reportCapital = parsed?.reproducibility?.initialCapital
  if (reportCandidate && typeof reportCandidate === 'object') {
    const candidateParams = reportCandidate.params && typeof reportCandidate.params === 'object'
      ? reportCandidate.params as Record<string, unknown>
      : reportCandidate as Record<string, unknown>
    const sameCandidate = selectedCandidate.value
      && candidateIdentity(selectedCandidate.value.sourceResearchJobId, selectedCandidate.value.candidate)
        === candidateIdentity(parsed?.reproducibility?.sourceResearchJobId, reportCandidate)
    selectedCandidate.value = {
      sourceResearchJobId: parsed?.reproducibility?.sourceResearchJobId,
      candidate: reportCandidate,
      description: sameCandidate ? selectedCandidate.value!.description : describeParameters(candidateParams),
      strategy: reportCandidate.strategy === 'sma_crossover' || candidateParams.fast_period != null
        ? 'SMA Crossover' : 'EMA / VWAP',
      fixedCandidateScope: fixedCandidateScope.value,
      holdoutEvidence: holdoutEvidence.value,
      dataset: reportDataset ?? { symbol: '—', timeframe: '—' },
      initialCapital: Number(reportCapital) || 10000,
    }
    candidateDescription.value = selectedCandidate.value.description
  }

  const config = parsed?.reproducibility?.config
  if (config) {
    settings.simulations = config.simulations ?? settings.simulations
    settings.seed = config.seed ?? settings.seed
    settings.skipProbability = (config.skip_probability ?? settings.skipProbability / 100) * 100
    settings.pnlJitter = config.pnl_jitter_fraction ?? settings.pnlJitter
    settings.extraCost = config.max_additional_cost_per_trade ?? settings.extraCost
    settings.ruinThreshold = 100 - (config.ruin_equity_percent_of_initial ?? 100 - settings.ruinThreshold)
    if (config.sampling?.mode === 'block_bootstrap') {
      settings.sampling = 'Block bootstrap'
      settings.blockSize = config.sampling.block_size ?? settings.blockSize
    } else if (config.sampling?.mode === 'bootstrap') {
      settings.sampling = 'Bootstrap'
    } else if (config.sampling?.mode === 'shuffle') {
      settings.sampling = 'Shuffle'
    }
  }

  const parameters = Array.isArray(report.monte_carlo)
    ? report.monte_carlo[0]?.parameters?.params
    : undefined
  if (parameters) candidateDescription.value = describeParameters(parameters)
  reportLabel.value = label
  reportMessage.value = evidence.primary === 'walk_forward_oos'
    ? `${label} loaded. Walk-forward out-of-sample evidence is the primary analysis.`
    : `${label} uses legacy full-dataset evidence. Run Monte Carlo again to generate the OOS comparison.`
  activeReport.value = parsed
}

const openReportPicker = () => reportInput.value?.click()

const importReport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    applyReport(text, file.name)
    sessionStorage.setItem('monte-carlo-report', text)
    if (selectedCandidate.value) sessionStorage.setItem('selected-research-candidate', JSON.stringify(selectedCandidate.value))
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Could not read the report.'
  } finally {
    input.value = ''
  }
}

const prepareRun = async () => {
  if (!selectedCandidate.value) {
    reportMessage.value = 'Choose a candidate from Parameter Optimization first.'
    return
  }
  if (!selectedCandidate.value.sourceResearchJobId) {
    reportMessage.value = 'The imported candidate has no live source job. Re-run optimization before Monte Carlo.'
    return
  }
  if (hasInsufficientPreview.value) {
    reportMessage.value = `Walk-forward evidence has ${displayedOutOfSampleTrades.value} closed trades; at least ${evidence.minimumSourceTrades} are required. Re-run optimization with a longer dataset.`
    return
  }
  if (!Number.isSafeInteger(settings.simulations) || settings.simulations < 1 || settings.simulations > 10_000_000
      || !Number.isSafeInteger(settings.seed) || settings.seed < 0
      || (settings.sampling === 'Block bootstrap' && (!Number.isSafeInteger(settings.blockSize) || settings.blockSize < 1))
      || ![settings.skipProbability, settings.pnlJitter, settings.extraCost, settings.ruinThreshold].every(Number.isFinite)
      || settings.skipProbability < 0 || settings.skipProbability > 100
      || settings.pnlJitter < 0 || settings.extraCost < 0
      || settings.ruinThreshold < 0 || settings.ruinThreshold > 100) {
    reportMessage.value = 'Check simulation settings: use a positive simulation count and block size, a non-negative seed and costs, and probabilities between 0 and 100%.'
    return
  }
  isRunning.value = true
  reportLabel.value = 'Running'
  try {
    const sampling =
      settings.sampling === 'Block bootstrap'
        ? { mode: 'block_bootstrap', block_size: settings.blockSize }
        : { mode: settings.sampling.toLowerCase() }
    const job = await createMonteCarloJob({
      closedTradePnls: [],
      initialCapital: selectedCandidate.value.initialCapital,
      config: {
        simulations: settings.simulations,
        seed: settings.seed,
        sampling,
        skip_probability: settings.skipProbability / 100,
        pnl_jitter_fraction: settings.pnlJitter,
        max_additional_cost_per_trade: settings.extraCost,
        ruin_equity_percent_of_initial: 100 - settings.ruinThreshold,
      },
      dataset: selectedCandidate.value.dataset,
      candidate: selectedCandidate.value.candidate,
      sourceResearchJobId: selectedCandidate.value.sourceResearchJobId,
      fixedCandidateScope: selectedCandidate.value.fixedCandidateScope ?? 'full_dataset',
      holdoutEvidence: holdoutEvidence.value,
    })
    activeJob.value = job
    await waitForResearchJob(job.id, (progress) => {
      activeJob.value = progress
      reportMessage.value = progress.message
    })
    const report = await getResearchReport(job.id)
    applyReport(JSON.stringify(report), 'Native Rust report')
    activeReport.value = report
    reportLabel.value = 'Native Rust report'
    reportMessage.value = `Completed and saved as ${job.id}. Primary evidence: ${summary.sourceTrades} OOS trades across ${evidence.walkForwardWindows} windows; supplementary evidence: ${fullDatasetSummary.sourceTrades} ${fixedCandidateScopeLabel.value} trades.`
    sessionStorage.setItem('monte-carlo-report', JSON.stringify(report))
  } catch (error) {
    reportLabel.value = 'Failed'
    reportMessage.value = error instanceof Error ? error.message : 'Monte Carlo failed.'
  } finally {
    isRunning.value = false
  }
}

const exportReport = () => {
  if (!activeReport.value) return
  downloadResearchReport(activeReport.value, `${activeJob.value?.id ?? 'monte-carlo-report'}.json`)
}

onActivated(() => {
  const selection = sessionStorage.getItem('selected-research-candidate')
  if (!selection) {
    selectedCandidate.value = null
    fixedCandidateScope.value = 'full_dataset'
    holdoutEvidence.value = null
    candidateDescription.value = '—'
    Object.assign(summary, emptySummary())
    Object.assign(fullDatasetSummary, emptySummary())
    Object.assign(evidence, {
      primary: 'none', minimumSourceTrades: 30, walkForwardWindows: 0,
      outOfSampleTrades: 0, fullDatasetTrades: 0,
    })
    hasFullDatasetComparison.value = false
    activeReport.value = null
    activeJob.value = null
    reportLabel.value = 'No simulation'
    reportMessage.value = ''
    return
  }
  if (selection) {
    try {
      const nextSelection = JSON.parse(selection) as NonNullable<typeof selectedCandidate.value>
      const previousIdentity = candidateIdentity(selectedCandidate.value?.sourceResearchJobId, selectedCandidate.value?.candidate)
      const nextIdentity = candidateIdentity(nextSelection.sourceResearchJobId, nextSelection.candidate)
      selectedCandidate.value = nextSelection
      fixedCandidateScope.value = nextSelection.fixedCandidateScope ?? 'full_dataset'
      holdoutEvidence.value = nextSelection.holdoutEvidence ?? null
      candidateDescription.value = nextSelection.description
      if (previousIdentity !== nextIdentity) {
        Object.assign(summary, emptySummary())
        Object.assign(fullDatasetSummary, emptySummary())
        Object.assign(evidence, {
          primary: 'none', minimumSourceTrades: 30, walkForwardWindows: 0,
          outOfSampleTrades: 0, fullDatasetTrades: 0,
        })
        hasFullDatasetComparison.value = false
        activeReport.value = null
        activeJob.value = null
        reportLabel.value = 'Candidate selected'
      }
    } catch {
      sessionStorage.removeItem('selected-research-candidate')
    }
  }
  const cached = sessionStorage.getItem('monte-carlo-report')
  if (!cached) return
  try {
    const parsed = JSON.parse(cached)
    const cachedSourceJobId = parsed?.reproducibility?.sourceResearchJobId
    const cachedCandidate = parsed?.reproducibility?.candidate
    if (
      selectedCandidate.value
      && candidateIdentity(selectedCandidate.value.sourceResearchJobId, selectedCandidate.value.candidate)
        !== candidateIdentity(cachedSourceJobId, cachedCandidate)
    ) {
      sessionStorage.removeItem('monte-carlo-report')
      reportMessage.value = 'The saved Monte Carlo report belongs to another candidate. Run a fresh simulation for this candidate.'
      return
    }
    if (!activeReport.value || (activeReport.value as { job?: { id?: string } }).job?.id !== parsed?.job?.id) {
      applyReport(cached, 'Saved Monte Carlo report')
      activeReport.value = parsed
    }
  } catch {
    sessionStorage.removeItem('monte-carlo-report')
  }
})
</script>

<template>
  <div class="research-view">
    <header class="research-page-header">
      <div>
        <h1>Monte Carlo Robustness</h1>
        <p>Stress the walk-forward selection process; compare the fixed selected candidate on its {{ fixedCandidateScopeLabel }}.</p>
      </div>
      <span class="research-status-badge">{{ reportLabel }}</span>
    </header>

    <div class="research-layout monte-layout">
      <div class="research-column">
        <section class="research-card">
          <h2 class="research-card-title">Selected Candidate</h2>
          <div class="research-card-body">
            <dl class="candidate-summary">
              <div>
                <dt>Strategy</dt>
                <dd>{{ selectedCandidate?.strategy ?? 'No candidate selected' }}</dd>
              </div>
              <div>
                <dt>Parameters</dt>
                <dd>{{ candidateDescription }}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd class="evidence-lines">
                  <span>
                    Walk-forward selection OOS · {{ displayedOutOfSampleTrades || 'not available' }} trades
                    <template v-if="displayedWalkForwardWindows"> / {{ displayedWalkForwardWindows }} windows</template>
                  </span>
                  <span>Selected candidate, {{ fixedCandidateScopeLabel }} · {{ displayedFullDatasetTrades || 'not available' }} trades</span>
                  <span class="evidence-quality" :class="`evidence-quality--${evidenceQuality.tone}`">
                    {{ evidenceQuality.label }}
                  </span>
                </dd>
              </div>
            </dl>
            <p v-if="evidence.primary === 'walk_forward_oos'" class="research-inline-notice">The primary Monte Carlo result tests the method’s walk-forward selection process, which may use different parameters in each window. Selecting another rank changes the supplementary fixed-candidate test; it does not create an independent test of that rank.</p>
            <div class="research-button-row" style="margin-top: 1rem">
              <button class="research-secondary" type="button" @click="router.push('/optimize')">
                Choose another candidate
              </button>
            </div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Simulation Settings</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="sampling-mode">Sampling mode</label>
              <select id="sampling-mode" v-model="settings.sampling">
                <option>Shuffle</option>
                <option>Bootstrap</option>
                <option>Block bootstrap</option>
              </select>
              <FieldTooltip label="Sampling mode" text="Shuffle reorders trades once, Bootstrap samples individual trades with replacement, and Block bootstrap preserves short trade sequences." />
            </div>
            <div class="research-field">
              <label for="simulation-count">Simulations</label>
              <input
                id="simulation-count"
                v-model.number="settings.simulations"
                type="number"
                min="100"
                step="1000"
              />
              <FieldTooltip label="Simulations" text="Number of alternative equity paths generated. More paths improve tail estimates but require more processing time." />
            </div>
            <div class="research-field">
              <label for="block-size">Block size</label>
              <input id="block-size" v-model.number="settings.blockSize" type="number" min="1" />
              <FieldTooltip label="Block size" text="Number of consecutive trades sampled together in Block bootstrap mode to retain short-term dependence." />
            </div>
            <div class="research-field">
              <label for="skip-probability">Skip probability %</label>
              <input
                id="skip-probability"
                v-model.number="settings.skipProbability"
                type="number"
                min="0"
                max="100"
              />
              <FieldTooltip label="Skip probability" text="Probability that a sampled trade is omitted, modeling missed entries or unavailable execution." />
            </div>
            <div class="research-field">
              <label for="pnl-jitter">P&amp;L jitter</label>
              <input
                id="pnl-jitter"
                v-model.number="settings.pnlJitter"
                type="number"
                min="0"
                step="0.05"
              />
              <FieldTooltip label="P&amp;L jitter" text="Random variation applied to each sampled trade result to test sensitivity to imperfect fills and outcome noise." />
            </div>
            <div class="research-field">
              <label for="extra-cost">Extra cost / trade</label>
              <input
                id="extra-cost"
                v-model.number="settings.extraCost"
                type="number"
                min="0"
                step="0.01"
              />
              <FieldTooltip label="Extra cost per trade" text="Additional quote-currency cost deducted from every simulated trade beyond the backtest costs." />
            </div>
            <div class="research-field">
              <label for="ruin-threshold">Ruin threshold %</label>
              <input
                id="ruin-threshold"
                v-model.number="settings.ruinThreshold"
                type="number"
                min="1"
                max="100"
              />
              <FieldTooltip label="Ruin threshold" text="Drawdown percentage treated as account ruin when calculating probability of ruin." />
            </div>
            <div class="research-field">
              <label for="simulation-seed">Seed</label>
              <input id="simulation-seed" v-model.number="settings.seed" type="number" min="0" />
              <FieldTooltip label="Seed" text="Initial random seed. Reusing the same seed and settings reproduces the same simulation paths." />
            </div>
            <button class="research-primary" type="button" :disabled="isRunning || !selectedCandidate || hasInsufficientPreview" @click="prepareRun">
              {{ isRunning ? 'Running Monte Carlo…' : 'Run Monte Carlo' }}
            </button>
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
            <div v-if="activeJob" class="research-summary-line">
              <span>{{ activeJob.stage }}</span>
              <span>{{ activeJob.completed }} / {{ activeJob.total }}</span>
            </div>
            <div v-if="activeJob" class="research-progress-track">
              <div class="research-progress-bar" :style="{ width: `${activeJob.percent}%` }" />
            </div>
            <div v-if="reportMessage" class="research-inline-notice">{{ reportMessage }}</div>
          </div>
        </section>
      </div>

      <div class="research-column">
        <div class="kpi-grid">
          <section class="research-card kpi-card">
            <div class="kpi-label">{{ primaryEvidenceLabel }} Median Net P&amp;L</div>
            <div class="kpi-value" :class="summary.netProfit.p50 < 0 ? 'metric-negative' : 'metric-positive'">{{ summary.simulations ? `${summary.netProfit.p50 >= 0 ? '+' : ''}${money(summary.netProfit.p50)} USDT` : '—' }}</div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">{{ primaryEvidenceLabel }} 5th percentile</div>
            <div
              class="kpi-value"
              :class="summary.netProfit.p05 < 0 ? 'metric-negative' : 'metric-positive'"
            >
              {{ summary.simulations ? `${summary.netProfit.p05 >= 0 ? '+' : ''}${money(summary.netProfit.p05)} USDT` : '—' }}
            </div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">{{ primaryEvidenceLabel }} 95th percentile</div>
            <div class="kpi-value" :class="summary.netProfit.p95 < 0 ? 'metric-negative' : 'metric-positive'">{{ summary.simulations ? `${summary.netProfit.p95 >= 0 ? '+' : ''}${money(summary.netProfit.p95)} USDT` : '—' }}</div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">{{ primaryEvidenceLabel }} Probability of loss</div>
            <div class="kpi-value">{{ summary.simulations ? percent(summary.probabilityOfLoss) : '—' }}</div>
          </section>
        </div>

        <div v-if="holdoutEvidence" class="research-inline-notice">
          Untouched final holdout · {{ holdoutEvidence.trades }} trades · {{ holdoutEvidence.pnl >= 0 ? '+' : '' }}{{ money(holdoutEvidence.pnl) }} USDT · {{ holdoutEvidence.drawdown.toFixed(1) }}% max DD.
          {{ holdoutEvidence.pnl <= 0 ? 'This period did not confirm the setup.' : holdoutEvidence.trades < 30 ? 'This is a limited sample.' : 'This period was not used to select the setup.' }}
        </div>

        <section v-if="summary.sourceTrades && evidence.primary === 'walk_forward_oos'" class="research-card evidence-comparison-card">
          <h2 class="research-card-title">
            Evidence Comparison <small>Walk-forward OOS is the decision basis</small>
          </h2>
          <div class="evidence-comparison-table">
            <div class="evidence-comparison-row evidence-comparison-head">
              <span>Evidence</span><span>Trades</span><span>Median P&amp;L</span><span>P05 P&amp;L</span><span>P95 DD</span><span>Loss probability</span>
            </div>
            <div class="evidence-comparison-row evidence-comparison-primary">
              <strong>Walk-forward selection OOS · Primary</strong>
              <span>{{ summary.sourceTrades }}</span>
              <span>{{ money(summary.netProfit.p50) }} USDT</span>
              <span>{{ money(summary.netProfit.p05) }} USDT</span>
              <span>{{ summary.drawdown.p95.toFixed(1) }}%</span>
              <span>{{ percent(summary.probabilityOfLoss) }}</span>
            </div>
            <div v-if="hasFullDatasetComparison" class="evidence-comparison-row">
              <strong>Selected candidate, {{ fixedCandidateScopeLabel }} · Supplementary</strong>
              <span>{{ fullDatasetSummary.sourceTrades }}</span>
              <span>{{ money(fullDatasetSummary.netProfit.p50) }} USDT</span>
              <span>{{ money(fullDatasetSummary.netProfit.p05) }} USDT</span>
              <span>{{ fullDatasetSummary.drawdown.p95.toFixed(1) }}%</span>
              <span>{{ percent(fullDatasetSummary.probabilityOfLoss) }}</span>
            </div>
          </div>
        </section>

        <div class="monte-main-grid">
          <section class="research-card">
            <h2 class="research-card-title">
              {{ primaryEvidenceLabel }} Endpoint Range <small>{{ summary.sourceTrades }} source trades</small>
            </h2>
            <div v-if="summary.simulations" class="chart-frame">
              <svg viewBox="0 0 760 300" role="img" aria-label="Illustrative curves from initial equity to simulated final equity percentiles; intermediate points are not simulated path percentiles">
                <defs>
                  <linearGradient id="fan-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stop-color="#58b8ff" stop-opacity="0.22" />
                    <stop offset="1" stop-color="#ff6574" stop-opacity="0.12" />
                  </linearGradient>
                </defs>
                <g>
                  <line
                    v-for="x in [55, 185, 315, 445, 575, 705]"
                    :key="`x${x}`"
                    :x1="x"
                    y1="22"
                    :x2="x"
                    y2="252"
                    class="chart-grid-line"
                  />
                  <line
                    v-for="y in [22, 68, 114, 160, 206, 252]"
                    :key="`y${y}`"
                    x1="55"
                    :y1="y"
                    x2="705"
                    :y2="y"
                    class="chart-grid-line"
                  />
                </g>
                <path
                  :d="fanAreaPath"
                  fill="url(#fan-gradient)"
                />
                <path
                  :d="fanPath(summary.netProfit.p95)"
                  fill="none"
                  stroke="#6fc4ff"
                  stroke-width="2.5"
                />
                <path
                  :d="fanPath(summary.netProfit.p50)"
                  fill="none"
                  stroke="#49df8b"
                  stroke-width="3.5"
                />
                <path
                  :d="fanPath(summary.netProfit.p05)"
                  fill="none"
                  stroke="#ff6574"
                  stroke-width="2.5"
                />
                <text x="713" :y="equityY(summary.netProfit.p95) + 4" class="chart-axis-label" fill="#6fc4ff">P95</text>
                <text x="713" :y="equityY(summary.netProfit.p50) + 4" class="chart-axis-label" fill="#49df8b">Median</text>
                <text x="713" :y="equityY(summary.netProfit.p05) + 4" class="chart-axis-label" fill="#ff6574">P05</text>
                <text x="380" y="287" text-anchor="middle" class="chart-axis-label">
                  Illustrative progress
                </text>
                <text
                  transform="translate(14,150) rotate(-90)"
                  text-anchor="middle"
                  class="chart-axis-label"
                >
                  Equity (USDT)
                </text>
              </svg>
              <p class="chart-disclaimer">Curves illustrate the final equity percentiles. Their intermediate shape is interpolated, not simulated path data.</p>
            </div>
            <div v-else class="chart-data-notice">Run or import a Monte Carlo report to see the endpoint range.</div>
          </section>

          <section class="research-card">
            <h2 class="research-card-title">{{ primaryEvidenceLabel }} Risk Summary</h2>
            <div class="research-card-body">
              <div class="risk-list">
                <div class="risk-row">
                  <span>Probability of ruin</span
                  ><strong>{{ summary.simulations ? percent(summary.probabilityOfRuin, 2) : '—' }}</strong>
                </div>
                <div class="risk-row">
                  <span>Median max drawdown</span
                  ><strong>{{ summary.simulations ? `${summary.drawdown.p50.toFixed(1)}%` : '—' }}</strong>
                </div>
                <div class="risk-row">
                  <span>95th percentile DD</span
                  ><strong>{{ summary.simulations ? `${summary.drawdown.p95.toFixed(1)}%` : '—' }}</strong>
                </div>
                <div class="risk-row">
                  <span>Worst simulated DD</span
                  ><strong>{{ summary.simulations ? `${summary.drawdown.maximum.toFixed(1)}%` : '—' }}</strong>
                </div>
                <div class="risk-row">
                  <span>Simulation paths</span
                  ><strong>{{ summary.simulations ? summary.simulations.toLocaleString('en-US') : '—' }}</strong>
                </div>
              </div>
              <div v-if="summary.simulations" class="verdict" :class="{ 'verdict--warning': drawdownVerdict !== 'Favorable under these assumptions' }">{{ drawdownVerdict }}</div>
            </div>
          </section>
        </div>

        <div class="monte-bottom-grid">
          <section class="research-card">
            <h2 class="research-card-title">{{ primaryEvidenceLabel }} Final Net P&amp;L Distribution</h2>
            <div v-if="summary.netProfitHistogram.length" class="chart-frame">
              <svg viewBox="0 0 560 245" role="img" aria-label="Final net profit distribution histogram">
                <line
                  v-for="y in [50, 100, 150, 200]"
                  :key="`net-y-${y}`"
                  x1="55"
                  :y1="y"
                  x2="535"
                  :y2="y"
                  class="chart-grid-line"
                />
                <rect
                  v-for="(bin, index) in summary.netProfitHistogram"
                  :key="`net-bin-${index}`"
                  :x="histogramBarX(bin, summary.netProfit)"
                  :y="histogramBarY(bin, summary.netProfitHistogram)"
                  :width="histogramBarWidth(bin, summary.netProfit)"
                  :height="histogramBarHeight(bin, summary.netProfitHistogram)"
                  fill="#469de8"
                  fill-opacity="0.9"
                />
                <line
                  v-if="summary.netProfit.minimum < 0 && summary.netProfit.maximum > 0"
                  :x1="distributionX(0, summary.netProfit)"
                  y1="35"
                  :x2="distributionX(0, summary.netProfit)"
                  y2="200"
                  stroke="#dbe5ef"
                  stroke-width="1.5"
                  stroke-dasharray="5 5"
                />
                <line
                  :x1="distributionX(summary.netProfit.p05, summary.netProfit)"
                  y1="35"
                  :x2="distributionX(summary.netProfit.p05, summary.netProfit)"
                  y2="200"
                  stroke="#ff6574"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <line
                  :x1="distributionX(summary.netProfit.p50, summary.netProfit)"
                  y1="35"
                  :x2="distributionX(summary.netProfit.p50, summary.netProfit)"
                  y2="200"
                  stroke="#49df8b"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <line
                  :x1="distributionX(summary.netProfit.p95, summary.netProfit)"
                  y1="35"
                  :x2="distributionX(summary.netProfit.p95, summary.netProfit)"
                  y2="200"
                  stroke="#5faeff"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <text :x="distributionX(summary.netProfit.p05, summary.netProfit)" y="17" text-anchor="middle" class="chart-axis-label">
                  P05 {{ money(summary.netProfit.p05) }}
                </text>
                <text :x="distributionX(summary.netProfit.p50, summary.netProfit)" y="30" text-anchor="middle" class="chart-axis-label" fill="#49df8b">
                  Median {{ money(summary.netProfit.p50) }}
                </text>
                <text :x="distributionX(summary.netProfit.p95, summary.netProfit)" y="17" text-anchor="middle" class="chart-axis-label">
                  P95 {{ money(summary.netProfit.p95) }}
                </text>
                <g v-for="tick in distributionTicks(summary.netProfit)" :key="`net-tick-${tick}`">
                  <line :x1="distributionX(tick, summary.netProfit)" y1="200" :x2="distributionX(tick, summary.netProfit)" y2="205" stroke="#72869b" />
                  <text :x="distributionX(tick, summary.netProfit)" y="218" text-anchor="middle" class="chart-axis-label">{{ money(tick) }}</text>
                </g>
                <text x="18" y="127" transform="rotate(-90 18 127)" text-anchor="middle" class="chart-axis-label">Frequency</text>
                <text x="290" y="237" text-anchor="middle" class="chart-axis-label">
                  Net P&amp;L (USDT)
                </text>
              </svg>
            </div>
            <div v-else class="chart-data-notice">Run or import a new native report to show the simulated distribution.</div>
          </section>

          <section class="research-card">
            <h2 class="research-card-title">{{ primaryEvidenceLabel }} Maximum Drawdown Distribution</h2>
            <div v-if="summary.drawdownHistogram.length" class="chart-frame">
              <svg viewBox="0 0 560 245" role="img" aria-label="Maximum drawdown distribution histogram">
                <line
                  v-for="y in [50, 100, 150, 200]"
                  :key="`dd-y-${y}`"
                  x1="55"
                  :y1="y"
                  x2="535"
                  :y2="y"
                  class="chart-grid-line"
                />
                <rect
                  v-for="(bin, index) in summary.drawdownHistogram"
                  :key="`dd-bin-${index}`"
                  :x="histogramBarX(bin, summary.drawdown)"
                  :y="histogramBarY(bin, summary.drawdownHistogram)"
                  :width="histogramBarWidth(bin, summary.drawdown)"
                  :height="histogramBarHeight(bin, summary.drawdownHistogram)"
                  fill="#469de8"
                  fill-opacity="0.9"
                />
                <path :d="drawdownCdfPath" fill="none" stroke="#edf4fc" stroke-width="2.5" />
                <line
                  :x1="distributionX(summary.drawdown.p95, summary.drawdown)"
                  y1="30"
                  :x2="distributionX(summary.drawdown.p95, summary.drawdown)"
                  y2="200"
                  stroke="#ff6574"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <text :x="distributionX(summary.drawdown.p95, summary.drawdown)" y="17" text-anchor="middle" class="chart-axis-label">
                  P95 {{ summary.drawdown.p95.toFixed(1) }}%
                </text>
                <g v-for="tick in distributionTicks(summary.drawdown)" :key="`dd-tick-${tick}`">
                  <line :x1="distributionX(tick, summary.drawdown)" y1="200" :x2="distributionX(tick, summary.drawdown)" y2="205" stroke="#72869b" />
                  <text :x="distributionX(tick, summary.drawdown)" y="218" text-anchor="middle" class="chart-axis-label">{{ tick.toFixed(1) }}%</text>
                </g>
                <text x="18" y="127" transform="rotate(-90 18 127)" text-anchor="middle" class="chart-axis-label">Frequency</text>
                <text x="548" y="127" transform="rotate(90 548 127)" text-anchor="middle" class="chart-axis-label">Cumulative probability</text>
                <text x="290" y="237" text-anchor="middle" class="chart-axis-label">
                  Maximum Drawdown (%)
                </text>
              </svg>
            </div>
            <div v-else class="chart-data-notice">Run or import a new native report to show the simulated distribution.</div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
