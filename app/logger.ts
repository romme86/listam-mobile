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

    if (level === 'error' || level === 'fatal') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

export const appLogger = createLogger({ app: 'mobile', write: writeMobileLine })
