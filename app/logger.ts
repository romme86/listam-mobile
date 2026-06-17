import { createLogger } from '@listam/logging'

// React Native's LogBox turns every console.error() call into a red "Console
// Error" overlay. The logging package defaults its writer to console.error for
// all levels (correct for Node, where stderr is conventional), so without an
// explicit writer even an info log would pop a red box. Route by level instead:
// real errors stay on console.error, warnings on console.warn, everything else
// on console.log so it never surfaces as a spurious error overlay.
function writeMobileLine(line: string): void {
    let level = 'info'
    try {
        level = JSON.parse(line).level
    } catch {
        // Non-JSON line (shouldn't happen) — treat as info.
    }

    // eslint-disable-next-line no-console -- deliberate console writer; see comment above
    if (level === 'error' || level === 'fatal') console.error(line)
    // eslint-disable-next-line no-console -- deliberate console writer; see comment above
    else if (level === 'warn') console.warn(line)
    // eslint-disable-next-line no-console -- deliberate console writer; see comment above
    else console.log(line)
}

export const appLogger = createLogger({ app: 'mobile', write: writeMobileLine })
