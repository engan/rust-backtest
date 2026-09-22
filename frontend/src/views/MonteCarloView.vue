<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import FieldTooltip from '@/components/FieldTooltip.vue'

type Distribution = {
  minimum: number
  p05: number
  p50: number
  mean: number
  p95: number
  maximum: number
}

type MonteCarloSummary = {
  simulations: number
  sourceTrades: number
  probabilityOfLoss: number
  probabilityOfRuin: number
  netProfit: Distribution
  drawdown: Distribution
}

const router = useRouter()
const reportInput = ref<HTMLInputElement | null>(null)
const reportLabel = ref('Example report')
const reportMessage = ref('')
const candidateDescription = ref('EMA 100 · High · SL 4.0% · TP 6.0%')

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

const summary = reactive<MonteCarloSummary>({
  simulations: 10000,
  sourceTrades: 52,
  probabilityOfLoss: 0.2417,
  probabilityOfRuin: 0.0005,
  netProfit: {
    minimum: -5689.55,
    p05: -1629.8,
    p50: 1198.97,
    mean: 1239.01,
    p95: 4202.59,
    maximum: 10002.91,
  },
  drawdown: {
    minimum: 2.39,
    p05: 7.04,
    p50: 13.69,
    mean: 15.07,
    p95: 27.97,
    maximum: 56.9,
  },
})

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`

const drawdownVerdict = computed(() => {
  if (summary.probabilityOfRuin >= 0.05 || summary.drawdown.p95 >= 40)
    return 'Tail risk requires changes'
  if (summary.probabilityOfLoss >= 0.3 || summary.drawdown.p95 >= 25)
    return 'Promising, tail risk needs review'
  return 'Robust in this simulation'
})

const describeParameters = (parameters: Record<string, unknown>) => {
  const ema = parameters.ema_length ?? '—'
  const source = parameters.ema_source ?? '—'
  const sl = parameters.trailing_sl_perc ?? '—'
  const tp = parameters.fixed_tp_for_trailing_perc ?? '—'
  return `EMA ${ema} · ${source} · SL ${sl}% · TP ${tp}%`
}

const applyReport = (text: string, label: string) => {
  const report = JSON.parse(text) as {
    walk_forward_monte_carlo?: {
      simulations?: number
      source_trades?: number
      probability_of_loss?: number
      probability_of_ruin?: number
      net_profit?: Distribution
      max_drawdown_percent?: Distribution
    }
    monte_carlo?: Array<{
      parameters?: { params?: Record<string, unknown> }
    }>
  }

  const result = report.walk_forward_monte_carlo
  if (!result?.net_profit || !result.max_drawdown_percent) {
    throw new Error('The file does not contain walk_forward_monte_carlo results.')
  }

  summary.simulations = result.simulations ?? 0
  summary.sourceTrades = result.source_trades ?? 0
  summary.probabilityOfLoss = result.probability_of_loss ?? 0
  summary.probabilityOfRuin = result.probability_of_ruin ?? 0
  Object.assign(summary.netProfit, result.net_profit)
  Object.assign(summary.drawdown, result.max_drawdown_percent)

  const parameters = report.monte_carlo?.[0]?.parameters?.params
  if (parameters) candidateDescription.value = describeParameters(parameters)
  reportLabel.value = 'Imported report'
  reportMessage.value = `${label} loaded successfully.`
}

const openReportPicker = () => reportInput.value?.click()

const importReport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    applyReport(text, file.name)
    sessionStorage.setItem('research-report', text)
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Could not read the report.'
  } finally {
    input.value = ''
  }
}

const prepareRun = () => {
  reportMessage.value =
    'Settings are ready. The next integration step sends them to the native deterministic Monte Carlo runner.'
}

onMounted(() => {
  const cached = sessionStorage.getItem('research-report')
  if (!cached) return
  try {
    applyReport(cached, 'Imported optimization report')
  } catch {
    sessionStorage.removeItem('research-report')
  }
})
</script>

<template>
  <div class="research-view">
    <header class="research-page-header">
      <div>
        <h1>Monte Carlo Robustness</h1>
        <p>Stress the selected out-of-sample trade sequence and inspect tail risk.</p>
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
                <dd>EMA / VWAP</dd>
              </div>
              <div>
                <dt>Parameters</dt>
                <dd>{{ candidateDescription }}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>Walk-forward OOS · {{ summary.sourceTrades }} trades</dd>
              </div>
            </dl>
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
            <button class="research-primary" type="button" @click="prepareRun">
              Run Monte Carlo
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
            <div v-if="reportMessage" class="research-inline-notice">{{ reportMessage }}</div>
          </div>
        </section>
      </div>

      <div class="research-column">
        <div class="kpi-grid">
          <section class="research-card kpi-card">
            <div class="kpi-label">Median Net P&amp;L</div>
            <div class="kpi-value metric-positive">+{{ money(summary.netProfit.p50) }} USDT</div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">5th percentile</div>
            <div
              class="kpi-value"
              :class="summary.netProfit.p05 < 0 ? 'metric-negative' : 'metric-positive'"
            >
              {{ summary.netProfit.p05 >= 0 ? '+' : '' }}{{ money(summary.netProfit.p05) }} USDT
            </div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">95th percentile</div>
            <div class="kpi-value metric-positive">+{{ money(summary.netProfit.p95) }} USDT</div>
          </section>
          <section class="research-card kpi-card">
            <div class="kpi-label">Probability of loss</div>
            <div class="kpi-value">{{ percent(summary.probabilityOfLoss) }}</div>
          </section>
        </div>

        <div class="monte-main-grid">
          <section class="research-card">
            <h2 class="research-card-title">
              Equity Path Percentiles <small>Illustrative fan from summary percentiles</small>
            </h2>
            <div class="chart-frame">
              <svg viewBox="0 0 760 300" role="img" aria-label="Equity path percentile fan chart">
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
                  d="M55 160 C170 128, 265 112, 380 79 S590 44,705 27 L705 229 C580 219,470 212,380 202 S170 179,55 160 Z"
                  fill="url(#fan-gradient)"
                />
                <path
                  d="M55 160 C190 139,300 123,420 99 S590 69,705 55"
                  fill="none"
                  stroke="#6fc4ff"
                  stroke-width="2.5"
                />
                <path
                  d="M55 160 C190 150,300 142,420 127 S590 110,705 92"
                  fill="none"
                  stroke="#3199f7"
                  stroke-width="2.5"
                />
                <path
                  d="M55 160 C190 157,300 153,420 148 S590 137,705 126"
                  fill="none"
                  stroke="#49df8b"
                  stroke-width="3.5"
                />
                <path
                  d="M55 160 C190 166,300 177,420 185 S590 200,705 207"
                  fill="none"
                  stroke="#8ba4bb"
                  stroke-width="2.5"
                />
                <path
                  d="M55 160 C190 177,300 195,420 208 S590 222,705 229"
                  fill="none"
                  stroke="#ff6574"
                  stroke-width="2.5"
                />
                <text x="713" y="59" class="chart-axis-label" fill="#6fc4ff">P95</text>
                <text x="713" y="96" class="chart-axis-label" fill="#3199f7">P75</text>
                <text x="713" y="130" class="chart-axis-label" fill="#49df8b">Median</text>
                <text x="713" y="211" class="chart-axis-label" fill="#8ba4bb">P25</text>
                <text x="713" y="233" class="chart-axis-label" fill="#ff6574">P05</text>
                <text x="380" y="287" text-anchor="middle" class="chart-axis-label">
                  Trade count
                </text>
                <text
                  transform="translate(14,150) rotate(-90)"
                  text-anchor="middle"
                  class="chart-axis-label"
                >
                  Equity (USDT)
                </text>
              </svg>
            </div>
          </section>

          <section class="research-card">
            <h2 class="research-card-title">Risk Summary</h2>
            <div class="research-card-body">
              <div class="risk-list">
                <div class="risk-row">
                  <span>Probability of ruin</span
                  ><strong>{{ percent(summary.probabilityOfRuin, 2) }}</strong>
                </div>
                <div class="risk-row">
                  <span>Median max drawdown</span
                  ><strong>{{ summary.drawdown.p50.toFixed(1) }}%</strong>
                </div>
                <div class="risk-row">
                  <span>95th percentile DD</span
                  ><strong>{{ summary.drawdown.p95.toFixed(1) }}%</strong>
                </div>
                <div class="risk-row">
                  <span>Worst simulated DD</span
                  ><strong>{{ summary.drawdown.maximum.toFixed(1) }}%</strong>
                </div>
                <div class="risk-row">
                  <span>Simulation paths</span
                  ><strong>{{ summary.simulations.toLocaleString('en-US') }}</strong>
                </div>
              </div>
              <div class="verdict">{{ drawdownVerdict }}</div>
            </div>
          </section>
        </div>

        <div class="monte-bottom-grid">
          <section class="research-card">
            <h2 class="research-card-title">Final Net P&amp;L Distribution</h2>
            <div class="chart-frame">
              <svg viewBox="0 0 560 245" role="img" aria-label="Final net profit distribution">
                <line x1="45" y1="206" x2="535" y2="206" class="chart-grid-line" />
                <g fill="#469de8">
                  <rect
                    v-for="(height, index) in [
                      8, 12, 18, 30, 45, 68, 92, 126, 158, 181, 196, 170, 142, 108, 76, 49, 31, 19,
                      11, 6,
                    ]"
                    :key="index"
                    :x="55 + index * 23"
                    :y="206 - height"
                    width="18"
                    :height="height"
                    rx="2"
                  />
                </g>
                <line
                  x1="172"
                  y1="24"
                  x2="172"
                  y2="206"
                  stroke="#ff6574"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <line
                  x1="309"
                  y1="24"
                  x2="309"
                  y2="206"
                  stroke="#49df8b"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <line
                  x1="442"
                  y1="24"
                  x2="442"
                  y2="206"
                  stroke="#5faeff"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <text x="172" y="17" text-anchor="middle" class="chart-axis-label">
                  P05 {{ money(summary.netProfit.p05) }}
                </text>
                <text x="309" y="17" text-anchor="middle" class="chart-axis-label">
                  Median {{ money(summary.netProfit.p50) }}
                </text>
                <text x="442" y="17" text-anchor="middle" class="chart-axis-label">
                  P95 {{ money(summary.netProfit.p95) }}
                </text>
                <text x="290" y="237" text-anchor="middle" class="chart-axis-label">
                  Net P&amp;L (USDT)
                </text>
              </svg>
            </div>
          </section>

          <section class="research-card">
            <h2 class="research-card-title">Maximum Drawdown Distribution</h2>
            <div class="chart-frame">
              <svg viewBox="0 0 560 245" role="img" aria-label="Maximum drawdown distribution">
                <line x1="45" y1="206" x2="535" y2="206" class="chart-grid-line" />
                <g fill="#469de8">
                  <rect
                    v-for="(height, index) in [
                      5, 11, 28, 61, 112, 166, 190, 174, 146, 113, 82, 57, 39, 27, 18, 12, 8, 5, 3,
                      2,
                    ]"
                    :key="index"
                    :x="55 + index * 23"
                    :y="206 - height"
                    width="18"
                    :height="height"
                    rx="2"
                  />
                </g>
                <path
                  d="M55 199 C135 191,165 167,206 126 S285 54,355 31 S450 18,520 16"
                  fill="none"
                  stroke="#e2eaf3"
                  stroke-width="2.5"
                />
                <line
                  x1="338"
                  y1="23"
                  x2="338"
                  y2="206"
                  stroke="#ff6574"
                  stroke-width="2"
                  stroke-dasharray="6 5"
                />
                <text x="338" y="17" text-anchor="middle" class="chart-axis-label">
                  P95 {{ summary.drawdown.p95.toFixed(1) }}%
                </text>
                <text x="290" y="237" text-anchor="middle" class="chart-axis-label">
                  Maximum Drawdown (%)
                </text>
              </svg>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
