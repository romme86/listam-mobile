type Tap = { x: number; y: number; time: number }

// Feed completed background presses only. Scrolls/long presses reset the pair;
// a triple tap can create only one element, and distant taps never pair up.
export function createDoubleTap() {
    let previous: Tap | null = null
    return {
        reset() { previous = null },
        tap(current: Tap): boolean {
            const matched = previous !== null
                && current.time >= previous.time
                && current.time - previous.time <= 300
                && Math.hypot(current.x - previous.x, current.y - previous.y) <= 24
            previous = matched ? null : current
            return matched
        },
    }
}
