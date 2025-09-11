<template>
  <div class="dashboard-view">
    <h1>High-Performance Backtester (Rust/WASM)</h1>

    <div class="control-panel">
      <!-- <h2>Simulation Controls</h2> -->

      <!-- ======================= -->
      <!--   TO-KOLONNE LAYOUT     -->
      <!-- ======================= -->
      <div class="controls-grid">
        <!-- VENSTRE: INPUTS -->
        <fieldset class="col-card">
          <legend>Inputs</legend>

          <!-- SMA -->
          <section class="group">
            <div class="group-title">SMA Crossover</div>
            <div class="row">
              <label for="sma_fast">Fast Period:</label>
              <input id="sma_fast" type="number" v-model.number="smaParams.fast_period" />
            </div>
            <div class="row">
              <label for="sma_slow">Slow Period:</label>
              <input id="sma_slow" type="number" v-model.number="smaParams.slow_period" />
            </div>
          </section>

          <!-- Trading Direction -->
          <section class="group">
            <div class="group-title">Long and/or Short</div>

            <div class="row">
              <label for="sma_trade_dir">Trading Direction:</label>
              <select id="sma_trade_dir" v-model="smaParams.trade_direction">
                <option :value="TradeDirectionFilter.Both">Both</option>
                <option :value="TradeDirectionFilter.Long">Long</option>
                <option :value="TradeDirectionFilter.Short">Short</option>
              </select>

              <!-- lite info-ikon -->
              <span class="tip" tabindex="0" style="margin-left:6px"> ⓘ
                <span class="tip-content">
                  <b>Default: 'Both'.</b><br>
                  - <b>Both:</b> Allows both long and short trades<br>
                  - <b>Long:</b> Only long trades<br>
                  - <b>Short:</b> Only short trades
                </span>
              </span>
            </div>
          </section>          

          <!-- SL/TP -->
          <section class="group">
            <div class="group-title">Stop-Loss &amp; Take-Profit</div>
            <div class="row">
              <label for="sma_sl_tp_method">SL/TP Method:</label>
              <select id="sma_sl_tp_method" v-model="smaParams.sl_tp_method">
                <option :value="SlTpMethod.RiskBased">RiskBased</option>
                <option :value="SlTpMethod.FixedPercent">Fixed %</option>
                <option :value="SlTpMethod.TrailingPercent">Trailing %</option>
                <option :value="SlTpMethod.Combined">Combined</option>
              </select>
            </div>

            <!-- RB parametre -->
            <div v-if="smaParams.sl_tp_method === SlTpMethod.RiskBased" class="method-rows">
              <div class="row">
                <label for="sma_rr">Reward/Risk Ratio:</label>
                <input id="sma_rr" type="number" step="0.1" v-model.number="smaParams.reward_mult_rb">
              </div>
              <div class="row">
                <label for="sma_atr_mult">R/R ATR Multiplier SL:</label>
                <input id="sma_atr_mult" type="number" step="0.1" v-model.number="smaParams.atr_mult_rb">
              </div>
            </div>

            <!-- Fixed -->
            <div v-if="smaParams.sl_tp_method === SlTpMethod.FixedPercent" class="method-rows">
              <div class="row"><label>Fixed SL %:</label><input type="number" step="0.1" v-model.number="smaParams.fixed_sl_perc" /></div>
              <div class="row"><label>Fixed TP %:</label><input type="number" step="0.1" v-model.number="smaParams.fixed_tp_perc" /></div>
            </div>

            <!-- Trailing -->
            <div v-if="smaParams.sl_tp_method === SlTpMethod.TrailingPercent" class="method-rows">
              <div class="row"><label>Trailing SL %:</label><input type="number" step="0.1" v-model.number="smaParams.trailing_sl_perc"></div>
              <div class="row"><label>Trailing TP %:</label><input type="number" step="0.1" v-model.number="smaParams.fixed_tp_for_trailing_perc"></div>
            </div>

            <!-- Combined -->
            <div v-if="smaParams.sl_tp_method === SlTpMethod.Combined" class="method-rows">
              <div class="row"><label>Fixed SL %:</label><input type="number" step="0.1" v-model.number="smaParams.fixed_sl_perc"></div>
              <div class="row"><label>Trailing SL %:</label><input type="number" step="0.1" v-model.number="smaParams.trailing_sl_perc"></div>
              <div class="row"><label>Trailing TP %:</label><input type="number" step="0.1" v-model.number="smaParams.fixed_tp_for_trailing_perc"></div>
            </div>
          </section>

          <!-- Risk & Position Sizing (kun RB) -->
          <section class="group" v-if="smaParams.sl_tp_method === SlTpMethod.RiskBased">
            <div class="group-title">Risk &amp; Position Sizing</div>
            <div class="row">
              <label for="sma_atr_len">ATR Length:</label>
              <input id="sma_atr_len" type="number" v-model.number="smaParams.atr_length">
            </div>
            <div class="row">
              <label for="sma_risk_gearing">Risk Gearing (x):</label>
              <select id="sma_risk_gearing" v-model.number="smaParams.risk_gearing">
                <option v-for="n in [1,2,3,4,5]" :key="n" :value="n">{{ n }}</option>
              </select>
            </div>
            <div class="row">
              <label for="sma_risk_perc">Risk per Trade %:</label>
              <input id="sma_risk_perc" type="number" step="0.1" v-model.number="smaParams.risk_perc">
            </div>
          </section>
        </fieldset>

        <!-- HØYRE: PROPERTIES -->
        <fieldset class="col-card">
          <legend>Properties</legend>

          <section class="group">
            <div class="group-title">Strategy Selection</div>
            <div class="row">
              <label for="strategy">Strategy:</label>
              <select id="strategy" v-model="selectedStrategy">
                <option value="smaCross">SMA Crossover (Full)</option>
                <option value="smaCrossMini">SMA Crossover (Mini)</option>
                <option value="emaVwap">EMA/VWAP Advanced</option>
              </select>
            </div>
          </section>

          <section class="group">
            <div class="group-title">Experimental</div>

            <!-- Round prices to exchange tick -->
            <div class="row row-checkbox">
              <input id="priceToTick" type="checkbox" v-model="priceToTick" class="accent-blue-500" />
              <label for="priceToTick" class="inline-label">Round prices to exchange tick</label>

              <!-- info-ikon -->
              <span class="tip" tabindex="0">ⓘ
                <span class="tip-content">
                  <b>What it does:</b> Rounds all simulated order prices to the exchange's tick size,
                  always in your disfavor (buy up / sell down).<br>
                  <b>Use it when:</b> you want exchange-realistic fills.<br>
                  <b>Turn it OFF</b> to match TradingView Strategy Tester (TV typically doesn't force tick rounding).
                </span>
              </span>
            </div>

            <!-- Match TradingView (Parity) -->
            <div class="row row-checkbox">
              <input id="parityMode" type="checkbox" v-model="smaParams.parity_mode" class="accent-blue-500" />
              <label for="parityMode" class="inline-label">Match TradingView (Parity)</label>

              <!-- info-ikon -->
              <span class="tip" tabindex="0">ⓘ
                <span class="tip-content">
                  <b>Match TradingView (Parity)</b><br>
                  • MODE 1-3: inkluderer commission og runder qty ned til exchange step.<br>
                  • MODE 4 (Explicit, qty settes i strategy.entry): ingen fee/step.<br>
                  • MODE 5 (Risk-Based SL/TP): ingen step på qty.<br>
                  <b>Round prices to exchange tick</b>.
                  Runder priser (entry/exit/SL/TP) til tick i din disfavør. Påvirker ikke close[1] i sizing.
                </span>
              </span>
            </div>
          </section>

          <section class="group">
            <div class="group-title">Data Source</div>
            <div class="row"><label for="symbol">Symbol:</label><input id="symbol" v-model="symbol" type="text" /></div>
            <div class="row"><label for="timeframe">Timeframe:</label><input id="timeframe" v-model="timeframe" type="text" /></div>
            <div class="row"><label for="limit">Data Limit:</label><input id="limit" v-model.number="dataLimitForFetch" type="number" /></div>
          </section>

          <section class="group">
            <div class="group-title">Backtest Properties</div>
            <div class="row">
              <label for="initial-capital">Initial Capital:</label>
              <input id="initial-capital" type="number" v-model.number="initialCapital" />
              <span v-if="isRiskBased" class="hint"> Disabled when Risk-Based sizing active!</span>
            </div>
            <div class="row" :class="{ 'row-disabled': isRiskBased }">
              <label for="order-size-value">Order Size:</label>
              <input id="order-size-value" type="number" v-model.number="smaParams.order_size_value" :disabled="isRiskBased" />
              <select v-model="smaParams.order_size_mode" :disabled="isRiskBased" style="margin-left:8px;">
                <option :value="OrderSizeMode.PercentOfEquity">% of equity</option>
                <option :value="OrderSizeMode.FixedQuantity">Quantity</option>
                <option :value="OrderSizeMode.FixedValue">USDT</option>
                <option :value="OrderSizeMode.ExplicitQty">Explicit quantity (x gearing)</option>
              </select>
              <!-- lite info-ikon -->
              <span class="tip" tabindex="0">ⓘ
                <span class="tip-content">
                  <b>MODE 1: % of equity</b> - bruker default_quantity (100% = all-in).<br>
                  <b>MODE 2: Quantity</b> - fast antall enheter.<br>
                  <b>MODE 3: USDT</b> - fast verdi i quote.<br>
                  <b>MODE 4: Explicit quantity (x)</b> - <code>qty = equity[1]/close[1] × gearing</code>.
                  <hr style="border-color:#333; margin:6px 0;">
                  <b>MODE 5: Risk-Based SL/TP</b>: qty beregnes aut. fra <i>Risk per Trade %</i> og <i>ATR</i>.
                </span>
              </span>              
            </div>
          </section>

          <section class="group">
            <div class="group-title">Backtest Costs</div>
            <div class="row"><label for="commission">Commission (%):</label><input id="commission" type="number" step="0.01" v-model.number="commissionPercent" style="width:60px" /></div>
            <div class="row"><label for="slippage">Slippage (ticks):</label><input id="slippage" type="number" v-model.number="slippageTicks" style="width:60px" /></div>
          </section>
        </fieldset>
      </div>

      <button class="run-btn" @click="runBacktest" :disabled="isLoading">
        {{ isLoading ? 'Running Backtest...' : 'Run Backtest' }}
      </button>
      <!-- 
      <button @click="runDebug" style="background-color: #55aaff; margin-top: 10px;">
          Run Stepped VWAP Debug
      </button>
      -->
    </div>

    <div class="results-panel" v-if="results">
    <h3 class="section-title">Backtest Results</h3>

    <!-- Metrics + Chart merged into a single visual card -->
    <div class="results-stack">
      <div class="summary-metrics">
        <div>
          <strong>Total P&L:</strong><br />
          <span :class="formattedTotalPnl.class">{{ formattedTotalPnl.text }}</span>
        </div>
        <div>
          <strong>Max equity drawdown:</strong><br />
          {{ results.summary.max_drawdown_amount.toFixed(2) }} USDT
          ({{ results.summary.max_drawdown_percent.toFixed(2) }} %)
        </div>
        <div>
          <strong>Total Trades:</strong><br />{{ results.summary.total_trades }}
        </div>
        <div>
          <strong>Profitable trades:</strong><br />{{
            (results.summary.profitable_trades / results.summary.total_trades * 100).toFixed(2)
          }}% ({{ results.summary.profitable_trades }})
        </div>
        <div>
          <strong>Profit factor:</strong><br />{{ results.summary.profit_factor.toFixed(3) }}
        </div>
      </div>

      <div class="chart-card" v-if="results?.equity_curve?.length">
        <PnlChart
          :equity-curve="results.equity_curve"
          :initial-capital="initialCapital"
          :trade-log="results.trade_log"
          :range-start-ms="tvStartMs"
          :range-end-ms="tvEndMs"
          baseline-mode="firstNonFlat"
        />
      </div>

      <div v-else class="empty-chart-placeholder">
        No performance data to display.
      </div>
    </div>

    <h3 class="section-title">List of Trades</h3>

      <table v-if="processedTradeLog.length > 0">
        <thead>
          <tr>
            <th>Trade #</th>
            <th>Type</th>
            <th>Date/Time</th>            
            <th>Signal</th>
            <th>Price</th>
            <th style="text-align: center">Position size</th>
            <th style="text-align: center">P&L</th>
            <th style="text-align: center">Run-up</th>
            <th style="text-align: center">Drawdown</th>
            <th style="text-align: center">Cumulative P&L</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="trade in processedTradeLog" :key="trade.entry.trade_id">
            
            <!-- Viser lukkede handler -->
            <template v-if="trade.exit">
              <!-- Rad for Exit -->
              <tr>
                <td :rowspan="2">
                  <span class="trade-id">{{ trade.entry.trade_id }}</span>
                  <span
                    class="dir-text"
                    :class="trade.entry.direction === 'long' ? 'dir-long' : 'dir-short'"
                  >
                    {{ trade.entry.direction === 'long' ? 'Long' : 'Short' }}
                  </span>
                </td>
                <td>Exit</td>
                <td>{{ new Date(trade.exit.timestamp).toLocaleString() }}</td>                       
                <td>{{ signalLabel(trade.exit) }}</td>                         
                <td>{{ trade.exit.price.toFixed(2) }} {{ quoteCurrency }}</td>
                <td :rowspan="2" style="text-align:center">
                  <div>{{ trade.exit.quantity.toFixed(2) }}</div>
                  <div class="percent-value">{{ (trade.positionValue/1000).toFixed(2) }}k&nbsp;{{ quoteCurrency }}</div>
                </td>

                <!-- P&L med % -->
                <td :rowspan="2" :class="{ profit: trade.exit.pnl! > 0, loss: trade.exit.pnl! < 0 }">
                  <div>{{ trade.exit.pnl?.toFixed(2) }} {{ quoteCurrency }}</div>
                  <!-- <div class="percent-value" :class="{ profit: (trade.pnlPercent ?? 0) > 0, loss: (trade.pnlPercent ?? 0) < 0 }">
                    {{ trade.pnlPercent?.toFixed(2) }}%
                  </div> -->
                  <div class="percent-value" :class="{ profit: (trade.returnPercent ?? 0) > 0, loss: (trade.returnPercent ?? 0) < 0 }">
                    {{ trade.returnPercent?.toFixed(2) }}%
                  </div>                  
                </td>

                <!-- Run-up med % -->
                <td :rowspan="2">
                   <div>{{ trade.exit.run_up_amount?.toFixed(2) }} {{ quoteCurrency }}</div>
                   <div class="percent-value">{{ trade.runUpPercent?.toFixed(2) }}%</div>
                </td>

                <!-- Drawdown med % -->
                <td :rowspan="2">
                   <div>-{{ trade.exit.drawdown_amount?.toFixed(2) }} {{ quoteCurrency }}</div>
                   <div class="percent-value">-{{ trade.drawdownPercent?.toFixed(2) }}%</div>
                </td>
                
                <!-- Cumulative P&L -->
                <td :rowspan="2" :class="{ profit: trade.cumulativePnl!> 0, loss: trade.cumulativePnl! < 0 }">
                   <div>{{ trade.cumulativePnl?.toFixed(2) }} {{ quoteCurrency }}</div>
                   <div class="percent-value" :class="{ profit: (trade.cumulativePnlPercent ?? 0) > 0, loss: (trade.cumulativePnlPercent ?? 0) < 0 }">
                      {{ trade.cumulativePnlPercent?.toFixed(2) }}%
                   </div>
                </td>
              </tr>
              <!-- Rad for Entry -->
              <tr>
                <td>Entry</td>
                <td>{{ new Date(trade.entry.timestamp).toLocaleString() }}</td>                
                <td>{{ signalLabel(trade.entry) }}</td>
                <td>{{ trade.entry.price.toFixed(2) }} {{ quoteCurrency }}</td>
              </tr>
            </template>
            <!-- ÅPEN TRADE: vis som to rader (Exit/Open + Entry) -->
            <template v-else>
              <!-- ØVERST: Exit ... Open (TV-stil) -->
              <tr>
                <td :rowspan="2">
                  <span class="trade-id">{{ trade.entry.trade_id }}</span>
                  <span
                    class="dir-text"
                    :class="trade.entry.direction === 'long' ? 'dir-long' : 'dir-short'"
                  >
                    {{ trade.entry.direction === 'long' ? 'Long' : 'Short' }}
                  </span>
                </td>
                <td>Exit {{ trade.entry.direction }}</td>
                <td>{{ new Date(openNowTs ?? trade.entry.timestamp).toLocaleString() }}</td>
                <td>Open</td>
                <td>
                  <!-- bruk simulert "nå"-pris fra bar_log-markør, ellers "—" -->
                  <template v-if="openNowPrice !== undefined">{{ openNowPrice!.toFixed(2) }} {{ quoteCurrency }}</template>
                  <template v-else>—</template>
                </td>

                <!-- Quantity/pos-verdi over to rader -->
                <td :rowspan="2" style="text-align:center">
                  <div>{{ trade.entry.quantity.toFixed(2) }}</div>
                  <div class="percent-value">{{ (trade.positionValue/1000).toFixed(2) }}k&nbsp;{{ quoteCurrency }}</div>
                </td>

                <!-- P&L (åpen) over to rader, som i TV -->
                <td :rowspan="2" :class="{ profit: (trade.entry.pnl ?? 0) > 0, loss: (trade.entry.pnl ?? 0) < 0 }">
                  <div>{{ trade.entry.pnl?.toFixed(2) }} {{ quoteCurrency }}</div>
                  <div class="percent-value" :class="{ profit: (trade.returnPercent ?? 0) > 0, loss: (trade.returnPercent ?? 0) < 0 }">
                    {{ trade.returnPercent?.toFixed(2) }}%
                  </div>
                </td>

                <!-- Run-up (over to rader) -->
                <td :rowspan="2">
                  <div>{{ trade.entry.run_up_amount?.toFixed(2) }} {{ quoteCurrency }}</div>
                  <div class="percent-value">{{ trade.runUpPercent?.toFixed(2) }}%</div>
                </td>

                <!-- Drawdown (over to rader) -->
                <td :rowspan="2">
                  <div>-{{ trade.entry.drawdown_amount?.toFixed(2) }} {{ quoteCurrency }}</div>
                  <div class="percent-value">-{{ trade.drawdownPercent?.toFixed(2) }}%</div>
                </td>

                <!-- Cumulative P&L (over to rader) -->
                <td :rowspan="2" :class="{ profit: trade.cumulativePnl!> 0, loss: trade.cumulativePnl! < 0 }">
                  <div>{{ trade.cumulativePnl?.toFixed(2) }} {{ quoteCurrency }}</div>
                  <div class="percent-value" :class="{ profit: (trade.cumulativePnlPercent ?? 0) > 0, loss: (trade.cumulativePnlPercent ?? 0) < 0 }">
                    {{ trade.cumulativePnlPercent?.toFixed(2) }}%
                  </div>
                </td>
              </tr>

              <!-- UNDER: Entry-raden for samme trade -->
              <tr>
                <td>Entry {{ trade.entry.direction }}</td>
                <td>{{ new Date(trade.entry.timestamp).toLocaleString() }}</td>
                <td>{{ signalLabel(trade.entry) }}</td>
                <td>{{ trade.entry.price.toFixed(2) }} {{ quoteCurrency }}</td>
              </tr>
            </template>
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
import { fetchSymbolFilters } from '@/services/binanceAPI';
// import EquityChart from '@/components/EquityChart.vue';
import PnlChart from '@/components/PnlChart.vue';

// Importer ENUMs (verdier)
import { 
  EmaSource, 
  VwapAnchorPeriod, 
  TradeDirectionFilter, 
  FashionablyLateMode, 
  SlTpMethod, 
  OrderSizeMode 
} from '@/types/common_strategy_types';

// Importer INTERFACES (typer)
import type { 
  BacktestResult, 
  BacktestConfig, 
  TradeEvent, 
  ProcessedTrade,
  EmaVwapParams, 
  SmaParams
} from '@/types/common_strategy_types';

/* ------------------------------------------------------------------
   1.  HJELPE-FUNKSJONER FOR AVRUNDING OG SIGNAL TEKST
--------------------------------------------------------------------*/
const cent  = (x: number) => Math.round(x * 100)  / 100;   // 2 desimaler
const milli = (x: number) => Math.round(x * 1000) / 1000;  // 3 desimaler
const pct2  = (x: number) => Math.round(x * 100)  / 100;   // prosent → 2 des.
// Eksakt cents-summering (unngår 0.01-drift fra flyttall)
const toCents   = (x: number) => Math.round(x * 100); // -> heltall
const fromCents = (c: number) => c / 100;

// Normaliser SignalType fra Rust til en enkel nøkkel
function normSignal(ev: TradeEvent | undefined): string {
  if (!ev) return '';
  return String(ev.signal ?? '')
    .replace(/^(Buy|Sell)\s*/i, '')     // fjern "Buy"/"Sell" prefiks fra ev.signal
    .replace(/[_\s-]/g, '')
    .toLowerCase();
}

// Side-tekst iht. TV-reglene (se over)
function orderSide(ev: TradeEvent): 'Buy' | 'Sell' {
  const isLong = ev.direction === 'long';
  const isReversal = ev.event_type === 'Exit' && normSignal(ev) === 'reversal';
  // Vanlig: følg posisjonsretningen; Reversal: inverter
  const base = isLong ? 'Buy' : 'Sell';
  return isReversal ? (isLong ? 'Sell' : 'Buy') : base;
}

// Bruk orderSide + fin tittel
function signalLabel(ev: TradeEvent): string {
  const side = orderSide(ev);
  const key = normSignal(ev);

  const TITLE: Record<string,string> = {
    // Entry
    std: 'Std',
    flclose: 'FL Close',
    flhighlow: 'FL High/Low',
    flatr: 'FL ATR',
    // Exit
    slriskbased: 'SL Risk-Based',
    slfixed: 'SL Fixed',
    sltrailing: 'SL Trailing',
    slcombined: 'SL Combined',
    tp: 'TP',
    // Entry/Exit
    reversal: 'Reversal',
    closeopposite: 'Close Opposite',
  };

  const reason = TITLE[key] ?? '';
  return reason ? `${side} ${reason}` : side;
}

/* ------------------------------------------------------------------
   2.  REAKTIVE DATA
--------------------------------------------------------------------*/
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

// --- Input variabler ---
const symbol = ref('SOLUSDT');
const timeframe = ref('1h'); 
const dataLimitForFetch = ref(14877);
const selectedStrategy = ref<'smaCross' | 'smaCrossMini' | 'emaVwap'>('smaCrossMini');

// `smaParams` inneholder nå ALLE parametere for BÅDE Full og Mini
const smaParams = reactive<SmaParams>({ 
  fast_period: 10,  // 10
  slow_period: 73,  // 64, 73
  order_size_mode: OrderSizeMode.PercentOfEquity,
  order_size_value: 100, // 100% av equity  
  // order_size_mode: OrderSizeMode.ExplicitQty,
  // order_size_value: 1.0, // gearing 1x (2.0 for 2×, osv.)  
  sl_tp_method: SlTpMethod.TrailingPercent,
  fixed_sl_perc: 1.0,
  fixed_tp_perc: 2.0,
  trailing_sl_perc: 3.0,
  fixed_tp_for_trailing_perc: 5.0,
  // full-strategi felt …
  atr_length: 14,
  reward_mult_rb: 2.0,
  atr_mult_rb: 1.5,
  risk_gearing: 1,
  risk_perc: 1.5,
  
  trade_direction: TradeDirectionFilter.Both,
  use_explicit_qty: false,
  parity_mode: true,   // default ON to mirror TradingView  
});

// Aktiv RB? (gjelder nå for både Full og Mini)
const isRiskBased = computed(() => smaParams.sl_tp_method === SlTpMethod.RiskBased);

const priceToTick = ref(false) 
const commissionPercent = ref(0.05);
const slippageTicks = ref(12);

// --- Resultat variabler ---
const initialCapital = ref(10000); 
const results = ref<BacktestResult | null>(null);
const quoteCurrency = ref('USDT');

// Start lik TV: 01.01.2024 00:00:00 UTC
const tvStartMs = Date.UTC(2024, 0, 1, 0, 0, 0);

// Slutt = siste bar i equity-curve (når resultater finnes)
const tvEndMs = computed(() =>
  results.value?.equity_curve?.length
    ? results.value.equity_curve.at(-1)!.timestamp
    : undefined
);

// SIMULERT "nå"-markør (pushes fra Rust når posisjon er åpen):
// Vi leser siste bar_log-rad (sig == "OpenNow") for tid og pris.
const openNowTs = computed<number | undefined>(() => results.value?.bar_log?.at(-1)?.timestamp);
const openNowPrice = computed<number | undefined>(() => results.value?.bar_log?.at(-1)?.close);

console.log('params.sma:', JSON.stringify(smaParams));
console.log('order_size_mode typeof =', typeof smaParams.order_size_mode, smaParams.order_size_mode);

/* ------------------------------------------------------------------
   3.  KJØR BACKTEST (uendret)
--------------------------------------------------------------------*/
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
        initialCapital: initialCapital.value,
        config: backtestConfig,
        params: smaParams,
      });
    } else if (selectedStrategy.value === 'smaCrossMini') {
      results.value = await runSmaCrossoverMiniBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital.value,
        config: backtestConfig,
        params: smaParams,
        priceToTick: priceToTick.value,
      });      
    } else if (selectedStrategy.value === 'emaVwap') {
      // VIKTIG: Denne er nå helt lik SMA-kallet, men sender 'params'
      results.value = await runEmaVwapBacktest({
        symbol: symbol.value,
        interval: timeframe.value,
        limit: dataLimitForFetch.value,
        initialCapital: initialCapital.value,
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

/* ------------------------------------------------------------------
   4.  KEY METRIC ØVERST (uendret)
--------------------------------------------------------------------*/
const formattedTotalPnl = computed(() => {
  if (!results.value) return { text: '0.00 USDT', class: '' };

  const { net_profit, pnl_open, pnl_total } = results.value.summary;

  // 1) Prosent for Net profit
  const netPerc  = (net_profit / initialCapital.value) * 100;

  // 2) Prosent for Open P&L (bruk kontantsaldo etter lukkede handler)
  const baseForOpen = initialCapital.value + net_profit;
  const openPerc = baseForOpen !== 0 ? (pnl_open / baseForOpen) * 100 : 0;
  const totalPerc = netPerc + openPerc;
  const sign = pnl_total >= 0 ? '+' : '';
  const cls  = pnl_total > 0 ? 'profit' : 'loss';
  return {
    text : `${sign}${pnl_total.toFixed(2)} ${quoteCurrency.value} `
         + `(${sign}${totalPerc.toFixed(2)}%)`,
    class: cls,
  };
});

/* ------------------------------------------------------------------
   5.  LIST OF TRADES –  NÅ MED «TV-NØYAKTIG» PROSENT
--------------------------------------------------------------------*/
const processedTradeLog = computed<ProcessedTrade[]>(() => {
  if (!results.value?.trade_log) return [];

  // 5.1 Gruppe entry/exit
  const grouped: { entry: TradeEvent; exit?: TradeEvent }[] = [];
  for (const ev of results.value.trade_log)
    if (ev.event_type === 'Entry')
      grouped.push({ 
        entry: ev, 
        exit: results.value.trade_log.find(
      e => e.trade_id === ev.trade_id && e.event_type === 'Exit') 
    });

  // const nowTimestamp = computed(() => Date.now());    

  // 5.2 Beregn alle feltene
  // TV-paritet: summer P&L i full presisjon; rund kun når vi viser tallet.
  let closedCumPrecise = 0;

const calc: ProcessedTrade[] = grouped.map(t => {
  const closed   = !!t.exit;

  // ---------- 1. Rå tall --------------------------------------------------
  const pnlRaw   = closed ? t.exit!.pnl!             : t.entry.pnl!;
  const ruRaw    = closed ? t.exit!.run_up_amount!   : t.entry.run_up_amount!;
  const ddRaw    = closed ? t.exit!.drawdown_amount! : t.entry.drawdown_amount!;
  const priceRaw = t.entry.price;                    // alltid entry-price
  const quantityRaw   = closed ? t.exit!.quantity              : t.entry.quantity;

  const entryValRaw = priceRaw * quantityRaw;             // verdi av posisjonen

  // ---------- 2. Prosent basert på rå tall -------------------------------
  const returnPct = entryValRaw ? pct2(pnlRaw / entryValRaw * 100)   : 0;
  const runUpPct  = entryValRaw ? pct2(ruRaw  / entryValRaw * 100)   : 0;
  const drawDnPct = entryValRaw ? pct2(ddRaw  / entryValRaw * 100)   : 0;

  // ---------- 3. Rund pr rad til CENTS først (integer) -------------------
  const pnlCents = toCents(pnlRaw);
  const ruCents  = toCents(ruRaw);
  const ddCents  = toCents(ddRaw);

  // Deretter konverter til visningsverdi i USDT
  const pnlDisp    = fromCents(pnlCents);
  const runUpDisp  = fromCents(ruCents);
  const drawDnDisp = fromCents(ddCents);

  // (Entry/Exit-priser beholdes som før – de formatteres med toFixed(2) i tabellen)
  const priceEntryDisp = cent(t.entry.price);
  const quantityDisp    = milli(quantityRaw);
  const entryVal   = entryValRaw; 

  // ---------- 4. Kumulativ PnL (full presisjon), rund KUN ved visning ----
  if (closed) closedCumPrecise += pnlRaw;                         // <- use raw P&L
  const cumPrecise = closed ? closedCumPrecise
                            : closedCumPrecise + pnlRaw;          // include open trade's raw P&L in its own row
  const cumPnlDisp = cent(cumPrecise);                            // display value
  const cumPct     = pct2((cumPrecise / initialCapital.value) * 100);

  return {
    ...t,

    // verdier som vises i tabellen
    positionValue         : entryVal,
    returnPercent         : returnPct,
    runUpPercent          : runUpPct,
    drawdownPercent       : drawDnPct,
    cumulativePnl         : cumPnlDisp,
    cumulativePnlPercent  : cumPct,

    // tallene du faktisk viser i cellene
    entry: { ...t.entry, price: priceEntryDisp, quantity: quantityDisp },
    exit : t.exit ? { ...t.exit,
                      quantity: quantityDisp,
                      pnl  : pnlDisp,                // per-trade cell stays rounded
                      run_up_amount   : runUpDisp,   // ditto
                      drawdown_amount : drawDnDisp } : undefined
  };
});

  // 5.3  Vis nyeste øverst
  return calc.reverse();
});


/* ------------------------------------------------------------------
   6.  (Debug-kode kan stå eller fjernes) 
--------------------------------------------------------------------*/
/* const runDebug = async () => {
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
  --label-width: 170px;   /* Justér denne for å skyve alle inputfelt til høyre / venstre */
  --section-gap: 1.5rem;  /* felles spacing-variabel for seksjoner/knapp */
}

.control-panel,
.results-panel {
  display: flex;
  flex-direction: column; /* Stable vertikal stabling */
  gap: var(--section-gap); /* Mellomrom mellom fieldsets/seksjoner */
}

/* To-kolonne grid (responsivt). Ved smal skjerm: 1 kolonne */
.controls-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
@media (min-width: 1200px) {
  .controls-grid { grid-template-columns: 1fr 1fr; }
}

/* Compact section titles */
.section-title {
  color: #eee;
  margin: 1.0rem 0 -1.2rem 0;     /* small bottom gap so content sits tight */
  font-weight: 600;
  border: 0;
  padding: 0;
}

/* Metrics + chart visually fused */
.results-stack {
  margin: 0;
}

/* Felles stil for alle boksene */
fieldset,
.summary-metrics {
  border: 1px solid #444;
  padding: 1.5rem; /* Øk padding for romsligere utseende */
  border-radius: 8px;
  background-color: #2a2a2a;
}

fieldset legend {
  font-size: 1.4rem;
}


/* Styling for nøkkeltallene */
.summary-metrics {
  display: flex;
  justify-content: space-around;
  text-align: center;
  padding: 1rem; /* Mer padding for nøkkeltall */
  /* Top piece of the fused card */
  margin: 0;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;  
}
.summary-metrics div {
  flex: 1; /* Gir lik bredde til hver nøkkeltall-div */
}

/* Bottom piece of the fused card */
.chart-card {
  border: 1px solid #444;
  border-top: 0;                          /* seam disappears */
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  padding: 0;                             /* chart hugs the edge */
  overflow: hidden;                       /* hide inner overflow from chart lib */
}

/* Kill any unexpected top-margins inside the chart component */
.chart-card > * {
  margin-top: 0 !important;
}

.empty-chart-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  border: 1px solid #444;
  border-radius: 8px;
  background-color: #2a2a2a;
  color: #888;
}

/* Generell styling */
h1 {
  text-align: center;
  margin-top: -3.5rem;   
  margin-bottom: 0.8rem;   
  color: #eee;
}
h2 {
  text-align: center;
  margin-bottom: 0.8rem;   /* strammere mellom tittel og kontroller */
  color: #bbb;             /* litt mer dempet enn h1 */
  font-size: 1rem;
  font-weight: 500;
}
/* Seksjonstitler (Results/Performance/Trades): uten linje, jevn avstand */
h3 {
  color: #eee;
  border: 0;
  padding: 0;
  margin: 1.2rem 0 .6rem;   /* topp → litt luft fra forrige seksjon, bunn → tett på innholdet */
  font-weight: 600;
}
/* Første tittel i resultatskortet trenger ikke topp-luft */
.results-panel h3:first-child { 
  margin-top: 0; 
}
/* Tighten space before the trades table */
.results-panel table {
  margin-top: .25rem;                     /* was 1rem */
}
/* Kolonnekort (Inputs / Properties) */
.col-card {
  border: 1px solid #444;
  padding: 1.25rem;
  border-radius: 8px;
  background-color: #2a2a2a;
}

/* Underseksjoner i et kolonne-kort */
.group + .group {            /* separator mellom grupper */
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #444;
}
.group-title {
  margin: 0 0 .6rem 0;
  color: #aab;
  font-size: .85rem;
  text-transform: uppercase;
  letter-spacing: .03em;
  font-weight: 600;
}

/* Rader (label + input) – bruk .row i templaten */
.row {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}
.row:last-child { margin-bottom: 0; }
/* Checkbox-rader: ikke bruk label-kolonnebredden */
.row-checkbox {
  gap: 10px;
  padding-left: var(--label-width); /* indenter slik at checkboxen står på linje med inputs */
  flex-wrap: nowrap;                /* aldri bryt linjen */
}
.row-checkbox .inline-label {
  width: auto !important;
  min-width: 0 !important;
  flex: 0 1 auto !important;
  margin: 0 !important;
  text-align: left !important;
  white-space: nowrap;              /* hindrer linjebrudd i teksten */
}
/* Valgfritt: snevr inn at kolonnebredde kun gjelder "vanlige" rader */
.row > label:not(.inline-label) {
  width: var(--label-width);
  min-width: var(--label-width);
  flex: 0 0 var(--label-width);
  text-align: right;
  margin-right: 10px;
  color: #ccc;
}
.row-disabled { opacity: .6; }
input[type='text'],
input[type='number'],
select {
  flex-grow: 1; /* La input-feltene vokse for å fylle plassen */
  padding: 8px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #3a3a3a;
  color: #eee;
  max-width: 210px; /* Gi en maks bredde for å unngå for lange felt */
}
/* Loddrett for metode-spesifikke felt (Fixed/Trailing/Combined/RB) */
.method-rows .row { margin-bottom: 0.5rem; }

/* Liten hint-tekst ved RB */
.hint { 
  margin-left: 20px; 
  margin-bottom: -22px; 
  color: #aaa; 
  font-size: 0.9em; }
button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
}
button:disabled {
  background-color: #555;
  cursor: not-allowed;
}

