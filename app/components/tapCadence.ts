// Tap-cadence recognizers for the triple-tap capture gesture (Overview).
// Pure and timer-free at the core — callers own any timers — so both modes are
// unit-testable with fake clocks.

/** Max gap between consecutive taps for them to count as one cadence. */
export const TRIPLE_TAP_MS = 300

export type RowTapDecision = 'wait' | 'add' | 'capture'
export type RowTapOutcome = 'none' | 'toggle' | 'add'

/**
 * Row mode: a single tap toggles done, a double-tap opens the add bar, and —
 * when the Overview is enabled — a triple-tap captures the item into it. A
 * toggle must not pre-empt a still-arriving second/third tap, so no tap acts on
 * its own: `register` answers 'wait' and the caller settles after the window.
 *
 *  - register(now, tripleEnabled): 'capture' fires at once on the 3rd tap (only
 *    when tripleEnabled). With tripleEnabled off there is no third outcome, so
 *    the 2nd tap answers 'add' immediately — no need to keep waiting. Else 'wait'.
 *  - settle(): resolves a waiting cadence once the window elapses — 1 tap =
 *    'toggle', 2 taps = 'add', nothing pending = 'none'.
 */
export function createRowTapCadence(windowMs: number = TRIPLE_TAP_MS) {
    let count = 0
    let lastTs = 0
    const reset = () => {
        count = 0
        lastTs = 0
    }
    return {
        register(now: number, tripleEnabled: boolean = true): RowTapDecision {
            count = now - lastTs < windowMs ? count + 1 : 1
            lastTs = now
            if (tripleEnabled && count >= 3) {
                reset()
                return 'capture'
            }
            if (!tripleEnabled && count >= 2) {
                reset()
                return 'add'
            }
            return 'wait'
        },
        settle(): RowTapOutcome {
            const n = count
            reset()
            if (n <= 0) return 'none'
            return n === 1 ? 'toggle' : 'add'
        },
        reset,
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
