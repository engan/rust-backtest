export const numericAxisCount = (min: number, max: number, step: number): number => {
  if (![min, max, step].every(Number.isFinite) || step <= 0 || max < min) return 0
  const count = Math.floor((max - min) / step + 1e-9) + 1
  return Number.isSafeInteger(count) && count > 0 ? count : 0
}

export const numericAxisValues = (min: number, max: number, step: number, limit: number): number[] => {
  const count = numericAxisCount(min, max, step)
  if (!count) throw new Error('Every enabled range needs finite bounds, a positive step, and a maximum at least as large as its minimum.')
  if (count > limit) throw new Error(`One parameter range has ${count} values, exceeding the job safety limit of ${limit}.`)
  return Array.from({ length: count }, (_, index) => Number((min + index * step).toFixed(8)))
}
