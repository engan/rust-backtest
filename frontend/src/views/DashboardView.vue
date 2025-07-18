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
            <option value="smaCross">SMA Crossover (Full)</option>
            <option value="smaCrossMini">SMA Crossover (Mini)</option>            
            <option value="emaVwap">EMA/VWAP Advanced</option> 
            <!-- <option value="rsi">RSI</option> -->
          </select>
        </div>
      </fieldset>

      <fieldset v-if="selectedStrategy === 'smaCross'">
        <legend>SMA Crossover Parameters</legend>
        
        <!-- Debug Qty -->
        <div>
          <label for="sma_fixed_qty" style="color: yellow;">Fixed Qty (Debug):</label>
          <input id="sma_fixed_qty" type="number" step="0.0001" v-model.number="smaParams.fixed_qty">
        </div>
        <small style="margin-left: 130px; display: block; margin-top: -8px; margin-bottom: 12px;">(Leave empty for dynamic size)</small>
        <hr style="margin-bottom: 1rem;">

        <!-- Signal Generation -->
        <div>
          <label for="sma_fast">Fast Period:</label>
          <input id="sma_fast" type="number" v-model.number="smaParams.fast_period" />
        </div>
        <div>
          <label for="sma_slow">Slow Period:</label>
          <input id="sma_slow" type="number" v-model.number="smaParams.slow_period" />
        </div>
        
        <hr style="margin: 1rem 0; border-color: #444;">

        <!-- Risk & Position Sizing -->
        <div>
          <label for="sma_risk_perc">Risk per Trade %:</label>
          <input id="sma_risk_perc" type="number" step="0.1" v-model.number="smaParams.risk_perc">
        </div>
        <div>
          <label for="sma_atr_len">ATR Length:</label>
          <input id="sma_atr_len" type="number" v-model.number="smaParams.atr_length">
        </div>

        <hr style="margin: 1rem 0; border-color: #444;">
        
        <!-- SL/TP Settings -->
        <div>
          <label for="sma_sl_tp_method">SL/TP Method:</label>
          <select id="sma_sl_tp_method" v-model="smaParams.sl_tp_method">
            <option v-for="m in SlTpMethod" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <!-- Conditional Inputs for SL/TP Methods -->
        <div v-if="smaParams.sl_tp_method === SlTpMethod.RiskBased">
            <label>Reward/Risk Ratio:</label>
            <input type="number" step="0.1" v-model.number="smaParams.reward_mult_rb">
            <label>ATR Multiplier:</label>
            <input type="number" step="0.1" v-model.number="smaParams.atr_mult_rb">
        </div>
        
        <div v-if="smaParams.sl_tp_method === SlTpMethod.FixedPercent">
            <label>Fixed SL %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.fixed_sl_perc">
            <label>Fixed TP %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.fixed_tp_perc">
        </div>

        <div v-if="smaParams.sl_tp_method === SlTpMethod.TrailingPercent">
            <label>Trailing SL %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.trailing_sl_perc">
            <label>Trailing TP %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.fixed_tp_for_trailing_perc">
        </div>

        <!-- NYTT: Inputs for Combined -->
        <div v-if="smaParams.sl_tp_method === SlTpMethod.Combined">
            <label>Fixed SL %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.fixed_sl_perc">
            <label>Trailing SL %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.trailing_sl_perc">
             <label>Trailing TP %:</label>
            <input type="number" step="0.1" v-model.number="smaParams.fixed_tp_for_trailing_perc">
        </div>
      </fieldset>

    <!-- ======================================================= -->
    <!-- NY SEKSJON FOR EMA/VWAP PARAMETERE -->
    <!-- ======================================================= -->
    <div class="strategy-parameters" v-if="selectedStrategy === 'emaVwap'">
      <!-- Her legger du inn alle de nye input-feltene. -->
      <!-- Eksempel for én seksjon: -->
      <fieldset>
        <legend>Moving Averages</legend>
        <div>
          <label for="emaLength">EMA Length:</label>
          <input id="emaLength" type="number" v-model.number="emaVwapParams.ema_length">
        </div>
        <div>
          <label for="emaSource">EMA Source:</label>
          <select id="emaSource" v-model="emaVwapParams.ema_source">
            <option v-for="s in EmaSource" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </fieldset>
    </div> 
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
      <!-- 
      <button @click="runDebug" style="background-color: #55aaff; margin-top: 10px;">
          Run Stepped VWAP Debug
      </button>
      -->
    </div>

    <div class="results-panel" v-if="results">
      <h2>Backtest Results</h2>
      <div class="summary-metrics">
        <div>
          <strong>Total P&L:</strong><br />
          <span :class="formattedTotalPnl.class">{{ formattedTotalPnl.text }}</span>
        </div>
        <div>
          <strong>Max Drawdown:</strong><br />
          {{ results.summary.max_drawdown_amount.toFixed(2) }} USDT 
          ({{ results.summary.max_drawdown_percent.toFixed(2) }} %)
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
      <EquityChart :equity-curve="results.equity_curve" />

      <h3>Trades</h3>
      <!-- Sjekk for den nye trade_log -->
      <table v-if="groupedTradeLog.length > 0">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Signal</th>
            <th>Date/Time</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>PnL</th>
            <th>Run-up</th>
            <th>Drawdown</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loop over de grupperte handlene -->
          <template v-for="trade in groupedTradeLog" :key="trade.entry.trade_id">
            
            <!-- Vis KUN lukkede handler for enkelhetens skyld -->
            <template v-if="trade.exit">
              <!-- Rad for Exit -->
              <tr>
                <td rowspan="2">{{ trade.entry.trade_id }}</td>
                <td>Exit {{ trade.exit.direction }}</td>
                <td>{{ trade.exit.signal }}</td>
                <td>{{ new Date(trade.exit.timestamp).toLocaleString() }}</td>
                <td>{{ trade.exit.price.toFixed(2) }} {{ quoteCurrency }}</td>
                <td rowspan="2">{{ trade.exit.qty.toFixed(3) }}</td>
                <td
                rowspan="2"
                :class="{ profit: trade.exit.pnl! > 0, loss: trade.exit.pnl! < 0 }"
              >
                {{ trade.exit.pnl?.toFixed(2) }} {{ quoteCurrency }}
              </td>
              <td rowspan="2">{{ trade.exit.run_up_amount?.toFixed(2) }} {{ quoteCurrency }}</td>
              <td rowspan="2">{{ trade.exit.drawdown_amount?.toFixed(2) }} {{ quoteCurrency }}</td>          
              </tr>
              <!-- Rad for Entry -->
              <tr>
                <td>Entry {{ trade.entry.direction }}</td>
                <td>{{ trade.entry.signal }}</td>
                <td>{{ new Date(trade.entry.timestamp).toLocaleString() }}</td>
                <td>{{ trade.entry.price.toFixed(2) }} {{ quoteCurrency }}</td>          
              </tr>
            </template>

            <!-- Håndter en eventuell åpen trade helt til slutt -->
            <tr v-else>
               <td>{{ trade.entry.trade_id }}</td>
               <td>Entry {{ trade.entry.direction }}</td>
               <td>Open</td> <!-- <-- Endret: Viser "Open" i Signal-kolonnen -->
               <td>{{ new Date(trade.entry.timestamp).toLocaleString() }}</td>
               <td>{{ trade.entry.price.toFixed(2) }} {{ quoteCurrency }}</td>
               <td>{{ trade.entry.qty.toFixed(3) }}</td>
               <td :class="{ profit: trade.entry.pnl! > 0, loss: trade.entry.pnl! < 0 }">
                {{ trade.entry.pnl?.toFixed(2) }} {{ quoteCurrency }}
              </td>
               <td>{{ trade.entry.run_up_amount?.toFixed(2) }} {{ quoteCurrency }}</td>
               <td>{{ trade.entry.drawdown_amount?.toFixed(2) }} {{ quoteCurrency }}</td>
            </tr>

          </template>
        </tbody>
      </table>
      <p v-else-if="results">No trades were executed.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useBacktest } from '@/composables/useBacktest';
