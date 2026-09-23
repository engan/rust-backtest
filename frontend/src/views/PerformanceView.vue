<script setup lang="ts">
import { computed, onActivated, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PnlChart from '@/components/PnlChart.vue'
import { loadBacktestAnalysis } from '@/services/backtestReport'
import { buildPeriodEndChanges } from '@/services/performancePeriods'
import { exitSignalName, tradeCommission } from '@/services/tradeMetrics'
import type { EquityPoint, TradeEvent } from '@/types/common_strategy_types'

type PerformanceTab = 'Breakdown' | 'Periodical' | 'Benchmarking' | 'Margin usage' | 'Growth & decline'
type TradeTab = 'Distribution' | 'Streaks' | 'Time patterns'
type PeriodUnit = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'

type ClosedTrade = {
  id: number
  direction: 'long' | 'short'
  signal: string
  entryTimestamp: number
  exitTimestamp: number
  pnl: number
  returnPercent: number
  runUp: number
  drawdown: number
  durationBars: number
  positionValue: number
  commission: number
}

const snapshot = ref(loadBacktestAnalysis())
onActivated(() => {
  snapshot.value = loadBacktestAnalysis()
})
const activePerformanceTab = ref<PerformanceTab>('Breakdown')
const activeTradeTab = ref<TradeTab>('Distribution')
const periodUnit = ref<PeriodUnit>('Monthly')
const performanceTabs: PerformanceTab[] = ['Breakdown', 'Periodical', 'Benchmarking', 'Margin usage', 'Growth & decline']
const tradeTabs: TradeTab[] = ['Distribution', 'Streaks', 'Time patterns']
const periodUnits: PeriodUnit[] = ['Daily', 'Weekly', 'Monthly', 'Yearly']

const result = computed(() => snapshot.value?.results ?? null)
const initialCapital = computed(() => snapshot.value?.execution.initialCapital ?? 0)
const currency = computed(() => snapshot.value?.execution.quoteCurrency ?? 'USDT')

const closedTrades = computed<ClosedTrade[]>(() => {
  const events = result.value?.trade_log ?? []
  const grouped = new Map<number, { entry?: TradeEvent; exit?: TradeEvent }>()
  for (const event of events) {
    const trade = grouped.get(event.trade_id) ?? {}
    if (event.event_type === 'Entry') trade.entry = event
    if (event.event_type === 'Exit') trade.exit = event
    grouped.set(event.trade_id, trade)
  }
  const commissionPercent = snapshot.value?.execution.commissionPercent ?? 0
  return [...grouped.values()]
    .filter((trade): trade is { entry: TradeEvent; exit: TradeEvent } => Boolean(trade.entry && trade.exit))
    .map(({ entry, exit }) => ({
      id: entry.trade_id,
      direction: entry.direction,
      signal: exitSignalName(exit.signal),
      entryTimestamp: entry.timestamp,
      exitTimestamp: exit.timestamp,
      pnl: exit.pnl ?? 0,
      returnPercent: exit.pnl_percent ?? 0,
      runUp: exit.run_up_amount ?? 0,
      drawdown: exit.drawdown_amount ?? 0,
      durationBars: Math.max(0, exit.bar_index - entry.bar_index),
      positionValue: entry.price * Math.abs(entry.quantity),
      commission: tradeCommission(entry, exit, result.value?.margin_calls ?? [], commissionPercent),
    }))
    .sort((left, right) => left.exitTimestamp - right.exitTimestamp)
})

const wins = computed(() => closedTrades.value.filter((trade) => trade.pnl > 0))
const losses = computed(() => closedTrades.value.filter((trade) => trade.pnl < 0))
const breakevens = computed(() => closedTrades.value.filter((trade) => trade.pnl === 0))
const grossProfit = computed(() => wins.value.reduce((sum, trade) => sum + trade.pnl, 0))
const grossLoss = computed(() => Math.abs(losses.value.reduce((sum, trade) => sum + trade.pnl, 0)))
const commissionTotal = computed(() => closedTrades.value.reduce((sum, trade) => sum + trade.commission, 0))
const expectancy = computed(() =>
  closedTrades.value.length
    ? closedTrades.value.reduce((sum, trade) => sum + trade.pnl, 0) / closedTrades.value.length
    : 0,
)
const strategyReturn = computed(() =>
  initialCapital.value ? ((result.value?.summary.pnl_total ?? 0) / initialCapital.value) * 100 : 0,
)

const fmt = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
const money = (value: number) => `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))} ${currency.value}`
const percent = (value: number) => `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))}%`
const durationDays = (milliseconds: number) => Math.max(0, milliseconds / 86_400_000)

const barLog = computed(() =>
  (result.value?.bar_log ?? []).filter(
    (bar: { timestamp?: number; close?: number; sig?: string }) =>
      Number.isFinite(bar.timestamp) && Number.isFinite(bar.close) && bar.sig !== 'OpenNow',
  ) as Array<{ timestamp: number; close: number }>,
)
const buyHoldReturn = computed(() => {
  const first = barLog.value[0]?.close
  const last = barLog.value.at(-1)?.close
  return first && last ? (last / first - 1) * 100 : 0
})

const equityRange = computed(() => {
  const curve = result.value?.equity_curve ?? []
  return { start: curve[0]?.timestamp, end: curve.at(-1)?.timestamp }
})

const annualizedReturn = computed(() => {
  const { start, end } = equityRange.value
  if (!start || !end || end <= start || initialCapital.value <= 0) return 0
  const years = (end - start) / (365.25 * 86_400_000)
  const finalEquity = result.value?.summary.equity_final ?? initialCapital.value
  return years > 0 && finalEquity > 0
    ? (Math.pow(finalEquity / initialCapital.value, 1 / years) - 1) * 100
    : 0
})

const periodKey = (timestamp: number, unit: PeriodUnit) => {
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  if (unit === 'Yearly') return `${year}`
  if (unit === 'Monthly') return `${year}-${String(month + 1).padStart(2, '0')}`
  if (unit === 'Weekly') {
    const day = date.getUTCDay() || 7
    const monday = new Date(Date.UTC(year, month, date.getUTCDate() - day + 1))
    return monday.toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

const periodLabel = (key: string, unit: PeriodUnit) => {
  if (unit === 'Yearly') return key
  const date = new Date(`${key}${unit === 'Monthly' ? '-01' : ''}T00:00:00Z`)
  return new Intl.DateTimeFormat('en', {
    month: unit === 'Daily' ? 'short' : undefined,
    day: unit === 'Daily' || unit === 'Weekly' ? 'numeric' : undefined,
    year: unit === 'Monthly' ? '2-digit' : undefined,
    timeZone: 'UTC',
  }).format(date)
}

const periodRows = computed(() => {
  return buildPeriodEndChanges(
    result.value?.equity_curve ?? [], barLog.value, initialCapital.value,
    (timestamp) => periodKey(timestamp, periodUnit.value),
  ).map((row) => ({ ...row, label: periodLabel(row.key, periodUnit.value) }))
})

const visiblePeriodRows = computed(() => periodRows.value.slice(-18))
const periodicReturns = computed(() => periodRows.value.map((row) => row.strategyReturn))
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0
  const mean = average(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
}
const sharpeRatio = computed(() => {
  const deviation = standardDeviation(periodicReturns.value)
  if (periodicReturns.value.length < 3 || !deviation) return null
  return average(periodicReturns.value) / deviation * Math.sqrt(periodsPerYear.value)
})
const sortinoRatio = computed(() => {
  const deviation = Math.sqrt(average(periodicReturns.value.map((value) => Math.min(0, value) ** 2)))
  if (periodicReturns.value.length < 3 || !deviation) return null
  return average(periodicReturns.value) / deviation * Math.sqrt(periodsPerYear.value)
})
const periodsPerYear = computed(() => ({ Daily: 365.25, Weekly: 52.18, Monthly: 12, Yearly: 1 })[periodUnit.value])

const correlation = computed(() => {
  const rows = periodRows.value
  if (rows.length < 3 || !initialCapital.value) return null
  const strategy = rows.map((row) => row.strategyReturn)
  const benchmark = rows.map((row) => row.benchmarkReturn)
  const strategyMean = average(strategy)
  const benchmarkMean = average(benchmark)
  const numerator = strategy.reduce(
    (sum, value, index) => sum + (value - strategyMean) * (benchmark[index] - benchmarkMean),
    0,
  )
  const left = Math.sqrt(strategy.reduce((sum, value) => sum + (value - strategyMean) ** 2, 0))
  const right = Math.sqrt(benchmark.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0))
  return left && right ? numerator / (left * right) : null
})

const signalRows = computed(() => {
  const groups = new Map<string, { profit: number; loss: number; total: number }>()
  for (const trade of closedTrades.value) {
    const group = groups.get(trade.signal) ?? { profit: 0, loss: 0, total: 0 }
    if (trade.pnl >= 0) group.profit += trade.pnl
    else group.loss += Math.abs(trade.pnl)
    group.total += trade.pnl
    groups.set(trade.signal, group)
  }
  return [...groups.entries()]
    .map(([label, values]) => ({ label, ...values }))
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
})
const maxSignalMagnitude = computed(() => Math.max(1, ...signalRows.value.map((row) => row.profit + row.loss)))

const sortedPnls = computed(() => closedTrades.value.map((trade) => trade.pnl).sort((a, b) => a - b))
const quartile = (values: number[], fraction: number) => {
  if (!values.length) return 0
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]
}
const outliers = computed(() => {
  const values = sortedPnls.value
  const q1 = quartile(values, 0.25)
  const q3 = quartile(values, 0.75)
  const spread = q3 - q1
  return closedTrades.value.filter((trade) => trade.pnl < q1 - 1.5 * spread || trade.pnl > q3 + 1.5 * spread)
})

const returnBins = computed(() => {
  const values = closedTrades.value.map((trade) => trade.returnPercent)
  if (!values.length) return []
  const hasNegative = values.some((value) => value < 0)
  const hasPositive = values.some((value) => value >= 0)
  const negativeBins = hasNegative ? (hasPositive ? 4 : 8) : 0
  const positiveBins = hasPositive ? (hasNegative ? 4 : 8) : 0
  const makeBins = (from: number, to: number, count: number, positive: boolean) =>
    Array.from({ length: count }, (_, index) => {
      const lower = from + (to - from) * index / count
      const upper = from + (to - from) * (index + 1) / count
      return {
        label: `${fmt(lower, 1)}–${fmt(upper, 1)}%`,
        count: values.filter((value) => value >= lower && (index === count - 1 ? value <= upper : value < upper)).length,
        positive,
      }
    })
  return [
    ...makeBins(Math.floor(Math.min(...values)), 0, negativeBins, false),
    ...makeBins(0, Math.max(1, Math.ceil(Math.max(...values))), positiveBins, true),
  ]
})
const maxBinCount = computed(() => Math.max(1, ...returnBins.value.map((bin) => bin.count)))
const tradeDonut = computed(() => {
  const total = Math.max(1, closedTrades.value.length)
  const winAngle = (wins.value.length / total) * 360
  const lossAngle = ((wins.value.length + losses.value.length) / total) * 360
  return { background: `conic-gradient(#22c7a5 0deg ${winAngle}deg, #ff5262 ${winAngle}deg ${lossAngle}deg, #f0a31b ${lossAngle}deg 360deg)` }
})

const streakStats = computed(() => {
  const winStreaks: number[] = []
  const lossStreaks: number[] = []
  let type = 0
  let length = 0
  for (const trade of closedTrades.value) {
    const next = trade.pnl > 0 ? 1 : trade.pnl < 0 ? -1 : 0
    if (!next) continue
    if (next === type) length += 1
    else {
      if (type === 1) winStreaks.push(length)
      if (type === -1) lossStreaks.push(length)
      type = next
      length = 1
    }
  }
  if (type === 1) winStreaks.push(length)
  if (type === -1) lossStreaks.push(length)
  return {
    longestWin: Math.max(0, ...winStreaks),
    longestLoss: Math.max(0, ...lossStreaks),
    averageWin: average(winStreaks),
    averageLoss: average(lossStreaks),
    currentType: type === 1 ? 'Winning' : type === -1 ? 'Losing' : 'None',
    currentLength: length,
  }
})

const weekdayRows = computed(() => {
  const formatter = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
  const rows = new Map<string, { value: number; count: number }>()
  for (const trade of closedTrades.value) {
    const key = formatter.format(new Date(trade.exitTimestamp))
    const current = rows.get(key) ?? { value: 0, count: 0 }
    rows.set(key, { value: current.value + trade.pnl, count: current.count + 1 })
  }
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return order.map((label) => ({ label, value: rows.get(label)?.value ?? 0, count: rows.get(label)?.count ?? 0 }))
})
const hourRows = computed(() => {
  const rows = new Map<number, { value: number; count: number }>()
  for (const trade of closedTrades.value) {
    const hour = new Date(trade.exitTimestamp).getUTCHours()
    const current = rows.get(hour) ?? { value: 0, count: 0 }
    rows.set(hour, { value: current.value + trade.pnl, count: current.count + 1 })
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([hour, row]) => ({ label: `${String(hour).padStart(2, '0')}:00`, ...row }))
})
const maxTimeMagnitude = computed(() => Math.max(1, ...weekdayRows.value.map((row) => Math.abs(row.value))))

const marginLongRate = computed(() =>
  Math.max(0, snapshot.value?.execution.marginLongPercent ?? 100) / 100,
)
const marginShortRate = computed(() =>
  Math.max(0, snapshot.value?.execution.marginShortPercent ?? 100) / 100,
)

const tradeIntervals = computed(() => {
  const grouped = new Map<number, { entry?: TradeEvent; exit?: TradeEvent }>()
  for (const event of result.value?.trade_log ?? []) {
    const trade = grouped.get(event.trade_id) ?? {}
    if (event.event_type === 'Entry') trade.entry = event
    if (event.event_type === 'Exit') trade.exit = event
    grouped.set(event.trade_id, trade)
  }
  return [...grouped.values()]
    .filter((trade): trade is { entry: TradeEvent; exit?: TradeEvent } => Boolean(trade.entry))
    .map(({ entry, exit }) => ({
      direction: entry.direction,
      entryTimestamp: entry.timestamp,
      exitTimestamp: exit?.timestamp,
      quantity: Math.abs(entry.quantity),
    }))
})

const marginUsageRows = computed(() =>
  (result.value?.bar_log ?? [])
    .filter((bar: { timestamp?: number; close?: number; sig?: string }) =>
      Number.isFinite(bar.timestamp) && Number.isFinite(bar.close) && bar.sig !== 'OpenNow',
    )
    .map((bar: { timestamp: number; close: number; side?: string; quantity_pos?: number }) => {
      const hasNativePosition =
        (bar.side === 'L' || bar.side === 'S' || bar.side === 'F')
        && typeof bar.quantity_pos === 'number'
        && Number.isFinite(bar.quantity_pos)
      const fallback = hasNativePosition
        ? undefined
        : tradeIntervals.value.find((trade) =>
            trade.entryTimestamp <= bar.timestamp
            && (trade.exitTimestamp == null || trade.exitTimestamp > bar.timestamp),
          )
      const direction = hasNativePosition
        ? bar.side === 'L' ? 'long' : bar.side === 'S' ? 'short' : undefined
        : fallback?.direction
      const quantity = hasNativePosition ? Math.abs(bar.quantity_pos ?? 0) : (fallback?.quantity ?? 0)
      const rate = !snapshot.value?.execution.marginEnforcementEnabled
        ? 1
        : direction === 'long'
        ? marginLongRate.value
        : direction === 'short' ? marginShortRate.value : 0
      return {
        timestamp: bar.timestamp,
        margin: Math.abs(quantity * bar.close) * rate,
      }
    }),
)

const averageMarginUsed = computed(() => average(marginUsageRows.value.filter((row) => row.margin > 0).map((row) => row.margin)))
const maximumMarginUsed = computed(() => Math.max(0, ...marginUsageRows.value.map((row) => row.margin)))
const marginEfficiency = computed(() =>
  averageMarginUsed.value ? (result.value?.summary.pnl_total ?? 0) / averageMarginUsed.value : 0,
)
const marginEfficiencyLabel = computed(() => {
  if (!averageMarginUsed.value) return 'Not available'
  const value = marginEfficiency.value
  return `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value), 3)}×`
})
const marginCalls = computed(() => result.value?.margin_calls ?? [])
const visibleMarginCalls = computed(() => marginCalls.value.slice(-10).reverse())
const marginCallLabel = computed(() => {
  if (!snapshot.value?.execution.marginEnforcementEnabled) return 'Off · Infinity'
  return String(marginCalls.value.length)
})
const marginChartRows = computed(() => {
  const rows = marginUsageRows.value
  if (!rows.length) return []
  const bucketSize = Math.max(1, Math.ceil(rows.length / 48))
  const formatter = new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  const buckets = []
  for (let index = 0; index < rows.length; index += bucketSize) {
    const members = rows.slice(index, index + bucketSize)
    buckets.push({
      timestamp: members[0].timestamp,
      margin: average(members.map((row) => row.margin)),
      label: formatter.format(new Date(members[0].timestamp)),
    })
  }
  return buckets.map((row, index) => ({ ...row, label: index % 6 === 0 ? row.label : '' }))
})

const drawdownEpisodes = computed(() => {
  const curve = result.value?.equity_curve ?? []
  const episodes: Array<{ duration: number; depth: number }> = []
  let peak = curve[0]?.equity ?? initialCapital.value
  let start: EquityPoint | null = null
  let peakPoint: EquityPoint | null = curve[0] ?? null
  let depth = 0
  for (const point of curve) {
    if (point.equity >= peak) {
      if (start) episodes.push({ duration: point.timestamp - start.timestamp, depth })
      peak = point.equity
      peakPoint = point
      start = null
      depth = 0
    } else {
      start ??= peakPoint ?? point
      depth = Math.max(depth, peak ? ((peak - point.equity) / peak) * 100 : 0)
    }
  }
  if (start && curve.length) episodes.push({ duration: curve.at(-1)!.timestamp - start.timestamp, depth })
  return episodes
})

const equityStreaks = computed(() => {
  const curve = result.value?.equity_curve ?? []
  const positive: number[] = []
  const negative: number[] = []
  let direction = 0
  let start = curve[0]?.timestamp ?? 0
  for (let index = 1; index < curve.length; index += 1) {
    const nextDirection = curve[index].equity >= curve[index - 1].equity ? 1 : -1
    if (nextDirection !== direction) {
      if (direction === 1) positive.push(curve[index - 1].timestamp - start)
      if (direction === -1) negative.push(curve[index - 1].timestamp - start)
      direction = nextDirection
      start = curve[index - 1].timestamp
    }
  }
  if (curve.length > 1) {
    const duration = curve.at(-1)!.timestamp - start
    if (direction === 1) positive.push(duration)
    if (direction === -1) negative.push(duration)
  }
  return { positive, negative }
})

const monthlyGrowth = computed(() => {
  return buildPeriodEndChanges(
    result.value?.equity_curve ?? [], [], initialCapital.value,
    (timestamp) => periodKey(timestamp, 'Monthly'),
  ).map((row) => ({ label: periodLabel(row.key, 'Monthly'), value: row.strategyReturn * 100 })).slice(-12)
})

const maxPeriodMagnitude = computed(() => Math.max(1, ...visiblePeriodRows.value.flatMap((row) => [Math.abs(row.strategy), Math.abs(row.benchmark)])))
const maxMonthlyGrowth = computed(() => Math.max(1, ...monthlyGrowth.value.map((row) => Math.abs(row.value))))
</script>

<template>
  <div class="research-view performance-view">
    <template v-if="snapshot && result">
      <header class="research-page-header performance-header">
        <div>
          <h1>Performance Analysis</h1>
          <p>{{ snapshot.strategyLabel }} · {{ snapshot.market.symbol }} · {{ snapshot.market.timeframe }} · {{ closedTrades.length }} closed trades</p>
        </div>
        <div class="performance-header-actions">
          <span class="research-status-badge">{{ new Date(snapshot.capturedAt).toLocaleString('nb-NO') }}</span>
          <RouterLink class="performance-close-button" to="/" aria-label="Close performance analysis">×</RouterLink>
        </div>
      </header>

      <div class="analysis-kpi-grid">
        <section class="research-card analysis-kpi">
          <span>Total P&amp;L</span>
          <strong :class="result.summary.pnl_total >= 0 ? 'positive' : 'negative'">{{ money(result.summary.pnl_total) }}</strong>
          <small>{{ percent(strategyReturn) }}</small>
        </section>
        <section class="research-card analysis-kpi">
          <span>Max drawdown</span>
          <strong class="negative">{{ fmt(result.summary.max_drawdown_amount) }} {{ currency }}</strong>
          <small>{{ fmt(result.summary.max_drawdown_percent) }}%</small>
        </section>
        <section class="research-card analysis-kpi">
          <span>Profitable trades</span>
          <strong>{{ fmt((wins.length / Math.max(1, closedTrades.length)) * 100) }}% ({{ wins.length }})</strong>
          <small>{{ closedTrades.length }} total</small>
        </section>
        <section class="research-card analysis-kpi">
          <span>Profit factor</span>
          <strong>{{ fmt(result.summary.profit_factor, 3) }}</strong>
          <small>{{ snapshot.strategyLabel }}</small>
        </section>
      </div>

      <section class="research-card performance-equity-card">
        <h2 class="research-card-title">Cumulative Performance</h2>
        <div class="performance-equity-chart">
          <PnlChart
            :equity-curve="result.equity_curve"
            :initial-capital="initialCapital"
            :trade-log="result.trade_log"
            :range-start-ms="equityRange.start"
            :range-end-ms="equityRange.end"
            baseline-mode="firstNonFlat"
          />
        </div>
      </section>

      <section class="analysis-section">
        <h2>Performance analysis</h2>
        <div class="analysis-tabs" role="tablist" aria-label="Performance analysis">
          <button v-for="tab in performanceTabs" :key="tab" type="button" :class="{ active: activePerformanceTab === tab }" @click="activePerformanceTab = tab">{{ tab }}</button>
        </div>

        <div v-if="activePerformanceTab === 'Breakdown'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>Gross profit</span><strong class="positive">{{ money(grossProfit) }}</strong></div>
            <div><span>Gross loss</span><strong class="negative">{{ money(-grossLoss) }}</strong></div>
            <div><span>Profit factor</span><strong>{{ fmt(result.summary.profit_factor, 3) }}</strong></div>
            <div><span>Commission load</span><strong>{{ grossProfit ? fmt((commissionTotal / grossProfit) * 100) : '0.00' }}%</strong></div>
          </div>
          <h3>Profits and losses by exit signal</h3>
          <div class="signal-breakdown">
            <div v-for="row in signalRows" :key="row.label" class="signal-row">
              <span>{{ row.label }}</span>
              <div class="signal-track">
                <i class="signal-loss" :style="{ width: `${(row.loss / maxSignalMagnitude) * 100}%` }" />
                <i class="signal-profit" :style="{ width: `${(row.profit / maxSignalMagnitude) * 100}%` }" />
              </div>
              <strong :class="row.total >= 0 ? 'positive' : 'negative'">{{ money(row.total) }}</strong>
            </div>
          </div>
        </div>

        <div v-else-if="activePerformanceTab === 'Periodical'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>Annualized return (CAGR)</span><strong>{{ percent(annualizedReturn) }}</strong></div>
            <div><span>Total return</span><strong>{{ percent(strategyReturn) }}</strong></div>
            <div><span>Sharpe ratio · annualized</span><strong>{{ sharpeRatio == null ? '—' : fmt(sharpeRatio, 3) }}</strong></div>
            <div><span>Sortino ratio · annualized</span><strong>{{ sortinoRatio == null ? '—' : fmt(sortinoRatio, 3) }}</strong></div>
          </div>
          <div class="chart-heading-row">
            <h3>Equity change by period</h3>
            <div class="period-selector">
              <button v-for="unit in periodUnits" :key="unit" type="button" :class="{ active: periodUnit === unit }" @click="periodUnit = unit">{{ unit }}</button>
            </div>
          </div>
          <div class="period-chart">
            <div v-for="row in visiblePeriodRows" :key="row.key" class="period-column">
              <div class="period-bars">
                <i :class="row.strategy >= 0 ? 'bar-positive' : 'bar-negative'" :style="{ height: `${Math.max(3, (Math.abs(row.strategy) / maxPeriodMagnitude) * 88)}px`, bottom: row.strategy >= 0 ? '50%' : 'auto', top: row.strategy < 0 ? '50%' : 'auto' }" />
              </div>
              <span>{{ row.label }}</span>
            </div>
          </div>
          <p class="analysis-note">Returns use period-end equity, including open positions. Sharpe and Sortino use a zero target return and annualize by the selected period length; at least three periods are required.</p>
        </div>

        <div v-else-if="activePerformanceTab === 'Benchmarking'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>Strategy return</span><strong>{{ percent(strategyReturn) }}</strong></div>
            <div><span>Buy and hold return</span><strong :class="buyHoldReturn >= 0 ? 'positive' : 'negative'">{{ percent(buyHoldReturn) }}</strong></div>
            <div><span>Strategy outperformance</span><strong>{{ percent(strategyReturn - buyHoldReturn) }}</strong></div>
            <div><span>Period correlation</span><strong>{{ correlation == null ? '—' : fmt(correlation, 3) }}</strong></div>
          </div>
          <div class="chart-heading-row">
            <h3>Strategy versus benchmark</h3>
            <div class="period-selector">
              <button v-for="unit in periodUnits" :key="unit" type="button" :class="{ active: periodUnit === unit }" @click="periodUnit = unit">{{ unit }}</button>
            </div>
          </div>
          <div class="comparison-chart">
            <div v-for="row in visiblePeriodRows" :key="row.key" class="comparison-column">
              <div class="comparison-bars">
                <i class="strategy-bar" :style="{ height: `${Math.max(2, (Math.abs(row.strategy) / maxPeriodMagnitude) * 76)}px`, bottom: row.strategy >= 0 ? '50%' : 'auto', top: row.strategy < 0 ? '50%' : 'auto' }" :title="`Strategy: ${fmt(row.strategy)} ${currency}`" />
                <i class="benchmark-bar" :style="{ height: `${Math.max(2, (Math.abs(row.benchmark) / maxPeriodMagnitude) * 76)}px`, bottom: row.benchmark >= 0 ? '50%' : 'auto', top: row.benchmark < 0 ? '50%' : 'auto' }" :title="`Buy and hold: ${fmt(row.benchmark)} ${currency}`" />
              </div>
              <span>{{ row.label }}</span>
            </div>
          </div>
          <div class="chart-legend"><span class="strategy-dot" />Strategy equity change <span class="benchmark-dot" />Buy and hold equity change</div>
          <p class="analysis-note">Both series compare consecutive period ends. Correlation requires at least three periods.</p>
        </div>

        <div v-else-if="activePerformanceTab === 'Margin usage'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>{{ snapshot.execution.marginEnforcementEnabled ? 'Margin efficiency' : 'Exposure efficiency' }}</span><strong :class="marginEfficiency >= 0 ? 'positive' : 'negative'">{{ marginEfficiencyLabel }}</strong></div>
            <div><span>{{ snapshot.execution.marginEnforcementEnabled ? 'Average margin while open' : 'Average notional while open' }}</span><strong>{{ fmt(averageMarginUsed) }} {{ currency }}</strong></div>
            <div><span>{{ snapshot.execution.marginEnforcementEnabled ? 'Maximum margin used' : 'Maximum position notional' }}</span><strong>{{ fmt(maximumMarginUsed) }} {{ currency }}</strong></div>
            <div><span>Margin calls</span><strong :class="marginCalls.length ? 'negative' : ''">{{ marginCallLabel }}</strong></div>
          </div>
          <h3>{{ snapshot.execution.marginEnforcementEnabled ? 'Margin usage' : 'Position exposure' }} at bar close</h3>
          <div class="exposure-chart">
            <div v-for="row in marginChartRows" :key="row.timestamp" class="exposure-column" :title="`${new Date(row.timestamp).toISOString().slice(0, 10)}: ${fmt(row.margin)} ${currency}`">
              <i :style="{ height: `${Math.max(3, maximumMarginUsed ? (row.margin / maximumMarginUsed) * 100 : 0)}%` }" />
              <span>{{ row.label }}</span>
            </div>
          </div>
          <div v-if="marginCalls.length" class="margin-call-list">
            <h3>Latest forced liquidations · {{ visibleMarginCalls.length }} of {{ marginCalls.length }}</h3>
            <div v-for="call in visibleMarginCalls" :key="`${call.trade_id}-${call.bar_index}`" class="margin-call-row">
              <span>#{{ call.trade_id }} · {{ new Date(call.timestamp).toISOString().replace('T', ' ').slice(0, 16) }}</span>
              <span>{{ call.direction === 'long' ? 'Long' : 'Short' }}</span>
              <span>{{ fmt(call.quantity_liquidated, 4) }} liquidated</span>
              <strong class="negative">{{ call.full_liquidation ? 'Full' : 'Partial' }}</strong>
            </div>
          </div>
          <p class="analysis-note">{{ snapshot.execution.marginEnforcementEnabled ? 'Used margin is position notional at each bar close multiplied by the configured long or short requirement. Margin efficiency is total P&L divided by average margin on bars with an open position. Forced liquidation follows the four-times-cover rule at bar close.' : 'Margin enforcement is off. The chart shows position notional at bar close, and exposure efficiency is total P&L divided by average notional on bars with an open position; no margin calls are modeled in this mode.' }}</p>
        </div>

        <div v-else class="analysis-panel">
          <div class="metric-strip">
            <div><span>Average run-up duration</span><strong>{{ fmt(durationDays(average(equityStreaks.positive)), 1) }} days</strong></div>
            <div><span>Average drawdown duration</span><strong>{{ fmt(durationDays(average(drawdownEpisodes.map((episode) => episode.duration))), 1) }} days</strong></div>
            <div><span>Maximum drawdown</span><strong>{{ fmt(result.summary.max_drawdown_percent) }}%</strong></div>
            <div><span>Longest drawdown</span><strong>{{ fmt(durationDays(Math.max(0, ...drawdownEpisodes.map((episode) => episode.duration))), 1) }} days</strong></div>
          </div>
          <h3>Monthly growth and decline</h3>
          <div class="growth-chart">
            <div v-for="row in monthlyGrowth" :key="row.label" class="growth-column">
              <div class="growth-bars"><i :class="row.value >= 0 ? 'bar-positive' : 'bar-negative'" :style="{ height: `${Math.max(3, (Math.abs(row.value) / maxMonthlyGrowth) * 86)}px`, bottom: row.value >= 0 ? '50%' : 'auto', top: row.value < 0 ? '50%' : 'auto' }" /></div>
              <span>{{ row.label }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="analysis-section trades-analysis">
        <h2>Trades analysis</h2>
        <div class="analysis-tabs" role="tablist" aria-label="Trades analysis">
          <button v-for="tab in tradeTabs" :key="tab" type="button" :class="{ active: activeTradeTab === tab }" @click="activeTradeTab = tab">{{ tab }}</button>
        </div>

        <div v-if="activeTradeTab === 'Distribution'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>Expectancy</span><strong>{{ money(expectancy) }}</strong></div>
            <div><span>Outlier trades</span><strong>{{ outliers.length }} · {{ money(outliers.reduce((sum, trade) => sum + trade.pnl, 0)) }}</strong></div>
            <div><span>Largest profit</span><strong class="positive">{{ money(Math.max(0, ...wins.map((trade) => trade.pnl))) }}</strong></div>
            <div><span>Largest loss</span><strong class="negative">{{ money(Math.min(0, ...losses.map((trade) => trade.pnl))) }}</strong></div>
          </div>
          <div class="distribution-layout">
            <div>
              <h3>Returns distribution</h3>
              <div class="return-distribution">
                <div v-for="bin in returnBins" :key="bin.label" class="return-bin">
                  <span>{{ bin.count }}</span>
                  <i :class="bin.positive ? 'bar-positive' : 'bar-negative'" :style="{ height: `${Math.max(2, (bin.count / maxBinCount) * 120)}px` }" />
                  <small>{{ bin.label }}</small>
                </div>
              </div>
            </div>
            <div>
              <h3>Trades distribution</h3>
              <div class="donut-layout">
                <div class="trade-donut" :style="tradeDonut"><span><strong>{{ closedTrades.length }}</strong>Total trades</span></div>
                <div class="donut-legend">
                  <p><i class="win-dot" />Winners <strong>{{ wins.length }} · {{ fmt((wins.length / Math.max(1, closedTrades.length)) * 100) }}%</strong></p>
                  <p><i class="loss-dot" />Losers <strong>{{ losses.length }} · {{ fmt((losses.length / Math.max(1, closedTrades.length)) * 100) }}%</strong></p>
                  <p><i class="even-dot" />Breakevens <strong>{{ breakevens.length }}</strong></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTradeTab === 'Streaks'" class="analysis-panel">
          <div class="metric-strip">
            <div><span>Longest winning streak</span><strong class="positive">{{ streakStats.longestWin }} trades</strong></div>
            <div><span>Longest losing streak</span><strong class="negative">{{ streakStats.longestLoss }} trades</strong></div>
            <div><span>Average win / loss streak</span><strong>{{ fmt(streakStats.averageWin, 1) }} / {{ fmt(streakStats.averageLoss, 1) }}</strong></div>
            <div><span>Current streak</span><strong>{{ streakStats.currentType }} · {{ streakStats.currentLength }}</strong></div>
          </div>
          <div class="streak-visual">
            <div><span>Winning</span><i class="signal-profit" :style="{ width: `${Math.min(100, streakStats.longestWin * 10)}%` }" /></div>
            <div><span>Losing</span><i class="signal-loss" :style="{ width: `${Math.min(100, streakStats.longestLoss * 10)}%` }" /></div>
          </div>
        </div>

        <div v-else class="analysis-panel">
          <div class="metric-strip">
            <div><span>Best weekday</span><strong>{{ [...weekdayRows].filter((row) => row.count).sort((a, b) => b.value - a.value)[0]?.label ?? '—' }}</strong></div>
            <div><span>Worst weekday</span><strong>{{ [...weekdayRows].filter((row) => row.count).sort((a, b) => a.value - b.value)[0]?.label ?? '—' }}</strong></div>
            <div><span>Most active exit hour</span><strong>{{ [...hourRows].sort((a, b) => b.count - a.count)[0]?.label ?? '—' }} UTC</strong></div>
            <div><span>Average duration</span><strong>{{ fmt(average(closedTrades.map((trade) => trade.durationBars)), 1) }} bars</strong></div>
          </div>
          <h3>Realized P&amp;L by exit weekday</h3>
          <div class="weekday-chart">
            <div v-for="row in weekdayRows" :key="row.label" class="weekday-row">
              <span>{{ row.label }}</span>
              <i :class="row.value >= 0 ? 'signal-profit' : 'signal-loss'" :style="{ width: `${(Math.abs(row.value) / maxTimeMagnitude) * 100}%` }" />
              <strong :class="row.value >= 0 ? 'positive' : 'negative'">{{ money(row.value) }}</strong>
            </div>
          </div>
        </div>
      </section>
    </template>

    <section v-else class="research-card missing-analysis">
      <h1>No backtest analysis yet</h1>
      <p>Run a backtest first, then open Performance analysis from the Equity &amp; Drawdown panel.</p>
      <RouterLink class="primary-link" to="/">Go to Backtest</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.performance-view { padding-bottom: 4rem; }
.performance-header-actions { display:flex; align-items:center; gap:0.7rem; }
.performance-close-button { display:grid; width:42px; height:42px; border:1px solid #4b6074; border-radius:6px; background:#1a2631; color:#d7e3f1; font-size:1.65rem; line-height:1; place-items:center; }
.performance-close-button:hover { border-color:#228bf4; color:#70b9ff; }
.analysis-kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0.75rem; margin-bottom:0.75rem; }
.analysis-kpi { display:flex; min-height:104px; flex-direction:column; justify-content:center; padding:0.8rem 1rem; }
.analysis-kpi span,.analysis-kpi small,.metric-strip span { color:#9fbed2; font-size:0.76rem; }
.analysis-kpi strong { margin-top:0.42rem; color:#f4f7fb; font-size:1.25rem; }
.analysis-kpi small { margin-top:0.18rem; }
.positive { color:#36dda8 !important; }
.negative { color:#ff5968 !important; }
.performance-equity-card { overflow:hidden; margin-bottom:1.4rem; }
.performance-equity-chart { height:365px; }
.analysis-section { margin:1.3rem 0 2rem; }
.analysis-section > h2 { margin:0 0 0.65rem; color:#f4f7fb; font-size:1.18rem; }
.analysis-tabs,.period-selector { display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.75rem; }
.analysis-tabs button,.period-selector button { padding:0.38rem 0.7rem; border:1px solid transparent; border-radius:999px; background:#142635; color:#b8ccdb; font-size:0.75rem; cursor:pointer; }
.analysis-tabs button.active,.period-selector button.active { border-color:#469eea; background:#245b83; color:#fff; }
.analysis-panel { min-height:260px; padding:1rem; border:1px solid #2e4b60; border-radius:7px; background:#0f212e; }
.analysis-panel h3 { margin:1.1rem 0 0.75rem; color:#e9f2f8; font-size:0.9rem; }
.metric-strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; }
.metric-strip > div { display:flex; min-width:0; flex-direction:column; gap:0.3rem; }
.metric-strip strong { color:#f4f7fb; font-size:0.92rem; }
.signal-breakdown { display:grid; gap:0.65rem; }
.signal-row { display:grid; grid-template-columns:180px minmax(120px,1fr) 140px; align-items:center; gap:0.75rem; color:#c6d6e2; font-size:0.78rem; }
.signal-row strong { text-align:right; }
.signal-track { display:flex; height:9px; justify-content:center; overflow:hidden; border-radius:5px; background:#1c3040; }
.signal-track i:first-child { margin-left:auto; }
.signal-profit,.signal-loss { display:block; height:100%; }
.signal-profit { background:#24b99d; }
.signal-loss { background:#ff5968; }
.chart-heading-row { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
.chart-heading-row .period-selector { margin:0; }
.period-chart,.growth-chart,.comparison-chart { display:flex; min-height:210px; align-items:stretch; gap:0.35rem; padding:0.8rem 0.3rem 0; border-bottom:1px solid #52616b; }
.period-column,.growth-column,.comparison-column { display:flex; min-width:0; flex:1; flex-direction:column; align-items:center; justify-content:flex-end; }
.period-column > span,.growth-column > span,.comparison-column > span { min-height:30px; color:#8fabbd; font-size:0.62rem; text-align:center; }
.period-bars,.growth-bars { position:relative; width:70%; height:176px; border-bottom:1px solid rgba(143,171,189,0.3); }
.period-bars::after,.growth-bars::after { position:absolute; top:50%; right:0; left:0; height:1px; background:#5a6c77; content:''; }
.period-bars i,.growth-bars i { position:absolute; right:15%; left:15%; z-index:1; }
.bar-positive { background:#24b99d; }
.bar-negative { background:#ff5968; }
.comparison-bars { position:relative; width:75%; height:165px; }
.comparison-bars::after { position:absolute; top:50%; right:0; left:0; height:1px; background:#5a6c77; content:''; }
.comparison-bars i { position:absolute; z-index:1; width:32%; }
.strategy-bar { left:16%; background:#2f8fff; }
.benchmark-bar { right:16%; background:#9aa7af; }
.chart-legend { display:flex; justify-content:center; gap:0.5rem; margin-top:0.8rem; color:#a9c0cf; font-size:0.72rem; }
.chart-legend span,.donut-legend i { width:8px; height:8px; border-radius:50%; }
.strategy-dot { background:#2f8fff; }.benchmark-dot { margin-left:0.7rem; background:#9aa7af; }
.exposure-chart { display:flex; height:190px; align-items:flex-end; gap:0.4rem; padding:0.5rem 0; border-bottom:1px solid #506472; }
.exposure-column { display:flex; height:100%; min-width:0; flex:1; flex-direction:column; align-items:center; justify-content:flex-end; }
.exposure-column i { display:block; width:65%; min-height:3px; background:#2f8fff; }
.exposure-column span { margin-top:0.35rem; color:#7f9bae; font-size:0.58rem; }
.analysis-note { margin:0.9rem 0 0; color:#91adbf; font-size:0.72rem; }
.margin-call-list { margin-top:1rem; border-top:1px solid #294557; }
.margin-call-list h3 { margin-bottom:0.4rem; }
.margin-call-row { display:grid; grid-template-columns:1.5fr 0.55fr 0.8fr 0.4fr; gap:0.75rem; padding:0.5rem 0; border-top:1px solid #203b4c; color:#c9dae5; font-size:0.72rem; }
.margin-call-row:first-of-type { border-top:0; }
.margin-call-row strong { text-align:right; }
.distribution-layout { display:grid; grid-template-columns:1.2fr 0.8fr; gap:2rem; }
.return-distribution { display:flex; height:190px; align-items:flex-end; gap:0.6rem; border-bottom:1px solid #536774; }
.return-bin { display:flex; min-width:0; flex:1; flex-direction:column; align-items:center; color:#8eabba; font-size:0.63rem; }
.return-bin i { width:70%; }
.return-bin small { min-height:30px; margin-top:0.3rem; text-align:center; }
.donut-layout { display:flex; align-items:center; justify-content:center; gap:2rem; min-height:190px; }
.trade-donut { position:relative; display:grid; width:150px; height:150px; place-items:center; border-radius:50%; }
.trade-donut::before { position:absolute; width:92px; height:92px; border-radius:50%; background:#0f212e; content:''; }
.trade-donut span { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; color:#bcd0dc; font-size:0.68rem; }
.trade-donut strong { color:#fff; font-size:1.15rem; }
.donut-legend p { display:flex; align-items:center; gap:0.45rem; color:#bcd0dc; font-size:0.73rem; }
.donut-legend strong { margin-left:auto; color:#eef5f9; }
.win-dot { background:#22c7a5; }.loss-dot { background:#ff5262; }.even-dot { background:#f0a31b; }
.streak-visual { display:grid; gap:1rem; margin-top:2rem; }
.streak-visual > div { display:grid; grid-template-columns:100px 1fr; align-items:center; gap:1rem; color:#bcd0dc; font-size:0.78rem; }
.streak-visual i { height:14px; border-radius:7px; }
.weekday-chart { display:grid; gap:0.65rem; }
.weekday-row { display:grid; grid-template-columns:48px minmax(80px,1fr) 140px; align-items:center; gap:0.8rem; color:#bcd0dc; font-size:0.76rem; }
.weekday-row i { height:12px; border-radius:6px; }
.weekday-row strong { text-align:right; }
.missing-analysis { max-width:620px; margin:5rem auto; padding:2rem; text-align:center; }
.missing-analysis h1 { color:#f4f7fb; }.missing-analysis p { color:#9db7c8; }
.primary-link { display:inline-flex; margin-top:1rem; padding:0.65rem 1rem; border-radius:5px; background:#198af5; color:#fff; font-weight:700; }
@media (max-width: 900px) {
  .analysis-kpi-grid,.metric-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .distribution-layout { grid-template-columns:1fr; }
  .signal-row { grid-template-columns:120px minmax(80px,1fr) 110px; }
}
@media (max-width: 600px) {
  .analysis-kpi-grid,.metric-strip { grid-template-columns:1fr; }
  .signal-row,.weekday-row { grid-template-columns:1fr; }
  .signal-row strong,.weekday-row strong { text-align:left; }
}
</style>
