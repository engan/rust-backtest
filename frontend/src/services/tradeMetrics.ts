import type { MarginCallEvent, TradeEvent } from '@/types/common_strategy_types'

/** Include every partial liquidation fill instead of pricing the original size at the final exit. */
export const tradeCommission = (
  entry: TradeEvent,
  exit: TradeEvent | undefined,
  marginCalls: MarginCallEvent[],
  commissionPercent: number,
): number => {
  const rate = commissionPercent / 100
  const calls = marginCalls.filter((call) => call.trade_id === entry.trade_id)
  const liquidationFees = calls.reduce(
    (total, call) => total + call.price * call.quantity_liquidated * rate,
    0,
  )
  const finalQuantity = calls.length
    ? Math.max(0, calls[calls.length - 1].quantity_remaining)
    : Math.abs(entry.quantity)
  const finalExitFee = exit && finalQuantity > 0 ? exit.price * finalQuantity * rate : 0
  return entry.price * Math.abs(entry.quantity) * rate + liquidationFees + finalExitFee
}

export const exitSignalName = (signal: string): string => {
  const normalized = String(signal || 'Unknown').replace(/[_\s-]/g, '').toLowerCase()
  if (normalized === 'reversal' || normalized === 'closeopposite') return 'Close Opposite'
  return String(signal || 'Unknown')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase())
    .replace(/\b(Tp|Sl|Atr|Adx|Fl)\b/g, (acronym) => acronym.toUpperCase())
}
