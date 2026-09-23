import type { BacktestResult } from '@/types/common_strategy_types'

const STORAGE_KEY = 'latest-backtest-analysis'
let inMemorySnapshot: BacktestAnalysisSnapshot | null = null

export type BacktestAnalysisSnapshot = {
  version: 1
  capturedAt: string
  strategy: string
  strategyLabel: string
  parameters: Record<string, unknown>
  market: {
    symbol: string
    timeframe: string
    dataLimit: number
    endBeforeUtc: string | null
  }
  execution: {
    initialCapital: number
    commissionPercent: number
    slippageTicks: number
    quoteCurrency: string
    marginLongPercent?: number
    marginShortPercent?: number
    marginEnforcementEnabled?: boolean
    priceToTick?: boolean
    tickSize?: number
    stepSize?: number
  }
  results: BacktestResult
}

const compactSnapshot = (snapshot: BacktestAnalysisSnapshot): BacktestAnalysisSnapshot => ({
  ...snapshot,
  results: {
    ...snapshot.results,
    pnl_curve: [],
    bar_log: snapshot.results.bar_log.map((bar: {
      bar_index?: number
      timestamp?: number
      close?: number
      side?: string
      quantity_pos?: number
      equity?: number
      sig?: string
    }) => ({
      bar_index: bar.bar_index,
      timestamp: bar.timestamp,
      close: bar.close,
      side: bar.side,
      quantity_pos: bar.quantity_pos,
      equity: bar.equity,
      sig: bar.sig,
    })),
  },
})

export const saveBacktestAnalysis = (snapshot: BacktestAnalysisSnapshot) => {
  inMemorySnapshot = snapshot

  const serialized = JSON.stringify(compactSnapshot(snapshot))
  try {
    sessionStorage.setItem(STORAGE_KEY, serialized)
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    try {
      sessionStorage.setItem(STORAGE_KEY, serialized)
    } catch {
      // The complete snapshot remains available in memory for this app session.
    }
  }
}

export const clearBacktestAnalysis = () => {
  inMemorySnapshot = null
  sessionStorage.removeItem(STORAGE_KEY)
}

export const loadBacktestAnalysis = (): BacktestAnalysisSnapshot | null => {
  if (inMemorySnapshot) return inMemorySnapshot

  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as BacktestAnalysisSnapshot
    if (parsed.version !== 1 || !parsed.results?.summary || !parsed.results?.trade_log) return null
    inMemorySnapshot = parsed
    return parsed
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}
