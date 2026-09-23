export type PeriodEndChange = {
  key: string
  strategy: number
  benchmark: number
  strategyReturn: number
  benchmarkReturn: number
}

/** Compare consecutive period-end equity and buy-and-hold values on the same timeline. */
export const buildPeriodEndChanges = (
  equityCurve: Array<{ timestamp: number; equity: number }>,
  priceBars: Array<{ timestamp: number; close: number }>,
  initialCapital: number,
  periodKey: (timestamp: number) => string,
): PeriodEndChange[] => {
  const strategyEnds = new Map<string, number>()
  for (const point of equityCurve) strategyEnds.set(periodKey(point.timestamp), point.equity)
  const benchmarkEnds = new Map<string, number>()
  for (const bar of priceBars) benchmarkEnds.set(periodKey(bar.timestamp), bar.close)
  const firstClose = priceBars[0]?.close
  let previousStrategy = initialCapital
  let previousBenchmark = initialCapital
  const rows: PeriodEndChange[] = []
  for (const key of [...new Set([...strategyEnds.keys(), ...benchmarkEnds.keys()])].sort()) {
    const strategyEnd = strategyEnds.get(key) ?? previousStrategy
    const close = benchmarkEnds.get(key)
    const benchmarkEnd = firstClose && close ? initialCapital * close / firstClose : previousBenchmark
    rows.push({
      key,
      strategy: strategyEnd - previousStrategy,
      benchmark: benchmarkEnd - previousBenchmark,
      strategyReturn: previousStrategy > 0 ? strategyEnd / previousStrategy - 1 : 0,
      benchmarkReturn: previousBenchmark > 0 ? benchmarkEnd / previousBenchmark - 1 : 0,
    })
    previousStrategy = strategyEnd
    previousBenchmark = benchmarkEnd
  }
  return rows
}
