// Which swarm-lifecycle RPC an AppState transition calls for.
//
// Pulled out of the AppInner effect purely so it can be tested: as an inline
// condition this was invisible, and it was already wrong once. The first version
// suspended on `prev === 'active' && next === 'background'`, which on iOS can
// never be true — iOS always steps active → inactive → background, so by the
// time 'background' arrives the previous state is 'inactive'. The swarm was
// therefore never suspended, and because resumeNetwork() early-returns unless
// `swarm.suspended`, the resume was dead as well. The entire mobile half of the
// 4G pairing fix silently did nothing on the platform it was written for.
//
// react-native-bare-kit gets this right by keying on the destination state alone
// (`switch (state) { case 'active': resume(); case 'background': suspend() }`,
// index.js:291-297). We match it.

import type { AppStateStatus } from 'react-native'

export type NetLifecycleAction = 'suspend' | 'resume' | null

/**
 * @param prev the state we were in before this event
 * @param next the state this event announces
 * @returns 'suspend' on entering the background, 'resume' on returning to the
 *   foreground from inactive/background, null for every other transition.
 */
export function netLifecycleAction(prev: AppStateStatus, next: AppStateStatus): NetLifecycleAction {
    // Destination-only, like Bare Kit. 'inactive' is deliberately NOT a suspend:
    // the iOS share sheet — the very flow that hands over an invite code — puts
    // the app in 'inactive', and churning the swarm on every share would undo
    // the thing this is here to fix.
    if (next === 'background') return 'suspend'
    if (next === 'active' && (prev === 'inactive' || prev === 'background')) return 'resume'
    return null
}

type LifecycleOptions = {
    request: (action: 'suspend' | 'resume', timeoutMs: number) => Promise<string | null>
    suspendRuntime: (lingerMs: number) => void
    catchUp: () => void
    report: (safeToSleep: boolean, reason: string) => void
    budgetMs?: number
}

// Bare Kit handles the native AppState resume. Give its background suspend a
// finite linger, then shorten that to zero once the backend confirms its drain.
// Generation checks prevent an old reply from freezing a foreground worklet.
export function createAppLifecycleCoordinator({ request, suspendRuntime, catchUp, report, budgetMs = 10000 }: LifecycleOptions) {
    let generation = 0
    let disposed = false
    async function transition(action: NetLifecycleAction) {
        if (!action || disposed) return
        const mine = ++generation
        if (action === 'suspend') suspendRuntime(budgetMs)
        let raw: string | null = null
        try { raw = await request(action, budgetMs - 500) } catch { /* deadline/error is not a drain */ }
        if (disposed || mine !== generation) return
        let result: { safeToSleep?: boolean, reason?: string } = {}
        try { result = raw ? JSON.parse(raw) : {} } catch { /* older/unavailable backend */ }
        if (action === 'resume') { catchUp(); return }
        const safe = result.safeToSleep === true
        report(safe, result.reason ?? 'unavailable')
        // If not drained, native linger enforces the existing hard budget;
        // pending durable work gets another attempt on the next foreground.
        if (safe) suspendRuntime(0)
    }
    return { transition, dispose() { disposed = true; generation++ } }
}
