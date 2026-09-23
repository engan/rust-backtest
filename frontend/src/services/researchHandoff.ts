import type { BacktestAnalysisSnapshot } from './backtestReport'

const STORAGE_KEY = 'backtest-to-research'

export type ResearchHandoff = Pick<
  BacktestAnalysisSnapshot,
  'strategy' | 'parameters' | 'market' | 'execution'
>

export const saveResearchHandoff = (snapshot: ResearchHandoff) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

export const consumeResearchHandoff = (): ResearchHandoff | null => {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  sessionStorage.removeItem(STORAGE_KEY)
  try {
    const parsed = JSON.parse(stored) as ResearchHandoff
    return parsed.market?.symbol && parsed.parameters && parsed.execution ? parsed : null
  } catch {
    return null
  }
}
