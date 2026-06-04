export type JoinInviteSource = 'link' | 'manual'
export type JoinConfirmationStatus = 'invalid' | 'busy' | 'already-pending' | 'needs-confirmation'

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

    const sourceText = options.source === 'link'
        ? 'This link contains a Listam invite.'
        : 'This invite code will start a Listam join.'

    return {
        status: 'needs-confirmation',
        invite,
        pendingInvite: invite,
        title: 'Join this Listam invite?',
        message: `${sourceText}\n\nJoining may switch this device from your current list base to the invited one. The invite grants writer access until a future re-key flow exists.`,
    }
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
