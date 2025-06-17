<template>
  <div class="dashboard-view">
    <h1>High-Performance Backtester (Rust/WASM)</h1>

    <div class="control-panel">
      <h2>Simulation Controls</h2>

      <fieldset>
        <legend>Data Source</legend>
        <div>
          <label for="symbol">Symbol:</label>
          <input type="text" id="symbol" v-model="symbol" />
        </div>
        <div>
          <label for="timeframe">Timeframe:</label>
          <input type="text" id="timeframe" v-model="timeframe" />
        </div>
        <div>
          <label for="limit">Data Limit:</label>
          <input type="number" id="limit" v-model.number="dataLimitForFetch" />
        </div>
      </fieldset>

      <fieldset>
        <legend>Strategy Selection</legend>
        <div>
          <label for="strategy">Strategy:</label>
          <select id="strategy" v-model="selectedStrategy">
            <option value="smaCross">SMA Crossover</option>
            <!-- <option value="emaVwap">EMA/VWAP Crossover</option> -->
            <!-- <option value="rsi">RSI</option> -->
          </select>
        </div>
      </fieldset>

      <fieldset v-if="selectedStrategy === 'smaCross'">
        <legend>SMA Crossover Parameters</legend>
        <div>
          <label>Short Period:</label>
          <input type="number" v-model.number="fastPeriod" style="width: 60px" />
        </div>
        <div>
          <label>Long Period:</label>
          <input type="number" v-model.number="slowPeriod" style="width: 60px" />
        </div>
      </fieldset>

      <fieldset>
        <legend>Backtest Costs</legend>
        <div>
          <label for="commission">Commission (%):</label>
          <input type="number" id="commission" step="0.01" v-model.number="commissionPercent" style="width: 60px" />
        </div>
        <div>
          <label for="slippage">Slippage (ticks):</label>
          <input type="number" id="slippage" v-model.number="slippageTicks" style="width: 60px" />
        </div>
      </fieldset>

      <button @click="runBacktest" :disabled="isLoading">
        {{ isLoading ? 'Running Backtest...' : 'Run Backtest' }}
      </button>
    </div>

    <div class="results-panel" v-if="results">
      <h2>Backtest Results</h2>
      <div class="summary-metrics">
        <div>
          <strong>Total P&L:</strong><br />
          <span :class="formattedTotalPnl.class">{{ formattedTotalPnl.text }}</span>
        </div>
        <div>
          <strong>Max Drawdown:</strong><br />{{ results.summary.max_drawdown_percent.toFixed(2) }} %
        </div>
        <div>
          <strong>Total Trades:</strong><br />{{ results.summary.total_trades }}
        </div>
        <div>
          <strong>Profitable:</strong><br />{{ (results.summary.profitable_trades / results.summary.total_trades * 100).toFixed(2) }}% ({{
            results.summary.profitable_trades
          }})
        </div>
        <div>
          <strong>Profit Factor:</strong><br />{{ results.summary.profit_factor.toFixed(3) }}
        </div>
      </div>

      <h3>Equity Curve</h3>
      <EquityChart :equity-curve="results.equity_curve" :max-points="2000" />

      <h3>Trades</h3>
      <table v-if="results.trades.length > 0">
        <thead>
          <tr>
            <th>Direction</th>
            <th>Entry Bar</th>
            <th>Entry Price</th>
            <th>Exit Bar</th>
            <th>Exit Price</th>
            <th>PnL</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(trade, index) in results.trades" :key="index">
            <td>{{ trade.direction }}</td>
            <td>{{ trade.entry_bar_index }}</td>
            <td>{{ trade.entry_price.toFixed(2) }} {{ quoteCurrency }}</td>
            <td>{{ trade.exit_bar_index }}</td>
            <td>{{ trade.exit_price?.toFixed(2) }} {{ quoteCurrency }}</td>
            <td
              :class="{
                profit: trade.pnl !== undefined && trade.pnl > 0,
                loss: trade.pnl !== undefined && trade.pnl < 0,
              }"
            >
              {{ trade.pnl?.toFixed(2) }} {{ quoteCurrency }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>No trades were executed.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useBacktest } from '@/composables/useBacktest';
import type { BacktestResult, BacktestConfig } from '@/types/common_strategy_types';
import EquityChart from '@/components/EquityChart.vue';

// Bruk useBacktest composable
const { isLoading, runSmaCrossoverBacktest } = useBacktest();

// --- Input variabler ---
const symbol = ref('SOLUSDT');
const timeframe = ref('1h'); // Default til 1 time
const dataLimitForFetch = ref(12714);
const selectedStrategy = ref<'smaCross' | 'emaVwap' | 'rsi'>('smaCross'); // Utvid med andre strategier
const fastPeriod = ref(10);
const slowPeriod = ref(20);
const commissionPercent = ref(0.05);
const slippageTicks = ref(2);

