<template>
  <div class="chart-container" ref="chartEl">
    <div ref="tooltipEl" class="tv-tooltip" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import {
  createChart,
  BaselineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SingleValueData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityPoint, TradeEvent } from '@/types/common_strategy_types';

// ---------------------------------------------
// Props
// ---------------------------------------------
type PnlPoint = { timestamp: number; pnlPercent?: number; pnl_percent?: number };

const props = defineProps<{
  equityCurve?: EquityPoint[];
  initialCapital?: number;
  tradeLog?: TradeEvent[]; // valgfritt: for "Trade #… Long" i tooltip
  pnlCurve?: PnlPoint[]; // Fallback hvis du ikke sender equity inn (som før)

  // NYTT: klipp til samme vindu som i TV (valgfritt)
  rangeStartMs?: number;
  rangeEndMs?: number;

  // NYTT: styr baseline
  baselineMode?: 'firstSample' | 'firstNonFlat' | 'initial';
}>();

// ---------------------------------------------
// State
// ---------------------------------------------
const chartEl = ref<HTMLElement | null>(null);
const tooltipEl = ref<HTMLDivElement | null>(null);

let chart: IChartApi | null = null;
let pnlSeries: ISeriesApi<'Baseline'> | null = null;
let barsSeries: ISeriesApi<'Histogram'> | null = null;

// For tooltip-beregninger
let idxValues: number[] = [];
let times: UTCTimestamp[] = [];
let rollingPeak: number[] = [];
let lastBarPctAbs: number[] = [];
let tradeAtTime = new Map<number, TradeEvent>(); // timestamp(sec) -> trade event (Entry/Exit)

// ---------------------------------------------
// Utils
// ---------------------------------------------
const msToSec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
const secToDate = (sec: number) => new Date(sec * 1000);

const pnlVal = (p: PnlPoint): number =>
  (typeof p.pnlPercent === 'number' ? p.pnlPercent :
   typeof (p as any).pnl_percent === 'number' ? (p as any).pnl_percent : NaN);

function fmtDateTimeUTC(sec: number): string {
  // TV-lignende; 24t og UTC
  const d = secToDate(sec);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).replace(',', '');
}

// Klipp en equity-serie til [start, end]
function clipByRange(equity: EquityPoint[], startMs?: number, endMs?: number): EquityPoint[] {
  if (!startMs && !endMs) return equity;
  return equity.filter(p =>
    (startMs ? p.timestamp >= startMs : true) &&
    (endMs   ? p.timestamp <= endMs   : true)
  );
}

// Finn første “ikke-flate” verdi (dvs. første punkt som ≠ initial innenfor en liten epsilon)
function firstNonFlatDenom(sorted: EquityPoint[], initial: number): number {
  const EPS = 1e-6;
  for (const e of sorted) {
    if (Math.abs(e.equity - initial) > EPS) return e.equity;
  }
  // Faller tilbake til første sample hvis alt er flatt
  return sorted[0].equity;
}