/* Run Backtest: ikke full bredde og lik avstand som mellom seksjonene */
.run-btn {
  width: auto;                 /* ikke 100% bredde */
  min-width: 220px;            /* litt «tyngde» */
  align-self: center;          /* behold sentrering (kan byttes til flex-start) */
  margin-top: var(--section-gap); /* samme vertikale avstand som fieldsets */
}

/* (valgfritt) litt responsivitet */
@media (max-width: 900px) {
  .dashboard-view { --label-width: 140px; }
}
@media (max-width: 720px) {
  .dashboard-view { --label-width: 120px; }
}

/* NYTT: Litt styling for prosentverdiene for å matche TradingView */
.percent-value {
  color: #999; /* En litt svakere farge for prosenter */
  text-align: center;
  font-size: 0.9em;
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
  padding: 8px 12px; /* Litt mer padding */
  text-align: left;
  color: #ccc;
  vertical-align: top; /* Juster celler til toppen */
}
th {
  background-color: #3f3f3f;
  color: #f0f0f0;
  font-weight: bold;
}
td[rowspan="2"] {
  vertical-align: middle; /* Sentrer innholdet i celler som spenner over to rader */
  text-align: center;
}
/* Overstyrer første kolonne (Trade #) av regelen som står rett ovenfor */
td[rowspan="2"]:first-child {
  text-align: left;
}
tr > td:nth-child(5), /* Price */
tr > td:nth-child(4)  /* Date/Time */
{
  text-align: left;
}

