// Device-local paywall reminder cadence. Dismissal numbers are one-based:
// first -> two calendar months, second -> three, every later dismissal -> year.
export function paywallDeferralMonths(dismissalNumber: number): number {
    if (dismissalNumber <= 1) return 2
    if (dismissalNumber === 2) return 3
    return 12
}

// Calendar arithmetic keeps the reminder aligned with the user's dismissal
// date. Clamp month-end dates (for example, 31 January + 2 months -> 31 March).
export function addCalendarMonths(timestamp: number, months: number): number {
    const source = new Date(timestamp)
    if (!Number.isFinite(timestamp) || Number.isNaN(source.getTime())) return timestamp

    const day = source.getDate()
    const result = new Date(source)
    result.setDate(1)
    result.setMonth(result.getMonth() + months)
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
    result.setDate(Math.min(day, lastDay))
    return result.getTime()
}

export function nextPaywallAt(now: number, dismissalNumber: number): number {
    return addCalendarMonths(now, paywallDeferralMonths(dismissalNumber))
}