// ---------------------------------------------
// Bygg serie (index) fra EQUITY (TV-korrekt)
// index = equity / initialCapital
// ---------------------------------------------
function toIndexFromEquity(
  equity: EquityPoint[],
  initialCapital: number,
  normalize: 'firstSample' | 'initial' | 'firstNonFlat',
  rangeStartMs?: number,
  rangeEndMs?: number,
): SingleValueData[] {
  if (!equity?.length) return [];

  // 1) klipp til samme dato-vindu som TV
  const clipped = clipByRange(equity, rangeStartMs, rangeEndMs);
  if (!clipped.length) return [];

  const sorted = clipped
    .filter(e => Number.isFinite(e.equity) && Number.isFinite(e.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  // 2) velg baseline
  let denom: number;
  if (normalize === 'initial') {
    denom = initialCapital;
  } else if (normalize === 'firstNonFlat') {
    denom = firstNonFlatDenom(sorted, initialCapital);
  } else { // 'firstSample' – TV-stil
    denom = sorted[0].equity;
  }

  if (!Number.isFinite(denom) || denom <= 0) return [];

  // 3) bygg index (1.x), etikett/akse = (v - 1) * 100
  return sorted.map(e => ({
    time: Math.floor(e.timestamp / 1000) as UTCTimestamp,
    value: e.equity / denom,
  }));
}

// ---------------------------------------------
// Fallback: bygg serie (index) fra PnL-prosent
// index = (100 + pnl%) / 100
// ---------------------------------------------
function toIndexFromPnl(pnl: PnlPoint[]): SingleValueData[] {
  const lineAbs = (pnl ?? [])
    .filter(p => Number.isFinite(pnlVal(p)) && Number.isFinite(p.timestamp) && p.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(p => ({ time: msToSec(p.timestamp), value: pnlVal(p) }));

  return lineAbs.map(d => ({
    time: d.time as UTCTimestamp,
    value: (100 + (d.value as number)) / 100,
  }));
}

// TV-style bars nederst (|%| endring pr bar)
function toBarsFromIndex(idx: SingleValueData[]): HistogramData[] {
  if (idx.length < 2) return [];
  const out: HistogramData[] = [];
  for (let i = 1; i < idx.length; i++) {
    const prev = idx[i - 1].value as number;
    const cur  = idx[i].value as number;
    const stepPct = (cur / prev - 1) * 100;
    out.push({
      time: idx[i].time as UTCTimestamp,
      value: Math.abs(stepPct),
      color: stepPct >= 0 ? 'rgba(38,166,154,0.65)' : 'rgba(239,83,80,0.65)',
    });
  }
  return out;
}

function prepareTooltipArrays(indexSeries: SingleValueData[]) {
  idxValues = indexSeries.map(d => d.value as number);
  times     = indexSeries.map(d => d.time as UTCTimestamp);

  rollingPeak = [];
  lastBarPctAbs = [];
  let peak = -Infinity;

  for (let i = 0; i < idxValues.length; i++) {
    const v = idxValues[i];
    peak = Math.max(peak, v);
    rollingPeak.push(peak);

    if (i === 0) lastBarPctAbs.push(0);
    else {
      const prev = idxValues[i - 1];
      lastBarPctAbs.push(Math.abs((v / prev - 1) * 100));
    }
  }
}

// Bygg oppslag for “Trade #… Long/Short”
function buildTradeIndex(trades?: TradeEvent[]) {
  tradeAtTime.clear();
  if (!trades?.length) return;
  for (const t of trades) {
    const sec = msToSec(t.timestamp) as unknown as number;
    // Prioriter Entry; hvis flere samme sec, sist vinner
    if (t.event_type === 'Entry' || t.event_type === 'Exit') {
      tradeAtTime.set(sec, t);
    }
  }
}

function initChart() {
  if (!chartEl.value) return;

  chart = createChart(chartEl.value, {
    autoSize: true,
    layout: { background: { color: '#2a2a2a' }, textColor: '#ccc' },
    grid: { vertLines: { color: '#444' }, horzLines: { color: '#444' } },
    rightPriceScale: {
      borderColor: '#71717a',
      scaleMargins: { top: 0.08, bottom: 0.30 },
      mode: 2, // Percentage
    },
    timeScale: {
      borderColor: '#71717a',
      timeVisible: true,
      minBarSpacing: 0.001,
      barSpacing: 0.1,
      lockVisibleTimeRangeOnResize: true,
      shiftVisibleRangeOnNewBar: false,
      rightOffset: 0,
    },
  });

  pnlSeries = chart.addSeries(BaselineSeries, {
    baseValue: { type: 'price', price: 1 }, // 1.0 == 0 %
    topFillColor1: 'rgba(38,166,154,0.35)',
    topFillColor2: 'rgba(38,166,154,0.05)',
    topLineColor:   'rgba(38,166,154,1)',
    bottomFillColor1: 'rgba(239,83,80,0.35)',
    bottomFillColor2: 'rgba(239,83,80,0.05)',
    bottomLineColor:   'rgba(239,83,80,1)',
    lineWidth: 2,
    priceFormat: {
      type: 'custom',
      minMove: 0.0001,
      formatter: (v: number) => `${((v - 1) * 100).toFixed(2)}%`,
    },
  });

  barsSeries = chart.addSeries(HistogramSeries, { priceScaleId: '' });
  barsSeries.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 } });
  pnlSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.30 } });

  setupCrosshairTooltip();
}