/* Profit/Loss farger */
.profit {
  color: #4caf50;
  font-weight: 500;
  opacity: 0.86; /* Litt svakere for bedre lesbarhet */
}
.loss {
  color: #f44336;
  font-weight: 500;
    opacity: 0.86; /* Litt svakere for bedre lesbarhet */
}

.tip {
  position:relative; display:inline-flex; align-items:center; justify-content:center;
  width:18px; height:18px; margin-left:6px; border-radius:50%; background:#555; color:#fff;
  font-size:16px; cursor:help; outline:none;
}
.tip-content {
  position:absolute; left:50%; transform:translateX(-50%);
  bottom:130%; min-width:590px; max-width:590px; padding:8px 10px; border-radius:6px;
  background:#111; color:#eee; border:1px solid #444; box-shadow:0 6px 20px rgba(0,0,0,.35);
  opacity:0; pointer-events:none; transition:opacity .12s ease; z-index:10; white-space:normal;
}
.tip:hover .tip-content, .tip:focus .tip-content { opacity:1; }

.trade-id {
  color: #bbb;
  font-weight: 500;
  font-size: 1em;
  margin-right: 10px;
}

.dir-text {
  font-weight: 500;
  font-size: 1em;
}

.dir-long {            /* blå som TV */
  color: #3b82f6;      /* ~Tailwind blue-500 */
  opacity: 0.86; /* Litt svakere for bedre lesbarhet */
}

.dir-short {           /* rød som TV */
  color: #ef4444;      /* ~Tailwind red-500 */
  opacity: 0.86; /* Litt svakere for bedre lesbarhet */  
}
</style>