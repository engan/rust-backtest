<template>
  <div class="dashboard-view research-view">
    <header class="backtest-page-header">
      <div>
        <h1>Backtest</h1>
        <p>Configure, run, and inspect a TradingView-parity strategy test.</p>
      </div>
      <div class="backtest-header-actions">
        <label class="parity-badge" :class="{ active: activeParams.parity_mode }" for="parityMode">
          <input id="parityMode" v-model="activeParams.parity_mode" type="checkbox" />
          <span>{{ activeParams.parity_mode ? '✓' : '○' }}</span>
          TradingView parity
        </label>
        <FieldTooltip label="TradingView parity" text="Uses the execution and rounding behavior required to reproduce TradingView strategy results as closely as possible." />
        <button
          class="backtest-run-button"
          type="button"
          :disabled="isLoading"
          @click="runBacktest"
        >
          {{ isLoading ? 'Running backtest…' : '▶ Run backtest' }}
        </button>
      </div>
    </header>

    <div v-if="backtestError" class="research-inline-notice" role="alert">{{ backtestError }}</div>

    <div class="backtest-layout">
      <div class="backtest-column">
        <section class="research-card">
          <h2 class="research-card-title">Strategy &amp; Market</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="strategy">Strategy</label>
              <select id="strategy" v-model="selectedStrategy">
                <option value="smaCross">SMA Crossover</option>
                <option value="emaVwap">EMA / VWAP</option>
              </select>
              <FieldTooltip label="Strategy" text="Selects the trading rules used for signal generation. Each strategy keeps its own parameter set." />
            </div>
            <div class="research-field">
              <label for="symbol">Symbol</label>
              <input id="symbol" v-model="symbol" type="text" />
              <FieldTooltip label="Symbol" text="The Binance market to download and backtest, for example SOLUSDT." />
            </div>
            <div class="research-field">
              <label for="timeframe">Timeframe</label>
              <select id="timeframe" v-model="timeframe">
                <option v-for="iv in BINANCE_INTERVALS" :key="iv" :value="iv">{{ iv }}</option>
              </select>
              <FieldTooltip label="Timeframe" text="Candle interval used by the strategy. Time-based settings measured in bars change their real-world duration with this value." />
            </div>
            <div class="research-field">
              <label for="limit">Dataset</label>
              <input id="limit" v-model.number="dataLimitForFetch" type="number" min="1" />
              <FieldTooltip label="Dataset" text="Maximum number of historical candles requested for this run. Larger datasets take longer but cover more market regimes." />
            </div>
            <div class="research-field">
              <label for="end-before">End before (UTC)</label>
              <input id="end-before" v-model="endBeforeUtc" type="datetime-local" />
              <FieldTooltip label="End before" text="Exclusive UTC cutoff for the newest candle. Leave empty to use the latest available market data." />
            </div>
            <div class="research-field">
              <label for="trade-direction">Trading direction</label>
              <select id="trade-direction" v-model="activeParams.trade_direction">
                <option :value="TradeDirectionFilter.Both">Both</option>
                <option :value="TradeDirectionFilter.Long">Long</option>
                <option :value="TradeDirectionFilter.Short">Short</option>
              </select>
              <FieldTooltip label="Trading direction" text="Allows long trades, short trades, or both. Signals in disabled directions are ignored." />
            </div>

            <div v-if="presetEnabled" class="preset-card-row">
              <label for="tvpreset">TradingView preset JSON</label>
              <textarea id="tvpreset" rows="3" @paste.prevent="onPastePreset($event)" />
              <FieldTooltip label="TradingView preset JSON" text="Paste a saved TradingView-compatible parameter preset to populate matching strategy settings." />
              <div class="research-button-row">
                <button class="research-secondary" type="button" @click="showPreset">
                  Show preset
                </button>
                <button class="research-secondary" type="button" @click="clearPreset">
                  Clear preset
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Signal &amp; Entry</h2>
          <div class="research-card-body research-field-grid">
            <template v-if="selectedStrategy === 'smaCross'">
              <div class="research-field">
                <label for="sma_fast">Fast SMA period</label>
                <input id="sma_fast" v-model.number="smaParams.fast_period" type="number" min="1" />
                <FieldTooltip label="Fast SMA period" text="Number of candles in the responsive moving average. Lower values react faster to price changes." />
              </div>
              <div class="research-field">
                <label for="sma_slow">Slow SMA period</label>
                <input id="sma_slow" v-model.number="smaParams.slow_period" type="number" min="1" />
                <FieldTooltip label="Slow SMA period" text="Number of candles in the slower trend average. Crosses against the fast SMA create the base signals." />
              </div>
            </template>

            <template v-else>
              <div class="research-field">
                <label for="ema_length">EMA length</label>
                <input
                  id="ema_length"
                  v-model.number="emaVwapParams.ema_length"
                  type="number"
                  min="1"
                />
                <FieldTooltip label="EMA length" text="Number of candles used by the exponential moving average. Higher values produce a slower trend filter." />
              </div>
              <div class="research-field">
                <label for="ema_source">EMA source</label>
                <select id="ema_source" v-model="emaVwapParams.ema_source">
                  <option v-for="source in Object.values(EmaSource)" :key="source" :value="source">
                    {{ source }}
                  </option>
                </select>
                <FieldTooltip label="EMA source" text="Price series used to calculate the EMA, such as close, high, low, or open." />
              </div>
              <div class="research-field">
                <label for="vwap_anchor">VWAP anchor</label>
                <select id="vwap_anchor" v-model="emaVwapParams.vwap_anchor_period">
                  <option
                    v-for="anchor in Object.values(VwapAnchorPeriod)"
                    :key="anchor"
                    :value="anchor"
                  >
                    {{ anchor }}
                  </option>
                </select>
                <FieldTooltip label="VWAP anchor" text="Period at which VWAP accumulation resets. Weekly anchoring starts a new VWAP each week." />
              </div>
              <div class="research-field">
                <label for="vwap_source">VWAP source</label>
                <select id="vwap_source" v-model="emaVwapParams.vwap_source">
                  <option v-for="source in Object.values(EmaSource)" :key="source" :value="source">
                    {{ source }}
                  </option>
                </select>
                <FieldTooltip label="VWAP source" text="Price series accumulated by the anchored VWAP calculation." />
              </div>
            </template>

            <div class="research-divider" />

            <div class="research-field">
              <label for="fl_mode">Fashionably Late</label>
              <select id="fl_mode" v-model="activeParams.fashionably_late_mode">
                <option :value="FashionablyLateMode.Off">Off</option>
                <option :value="FashionablyLateMode.OnClose">On Close</option>
                <option :value="FashionablyLateMode.OnHighLow">On High / Low</option>
                <option :value="FashionablyLateMode.Atr">ATR</option>
              </select>
              <FieldTooltip label="Fashionably Late" text="Controls delayed entries after an initial crossover. ATR mode waits for price to return within the configured volatility threshold." />
            </div>
            <div v-if="isImproved" class="research-field">
              <label for="atr_units">ATR threshold units</label>
              <select id="atr_units" v-model="activeParams.atr_threshold_percent">
                <option :value="false">Absolute</option>
                <option :value="true">Percent of price</option>
              </select>
              <FieldTooltip label="ATR threshold units" text="Uses either an absolute price distance or a percentage of price for the Fashionably Late ATR threshold." />
            </div>
            <div class="research-field">
              <label :for="activeParams.atr_threshold_percent ? 'atr_percent' : 'fl_atr'"
                >ATR threshold</label
              >
              <input
                v-if="isImproved && activeParams.atr_threshold_percent"
                id="atr_percent"
                v-model.number="activeParams.atr_threshold_fl_percent"
                type="number"
                min="0"
                step="0.1"
              />
              <input
                v-else
                id="fl_atr"
                v-model.number="activeParams.atr_threshold_fl"
                type="number"
                min="0"
                step="0.1"
              />
              <FieldTooltip label="ATR threshold" text="Maximum allowed distance for an ATR-delayed entry. The unit is selected in the field above." />
            </div>
            <div v-if="isImproved" class="research-option-row">
              <label class="backtest-check-row" for="reset_fl">
                <input id="reset_fl" v-model="activeParams.reset_fl_on_opposite" type="checkbox" />
                <span>Cancel on opposite cross</span>
              </label>
              <FieldTooltip label="Cancel on opposite cross" text="Cancels an armed delayed entry if the moving averages cross in the opposite direction before entry." />
            </div>
            <div v-if="isImproved" class="research-field">
              <label for="fl_expiry">Maximum wait</label>
              <div class="field-with-unit">
                <input
                  id="fl_expiry"
                  v-model.number="activeParams.fl_expiry_bars"
                  type="number"
                  min="0"
                  step="1"
                />
                <span>bars</span>
              </div>
              <FieldTooltip label="Maximum wait" text="Maximum number of candles a delayed entry can remain armed. Zero means no time limit." />
            </div>
          </div>
        </section>
      </div>

      <div class="backtest-column">
        <section class="research-card">
          <h2 class="research-card-title">Risk &amp; Exits</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="sl-tp-method">SL/TP method</label>
              <select id="sl-tp-method" v-model="activeParams.sl_tp_method">
                <option :value="SlTpMethod.RiskBased">RiskBased</option>
                <option :value="SlTpMethod.FixedPercent">Fixed %</option>
                <option :value="SlTpMethod.TrailingPercent">Trailing %</option>
                <option :value="SlTpMethod.Combined">Combined</option>
              </select>
              <FieldTooltip label="SL/TP method" text="Chooses how stop-loss and take-profit levels are calculated for each trade." />
            </div>

            <template v-if="activeParams.sl_tp_method === SlTpMethod.RiskBased">
              <div class="research-field">
                <label for="reward-risk">Reward / risk</label>
                <input
                  id="reward-risk"
                  v-model.number="activeParams.reward_mult_rb"
                  type="number"
                  step="0.1"
                />
                <FieldTooltip label="Reward / risk" text="Take-profit distance as a multiple of the initial stop distance in RiskBased mode." />
              </div>
              <div class="research-field">
                <label for="atr-multiplier">ATR multiplier SL</label>
                <input
                  id="atr-multiplier"
                  v-model.number="activeParams.atr_mult_rb"
                  type="number"
                  step="0.1"
                />
                <FieldTooltip label="ATR multiplier SL" text="Multiplies ATR to set the initial stop distance in RiskBased mode." />
              </div>
            </template>

            <template v-if="activeParams.sl_tp_method === SlTpMethod.FixedPercent">
              <div class="research-field">
                <label for="fixed-sl">Fixed SL</label>
                <div class="field-with-unit">
                  <input
                    id="fixed-sl"
                    v-model.number="activeParams.fixed_sl_perc"
                    type="number"
                    step="0.1"
                  /><span>%</span>
                </div>
                <FieldTooltip label="Fixed SL" text="Fixed percentage distance from entry to the stop-loss." />
              </div>
              <div class="research-field">
                <label for="fixed-tp">Fixed TP</label>
                <div class="field-with-unit">
                  <input
                    id="fixed-tp"
                    v-model.number="activeParams.fixed_tp_perc"
                    type="number"
                    step="0.1"
                  /><span>%</span>
                </div>
                <FieldTooltip label="Fixed TP" text="Fixed percentage distance from entry to the take-profit target." />
              </div>
            </template>

            <template
              v-if="
                activeParams.sl_tp_method === SlTpMethod.TrailingPercent ||
                activeParams.sl_tp_method === SlTpMethod.Combined
              "
            >
              <div v-if="activeParams.sl_tp_method === SlTpMethod.Combined" class="research-field">
                <label for="combined-fixed-sl">Fixed SL</label>
                <div class="field-with-unit">
                  <input
                    id="combined-fixed-sl"
                    v-model.number="activeParams.fixed_sl_perc"
                    type="number"
                    step="0.1"
                  /><span>%</span>
                </div>
                <FieldTooltip label="Fixed SL" text="Fixed protective stop used together with the trailing exit in Combined mode." />
              </div>
              <div class="research-field">
                <label for="trailing-sl">Trailing SL</label>
                <div class="field-with-unit">
                  <input
                    id="trailing-sl"
                    v-model.number="activeParams.trailing_sl_perc"
                    type="number"
                    step="0.1"
                  /><span>%</span>
                </div>
                <FieldTooltip label="Trailing SL" text="Percentage trailing distance from the most favorable price reached after entry." />
              </div>
              <div class="research-field">
                <label for="static-tp">Static TP</label>
                <div class="field-with-unit">
                  <input
                    id="static-tp"
                    v-model.number="activeParams.fixed_tp_for_trailing_perc"
                    type="number"
                    step="0.1"
                  /><span>%</span>
                </div>
                <FieldTooltip label="Static TP" text="Fixed take-profit percentage used with Trailing or Combined exit modes." />
              </div>
            </template>

            <div class="research-divider" />

            <div class="research-field">
              <label for="atr-length">ATR length</label>
              <input
                id="atr-length"
                v-model.number="activeParams.atr_length"
                type="number"
                min="1"
              />
              <FieldTooltip label="ATR length" text="Number of candles used for Average True Range calculations in entry, risk, and sizing logic." />
            </div>
            <div class="research-field">
              <label for="risk-gearing">Position gearing</label>
              <select id="risk-gearing" v-model.number="activeParams.risk_gearing">
                <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}×</option>
              </select>
              <FieldTooltip label="Position gearing" text="Multiplies the calculated position exposure. Higher gearing increases both profit and loss sensitivity." />
            </div>
            <div v-if="isRiskBased" class="research-field">
              <label for="risk-percent">Risk per trade</label>
              <div class="field-with-unit">
                <input
                  id="risk-percent"
                  v-model.number="activeParams.risk_perc"
                  type="number"
                  min="0"
                  step="0.1"
                /><span>%</span>
              </div>
              <FieldTooltip label="Risk per trade" text="Percentage of current equity risked at the initial stop when RiskBased sizing is active." />
            </div>
            <div class="research-field">
              <label for="order-size-value">Order size</label>
              <div class="compound-control">
                <input
                  id="order-size-value"
                  v-model.number="activeParams.order_size_value"
                  type="number"
                  :disabled="disableOrderSizeValue"
                />
                <select
                  v-model="activeParams.order_size_mode"
                  :disabled="isRiskBased"
                  aria-label="Order size unit"
                >
                  <option :value="OrderSizeMode.PercentOfEquity">% equity</option>
                  <option :value="OrderSizeMode.FixedQuantity">Quantity</option>
                  <option :value="OrderSizeMode.FixedValue">USDT</option>
                </select>
              </div>
              <FieldTooltip label="Order size" text="Controls position size as percent of equity, fixed quantity, or fixed quote-currency value. RiskBased mode calculates this automatically." />
            </div>
            <div class="research-field">
              <label for="initial-capital">Initial capital</label>
              <div class="field-with-unit">
                <input
                  id="initial-capital"
                  v-model.number="initialCapital"
                  type="number"
                  min="0"
                /><span>USDT</span>
              </div>
              <FieldTooltip label="Initial capital" text="Starting account equity used for returns, drawdown, and position sizing." />
            </div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Safeguards</h2>
          <div class="research-card-body research-field-grid">
            <div class="safeguard-line">
              <label class="backtest-check-row" for="enable_max_drawdown">
                <input
                  id="enable_max_drawdown"
                  v-model="activeParams.enable_max_drawdown"
                  type="checkbox"
                />
                <span>Maximum drawdown</span>
              </label>
              <div class="compact-value">
                <input
                  v-model.number="activeParams.max_drawdown_perc"
                  type="number"
                  min="0"
                  step="0.1"
                  aria-label="Maximum drawdown percent"
                /><span>%</span>
              </div>
              <FieldTooltip label="Maximum drawdown" text="Pauses new entries when equity drawdown reaches this percentage. Improved mode can resume after recovery and cooldown conditions are satisfied." />
            </div>
            <div class="safeguard-line">
              <label class="backtest-check-row" for="enable_max_losses">
                <input
                  id="enable_max_losses"
                  v-model="activeParams.enable_max_consecutive_losses"
                  type="checkbox"
                />
                <span>Consecutive losses</span>
              </label>
              <input
                v-model.number="activeParams.max_consecutive_losses"
                class="compact-input"
                type="number"
                min="1"
                aria-label="Maximum consecutive losses"
              />
              <FieldTooltip label="Consecutive losses" text="Pauses new entries after this many completed losing trades in a row." />
            </div>
            <div v-if="isImproved" class="research-field">
              <label for="cooldown-bars">Cooldown</label>
              <div class="field-with-unit">
                <input
                  id="cooldown-bars"
                  v-model.number="activeParams.cooldown_bars"
                  type="number"
                  min="1"
                /><span>bars</span>
              </div>
              <FieldTooltip label="Cooldown" text="Minimum number of candles to wait after a safeguard pause before the strategy may resume." />
            </div>
            <div class="research-divider" />
            <div class="research-option-row">
              <label class="backtest-check-row" for="enable_dmi_filter">
                <input
                  id="enable_dmi_filter"
                  v-model="activeParams.enable_dmi_filter"
                  type="checkbox"
                />
                <span>ADX trend-strength filter</span>
              </label>
              <FieldTooltip label="ADX trend-strength filter" text="Pauses entries in weak-trend conditions and resumes only after ADX reaches the recovery threshold for the required confirmation period." />
            </div>
            <div class="research-field">
              <label for="dmi-length">DMI length</label>
              <input
                id="dmi-length"
                v-model.number="activeParams.dmi_length"
                type="number"
                min="1"
              />
              <FieldTooltip label="DMI length" text="Lookback length used to calculate directional movement before ADX smoothing." />
            </div>
            <div class="research-field">
              <label for="dmi-smoothing">ADX smoothing</label>
              <input
                id="dmi-smoothing"
                v-model.number="activeParams.dmi_smoothing"
                type="number"
                min="1"
              />
              <FieldTooltip label="ADX smoothing" text="Smoothing length used for the ADX trend-strength value." />
            </div>
            <div class="research-field">
              <label for="dmi-threshold">ADX pause below</label>
              <input
                id="dmi-threshold"
                v-model.number="activeParams.dmi_threshold"
                type="number"
                min="0"
                step="0.05"
              />
              <FieldTooltip label="ADX pause below" text="Pauses new entries when ADX falls below this trend-strength level." />
            </div>
            <template v-if="isImproved">
              <div class="research-field">
                <label for="adx-resume">ADX resume at</label>
                <input
                  id="adx-resume"
                  v-model.number="activeParams.adx_resume_threshold"
                  type="number"
                  min="0"
                  step="0.05"
                />
                <FieldTooltip label="ADX resume at" text="ADX must reach or exceed this value before recovery confirmation can begin." />
              </div>
              <div class="research-field">
                <label for="adx-confirmation">Confirmation</label>
                <div class="field-with-unit">
                  <input
                    id="adx-confirmation"
                    v-model.number="activeParams.adx_resume_bars"
                    type="number"
                    min="1"
                  /><span>bars</span>
                </div>
                <FieldTooltip label="Confirmation" text="Number of consecutive candles ADX must remain at or above the resume threshold before entries restart." />
              </div>
            </template>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Execution Costs</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-field">
              <label for="commission">Commission</label>
              <div class="field-with-unit">
                <input
                  id="commission"
                  v-model.number="commissionPercent"
                  type="number"
                  min="0"
                  step="0.01"
                /><span>%</span>
              </div>
              <FieldTooltip label="Commission" text="Broker fee charged on both entry and exit, expressed as a percentage of transaction value." />
            </div>
            <div class="research-field">
              <label for="slippage">Slippage</label>
              <div class="field-with-unit">
                <input id="slippage" v-model.number="slippageTicks" type="number" min="0" /><span
                >ticks</span
                >
              </div>
              <FieldTooltip label="Slippage" text="Adverse execution adjustment in exchange ticks applied to simulated fills." />
            </div>
            <div class="research-option-row">
              <label class="backtest-check-row" for="priceToTick">
                <input
                  id="priceToTick"
                  v-model="priceToTick"
                  type="checkbox"
                  :disabled="activeParams.parity_mode"
                />
                <span>Round to exchange tick</span>
              </label>
              <FieldTooltip label="Round to exchange tick" text="Rounds simulated order prices to the market tick size. It is disabled while TradingView parity mode is active." />
            </div>
          </div>
        </section>

        <section class="research-card">
          <h2 class="research-card-title">Leverage &amp; Margin</h2>
          <div class="research-card-body research-field-grid">
            <div class="research-option-row">
              <label class="backtest-check-row" for="enforce-margin">
                <input id="enforce-margin" v-model="marginEnforcementEnabled" type="checkbox" />
                <span>Simulate leverage &amp; margin calls</span>
              </label>
              <FieldTooltip label="Leverage and margin calls" text="When enabled, the engine enforces the long and short margin requirements and can partially or fully liquidate a position. When disabled, execution remains equivalent to TradingView leverage set to Infinity." />
            </div>
            <div class="research-field">
              <label for="margin-long">Long margin</label>
              <div class="field-with-unit">
                <input
                  id="margin-long"
                  v-model.number="marginLongPercent"
                  type="number"
                  min="0"
                  step="1"
                /><span>%</span>
              </div>
              <FieldTooltip label="Long margin requirement" text="Required collateral for a long position. 100% is 1× leverage, 50% is 2×, 20% is 5×, and 0% is Infinity. It changes execution only when margin-call simulation is enabled." />
            </div>
            <div class="research-field">
              <label for="margin-short">Short margin</label>
              <div class="field-with-unit">
                <input
                  id="margin-short"
                  v-model.number="marginShortPercent"
                  type="number"
                  min="0"
                  step="1"
                /><span>%</span>
              </div>
              <FieldTooltip label="Short margin requirement" text="Required collateral for a short position. 100% is 1× leverage, 50% is 2×, 20% is 5×, and 0% is Infinity. It changes execution only when margin-call simulation is enabled." />
            </div>
          </div>
        </section>
      </div>

      <div class="backtest-column backtest-results-column">
        <div class="backtest-kpi-grid">
          <section class="research-card backtest-kpi">
            <span>Net P&amp;L</span>
            <strong v-if="results" :class="formattedTotalPnl.class">
              {{ formattedTotalPnl.amount }}
              <small>({{ formattedTotalPnl.percent }})</small>
            </strong>
            <strong v-else>—</strong>
          </section>
          <section class="research-card backtest-kpi">
            <span>Max drawdown</span>
            <strong v-if="results" class="metric-negative">
              {{ results.summary.max_drawdown_amount.toFixed(2) }} {{ quoteCurrency }}
              <small>({{ results.summary.max_drawdown_percent.toFixed(2) }}%)</small>
            </strong>
            <strong v-else>—</strong>
          </section>
          <section class="research-card backtest-kpi">
            <span>Profitable trades</span>
            <strong>{{ formattedProfitableTrades }}</strong>
          </section>
          <section class="research-card backtest-kpi">
            <span>Profit factor</span>
            <strong>{{ results ? results.summary.profit_factor.toFixed(3) : '—' }}</strong>
          </section>
        </div>

        <section class="research-card backtest-chart-card">
          <h2 class="research-card-title">
            Equity &amp; Drawdown
            <RouterLink
              v-if="results"
              class="performance-analysis-link"
              to="/performance"
              @click="cacheBacktestAnalysis"
            >↗ Performance analysis</RouterLink>
          </h2>
          <div v-if="results?.equity_curve?.length" class="backtest-chart-wrap">
            <PnlChart
              :equity-curve="results.equity_curve"
              :initial-capital="completedRun?.execution.initialCapital ?? initialCapital"
              :trade-log="results.trade_log"
              :range-start-ms="tvStartMs"
              :range-end-ms="tvEndMs"
              baseline-mode="firstNonFlat"
            />
          </div>
          <div v-else class="backtest-empty-state">
            <span class="empty-state-icon">⌁</span>
            <strong>No backtest results yet</strong>
            <span>Configure the strategy and run a backtest to populate the chart.</span>
          </div>
        </section>

        <section class="research-card recent-trades-card">
          <header class="research-card-title recent-trades-heading">
            <h2>Recent Trades</h2>
            <div class="recent-trades-heading-actions">
              <small>{{
                processedTradeLog.length ? processedTradeLog.length + ' total' : 'Waiting for a run'
              }}</small>
              <button
                v-if="processedTradeLog.length"
                class="trade-log-open-button"
                type="button"
                @click="openFullTradeLog"
              >
                ↗ View all trades
              </button>
            </div>
          </header>
          <div v-if="processedTradeLog.length" class="compact-trades-wrap">
            <table class="compact-trades-table">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Direction</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Signal</th>
                  <th>Size</th>
                  <th>Net P&amp;L</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trade in processedTradeLog.slice(0, 17)" :key="trade.entry.trade_id">
                  <td>#{{ trade.entry.trade_id }}</td>
                  <td :class="trade.entry.direction === 'long' ? 'dir-long' : 'dir-short'">
                    {{ trade.entry.direction === 'long' ? 'Long' : 'Short' }}
                  </td>
                  <td>{{ formatDateTime(trade.entry.timestamp) }}</td>
                  <td>{{ trade.exit ? formatDateTime(trade.exit.timestamp) : 'Open' }}</td>
                  <td>{{ signalLabel(trade.exit ?? trade.entry) }}</td>
                  <td>
                    {{ (trade.exit?.quantity ?? trade.entry.quantity).toFixed(2) }} /
                    {{ formatPositionValue(trade.positionValue) }}
                  </td>
                  <td :class="(trade.exit?.pnl ?? trade.entry.pnl ?? 0) >= 0 ? 'profit' : 'loss'">
                    {{ signed2(trade.exit?.pnl ?? trade.entry.pnl ?? 0) }} {{ quoteCurrency }}
                  </td>
                  <td :class="(trade.pnlPercent ?? 0) >= 0 ? 'profit' : 'loss'">
                    {{ signedPercent2(trade.pnlPercent) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="recent-trades-empty">Completed and open trades will appear here.</div>
          <div class="research-card-body backtest-results-actions">
            <button
              class="research-secondary"
              type="button"
              :disabled="!results"
              @click="exportBacktestReport"
            >
              ⇩ Export report
            </button>
            <RouterLink class="open-optimize-link" to="/optimize" @click="openInOptimize">↗ Open in Optimize</RouterLink>
          </div>
        </section>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="showFullTradeLog"
        class="trade-log-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-trade-log-title"
        @click.self="closeFullTradeLog"
        @keydown.esc="closeFullTradeLog"
        @keydown.tab="trapTradeLogFocus"
      >
        <section class="trade-log-dialog">
          <header class="trade-log-dialog-header">
            <div>
              <h2 id="full-trade-log-title">List of Trades</h2>
              <p>{{ completedRun?.strategyLabel }} · {{ completedRun?.market.symbol }} · {{ completedRun?.market.timeframe }} · {{ processedTradeLog.length }} trades</p>
            </div>
            <div class="trade-log-dialog-actions">
              <button class="research-secondary" type="button" @click="exportBacktestReport">
                ⇩ Export report
              </button>
              <button
                ref="fullTradeLogCloseButton"
                class="trade-log-close-button"
                type="button"
                aria-label="Close full trade log"
                @click="closeFullTradeLog"
              >
                ×
              </button>
            </div>
          </header>

          <div class="trade-log-table-wrap">
            <table class="trade-log-table">
              <thead>
                <tr>
                  <th>Trade #</th>
                  <th>Type</th>
                  <th>Date and time</th>
                  <th>Signal</th>
                  <th>Price</th>
                  <th>Size</th>
                  <th>Net P&amp;L</th>
                  <th>Return</th>
                  <th>Commission</th>
                  <th>Favorable excursion</th>
                  <th>Adverse excursion</th>
                  <th>Cumulative P&amp;L</th>
                  <th>Duration (bars)</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="trade in processedTradeLog" :key="trade.entry.trade_id">
                  <tr v-if="trade.exit" class="trade-exit-row">
                    <td rowspan="2" class="trade-number-cell">
                      <strong>#{{ trade.entry.trade_id }}</strong>
                      <span :class="trade.entry.direction === 'long' ? 'dir-long' : 'dir-short'">
                        {{ trade.entry.direction === 'long' ? 'Long' : 'Short' }}
                      </span>
                    </td>
                    <td>Exit</td>
                    <td>{{ formatDateTime(trade.exit.timestamp) }}</td>
                    <td>{{ signalLabel(trade.exit) }}</td>
                    <td>{{ trade.exit.price.toFixed(2) }} <small>{{ quoteCurrency }}</small></td>
                    <td rowspan="2" class="two-line-value">
                      <strong>{{ trade.exit.quantity.toFixed(2) }}</strong>
                      <small>{{ formatPositionValue(trade.positionValue) }} {{ quoteCurrency }}</small>
                    </td>
                    <td
                      rowspan="2"
                      class="two-line-value"
                      :class="(trade.exit.pnl ?? 0) >= 0 ? 'profit' : 'loss'"
                    >
                      <strong>{{ signed2(trade.exit.pnl ?? 0) }} {{ quoteCurrency }}</strong>
                      <small>{{ signedPercent2(trade.pnlPercent) }}</small>
                    </td>
                    <td
                      rowspan="2"
                      :class="(trade.pnlPercent ?? 0) >= 0 ? 'profit' : 'loss'"
                    >
                      {{ signedPercent2(trade.pnlPercent) }}
                    </td>
                    <td rowspan="2">{{ trade.commission?.toFixed(2) }} {{ quoteCurrency }}</td>
                    <td rowspan="2" class="two-line-value">
                      <strong>{{ Math.abs(trade.exit.run_up_amount ?? 0).toFixed(2) }} {{ quoteCurrency }}</strong>
                      <small>{{ tvFmt2(trade.runUpPercent) }}%</small>
                    </td>
                    <td rowspan="2" class="two-line-value">
                      <strong>-{{ Math.abs(trade.exit.drawdown_amount ?? 0).toFixed(2) }} {{ quoteCurrency }}</strong>
                      <small>-{{ tvFmt2(Math.abs(trade.drawdownPercent ?? 0)) }}%</small>
                    </td>
                    <td
                      rowspan="2"
                      class="two-line-value"
                      :class="(trade.cumulativePnl ?? 0) >= 0 ? 'profit' : 'loss'"
                    >
                      <strong>{{ trade.cumulativePnl?.toFixed(2) }} {{ quoteCurrency }}</strong>
                      <small>{{ trade.cumulativePnlPercent?.toFixed(2) }}%</small>
                    </td>
                    <td rowspan="2" class="duration-cell">{{ trade.durationBars }}</td>
                  </tr>
                  <tr v-if="trade.exit" class="trade-entry-row">
                    <td>Entry</td>
                    <td>{{ formatDateTime(trade.entry.timestamp) }}</td>
                    <td>{{ signalLabel(trade.entry) }}</td>
                    <td>{{ trade.entry.price.toFixed(2) }} <small>{{ quoteCurrency }}</small></td>
                  </tr>
                  <tr v-else class="trade-entry-row trade-open-row">
                    <td class="trade-number-cell">
                      <strong>#{{ trade.entry.trade_id }}</strong>
                      <span :class="trade.entry.direction === 'long' ? 'dir-long' : 'dir-short'">
                        {{ trade.entry.direction === 'long' ? 'Long' : 'Short' }}
                      </span>
                    </td>
                    <td>Entry</td>
                    <td>{{ formatDateTime(trade.entry.timestamp) }}</td>
                    <td>{{ signalLabel(trade.entry) }}</td>
                    <td>{{ trade.entry.price.toFixed(2) }} <small>{{ quoteCurrency }}</small></td>
                    <td class="two-line-value">
                      <strong>{{ trade.entry.quantity.toFixed(2) }}</strong>
                      <small>{{ formatPositionValue(trade.positionValue) }} {{ quoteCurrency }}</small>
                    </td>
                    <td colspan="7" class="open-trade-cell">Open position</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { useBacktest } from '@/composables/useBacktest'
import { fetchSymbolFilters } from '@/services/binanceAPI'
import PnlChart from '@/components/PnlChart.vue'
import FieldTooltip from '@/components/FieldTooltip.vue'
import { loadPreset, savePreset, parsePreset, type TvPreset } from '@/services/tvPreset.ts'
import { clearBacktestAnalysis, saveBacktestAnalysis, type BacktestAnalysisSnapshot } from '@/services/backtestReport'
import { saveResearchHandoff } from '@/services/researchHandoff'
import { tradeCommission } from '@/services/tradeMetrics'

// Importer ENUMs (verdier)
import {
  EmaSource,
  VwapAnchorPeriod,
  TradeDirectionFilter,
  FashionablyLateMode,
  SlTpMethod,
  OrderSizeMode,
} from '@/types/common_strategy_types'

// Importer INTERFACES (typer)
import type {
  BacktestResult,
  BacktestConfig,
  TradeEvent,
  ProcessedTrade,
  EmaVwapParams,
  SmaParams,
} from '@/types/common_strategy_types'

/* ------------------------------------------------------------------
   1.  HJELPE-FUNKSJONER FOR AVRUNDING OG SIGNAL TEKST
--------------------------------------------------------------------*/
// TV preset (lagret i localStorage) + bryter for å bruke/ignore det
const tvPreset = ref<TvPreset | null>(loadPreset()) // last fra localStorage på oppstart
const presetEnabled = ref(false) // default: AV

// Rounding: half-away-from-zero (TV-konsistent)
const roundN = (x: number, n: number) => {
  const m = Math.pow(10, n)
  return (x >= 0 ? Math.round(x * m) : -Math.round(-x * m)) / m
}
const priceDecimals = ref(2)
const qtyDecimals = ref(2)

// Keep full precision in calculations; round currency at display time.
const cent = (x: number) => roundN(x, 2) // Currency is rounded only for display.
// Hjelpere for 2/4 desimalers avrunding (TV-stil)
const r2 = (x: number) => roundN(x, 2)
const r4 = (x: number) => roundN(x, 4)

// TV-basis for prosent: entry pris rundet til tick  ×  qty trunket til step
const tvBasisRaw = (entryPrice: number, entryQty: number) => {
  const p = roundN(entryPrice, priceDecimals.value)
  const q = truncN(entryQty, qtyDecimals.value)
  return p * q // rå basis (ikke r2)
}
const tvBasisDisp = (entryPrice: number, entryQty: number) => r2(tvBasisRaw(entryPrice, entryQty))

// const milli = (x: number) => roundN(x, 3);   // 3 desimaler (qty)
const pct2 = (x: number) => roundN(x, 2) // 2 desimaler (prosent, brukes f.eks. på cumulative)
// Trunkering (mot 0) til n desimaler – matcher TV når qty har step 0.01
const truncN = (x: number, n: number) =>
  (x >= 0 ? Math.trunc(x * 10 ** n) : Math.ceil(x * 10 ** n)) / 10 ** n

// Prosenter vises allerede med riktig avrunding (half-away) → kun "safe to string".
const tvFmt2 = (x?: number) => {
  if (x === undefined || x === null || !isFinite(x)) return '0.00'
  const safe = Math.abs(x) < 0.005 ? 0 : x // unngå "-0.00"
  return roundN(safe, 2).toFixed(2)
}

const signed2 = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`
const signedPercent2 = (x?: number) => {
  const safe = x === undefined || x === null || !isFinite(x) || Math.abs(x) < 0.005 ? 0 : x
  return `${safe >= 0 ? '+' : ''}${tvFmt2(safe)}%`
}

// Keep up to two decimals after scaling, e.g. 11.76 K or 5.9 K.
const formatPositionValue = (value: number) => {
  const abs = Math.abs(value)
  const compact = (divisor: number, suffix: string) =>
    `${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value / divisor)} ${suffix}`

  if (abs >= 1_000_000_000) return compact(1_000_000_000, 'B')
  if (abs >= 1_000_000) return compact(1_000_000, 'M')
  if (abs >= 1_000) return compact(1_000, 'K')
  return value.toFixed(2)
}

// Prosent slik TV kalkulerer: amount / tvBasisRaw * 100 → r4.
const tvPercent4dp = (amount: number, entryPrice: number, entryQty: number) => {
  const base = tvBasisRaw(entryPrice, entryQty)
  return base ? r4((amount / base) * 100) : 0
}

// Normaliser SignalType fra Rust til en enkel nøkkel
function normSignal(ev: TradeEvent | undefined): string {
  if (!ev) return ''
  return String(ev.signal ?? '')
    .replace(/^(Buy|Sell)\s*/i, '') // fjern "Buy"/"Sell" prefiks fra ev.signal
    .replace(/[_\s-]/g, '')
    .toLowerCase()
}

// TradingView prefixes an order comment with the strategy order id (Buy/Sell),
// which is also the direction of the open trade for close orders.
function orderSide(ev: TradeEvent): 'Buy' | 'Sell' {
  return ev.direction === 'long' ? 'Buy' : 'Sell'
}

// Bruk orderSide + fin tittel
function signalLabel(ev: TradeEvent): string {
  const side = orderSide(ev)
  const key = normSignal(ev)

  if (key === 'margincall') return 'Margin Call'
  // Rust uses Reversal internally for an opposite-cross close. Pine reports
  // that same exit using the strategy.close comment "Buy/Sell Close Opposite".
  if (ev.event_type === 'Exit' && (key === 'reversal' || key === 'closeopposite')) return `${side} Close Opposite`

  const TITLE: Record<string, string> = {
    // Entry
    std: 'Std',
    flclose: 'FL Close',
    flhighlow: 'FL High/Low',
    flatr: 'FL ATR',
    // Exit
    slriskbased: 'SL Risk-Based',
    slfixed: 'SL Fixed %',
    sltrailing: 'SL Trailing %',
    slcombined: 'SL Combined',
    tp: 'TP',
    maxdrawdownclose: 'Max Drawdown Close',
    maxconsecutivelossesclose: 'Max Consecutive Losses Close',
    dmiweaktrendclose: 'DMI Weak Trend Close',
    drawdownandlossesclose: 'Maximum drawdown + consecutive losses Close',
    nonpositiveequityclose: 'Non-positive equity Close',
    adxwarmupclose: 'ADX warm-up Close',
    adxrecoveryclose: 'ADX recovery Close',
    // Entry/Exit
    reversal: 'Reversal',
    closeopposite: 'Close Opposite',
    margincall: 'Margin Call',
  }

  const reason = TITLE[key] ?? ''
  if (key.endsWith('close') && !['flclose'].includes(key)) {
    if (key === 'maxdrawdownclose') return 'Maximum drawdown Close'
    if (key === 'maxconsecutivelossesclose') return 'Consecutive losses Close'
    return reason || side
  }
  return reason ? `${side} ${reason}` : side
}

function onPastePreset(e: ClipboardEvent) {
  const txt = e.clipboardData?.getData('text') ?? ''
  try {
    const parsed = parsePreset(txt)
    tvPreset.value = parsed
    savePreset(parsed)
    // auto-enable når bruker limer inn noe gyldig
    if (!presetEnabled.value) presetEnabled.value = true
    alert('Preset applied ✔')
  } catch (err: unknown) {
    alert('Invalid preset JSON\n' + ((err as Error)?.message ?? ''))
  }
}

// TradingView-stil dato/tid:
//  - Rust gir timestamps i ms siden epoch (UTC)
//  - vi viser dem i samme timezone som TradingView-chartet (Europe/Oslo)
const tvDateFormatter = new Intl.DateTimeFormat('nb-NO', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Europe/Oslo', // endre hvis du bruker annen chart-timezone
})

const formatDateTime = (ts: number | null | undefined): string => {
  if (ts == null || !Number.isFinite(ts)) return '-'
  // ts er ms-timestamp i UTC fra Rust – formater i valgt timezone
  return tvDateFormatter.format(new Date(ts))
}

/* ------------------------------------------------------------------
   2.  REAKTIVE DATA
--------------------------------------------------------------------*/
const emaVwapParams = reactive<EmaVwapParams>({
  behavior_mode: 'Improved',
  atr_threshold_percent: false,
  atr_threshold_fl_percent: 1.0,
  reset_fl_on_opposite: true,
  fl_expiry_bars: 48,
  cooldown_bars: 48,
  adx_resume_threshold: 16.0,
  adx_resume_bars: 3,
  ema_length: 122,
  ema_source: EmaSource.High,
  vwap_anchor_period: VwapAnchorPeriod.Week,
  vwap_source: EmaSource.Open,
  order_size_mode: OrderSizeMode.PercentOfEquity,
  order_size_value: 100,
  trade_direction: TradeDirectionFilter.Long,
  close_on_opposite: true,
  parity_mode: true,
  fashionably_late_mode: FashionablyLateMode.Atr,
  atr_threshold_fl: 1.3,
  atr_length: 14,
  risk_gearing: 1,
  risk_perc: 1,
  sl_tp_method: SlTpMethod.TrailingPercent,
  reward_mult_rb: 2.0,
  atr_mult_rb: 1.5,
  fixed_sl_perc: 1.0,
  fixed_tp_perc: 2.0,
  trailing_sl_perc: 3.0,
  fixed_tp_for_trailing_perc: 5.0,
  enable_max_drawdown: true,
  max_drawdown_perc: 22.0,
  enable_max_consecutive_losses: true,
  max_consecutive_losses: 5,
  enable_dmi_filter: true,
  dmi_length: 6,
  dmi_smoothing: 24,
  dmi_threshold: 14.05,
})

// Bruk useBacktest composable
const { isLoading, runSmaCrossoverBacktest, runEmaVwapBacktest } = useBacktest()

// --- Input variabler ---
const symbol = ref('SOLUSDT')
// Gyldige Binance-klines intervaller (spot /api/v3/klines)
const BINANCE_INTERVALS = [
  '1s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
] as const
const timeframe = ref<(typeof BINANCE_INTERVALS)[number]>('1h')
const selectedStrategy = ref<'smaCross' | 'emaVwap'>('smaCross')
const showFullTradeLog = ref(false)
const fullTradeLogCloseButton = ref<HTMLButtonElement | null>(null)
let fullTradeLogOpener: HTMLElement | null = null
const openFullTradeLog = async () => {
  fullTradeLogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  showFullTradeLog.value = true
  await nextTick()
  fullTradeLogCloseButton.value?.focus()
}
const closeFullTradeLog = () => {
  showFullTradeLog.value = false
  fullTradeLogOpener?.focus()
}
const trapTradeLogFocus = (event: KeyboardEvent) => {
  const dialog = fullTradeLogCloseButton.value?.closest('.trade-log-dialog')
  const controls = dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  if (!controls?.length) return
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
const selectedStrategyLabel = computed(() =>
  selectedStrategy.value === 'emaVwap' ? 'EMA / VWAP' : 'SMA Crossover',
)

// Canonical parameters for the SMA Crossover strategy.
const smaParams = reactive<SmaParams>({
  behavior_mode: 'Improved',
  atr_threshold_percent: false,
  atr_threshold_fl_percent: 1.0,
  reset_fl_on_opposite: true,
  fl_expiry_bars: 48,
  cooldown_bars: 48,
  adx_resume_threshold: 16.0,
  adx_resume_bars: 3,
  fast_period: 10,
  slow_period: 73,
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
  risk_perc: 1.0,

  trade_direction: TradeDirectionFilter.Both,
  parity_mode: true, // default ON to mirror TradingView

  fashionably_late_mode: FashionablyLateMode.Atr,
  atr_threshold_fl: 1.3,
  enable_max_drawdown: true,
  max_drawdown_perc: 22.0,
  enable_max_consecutive_losses: true,
  max_consecutive_losses: 5,
  enable_dmi_filter: true,
  dmi_length: 6,
  dmi_smoothing: 24,
  dmi_threshold: 14.05,
})

const activeParams = computed(() =>
  selectedStrategy.value === 'emaVwap' ? emaVwapParams : smaParams,
)

const isRiskBased = computed(() => activeParams.value.sl_tp_method === SlTpMethod.RiskBased)
const isImproved = computed(() => activeParams.value.behavior_mode === 'Improved')

// Order Size-verdi er inaktiv når Risk-Based styrer sizing
const disableOrderSizeValue = computed(() => isRiskBased.value)

const priceToTick = ref(false)
const commissionPercent = ref(0.05)
const slippageTicks = ref(2)
const marginLongPercent = ref(100)
const marginShortPercent = ref(100)
const marginEnforcementEnabled = ref(false)

// --- Resultat variabler ---
const initialCapital = ref(10000)
const results = ref<BacktestResult | null>(null)
const completedRun = ref<BacktestAnalysisSnapshot | null>(null)
const backtestError = ref('')
const quoteCurrency = ref('USDT')

// Slutt = siste bar i equity-curve (når resultater finnes)
const tvEndMs = computed(() =>
  results.value?.equity_curve?.length ? results.value.equity_curve.at(-1)!.timestamp : undefined,
)

// Start = første bar i equity-curve (brukes av PnlChart for range-start)
const tvStartMs = computed(() =>
  results.value?.equity_curve?.length ? results.value.equity_curve[0]!.timestamp : undefined,
)

console.log('params.sma:', JSON.stringify(smaParams))

// Manuelt Data Limit (ingen auto-beregning)
const dataLimitForFetch = ref<number>(10000)
const endBeforeUtc = ref('')

function showPreset() {
  if (!tvPreset.value) {
    alert('No preset stored.')
  } else {
    alert(JSON.stringify(tvPreset.value, null, 2))
  }
}
function clearPreset() {
  tvPreset.value = null
  savePreset(null) // tvPreset.ts bør støtte null → removeItem
  alert('Preset cleared ✔')
}

/* ------------------------------------------------------------------
   3.  KJØR BACKTEST
--------------------------------------------------------------------*/
const captureCurrentBacktestSettings = (): Omit<BacktestAnalysisSnapshot, 'results'> => ({
  version: 1,
  capturedAt: new Date().toISOString(),
  strategy: selectedStrategy.value,
  strategyLabel: selectedStrategyLabel.value,
  parameters: { ...activeParams.value },
  market: {
    symbol: symbol.value,
    timeframe: timeframe.value,
    dataLimit: dataLimitForFetch.value,
    endBeforeUtc: endBeforeUtc.value || null,
  },
  execution: {
    initialCapital: initialCapital.value,
    commissionPercent: commissionPercent.value,
    slippageTicks: slippageTicks.value,
    quoteCurrency: symbol.value.endsWith('USDT') ? 'USDT'
      : symbol.value.endsWith('USD') ? 'USD'
        : symbol.value.endsWith('EUR') ? 'EUR'
          : symbol.value.endsWith('BTC') ? 'BTC' : 'UNKNOWN',
    marginLongPercent: marginLongPercent.value,
    marginShortPercent: marginShortPercent.value,
    marginEnforcementEnabled: marginEnforcementEnabled.value,
    priceToTick: priceToTick.value,
  },
})

const runBacktest = async () => {
  const runSettings = captureCurrentBacktestSettings()
  results.value = null
  completedRun.value = null
  clearBacktestAnalysis()
  backtestError.value = ''
  isLoading.value = true

  try {
    const endTimeExclusive = runSettings.market.endBeforeUtc
      ? Date.parse(`${runSettings.market.endBeforeUtc}Z`) : undefined
    if (endTimeExclusive !== undefined && !Number.isFinite(endTimeExclusive)) {
      throw new Error('Invalid backtest end time.')
    }
    // Dynamisk tick size hentes fra API
    const filters = await fetchSymbolFilters(runSettings.market.symbol)
    // hent antall desimaler fra tick/step (robust for 0.1, 0.01, 0.0001, osv.)
    const decimalsFromStep = (x: number | string) => {
      const s = String(x)
      if (s.includes('e-')) {
        const m = /e-(\d+)/i.exec(s)
        return m ? parseInt(m[1], 10) : 0
      }
      const i = s.indexOf('.')
      return i === -1 ? 0 : s.length - i - 1
    }
    priceDecimals.value = decimalsFromStep(filters.tickSize)
    qtyDecimals.value = decimalsFromStep(filters.stepSize)
    const backtestConfig: BacktestConfig = {
      commission_percent: runSettings.execution.commissionPercent,
      slippage_ticks: runSettings.execution.slippageTicks,
      tick_size: filters.tickSize, // 0.01 hos Binance for de fleste USDT-par
      step_size: filters.stepSize, // 0.001 hos Binance - Husk å legge til step_size i BacktestConfig-typen din også
      enforce_margin: runSettings.execution.marginEnforcementEnabled,
      margin_long_percent: runSettings.execution.marginLongPercent,
      margin_short_percent: runSettings.execution.marginShortPercent,
    }
    let outcome: BacktestResult
    // Kall riktig Rust-funksjon basert på valgt strategi
    if (runSettings.strategy === 'smaCross') {
      outcome = await runSmaCrossoverBacktest({
        symbol: runSettings.market.symbol,
        interval: runSettings.market.timeframe,
        limit: runSettings.market.dataLimit,
        endTimeExclusive,
        initialCapital: runSettings.execution.initialCapital,
        config: backtestConfig,
        params: runSettings.parameters as unknown as SmaParams,
        priceToTick: runSettings.execution.priceToTick ?? false,
      })
    } else {
      outcome = await runEmaVwapBacktest({
        symbol: runSettings.market.symbol,
        interval: runSettings.market.timeframe,
        limit: runSettings.market.dataLimit,
        endTimeExclusive,
        initialCapital: runSettings.execution.initialCapital,
        config: backtestConfig,
        params: runSettings.parameters as unknown as EmaVwapParams,
        priceToTick: runSettings.execution.priceToTick ?? false,
      })
    }
    quoteCurrency.value = runSettings.execution.quoteCurrency
    results.value = outcome
    completedRun.value = {
      ...runSettings,
      execution: { ...runSettings.execution, tickSize: filters.tickSize, stepSize: filters.stepSize },
      results: outcome,
    }
    cacheBacktestAnalysis()
  } catch (error) {
    console.error('Failed to run backtest:', error)
    backtestError.value = error instanceof Error ? error.message : 'The backtest failed.'
  } finally {
    isLoading.value = false
  }
}

const cacheBacktestAnalysis = () => {
  if (completedRun.value) saveBacktestAnalysis(completedRun.value)
}

const openInOptimize = () => {
  saveResearchHandoff(captureCurrentBacktestSettings())
}

const exportBacktestReport = () => {
  if (!completedRun.value) return

  const report = {
    exportedAt: new Date().toISOString(),
    ...completedRun.value,
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${completedRun.value.market.symbol}-${completedRun.value.strategy}-backtest.json`
  link.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------
   4.  KEY METRIC ØVERST
--------------------------------------------------------------------*/
const formattedTotalPnl = computed(() => {
  if (!results.value) return { amount: '0.00 USDT', percent: '0.00%', class: '' }

  const { pnl_total } = results.value.summary
  const capital = completedRun.value?.execution.initialCapital ?? initialCapital.value
  const totalPerc = capital > 0 ? (pnl_total / capital) * 100 : 0
  const sign = pnl_total >= 0 ? '+' : ''
  const cls = pnl_total > 0 ? 'profit' : 'loss'
  return {
    amount: `${sign}${pnl_total.toFixed(2)} ${quoteCurrency.value}`,
    percent: `${sign}${totalPerc.toFixed(2)}%`,
    class: cls,
  }
})

const formattedProfitableTrades = computed(() => {
  if (!results.value || results.value.summary.total_trades === 0) return '—'
  const { profitable_trades, total_trades } = results.value.summary
  return `${((profitable_trades / total_trades) * 100).toFixed(2)}% (${profitable_trades})`
})

/* ------------------------------------------------------------------
   5.  LIST OF TRADES –  NÅ MED «TV-NØYAKTIG» PROSENT
--------------------------------------------------------------------*/
// --- (flyttet opp) tvBasisRaw / tvBasisDisp brukes for prosent ---

// --- To uavhengige prosenter slik TV faktisk gjør ---
// (nå definert som tvPercent4dp / tvPercent2dp over)

// Enkel debug-toggle for prosentberegninger
const PCT_DEBUG = false // sett true ved feilsøking
const PCT_DEBUG_IDS = new Set<number>() // legg inn trade-id'er hvis du vil filtrere

const processedTradeLog = computed<ProcessedTrade[]>(() => {
  if (!results.value?.trade_log) return []

  // 5.1 Gruppe entry/exit
  const grouped: { entry: TradeEvent; exit?: TradeEvent }[] = (() => {
    const byId = new Map<number, { entry?: TradeEvent; exit?: TradeEvent }>()
    for (const ev of results.value!.trade_log) {
      const g = byId.get(ev.trade_id) ?? {}
      if (ev.event_type === 'Entry') g.entry = ev
      if (ev.event_type === 'Exit') g.exit = ev
      byId.set(ev.trade_id, g)
    }
    return Array.from(byId.values()).filter((g) => g.entry) as {
      entry: TradeEvent
      exit?: TradeEvent
    }[]
  })()

  // 5.2 Beregn alle feltene
  // TV-paritet: summer P&L i full presisjon; rund kun når vi viser tallet.
  let closedCumPrecise = 0

  const calc: ProcessedTrade[] = grouped.map((t) => {
    const closed = !!t.exit

    // ---------- 1. Rå tall --------------------------------------------------
    const pnlRaw = closed ? t.exit!.pnl! : t.entry.pnl! // inkl. fees (netto)
    const ruRaw = closed ? t.exit!.run_up_amount! : t.entry.run_up_amount!
    const ddRaw = closed ? t.exit!.drawdown_amount! : t.entry.drawdown_amount!

    // TV-basis for %: ALLTID entry-qty (også på lukkede trades)
    const qtyForPct = t.entry.quantity

    // ---------- 2. Visningstall + integer-basert % (TV-stil) ---------------
    // Display price/quantity at exchange precision without truncating float noise.
    const priceEntryDisp = roundN(t.entry.price, priceDecimals.value)
    const priceExitDisp = closed ? roundN(t.exit!.price, priceDecimals.value) : priceEntryDisp
    const qtyDisp = roundN(qtyForPct, qtyDecimals.value)

    const pnlDisp = cent(pnlRaw)
    const runUpDisp = cent(ruRaw)
    const drawDnDisp = cent(ddRaw)

    // Use full-precision percentages from the engine, including entry commission
    // in Mini's denominator. Do not recompute from rounded monetary amounts.
    const metrics = t.exit ?? t.entry
    const pnlPct = metrics.pnl_percent ?? tvPercent4dp(pnlRaw, t.entry.price, qtyForPct)
    const runUpPct = metrics.run_up_percent ?? tvPercent4dp(ruRaw, t.entry.price, qtyForPct)
    const drawDnPct = metrics.drawdown_percent ?? tvPercent4dp(ddRaw, t.entry.price, qtyForPct)
    const pnlPct4 = roundN(pnlPct, 4)
    const runUpPct4 = roundN(runUpPct, 4)
    const drawDnPct4 = roundN(drawDnPct, 4)
    const pnlPctDisp2 = roundN(pnlPct, 2)
    const runUpPctDisp2 = roundN(runUpPct, 2)
    const drawDnPctDisp2 = roundN(drawDnPct, 2)

    if (PCT_DEBUG && (!PCT_DEBUG_IDS.size || PCT_DEBUG_IDS.has(t.entry.trade_id))) {
      console.debug(
        `[PCTDBG] t#${t.entry.trade_id} expoRaw=${tvBasisRaw(t.entry.price, qtyForPct).toFixed(6)} ` +
          `expoDisp=${tvBasisDisp(t.entry.price, qtyForPct).toFixed(2)} ` +
          `| pnl: ${pnlPctDisp2.toFixed(2)}% (${pnlPct4.toFixed(4)}%) ` +
          `ru: ${runUpPctDisp2.toFixed(2)}% (${runUpPct4.toFixed(4)}%) ` +
          `dd: ${drawDnPctDisp2.toFixed(2)}% (${drawDnPct4.toFixed(4)}%) ` +
          `| amounts: pnl=${cent(pnlRaw).toFixed(2)} ru=${cent(ruRaw).toFixed(2)} dd=${cent(ddRaw).toFixed(2)}`,
      )
    }

    // Verdien som vises i "Position size" (kun visning)
    const entryValDisp = priceEntryDisp * qtyForPct
    const commissionDisp = cent(tradeCommission(
      t.entry,
      t.exit,
      results.value?.margin_calls ?? [],
      completedRun.value?.execution.commissionPercent ?? 0,
    ))
    const durationBars = closed ? Math.max(0, t.exit!.bar_index - t.entry.bar_index) : undefined
    // ---------- 4. Kumulativ PnL (full presisjon), rund KUN ved visning ----
    if (closed) closedCumPrecise += pnlRaw // <- use raw P&L
    const cumPrecise = closed ? closedCumPrecise : closedCumPrecise + pnlRaw // include open trade's raw P&L in its own row
    const cumPnlDisp = cent(cumPrecise) // display value
    const capital = completedRun.value?.execution.initialCapital ?? initialCapital.value
    const cumPct = capital ? pct2((cumPnlDisp / capital) * 100) : 0

    return {
      ...t,

      // verdier som vises i tabellen
      positionValue: entryValDisp,
      pnlPercent: pnlPctDisp2,
      runUpPercent: runUpPctDisp2,
      drawdownPercent: drawDnPctDisp2,
      pnlPercent4: pnlPct4,
      runUpPercent4: runUpPct4,
      drawdownPercent4: drawDnPct4,
      cumulativePnl: cumPnlDisp,
      cumulativePnlPercent: cumPct,
      commission: commissionDisp,
      durationBars,

      // tallene du faktisk viser i cellene
      entry: { ...t.entry, price: priceEntryDisp, quantity: qtyDisp },
      exit: t.exit
        ? {
            ...t.exit,
            price: priceExitDisp,
            quantity: qtyDisp, // vis samme qty som entry (TV viser pos-størrelse)
            pnl: pnlDisp, // per-trade cell stays rounded
            run_up_amount: runUpDisp, // ditto
            drawdown_amount: drawDnDisp,
          }
        : undefined,
    }
  })

  // 5.3  Vis nyeste øverst
  return calc.reverse()
})

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
  --label-width: 170px; /* Justér denne for å skyve alle inputfelt til høyre / venstre */
  --section-gap: 1.5rem; /* felles spacing-variabel for seksjoner/knapp */
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
  .controls-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* Compact section titles */
.section-title {
  color: #eee;
  margin: 1rem 0 -1.2rem 0; /* small bottom gap so content sits tight */
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

.safeguard-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.safeguard-fields:disabled {
  opacity: 0.55;
}
.mode-note {
  color: #aaa;
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
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
  border-top: 0; /* seam disappears */
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  padding: 0; /* chart hugs the edge */
  overflow: hidden; /* hide inner overflow from chart lib */
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
  margin-bottom: 0.8rem; /* strammere mellom tittel og kontroller */
  color: #bbb; /* litt mer dempet enn h1 */
  font-size: 1rem;
  font-weight: 500;
}
/* Seksjonstitler (Results/Performance/Trades): uten linje, jevn avstand */
h3 {
  color: #eee;
  border: 0;
  padding: 0;
  margin: 1.2rem 0 0.6rem; /* topp → litt luft fra forrige seksjon, bunn → tett på innholdet */
  font-weight: 600;
}
/* Første tittel i resultatskortet trenger ikke topp-luft */
.results-panel h3:first-child {
  margin-top: 0;
}
/* Tighten space before the trades table */
.results-panel table {
  margin-top: 0.25rem; /* was 1rem */
}
/* Kolonnekort (Inputs / Properties) */
.col-card {
  border: 1px solid #444;
  padding: 1.25rem;
  border-radius: 8px;
  background-color: #2a2a2a;
}

/* Underseksjoner i et kolonne-kort */
.group + .group {
  /* separator mellom grupper */
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #444;
}
.group-title {
  margin: 0 0 0.6rem 0;
  color: #aab;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
}

/* Rader (label + input) – bruk .row i templaten */
.row {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}
.row:last-child {
  margin-bottom: 0;
}
/* Checkbox-rader: ikke bruk label-kolonnebredden */
.row-checkbox {
  gap: 10px;
  padding-left: var(--label-width); /* indenter slik at checkboxen står på linje med inputs */
  flex-wrap: nowrap; /* aldri bryt linjen */
}
.row-checkbox .inline-label {
  width: auto !important;
  min-width: 0 !important;
  flex: 0 1 auto !important;
  margin: 0 !important;
  text-align: left !important;
  white-space: nowrap; /* hindrer linjebrudd i teksten */
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
.row-disabled {
  opacity: 0.6;
}
input[type='text'],
input[type='number'],
input[type='datetime-local'],
select {
  flex-grow: 1; /* La input-feltene vokse for å fylle plassen */
  padding: 8px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #3a3a3a;
  color: #eee;
  max-width: 210px; /* Gi en maks bredde for å unngå for lange felt */
}
.advanced-data-settings {
  width: 210px;
  margin: 0.1rem 0 0 calc(var(--label-width) + 10px);
  color: #aaa;
  font-size: 0.85rem;
}
.advanced-data-settings .advanced-data-toggle {
  display: inline-flex;
  gap: 0.3rem;
  align-items: center;
  width: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #aaa;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.advanced-data-panel {
  margin-top: 0.5rem;
}
.advanced-data-settings input {
  box-sizing: border-box;
  width: 100%;
}
.advanced-data-settings p {
  margin: 0.35rem 0 0;
  line-height: 1.35;
}
/* --- TV preset layout (textarea med knapper under) --- */
.preset-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px; /* samme bredde som før */
}
preset-col textarea {
  width: 100%;
}
.preset-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
/* Loddrett for metode-spesifikke felt (Fixed/Trailing/Combined/RB) */
.method-rows .row {
  margin-bottom: 0.5rem;
}

/* Liten hint-tekst ved RB */
.hint {
  margin-left: 20px;
  margin-bottom: -22px;
  color: #aaa;
  font-size: 0.9em;
}
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
  width: auto; /* ikke 100% bredde */
  min-width: 220px; /* litt «tyngde» */
  align-self: center; /* behold sentrering (kan byttes til flex-start) */
  margin-top: var(--section-gap); /* samme vertikale avstand som fieldsets */
}

/* (valgfritt) litt responsivitet */
@media (max-width: 900px) {
  .dashboard-view {
    --label-width: 140px;
  }
}
@media (max-width: 720px) {
  .dashboard-view {
    --label-width: 120px;
  }
}

/* NYTT: Litt styling for prosentverdiene for å matche TradingView */
.percent-value {
  color: #999; /* En litt svakere farge for prosenter */
  text-align: center;
  font-size: 0.9em;
}

.percent-small {
  font-size: 0.85em;
  opacity: 0.75;
  font-variant-numeric: tabular-nums; /* ryddigere kolonne */
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
td[rowspan='2'] {
  vertical-align: middle; /* Sentrer innholdet i celler som spenner over to rader */
  text-align: center;
}
/* Overstyrer første kolonne (Trade #) av regelen som står rett ovenfor */
td[rowspan='2']:first-child {
  text-align: left;
}
tr > td:nth-child(5), /* Price */
tr > td:nth-child(4)  /* Date/Time */ {
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

.dir-long {
  color: #3ce6a0;
  opacity: 0.96;
}

.dir-short {
  color: #ff5667;
  opacity: 0.96;
}

/* ------------------------------------------------------------------ */
/* Backtest research layout                                            */
/* ------------------------------------------------------------------ */
.dashboard-view.research-view {
  max-width: none;
  margin: 0;
  padding: 0;
  --label-width: auto;
}

.backtest-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.backtest-page-header h1 {
  margin: 0;
  color: #d7e5f8;
  font-size: clamp(1.55rem, 2.2vw, 1.95rem);
  font-weight: 750;
  letter-spacing: -0.035em;
  text-align: left;
}

.backtest-page-header p {
  max-width: 52rem;
  margin: 0.12rem 0 0;
  color: #9eacbc;
  font-size: 0.88rem;
}

.backtest-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.parity-badge {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.72rem;
  border: 1px solid #4a6178;
  border-radius: 6px;
  background: rgba(74, 97, 120, 0.12);
  color: #b9c8d8;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
}

.parity-badge.active {
  border-color: #2da767;
  background: rgba(45, 167, 103, 0.1);
  color: #63e69e;
}

.parity-badge input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.dashboard-view .backtest-run-button {
  min-width: 150px;
  min-height: 42px;
  background: linear-gradient(180deg, #2294ff, #087af0);
  color: white;
  box-shadow: 0 9px 24px rgba(8, 122, 240, 0.18);
}

.backtest-layout {
  display: grid;
  grid-template-columns: minmax(270px, 0.74fr) minmax(300px, 0.78fr) minmax(620px, 1.95fr);
  gap: 0.8rem;
  align-items: start;
}

.backtest-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.8rem;
}

.backtest-results-column {
  align-self: stretch;
}

.recent-trades-card {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.recent-trades-heading h2 {
  margin: 0;
  color: inherit;
  font-size: inherit;
}

.recent-trades-heading-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.trade-log-open-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #70b9ff;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 750;
}

.trade-log-open-button:hover {
  color: #a8d6ff;
}

.dashboard-view .research-card {
  border-color: #2b4455;
  background: #10212d;
}

.dashboard-view .research-card-title {
  margin: 0;
  color: #55b4ff;
  font-size: 0.92rem;
  text-align: left;
}

.dashboard-view .research-card-body {
  padding: 0.82rem 0.9rem;
}

.dashboard-view .research-field {
  grid-template-columns: minmax(112px, 0.9fr) minmax(108px, 0.95fr) 20px;
  gap: 0.55rem;
}

.dashboard-view.research-view input[type='text'],
.dashboard-view.research-view input[type='number'],
.dashboard-view.research-view input[type='datetime-local'],
.dashboard-view.research-view select,
.dashboard-view.research-view textarea {
  border-color: #365164;
  background-color: #102431;
  color: #e4f0f8;
}

.dashboard-view input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}

.dashboard-view input[type='number']::-webkit-inner-spin-button,
.dashboard-view input[type='number']::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.preset-card-row {
  display: grid;
  gap: 0.5rem;
}

.preset-card-row textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #365164;
  border-radius: 5px;
  background: #102431;
  color: #edf3fa;
}

.backtest-check-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #c7d3e1;
  cursor: pointer;
  font-size: 0.83rem;
}