// --- Resultat variabler ---
const results = ref<BacktestResult | null>(null);
const initialCapital = 10000;
const quoteCurrency = ref('USDT');

// --- Funksjoner ---
const runBacktest = async () => {
  results.value = null; // Nullstill gamle resultater
  isLoading.value = true;

  // Bestem quoteCurrency basert på symbol
  if (symbol.value.endsWith('USDT')) quoteCurrency.value = 'USDT';
  else if (symbol.value.endsWith('USD')) quoteCurrency.value = 'USD';
  else if (symbol.value.endsWith('EUR')) quoteCurrency.value = 'EUR';
  else if (symbol.value.endsWith('BTC')) quoteCurrency.value = 'BTC';

  const backtestConfig: BacktestConfig = {
    commission_percent: commissionPercent.value,
    slippage_ticks: slippageTicks.value,
    tick_size: 0.01 // TODO: Denne bør være dynamisk basert på symbol (fra API)
  };

  try {
    // Kall riktig Rust-funksjon basert på valgt strategi
    if (selectedStrategy.value === 'smaCross') {
      results.value = await runSmaCrossoverBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital,
        fastPeriod: fastPeriod.value,
        slowPeriod: slowPeriod.value,
        config: backtestConfig,
      });
    } else {
      // For andre strategier, vis en melding eller kall en annen funksjon
      console.warn(`Strategy ${selectedStrategy.value} not yet implemented.`);
      results.value = null;
    }
  } catch (error) {
    console.error('Failed to run backtest:', error);
    alert('An error occurred. Check the console for details.');
  } finally {
    isLoading.value = false;
  }
};

// --- Computed Properties for Formatering ---
const formattedTotalPnl = computed(() => {
  if (!results.value) return { text: '0.00 USDT', class: '' };
  const pnl = results.value.summary.total_pnl;
  const percentage = (pnl / initialCapital) * 100;
  const sign = pnl >= 0 ? '+' : '';
  const pnlColorClass = pnl > 0 ? 'profit' : (pnl < 0 ? 'loss' : '');
  return {
    text: `${sign}${pnl.toFixed(2)} ${quoteCurrency.value} (${sign}${percentage.toFixed(2)}%)`,
    class: pnlColorClass,
  };
});
</script>

<style scoped>
.dashboard-view {
  max-width: 90vw; /* Gjør dashbordet bredt */
  margin: 0 auto;
  padding: 1rem;
}

.control-panel,
.results-panel {
  display: flex;
  flex-direction: column; /* Stable vertikal stabling */
  gap: 1.5rem; /* Mellomrom mellom fieldsets/seksjoner */
}

/* Felles stil for alle boksene */
fieldset,
.summary-metrics,
.chart-wrapper,
.trades-wrapper {
  border: 1px solid #444;
  padding: 1.5rem; /* Øk padding for romsligere utseende */
  border-radius: 8px;
  background-color: #2a2a2a;
}

/* Flex-layout for innhold i fieldset-div */
fieldset div {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem; /* Mindre margin mellom input-linjer */
}
fieldset div:last-child {
  margin-bottom: 0;
}

/* Styling for nøkkeltallene */
.summary-metrics {
  display: flex;
  justify-content: space-around;
  text-align: center;
  padding: 1rem; /* Mer padding for nøkkeltall */
}
.summary-metrics div {
  flex: 1; /* Gir lik bredde til hver nøkkeltall-div */
}

/* Generell styling */
h1 {
  text-align: center;
  margin-bottom: 2rem;
  color: #eee;
}
h2 {
  text-align: center;
  margin-bottom: 1.5rem;
  color: #eee;
}
h3 {
  margin-top: 0;
  border-bottom: 1px solid #555;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  color: #eee;
}
label {
  min-width: 120px; /* Mer plass for labels */
  text-align: right;
  margin-right: 10px;
  color: #ccc;
}
input[type='text'],
input[type='number'],
select {
  flex-grow: 1; /* La input-feltene vokse for å fylle plassen */
  padding: 8px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #3a3a3a;
  color: #eee;
  max-width: 200px; /* Gi en maks bredde for å unngå for lange felt */
}
button {
  margin-top: 1.5rem; /* Mer margin over knapper */
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  width: 100%; /* Knapper fyller hele bredden */
}
button:disabled {
  background-color: #555;
  cursor: not-allowed;
}

/* Tabell-styling */
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
th,
td {
  border: 1px solid #444;
  padding: 8px;
  text-align: left;
  color: #ccc;
}
th {
  background-color: #3f3f3f;
  color: #f0f0f0;
  font-weight: bold;
}

/* Profit/Loss farger */
.profit {
  color: #4caf50;
  font-weight: 500;
}
.loss {
  color: #f44336;
  font-weight: 500;
}
</style>