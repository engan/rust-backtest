<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

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
}

const router = useRouter()
const reportInput = ref<HTMLInputElement | null>(null)
const reportLabel = ref('Example data')
const reportMessage = ref('')
const selectedRank = ref(1)

const setup = reactive({
  strategy: 'EMA / VWAP',
  symbol: 'SOLUSDT',
  timeframe: '1h',
  dataset: 15095,
  endBefore: '2026-09-22T00:00',
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

const axes = reactive<ResearchAxis[]>([
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
])

const defaultCandidates: CandidateRow[] = [
  {
    rank: 1,
    label: 'EMA 120, High · SL 3.0% · TP 5.0%',
    netProfit: 4830,
    drawdown: 12.4,
    profitFactor: 2.31,
    eligible: true,
  },
  {
    rank: 2,
    label: 'EMA 116, High · SL 2.5% · TP 5.0%',
    netProfit: 4410,
    drawdown: 13.1,
    profitFactor: 2.12,
    eligible: true,
  },
  {
    rank: 3,
    label: 'EMA 120, Low · SL 3.0% · TP 5.5%',
    netProfit: 4170,
    drawdown: 14.8,
    profitFactor: 2.08,
    eligible: true,
  },
  {
    rank: 4,
    label: 'EMA 124, High · SL 2.5% · TP 5.5%',
    netProfit: 3890,
    drawdown: 15.6,
    profitFactor: 1.92,
    eligible: true,
  },
  {
    rank: 5,
    label: 'EMA 112, High · SL 3.0% · TP 6.0%',
    netProfit: 3640,
    drawdown: 16.1,
    profitFactor: 1.87,
    eligible: true,
  },
]

const candidates = ref<CandidateRow[]>(defaultCandidates)

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

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

const selectCandidate = (rank: number) => {
  selectedRank.value = rank
}

const describeParameters = (parameters: Record<string, unknown>): string => {
  const ema = parameters.ema_length ?? '—'
  const source = parameters.ema_source ?? '—'
  const sl = parameters.trailing_sl_perc ?? '—'
  const tp = parameters.fixed_tp_for_trailing_perc ?? '—'
  return `EMA ${ema}, ${source} · SL ${sl}% · TP ${tp}%`
}

const openReportPicker = () => reportInput.value?.click()

const importReport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const report = JSON.parse(text) as {
      optimization?: {
        evaluations?: Array<{
          parameters?: { params?: Record<string, unknown> }
          rejection_reasons?: string[]
          summary?: {
            net_profit?: number
            max_drawdown_percent?: number
            profit_factor?: number
          }
        }>
      }
    }
    const evaluations = report.optimization?.evaluations
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      throw new Error('The file does not contain optimization.evaluations.')
    }

    candidates.value = evaluations.slice(0, 12).map((evaluation, index) => ({
      rank: index + 1,
      label: describeParameters(evaluation.parameters?.params ?? {}),
      netProfit: evaluation.summary?.net_profit ?? 0,
      drawdown: evaluation.summary?.max_drawdown_percent ?? 0,
      profitFactor: evaluation.summary?.profit_factor ?? 0,
      eligible: (evaluation.rejection_reasons?.length ?? 0) === 0,
    }))
    selectedRank.value = 1
    reportLabel.value = 'Imported report'
    reportMessage.value = `${file.name} loaded successfully.`
    sessionStorage.setItem('research-report', text)
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Could not read the report.'
  } finally {
    input.value = ''
  }
}

const prepareRun = () => {
  reportMessage.value =
    'The search space is ready. Connecting this screen to the native Rust job runner is the next implementation step.'
}

const openMonteCarlo = () => {
  void router.push('/monte-carlo')
}
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
            </div>
            <div class="research-field">
              <label for="research-symbol">Symbol</label>
              <input id="research-symbol" v-model="setup.symbol" />
            </div>
            <div class="research-field">
              <label for="research-timeframe">Timeframe</label>
              <select id="research-timeframe" v-model="setup.timeframe">
                <option>15m</option>
                <option>1h</option>
                <option>4h</option>
                <option>1d</option>
              </select>
            </div>
            <div class="research-field">
              <label for="research-bars">Dataset</label>
              <input id="research-bars" v-model.number="setup.dataset" type="number" min="100" />
            </div>
            <div class="research-field">
              <label for="research-cutoff">End before (UTC)</label>
              <input id="research-cutoff" v-model="setup.endBefore" type="datetime-local" />
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
            </div>
            <div class="research-field">
              <label for="train-days">Train</label>
              <input id="train-days" v-model.number="validation.trainDays" type="number" min="1" />
            </div>
            <div class="research-field">
              <label for="validate-days">Validate</label>
              <input
                id="validate-days"
                v-model.number="validation.validateDays"
                type="number"
                min="1"
              />
            </div>
            <div class="research-field">
              <label for="step-days">Step</label>
              <input id="step-days" v-model.number="validation.stepDays" type="number" min="1" />
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
            </div>
            <div class="research-field">
              <label for="maximum-drawdown">Maximum DD %</label>
              <input
                id="maximum-drawdown"
                v-model.number="validation.maximumDrawdown"
                type="number"
                min="0"
              />
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
                <div class="axis-cell axis-name">{{ axis.label }}</div>
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
              <button class="research-primary" type="button" @click="prepareRun">
                ▶ Run optimization
              </button>
            </div>

            <div class="research-inline-notice">
              Native Rust execution will be connected here. Search values are job data and do not
              require source-code changes.
            </div>
            <div v-if="reportMessage" class="research-inline-notice">{{ reportMessage }}</div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">
            Execution Preview <small>Runner integration pending</small>
          </h2>
          <div class="research-card-body">
            <div class="research-summary-line">
              <span>Candidate progress</span>
              <span>0 / {{ number(candidateCount) }}</span>
            </div>
            <div class="research-progress-track">
              <div class="research-progress-bar" style="width: 0%" />
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
                  <td>{{ number(candidate.profitFactor, 2) }}</td>
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
            <button class="research-primary" type="button" @click="openMonteCarlo">
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
              <g fill="#72869b" opacity="0.72">
                <circle
                  v-for="i in 58"
                  :key="i"
                  :cx="70 + ((i * 73) % 445)"
                  :cy="37 + ((i * 47) % 160)"
                  r="3.2"
                />
              </g>
              <polyline
                points="92,48 150,58 225,78 310,100 405,132 500,166"
                fill="none"
                stroke="#46dd89"
                stroke-width="3"
              />
              <g fill="#46dd89">
                <circle
                  v-for="point in [
                    [92, 48],
                    [150, 58],
                    [225, 78],
                    [310, 100],
                    [405, 132],
                    [500, 166],
                  ]"
                  :key="point.join('-')"
                  :cx="point[0]"
                  :cy="point[1]"
                  r="5"
                />
              </g>
              <circle cx="150" cy="58" r="7" fill="#2699ff" stroke="#d8eeff" stroke-width="2" />
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