// import { useKlines } from '@/composables/useKlines'; 
import type { BacktestResult, BacktestConfig 
} from '@/types/common_strategy_types';
import EquityChart from '@/components/EquityChart.vue';
import { EmaSource, VwapAnchorPeriod, TradeDirectionFilter, 
        FashionablyLateMode, SlTpMethod, type EmaVwapParams, type SmaParams
} from '@/types/common_strategy_types';
import { fetchSymbolFilters } from '@/services/binanceAPI';

// NY reaktiv variabel for alle EMA/VWAP-parametere
const emaVwapParams = reactive<EmaVwapParams>({
  // Fyll inn med fornuftige default-verdier som matcher Pine Script
  ema_length: 120,
  ema_source: EmaSource.Close,
  vwap_anchor_period: VwapAnchorPeriod.Week,
  vwap_source: EmaSource.HLC3,
  trade_direction: TradeDirectionFilter.Both,
  fashionably_late_mode: FashionablyLateMode.Off,
  atr_threshold_fl: 1.0,
  atr_length_pos: 14,
  risk_gearing: 1,
  risk_perc: 1,
  sl_tp_method: SlTpMethod.FixedPercent,
  reward_mult_rb: 1.0,
  atr_mult_rb: 1.0,
  fixed_sl_perc: 1.0,
  fixed_tp_perc: 1.0,
  trailing_sl_perc: 1.0,
  fixed_tp_for_trailing_perc: 1.0,
  enable_max_drawdown: false,
  max_drawdown_perc: 50.0,
  enable_max_consecutive_losses: false,
  max_consecutive_losses: 20,
  enable_dmi_filter: false,
  dmi_length: 6,
  dmi_smoothing: 24,
  dmi_threshold: 14.05,
});

// Bruk useBacktest composable
const { isLoading, runSmaCrossoverBacktest, runSmaCrossoverMiniBacktest, runEmaVwapBacktest } = useBacktest();
// const { klines: debugKlines, loadKlines: debugLoadKlines } = useKlines(); 

