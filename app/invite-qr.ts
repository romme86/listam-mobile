import { parseInviteQrPayload, type InviteQrScope } from '@listam/protocol'

export type ScannedInviteQrResult =
    | { status: 'ok'; invite: string; scope: InviteQrScope; legacy: boolean }
    | { status: 'scope-mismatch'; scope: InviteQrScope }
    | { status: 'invalid' }

const LEGACY_INVITE_RE = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{106}$/

/**
 * Parse an in-app camera result without letting a list invite fall through to
 * the destructive project path. Old raw codes and trusted Listam join links
 * predate typed QR payloads, so they inherit the Join dialog's current scope.
 */
export function parseScannedInviteQr(
    raw: string,
    expectedScope: InviteQrScope,
): ScannedInviteQrResult {
    const typed = parseInviteQrPayload(raw)
    if (typed) {
        if (typed.scope !== expectedScope) {
            return { status: 'scope-mismatch', scope: typed.scope }
        }
        return { status: 'ok', invite: typed.invite, scope: typed.scope, legacy: false }
    }

    const invite = legacyInviteFromQr(raw)
    if (!invite) return { status: 'invalid' }
    return { status: 'ok', invite, scope: expectedScope, legacy: true }
}

function legacyInviteFromQr(raw: string): string {
    const trimmed = raw.trim()
    // A malformed/unknown typed envelope must never be reinterpreted as a
    // legacy invite and lose its explicit scope.
    if (trimmed.toLowerCase().startsWith('listam-invite:')) return ''

    if (trimmed.includes('://')) {
        try {
            const url = new URL(trimmed)
            const protocol = url.protocol.toLowerCase()
            const host = url.hostname.toLowerCase()
            const isWebInvite = protocol === 'https:'
                && (host === 'listam.ch' || host === 'www.listam.ch')
                && (url.pathname === '/join' || url.pathname === '/join/')
            const isAppInvite = protocol === 'ch.saynode.listam:' && host === 'join'
            if (!isWebInvite && !isAppInvite) return ''
            return normalizeLegacyInvite(url.searchParams.get('invite') || '')
        } catch {
            return ''
        }
    }

    return normalizeLegacyInvite(trimmed)
}

function normalizeLegacyInvite(raw: string): string {
    const normalized = raw.trim().replace(/\s+/g, '').toLowerCase()
    return LEGACY_INVITE_RE.test(normalized) ? normalized : ''
}
