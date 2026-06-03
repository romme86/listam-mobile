export const INVITE_MAX_USES = 1
export const INVITE_TTL_MS = 10 * 60 * 1000

export function withInvitePolicy(invite, now = Date.now()) {
    if (!invite) return null
    return {
        ...invite,
        expires: now + INVITE_TTL_MS
    }
}

export function isInviteUsable(invite, usesRemaining, now = Date.now()) {
    if (!invite) return false
    if (usesRemaining <= 0) return false
    if (!Number.isFinite(invite.expires)) return false
    return now < invite.expires
}

export function consumeInviteUse(usesRemaining) {
    return Math.max(0, usesRemaining - 1)
}

export function inviteExpiresInMs(invite, now = Date.now()) {
    if (!invite || !Number.isFinite(invite.expires)) return 0
    return Math.max(0, invite.expires - now)
}