function setupCrosshairTooltip() {
  if (!chart || !pnlSeries || !tooltipEl.value) return;

  const el = tooltipEl.value;
  el.style.display = 'none';

  const series: ISeriesApi<'Baseline'> = pnlSeries;

  chart.subscribeCrosshairMove((param) => {
    if (!param.point || !param.time || !param.seriesData.size) {
      el.style.display = 'none';
      return;
    }

    const sData = param.seriesData.get(series);
    if (!sData) { el.style.display = 'none'; return; }

    const t = param.time as UTCTimestamp;
    const sec = t as unknown as number;

    // Finn indeksposisjon nærmest dette tidspunktet (eksakt eller nærmeste venstre)
    let i = times.findIndex(x => x === t);
    if (i < 0) {
      i = times.findIndex(x => x > t) - 1;
      if (i < 0) { el.style.display = 'none'; return; }
    }

    const idxVal = idxValues[i];
    const cumPct = (idxVal - 1) * 100;
    const barPct = lastBarPctAbs[i];
    const ddPct  = (idxVal / rollingPeak[i] - 1) * 100;

    // Optional header: “Trade #… Long/Short”
    const trade = tradeAtTime.get(sec);
    const hdr = trade
      ? `Trade #${trade.trade_id} ${trade.direction[0].toUpperCase()}${trade.direction.slice(1)}`
      : '';

    const when = fmtDateTimeUTC(sec);

    el.innerHTML = `
      ${hdr ? `<div class="hdr">${hdr}</div>` : ''}
      <div class="row head">
        <span class="lbl">Cumulative P&amp;L</span>
        <span class="val">${cumPct.toFixed(2)}%</span>
      </div>
      <div class="row">
        <span class="lbl">Run-up</span>
        <span class="val">${barPct.toFixed(2)}%</span>
      </div>
      <div class="row">
        <span class="lbl">Drawdown</span>
        <span class="val">${ddPct.toFixed(2)}%</span>
      </div>
      <div class="dt">${when}</div>
    `;

    el.style.display = 'block';
    const x = Math.round(param.point.x);
    const y = Math.round(param.point.y);
    const br = chartEl.value!.getBoundingClientRect();

    el.style.left = Math.min(x + 12, br.width - el.offsetWidth - 8) + 'px';
    el.style.top  = Math.max(y - el.offsetHeight - 12, 8) + 'px';
  });
}

function showAll(pointsCount: number) {
  if (!chart) return;
  const to = Math.max(0, pointsCount - 1);
  chart.timeScale().setVisibleLogicalRange({ from: 0, to });
  requestAnimationFrame(() => chart!.timeScale().setVisibleLogicalRange({ from: 0, to }));
}

function render() {
  if (!chart || !pnlSeries || !barsSeries) return;

  let idx: SingleValueData[] = [];

  // 1) Foretrukket: equity/initialCapital (TV-korrekt)
if (props.equityCurve?.length && typeof props.initialCapital === 'number') {
  const mode = props.baselineMode ?? 'firstSample'; // default = TV-stil
  idx = toIndexFromEquity(
    props.equityCurve,
    props.initialCapital!,
    mode,
    props.rangeStartMs,
    props.rangeEndMs
  );

  // debug: se hvilken baseline som faktisk ble brukt
  if (idx.length) {
    const firstMs = (idx[0].time as number) * 1000;
    const firstEq = clipByRange(props.equityCurve, props.rangeStartMs, props.rangeEndMs)
                      .sort((a,b) => a.timestamp - b.timestamp)[0].equity;
    const lastEq  = props.equityCurve.at(-1)!.equity;
    console.log('[PnlChart] baselineMode=', mode,
                'rangeStart=', new Date(props.rangeStartMs ?? firstMs).toISOString(),
                'firstEqInRange=', firstEq, 'lastEq=', lastEq,
                'pct_vs_first=', ((lastEq/firstEq)-1)*100);
  }
} else if (props.pnlCurve?.length) {
  idx = toIndexFromPnl(props.pnlCurve);
}

  if (!idx.length) return;

  // Trade-header oppslag
  buildTradeIndex(props.tradeLog);

  pnlSeries.setData(idx);
  barsSeries.setData(toBarsFromIndex(idx));
  prepareTooltipArrays(idx);
  showAll(idx.length);
}

// etter render():
const lastEq = props.equityCurve?.at(-1)?.equity ?? 0;
console.log('equity_last', lastEq, 'initial', props.initialCapital, 'pct=', ((lastEq/props.initialCapital!)-1)*100);


onMounted(async () => {
  await nextTick();
  initChart();
  render();
});

watch(
  () => [props.equityCurve, props.initialCapital, props.pnlCurve, props.tradeLog],
  () => render(),
  { deep: true }
);

onBeforeUnmount(() => {
  chart?.remove();
  chart = null;
  pnlSeries = null;
  barsSeries = null;
});
</script>

<style scoped>
.chart-container { position: relative; height: 400px; width: 100%; }

/* TV-lignende tooltip */
.tv-tooltip {
  position: absolute;
  z-index: 1000;
  pointer-events: none;
  display: none;
  min-width: 210px;
  background: rgba(20,20,20,0.92);
  color: #eaeaea;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  font-size: 12px;
  line-height: 1.2;
}
.tv-tooltip .hdr { font-weight: 600; margin-bottom: 6px; opacity: 0.95; }
.tv-tooltip .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; margin: 2px 0; }
.tv-tooltip .row.head { font-weight: 700; }
.tv-tooltip .lbl { opacity: 0.9; }
.tv-tooltip .val { text-align: right; min-width: 72px; }
.tv-tooltip .dt  { margin-top: 6px; opacity: 0.8; }
</style>
