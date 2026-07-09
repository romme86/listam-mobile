// Tap-cadence recognizers for the triple-tap capture gesture (Overview).
// Pure and timer-free at the core — callers own any timers — so both modes are
// unit-testable with fake clocks.

/** Max gap between consecutive taps for them to count as one cadence. */
export const TRIPLE_TAP_MS = 300

export type RowTapDecision = 'pass' | 'capture'

/**
 * Row mode: single taps keep their instant behavior (the row toggle flips in
 * place and settles later — see index.tsx handleToggleDone), so taps 1 and 2
 * "pass" through; a third tap within the window is diverted to "capture".
 */
export function createRowTapCadence(windowMs: number = TRIPLE_TAP_MS) {
    let count = 0
    let lastTs = 0
    return {
        register(now: number): RowTapDecision {
            count = now - lastTs < windowMs ? count + 1 : 1
            lastTs = now
            if (count >= 3) {
                count = 0
                lastTs = 0
                return 'capture'
            }
            return 'pass'
        },
        reset() {
            count = 0
            lastTs = 0
        },
    }
}

export type CardTapDecision = 'wait' | 'capture'

/**
 * Card mode: a card's single tap opens its detail, so taps can't pass through —
 * every tap answers "wait" while the cadence could still become a triple, and
 * the caller opens the detail only when settle() confirms the cadence ended
 * with fewer than three taps. The third tap answers "capture" immediately.
 */
export function createCardTapCadence(windowMs: number = TRIPLE_TAP_MS) {
    let count = 0
    let lastTs = 0
    return {
        register(now: number): CardTapDecision {
            count = now - lastTs < windowMs ? count + 1 : 1
            lastTs = now
            if (count >= 3) {
                count = 0
                lastTs = 0
                return 'capture'
            }
            return 'wait'
        },
        /** Ends the cadence; true = at least one tap was waiting (open once). */
        settle(): boolean {
            const hadTaps = count > 0
            count = 0
            lastTs = 0
            return hadTaps
        },
        reset() {
            count = 0
            lastTs = 0
        },
    }
}
