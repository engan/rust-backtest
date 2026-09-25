import { closedCandleCutoff } from './autoResearch'
import type { ResearchHandoff } from './researchHandoff'

export const PROFILE_KEY = 'simulation-profile-v1'
export const fixedFields = ['trade_direction', 'order_size_mode', 'order_size_value', 'risk_gearing', 'risk_perc', 'enable_max_drawdown', 'max_drawdown_perc', 'enable_max_consecutive_losses', 'max_consecutive_losses', 'cooldown_bars'] as const
export type SimulationProfile = { version: 1; name: string; settings: ResearchHandoff; history: string }
export function makeProfile(name: string, settings: ResearchHandoff, history: string): SimulationProfile {
  return { version: 1, name: name.trim() || 'My simulation', history, settings: {
    ...settings, parameters: Object.fromEntries(fixedFields.map(key => [key, settings.parameters[key]])),
  } }
}
export function readProfile(): SimulationProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    if (p?.version !== 1 || !p.settings?.market?.symbol || !p.settings?.execution || !p.settings?.parameters) return null
    return p
  } catch { return null }
}
/** Calendar months, including month-end clamping; count candle opens in [start, end). */
export function historyBars(months: number, timeframe: string, cutoff: string, now = Date.now()): number {
  const end = closedCandleCutoff(cutoff ? Date.parse(`${cutoff}Z`) : now, timeframe)
  const date = new Date(end), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  const match = /^(\d+)(s|m|h|d|w|M)$/.exec(timeframe)!
  if (match[2] === 'M') return Math.ceil(months / Number(match[1]))
  const duration = Number(match[1]) * ({s:1000,m:60000,h:3600000,d:86400000,w:604800000}[match[2]] ?? 0)
  const bars = Math.floor((end - date.getTime()) / duration)
  if (!Number.isSafeInteger(bars) || bars < 1 || bars > 200000) throw new Error('This period needs too many or too few candles (limit 200,000). Choose a shorter period or a larger timeframe.')
  return bars
}