// --- Input variabler ---
const symbol = ref('SOLUSDT');
const timeframe = ref('1h'); // Default til 30minutter
const dataLimitForFetch = ref(13547);
const selectedStrategy = ref<'smaCross' | 'smaCrossMini' | 'emaVwap'>('smaCross'); // Utvid med andre strategier
const smaParams = reactive<SmaParams>({ // Bruk SmaParams-typen for å få auto-fullføring
  fast_period: 10,  // 10
  slow_period: 64,  // 64
  fixed_qty: undefined, // <-- NYTT FELT, satt til undefined  
  sl_tp_method: SlTpMethod.FixedPercent, // Start med den enkleste
  atr_length: 14,
  reward_mult_rb: 2.0,
  atr_mult_rb: 1.5,
  fixed_sl_perc: 1.0,
  fixed_tp_perc: 2.0,
  trailing_sl_perc: 3.0,
  fixed_tp_for_trailing_perc: 5.0,
  risk_gearing: 1,
  risk_perc: 1.5,
  // ... legg til combined defaults ...
});
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
  else quoteCurrency.value = 'UNKNOWN'; // Fallback hvis ingen match

  try {
    // Dynamisk tick size hentes fra API
    const filters = await fetchSymbolFilters(symbol.value);
    const backtestConfig: BacktestConfig = {
      commission_percent: commissionPercent.value,
      slippage_ticks: slippageTicks.value,
      tick_size: filters.tickSize,
      step_size: filters.stepSize, // Husk å legge til step_size i BacktestConfig-typen din også
    }; 
    // Kall riktig Rust-funksjon basert på valgt strategi
    if (selectedStrategy.value === 'smaCross') {
      results.value = await runSmaCrossoverBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital,
        config: backtestConfig,
        params: smaParams,
      });
    } else if (selectedStrategy.value === 'smaCrossMini') {
      results.value = await runSmaCrossoverMiniBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital,
        config: backtestConfig,
        params: smaParams,
      });      
    } else if (selectedStrategy.value === 'emaVwap') {
      // VIKTIG: Denne er nå helt lik SMA-kallet, men sender 'params'
      results.value = await runEmaVwapBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital,
        config: backtestConfig,
        params: emaVwapParams, // Send hele det reaktive objektet
      });   
    }
  } catch (error) {
    console.error('Failed to run backtest:', error);
    alert('An error occurred. Check the console for details.');
  } finally {
    isLoading.value = false;
  }
};

const formattedTotalPnl = computed(() => {
  if (!results.value) return { text: '0.00 USDT', class: '' };

  const { net_profit, open_pnl, total_pnl } = results.value.summary;

  // 1) Prosent for Net profit
  const netPerc  = (net_profit / initialCapital) * 100;

  // 2) Prosent for Open P&L (bruk kontantsaldo etter lukkede handler)
  const baseForOpen = initialCapital + net_profit;
  const openPerc = baseForOpen !== 0 ? (open_pnl / baseForOpen) * 100 : 0;

  // 3) TradingView‑logikken: summér prosentene
  const totalPerc = netPerc + openPerc;

  const sign = total_pnl >= 0 ? '+' : '';
  const cls  = total_pnl > 0 ? 'profit' : 'loss';

  return {
    text : `${sign}${total_pnl.toFixed(2)} ${quoteCurrency.value} `
         + `(${sign}${totalPerc.toFixed(2)}%)`,
    class: cls,
  };
});

const groupedTradeLog = computed(() => {
  if (!results.value?.trade_log) {
    return [];
  }

  const grouped = [];
  // Gå gjennom loggen og slå sammen par basert på trade_id
  for (let i = 0; i < results.value.trade_log.length; i++) {
    const event = results.value.trade_log[i];
    if (event.event_type === 'Entry') {
      // Finn den tilhørende exit-en
      const exitEvent = results.value.trade_log.find(
        (e) => e.trade_id === event.trade_id && e.event_type === 'Exit'
      );
      grouped.push({
        entry: event,
        exit: exitEvent, // Kan være undefined hvis traden fortsatt er åpen
      });
    }
  }
  // Snu listen for å vise den siste handelen øverst, som TradingView
  return grouped.reverse(); 
});

/*
const runDebug = async () => {
  console.log("Running Stepped VWAP debug...");
  try {
    await debugLoadKlines(symbol.value, timeframe.value, dataLimitForFetch.value);

    if (debugKlines.value) {
      const wasm = await (await import('@/rust/pkg/rust_backtest_proprietary.js')).default();
      
      const vwapResults = wasm.calculate_vwap_stepped_debug(debugKlines.value);
      
      console.log("--- DEBUG VWAP STEPPED VALUES ---");
      console.log("Running (cumulative) VWAP:", vwapResults.running_vwap);
      console.log("Stepped (weekly) VWAP:", vwapResults.stepped_vwap);
      console.log("---------------------------------");
      alert('Stepped VWAP debug results logged to console!');

    } else {
      throw new Error("Could not fetch klines for debugging.");
    }
  } catch (error) {
    console.error("Debug run failed:", error);
    alert('Debug run failed. Check console.');
  }
};
*/
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