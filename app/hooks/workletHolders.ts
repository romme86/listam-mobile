// Module-level value holders shared by the Bare worklet bridge.
//
// The worklet is deliberately a singleton that outlives any React remount. The
// RPC object built on top of it used to be a component `useRef` that cleanup set
// to null, while the remount path restored only the worklet and then reported
// ready. Every command after a remount was silently dropped — including the
// catch-up RPC_REQUEST_SYNC — because `sendRPC` short-circuits on a null rpc.
//
// These holders are the fix, and they live in their own module for two reasons:
// nothing here imports react-native, so the lifecycle contract is unit-testable
// off-device; and the RPC message handler can close over them exactly as it
// closed over the old refs, so ~100 call sites are unchanged.
//
// The handler is created once, by whichever mount started the worklet, but must
// always talk to the CURRENT mount. That works because the only genuinely
// per-mount values (notify, i18n, the isJoining mirror) are latest-value
// holders, never identity-sensitive: the hook re-points them on every render.
// Redux `dispatch` is not per-mount at all — useAppDispatch returns the
// module-level store's dispatch.
//
// Single-consumer by design: one <AppInner/> owns the backend, exactly like the
// worklet singleton itself.

export type NotifyType = 'info' | 'success' | 'error'
export type NotifyFn = (message: string, type?: NotifyType) => void

/** The live bare-rpc instance. Survives remounts; null only before first start. */
export const rpcRef: { current: any } = { current: null }

/** The Bare worklet. Survives remounts. */
export const workletRef: { current: any } = { current: null }

/** Mirrors Redux `isJoining` so the RPC handler can read it synchronously. */
export const isJoiningRef: { current: boolean } = { current: false }

/**
 * The join request that still owns the backend, even if its overlay was
 * dismissed. Join RPCs are not cancellable, so this prevents a second join
 * from racing the first and lets only the owning completion clear its state.
 */
export const joinInFlightRef: { current: 'project' | 'list' | null } = { current: null }

export function tryBeginJoin(kind: 'project' | 'list'): boolean {
    if (joinInFlightRef.current !== null) return false
    joinInFlightRef.current = kind
    return true
}

export function finishJoin(kind: 'project' | 'list'): boolean {
    if (joinInFlightRef.current !== kind) return false
    joinInFlightRef.current = null
    return true
}

/** The current mount's snackbar/alert callback. */
export const notifyRef: { current: NotifyFn | undefined } = { current: undefined }

/** The current mount's i18n instance. */
export const i18nRef: { current: any } = { current: null }

/**
 * Reset every holder. Test-only: production code must never call this, because
 * clearing rpcRef is precisely the bug these holders exist to prevent.
 */
export function resetWorkletHolders(): void {
    rpcRef.current = null
    workletRef.current = null
    isJoiningRef.current = false
    joinInFlightRef.current = null
    notifyRef.current = undefined
    i18nRef.current = null
}
