export type JoinInviteSource = 'link' | 'manual'
export type JoinConfirmationStatus =
    | 'invalid'
    | 'busy'
    | 'already-pending'
    | 'confirmation-open'
    | 'needs-confirmation'

export type JoinConfirmationRequest = {
    status: JoinConfirmationStatus
    invite: string
    pendingInvite: string
    title?: string
    message?: string
    notification?: string
}

type JoinConfirmationOptions = {
    source: JoinInviteSource
    pendingInvite: string
    isJoining: boolean
    sourceLabel?: string
    trusted?: boolean
}

// Hosts (and the custom scheme) that Listam itself generates invite links for.
// A link from anywhere else still requires confirmation, but is flagged as
// untrusted so the user can spot a phishing link before switching bases.
export const LISTAM_INVITE_HOSTS = ['listam.ch', 'www.listam.ch']
export const LISTAM_INVITE_SCHEME = 'listam:'

export type ParsedInviteLink = {
    invite: string
    sourceLabel: string
    trusted: boolean
}

export function normalizeInvite(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, '')
}

export function extractInviteFromInput(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''

    if (trimmed.includes('://')) {
        const inviteFromUrl = extractInviteFromUrl(trimmed)
        if (inviteFromUrl) return normalizeInvite(inviteFromUrl)
    }

    return normalizeInvite(trimmed)
}

// Strict parse of a deep link into an invite plus a description of where it
// came from. Returns null when the URL is not a Listam invite link at all, so
// unrelated links the OS hands us are ignored instead of prompting a join.
export function parseInviteLink(rawUrl: string): ParsedInviteLink | null {
    const trimmed = rawUrl.trim()
    if (!trimmed) return null

    let url: URL | null = null
    try {
        url = new URL(trimmed)
    } catch {
        return null
    }

    const inviteParam = url.searchParams.get('invite')
    const invite = normalizeInvite(inviteParam)
    if (!invite) return null

    const isCustomScheme = url.protocol.toLowerCase() === LISTAM_INVITE_SCHEME
    const host = url.hostname.toLowerCase()
    const trusted = isCustomScheme || LISTAM_INVITE_HOSTS.includes(host)
    const sourceLabel = isCustomScheme
        ? 'the Listam app'
        : host || 'an unknown source'

    return { invite, sourceLabel, trusted }
}

export function createJoinConfirmationRequest(
    rawInvite: string,
    options: JoinConfirmationOptions
): JoinConfirmationRequest {
    const invite = extractInviteFromInput(rawInvite)
    if (!invite) {
        return {
            status: 'invalid',
            invite: '',
            pendingInvite: options.pendingInvite,
            notification: 'Enter a valid invite key or link',
        }
    }

    if (options.isJoining) {
        return {
            status: 'busy',
            invite,
            pendingInvite: options.pendingInvite,
            notification: 'Already joining an invite',
        }
    }

    if (options.pendingInvite === invite) {
        return {
            status: 'already-pending',
            invite,
            pendingInvite: options.pendingInvite,
        }
    }

    // A confirmation for a *different* invite is already on screen. Suppress
    // this one instead of stacking a second dialog over it.
    if (options.pendingInvite) {
        return {
            status: 'confirmation-open',
            invite,
            pendingInvite: options.pendingInvite,
            notification: 'Finish the current invite prompt first',
        }
    }

    const sourceText = options.source === 'link'
        ? `This link from ${options.sourceLabel || 'an external source'} contains a Listam invite.`
        : 'This invite code will start a Listam join.'

    const trustWarning = options.source === 'link' && options.trusted === false
        ? '\n\n⚠️ This link is not from listam.ch — only continue if you trust whoever sent it.'
        : ''

    return {
        status: 'needs-confirmation',
        invite,
        pendingInvite: invite,
        title: 'Join this Listam invite?',
        message: `${sourceText}\n\nJoining switches this device to the invited list and gives up ownership of your current list on this device — you will not be able to switch back to it here. Invites can be revoked before use, but removing a device after it joins requires a future re-key flow.${trustWarning}`,
    }
}

// Build a confirmation request from an incoming deep link. Returns null when
// the link is not a Listam invite link, so callers can ignore it silently.
export function planIncomingLinkJoin(
    rawUrl: string,
    options: { pendingInvite: string; isJoining: boolean }
): JoinConfirmationRequest | null {
    const parsed = parseInviteLink(rawUrl)
    if (!parsed) return null

    return createJoinConfirmationRequest(parsed.invite, {
        source: 'link',
        pendingInvite: options.pendingInvite,
        isJoining: options.isJoining,
        sourceLabel: parsed.sourceLabel,
        trusted: parsed.trusted,
    })
}

export function resolveJoinConfirmation(
    pendingInvite: string,
    invite: string,
    confirmed: boolean
): { pendingInvite: string; confirmedInvite: string } {
    if (pendingInvite !== invite) {
        return { pendingInvite, confirmedInvite: '' }
    }

    return {
        pendingInvite: '',
        confirmedInvite: confirmed ? invite : '',
    }
}

function extractInviteFromUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl)
        return url.searchParams.get('invite') || ''
    } catch {
        const match = rawUrl.match(/[?&]invite=([^&#]+)/)
        if (!match) return ''
        try {
            return decodeURIComponent(match[1].replace(/\+/g, ' '))
        } catch {
            return match[1]
        }
    }
}
