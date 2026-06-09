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
    copy?: Partial<JoinConfirmationCopy>
}

export type JoinConfirmationCopy = {
    invalidNotification: string
    busyNotification: string
    promptOpenNotification: string
    title: string
    sourceLink: (sourceLabel: string) => string
    sourceManual: string
    message: (sourceText: string, trustWarning: string) => string
    untrustedWarning: string
    sourceLabel: (sourceLabel: string) => string
}

const DEFAULT_JOIN_CONFIRMATION_COPY: JoinConfirmationCopy = {
    invalidNotification: 'Enter a valid invite key or link',
    busyNotification: 'Already joining an invite',
    promptOpenNotification: 'Finish the current invite prompt first',
    title: 'Join this Listam invite?',
    sourceLink: (sourceLabel) => `This link from ${sourceLabel} contains a Listam invite.`,
    sourceManual: 'This invite code will start a Listam join.',
    message: (sourceText, trustWarning) => (
        `${sourceText}\n\nJoining switches this device to the invited list and gives up ownership of your current list on this device. You will not be able to switch back to it here. Invites can be revoked before use, but removing a device after it joins requires a future re-key flow.${trustWarning}`
    ),
    untrustedWarning: '\n\nWarning: This link is not from listam.ch. Only continue if you trust whoever sent it.',
    sourceLabel: (sourceLabel) => sourceLabel,
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
    const copy = createJoinConfirmationCopy(options.copy)
    const invite = extractInviteFromInput(rawInvite)
    if (!invite) {
        return {
            status: 'invalid',
            invite: '',
            pendingInvite: options.pendingInvite,
            notification: copy.invalidNotification,
        }
    }

    if (options.isJoining) {
        return {
            status: 'busy',
            invite,
            pendingInvite: options.pendingInvite,
            notification: copy.busyNotification,
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
            notification: copy.promptOpenNotification,
        }
    }

    const sourceLabel = copy.sourceLabel(options.sourceLabel || 'an external source')
    const sourceText = options.source === 'link'
        ? copy.sourceLink(sourceLabel)
        : copy.sourceManual

    const trustWarning = options.source === 'link' && options.trusted === false
        ? copy.untrustedWarning
        : ''

    return {
        status: 'needs-confirmation',
        invite,
        pendingInvite: invite,
        title: copy.title,
        message: copy.message(sourceText, trustWarning),
    }
}

// Build a confirmation request from an incoming deep link. Returns null when
// the link is not a Listam invite link, so callers can ignore it silently.
export function planIncomingLinkJoin(
    rawUrl: string,
    options: { pendingInvite: string; isJoining: boolean; copy?: Partial<JoinConfirmationCopy> }
): JoinConfirmationRequest | null {
    const parsed = parseInviteLink(rawUrl)
    if (!parsed) return null

    return createJoinConfirmationRequest(parsed.invite, {
        source: 'link',
        pendingInvite: options.pendingInvite,
        isJoining: options.isJoining,
        sourceLabel: parsed.sourceLabel,
        trusted: parsed.trusted,
        copy: options.copy,
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

function createJoinConfirmationCopy(copy?: Partial<JoinConfirmationCopy>): JoinConfirmationCopy {
    return {
        ...DEFAULT_JOIN_CONFIRMATION_COPY,
        ...copy,
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