.backtest-check-row input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: #1687ff;
}

.field-with-unit,
.compact-value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  overflow: hidden;
  border: 1px solid #365164;
  border-radius: 5px;
  background: #102431;
}

.field-with-unit input,
.compact-value input {
  border: 0;
  background: transparent;
  box-shadow: none !important;
}

.field-with-unit span,
.compact-value span {
  padding-right: 0.65rem;
  color: #91a1b2;
  font-size: 0.75rem;
}

.compound-control {
  display: grid;
  grid-template-columns: minmax(58px, 0.62fr) minmax(96px, 1fr);
  gap: 0.45rem;
}

.safeguard-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 82px 20px;
  gap: 0.55rem;
  align-items: center;
}

.compact-input {
  max-width: 82px;
}

.backtest-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 0.75rem;
}

.performance-analysis-link {
  color: #58adff;
  font-size: 0.72rem;
  font-weight: 650;
  white-space: nowrap;
}

.performance-analysis-link:hover {
  color: #8bc7ff;
  background: transparent;
}

.backtest-kpi {
  min-height: 84px;
  padding: 0.72rem 0.82rem;
}

.backtest-kpi span {
  display: block;
  color: #a9b8c8;
  font-size: 0.76rem;
  font-weight: 650;
}

.backtest-kpi strong {
  display: block;
  margin-top: 0.25rem;
  color: #edf4fc;
  font-size: clamp(1.05rem, 1.35vw, 1.55rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.backtest-kpi strong small {
  font-size: 0.78em;
  font-weight: 750;
}

.backtest-kpi strong.profit {
  color: #3ce6a0;
}

.backtest-kpi strong.loss,
.backtest-kpi strong.metric-negative {
  color: #ff5667;
}

.backtest-chart-wrap {
  height: 360px;
  overflow: hidden;
}

.backtest-empty-state {
  display: flex;
  min-height: 360px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.45rem;
  color: #8fa0b1;
  text-align: center;
}

.backtest-empty-state strong {
  color: #dce7f3;
}

.empty-state-icon {
  color: #419ff5;
  font-size: 3rem;
  line-height: 1;
}

.compact-trades-wrap,
.full-trade-table-wrap {
  overflow: auto;
}

.dashboard-view .compact-trades-table,
.dashboard-view .full-trade-table {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.dashboard-view .compact-trades-table th,
.dashboard-view .compact-trades-table td,
.dashboard-view .full-trade-table th,
.dashboard-view .full-trade-table td {
  padding: 0.52rem 0.62rem;
  border: 0;
  border-bottom: 1px solid #2a3947;
  background: transparent;
  color: #d7e1ed;
  font-size: 0.76rem;
  text-align: left;
  white-space: nowrap;
}

.dashboard-view .compact-trades-table th,
.dashboard-view .full-trade-table th {
  background: #142a38;
  color: #aebdce;
  font-size: 0.71rem;
  font-weight: 700;
}

.dashboard-view .compact-trades-table td.dir-long,
.dashboard-view .compact-trades-table td.profit {
  color: #3ce6a0;
  font-weight: 700;
}

.dashboard-view .compact-trades-table td.dir-short,
.dashboard-view .compact-trades-table td.loss {
  color: #ff5667;
  font-weight: 700;
}

.recent-trades-empty {
  display: grid;
  min-height: 170px;
  place-items: center;
  color: #8495a7;
  font-size: 0.84rem;
}

.backtest-results-actions {
  display: flex;
  margin-top: auto;
  justify-content: flex-end;
  gap: 0.65rem;
}

.dashboard-view .research-secondary,
.open-optimize-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.85rem;
  border: 1px solid #3b566a;
  border-radius: 5px;
  background: #122532;
  color: #d7e3f1;
  font-size: 0.82rem;
  font-weight: 700;
}

.open-optimize-link {
  border-color: #228bf4;
  color: #70b9ff;
}

.trade-log-overlay {
  position: fixed;
  z-index: 90;
  top: 49px;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  background: #101922;
  overflow-y: auto;
  scrollbar-width: none;
}

.trade-log-overlay::-webkit-scrollbar {
  display: none;
}

:global(body:has(.trade-log-overlay)) {
  overflow: hidden;
}

.trade-log-dialog {
  display: flex;
  width: min(100%, 1660px);
  min-height: 100%;
  margin: 0 auto;
  padding: 0.9rem 1.25rem 2rem;
  box-sizing: border-box;
  flex-direction: column;
  background: transparent;
  color: #dce7f3;
}

.trade-log-dialog-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 0.85rem;
}

.trade-log-dialog-header h2 {
  margin: 0;
  color: #d7e5f8;
  font-size: clamp(1.55rem, 2.2vw, 1.95rem);
  font-weight: 750;
  letter-spacing: -0.035em;
}

.trade-log-dialog-header p {
  margin: 0.25rem 0 0;
  color: #91a2b4;
  font-size: 0.8rem;
}

.trade-log-dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.trade-log-dialog .research-secondary {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  padding: 0.6rem 0.9rem;
  border: 1px solid #4b6074;
  border-radius: 6px;
  background: #1a2631;
  color: #d7e3f1;
  cursor: pointer;
  font-weight: 700;
}

.trade-log-close-button {
  display: grid;
  width: 42px;
  height: 42px;
  border: 1px solid #4b6074;
  border-radius: 6px;
  background: #1a2631;
  color: #d7e3f1;
  cursor: pointer;
  font-size: 1.65rem;
  line-height: 1;
  place-items: center;
}

.trade-log-close-button:hover,
.trade-log-dialog .research-secondary:hover {
  border-color: #228bf4;
  color: #70b9ff;
}

.trade-log-table-wrap {
  flex: 0 0 auto;
  overflow: visible;
  border: 1px solid #2b4455;
  border-radius: 6px;
  background: #0f202b;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.13);
}

.trade-log-table {
  width: 100%;
  min-width: 0;
  border-collapse: separate;
  border-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.trade-log-table th {
  position: sticky;
  z-index: 2;
  top: 0;
  padding: 0.58rem 0.62rem;
  border-bottom: 1px solid #405164;
  background: #142a38;
  color: #b6c5d5;
  font-size: 0.72rem;
  font-weight: 750;
  text-align: left;
  white-space: normal;
}

.trade-log-table td {
  padding: 0.52rem 0.62rem;
  border: 0;
  border-bottom: 1px solid #293846;
  background: #0f202b;
  color: #dce5ef;
  font-size: 0.76rem;
  text-align: left;
  vertical-align: middle;
  white-space: normal;
}

.trade-log-table tr:hover td {
  background: #142936;
}

.trade-log-table .trade-entry-row td {
  border-bottom-color: #3a4a5a;
}

.trade-number-cell {
  min-width: 88px;
}

.trade-number-cell strong,
.trade-number-cell span,
.two-line-value strong,
.two-line-value small {
  display: block;
}

.trade-number-cell strong {
  margin-bottom: 0.2rem;
  color: #edf4fc;
}

.trade-log-table small,
.two-line-value small {
  color: #93a5b7;
  font-size: 0.68rem;
}

.trade-log-table .profit,
.trade-log-table .profit small {
  color: #4fc879;
}

.trade-log-table .loss,
.trade-log-table .loss small {
  color: #ff6666;
}

.duration-cell {
  text-align: right !important;
}

.open-trade-cell {
  color: #f4c765 !important;
  text-align: center !important;
}

@media (max-width: 720px) {
  .trade-log-overlay {
    top: 101px;
  }

  .trade-log-dialog-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .trade-log-dialog-actions {
    width: 100%;
  }

  .trade-log-dialog .research-secondary {
    flex: 1;
    justify-content: center;
  }
}

@media (max-width: 1380px) {
  .backtest-layout {
    grid-template-columns: minmax(270px, 0.8fr) minmax(300px, 0.85fr);
  }

  .backtest-results-column {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .backtest-page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .backtest-header-actions {
    width: 100%;
  }

  .backtest-header-actions > * {
    flex: 1;
  }

  .backtest-header-actions > .field-tooltip {
    flex: 0 0 20px;
  }

  .backtest-layout {
    grid-template-columns: 1fr;
  }

  .backtest-results-column {
    grid-column: auto;
  }

  .backtest-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
