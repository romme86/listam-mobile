// Translation of the backend's machine-readable join/network vocabulary into
// catalog keys, plus the copy-pasteable field bundle.
//
// This is deliberately a pure module with no react-native imports, so node:test
// can cover it directly. It exists because the 2026-08-26 4G pairing failure
// produced no evidence anyone could act on: the guest saw an untranslated
// `Error.message` ("Pairing timed out") and the phone had no log sink at all.
// Getting this mapping wrong is what makes the next field failure undiagnosable,
// so it is the part that gets tests.

import type { MessageKey } from '@listam/i18n'

// The reasons the backend broadcasts on `join-error` (JOIN_REASON in
// @listam/backend's pairing-tuning). Kept exhaustive on purpose: an unmapped
// reason falls through to `unknown`, which is honest, but a missing entry here
// is a silent downgrade of copy the catalog already has.
const JOIN_FAILURE_KEYS: Record<string, MessageKey> = {
    'timeout': 'joining.failed.timeout',
    'invite-used': 'joining.failed.inviteUsed',
    'invite-expired': 'joining.failed.inviteExpired',
    'invite-invalid': 'joining.failed.inviteInvalid',
    'rejected': 'joining.failed.rejected',
    'no-network': 'joining.failed.noNetwork',
    'cancelled': 'joining.failed.cancelled',
    'incomplete-credentials': 'joining.failed.incompleteCredentials',
    'unknown': 'joining.failed.unknown',
}

/**
 * Copy for a whole-project join failure. Never returns the backend's raw
 * English message — that is exactly what users saw in the field.
 */
export function joinFailureMessageKey(reason?: string | null): MessageKey {
    if (!reason) return 'joining.failed.unknown'
    return JOIN_FAILURE_KEYS[reason] ?? 'joining.failed.unknown'
}

// RPC_JOIN_LIST answers from its own, older vocabulary (backend.mjs `joinList`),
// which never adopted JOIN_REASON — its catch collapses every transport failure
// into 'join-failed'. Fold the ones that mean the same thing onto the same copy
// so a list join finally says something; the structural refusals below are
// deliberately absent, because "ask for a fresh invite code" is wrong advice for
// a list-id conflict or a blocked built-in surface.
const LIST_JOIN_FAILURE_KEYS: Record<string, MessageKey> = {
    'join-timeout': 'joining.failed.timeout',
    'bad-invite': 'joining.failed.inviteInvalid',
    'not-ready': 'joining.failed.noNetwork',
    // The common real-world outcome on carrier NAT, and the least informative
    // one the backend can give us. 'unknown' at least tells the user what to do.
    'join-failed': 'joining.failed.unknown',
}

/**
 * Copy for a single-list join failure. Falls back to the list-specific string
 * for refusals that are not about the invite or the network.
 */
export function listJoinFailureMessageKey(reason?: string | null): MessageKey {
    if (!reason) return 'joinList.failed'
    return LIST_JOIN_FAILURE_KEYS[reason] ?? JOIN_FAILURE_KEYS[reason] ?? 'joinList.failed'
}

// Mirrors JOIN_SLOW_HINT_MS in @listam/backend's pairing-tuning: the point at
// which a join is slow enough that silence reads as "broken".
export const JOIN_SLOW_HINT_MS = 20000

/**
 * The one hint under the spinner, or null while there is nothing useful to say.
 *
 * `relayed` outranks the slow hint even before 20s: it explains WHY this is
 * taking long AND that it will still work, which is the calmer of the two.
 */
export function joinHintMessageKey(elapsedMs: number, relayed: boolean): MessageKey | null {
    if (relayed) return 'joining.hint.relayed'
    if (Number.isFinite(elapsedMs) && elapsedMs >= JOIN_SLOW_HINT_MS) return 'joining.hint.slow'
    return null
}

/** Milliseconds left on an invite, or null when the backend did not date it. */
export function inviteRemainingMs(expiresAt: number | null | undefined, now: number): number | null {
    if (!Number.isFinite(expiresAt as number)) return null
    return Math.max(0, (expiresAt as number) - now)
}

/**
 * `invite.expiresIn {time}` — m:ss, not "9 minutes". The window is ~10 minutes,
 * so rounding to whole minutes hides precisely the part the sharer needs when
 * they are deciding whether to send this code or mint a new one.
 */
export function formatInviteCountdown(msRemaining: number): string {
    const total = Math.max(0, Math.ceil((Number.isFinite(msRemaining) ? msRemaining : 0) / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export type NetDiagnostics = {
    bootstrapped?: boolean
    online?: boolean
    firewalled?: boolean | null
    randomized?: boolean | null
    punches?: number | null
    relaying?: number | null
    relayConfigured?: number
    tempConnections?: number
    mainConnections?: number
}

/**
 * True when this network blocks direct connections and everything has to be
 * relayed — the carrier-NAT signature behind the field failure.
 */
export function isRelayedNetwork(diagnostics: NetDiagnostics | null | undefined): boolean {
    return diagnostics?.randomized === true
}

const DIAGNOSTIC_FIELDS: readonly (keyof NetDiagnostics)[] = [
    'bootstrapped',
    'online',
    'firewalled',
    'randomized',
    'punches',
    'relaying',
    'relayConfigured',
    'tempConnections',
    'mainConnections',
]

/**
 * The text the Settings row puts on the clipboard. Plain lines rather than JSON:
 * it is pasted into a chat message by a non-technical user, and it has to stay
 * readable after whatever that app does to whitespace.
 *
 * Log lines are already redacted twice backend-side (once on write, once in
 * logTail) — nothing here may add anything that was not in that bundle.
 */
export function formatDiagnosticsBundle(input: {
    diagnostics?: NetDiagnostics | null
    logLines?: readonly string[]
    dropped?: number
    platform?: string
    appVersion?: string
    now?: number
}): string {
    const {
        diagnostics = null,
        logLines = [],
        dropped = 0,
        platform = 'unknown',
        appVersion,
        now = Date.now(),
    } = input

    const lines = ['Listam network diagnostics', new Date(now).toISOString(), `platform: ${platform}`]
    if (appVersion) lines.push(`app: ${appVersion}`)

    if (diagnostics) {
        for (const field of DIAGNOSTIC_FIELDS) {
            const value = diagnostics[field]
            lines.push(`${field}: ${value === undefined || value === null ? 'n/a' : String(value)}`)
        }
    } else {
        // Say so rather than emitting a bundle that merely looks empty — "the
        // backend never answered" is itself the most important finding.
        lines.push('diagnostics: unavailable (backend did not answer)')
    }

    lines.push(`log: ${logLines.length} lines${dropped > 0 ? `, ${dropped} dropped` : ''}`)
    lines.push('---')
    for (const line of logLines) lines.push(String(line))

    return lines.join('\n')
}
