import test from 'node:test'
import assert from 'node:assert/strict'
import {
    INVITE_MAX_USES,
    INVITE_TTL_MS,
    consumeInviteUse,
    inviteExpiresInMs,
    isInviteUsable,
    withInvitePolicy,
} from './invite-policy.mjs'

test('new invites are single-use and short-lived', () => {
    const now = 1000
    const invite = withInvitePolicy({ invite: Buffer.from('abc') }, now)

    assert.equal(INVITE_MAX_USES, 1)
    assert.equal(invite.expires, now + INVITE_TTL_MS)
    assert.equal(isInviteUsable(invite, INVITE_MAX_USES, now), true)
})

test('expired, exhausted, and legacy invites are not usable', () => {
    const now = 1000
    const invite = withInvitePolicy({ invite: Buffer.from('abc') }, now)

    assert.equal(isInviteUsable(invite, 0, now), false)
    assert.equal(isInviteUsable(invite, 1, now + INVITE_TTL_MS), false)
    assert.equal(isInviteUsable({ invite: Buffer.from('abc') }, 1, now), false)
    assert.equal(isInviteUsable(null, 1, now), false)
})

test('using an invite exhausts it and reports remaining lifetime', () => {
    const now = 1000
    const invite = withInvitePolicy({ invite: Buffer.from('abc') }, now)

    assert.equal(consumeInviteUse(1), 0)
    assert.equal(consumeInviteUse(0), 0)
    assert.equal(inviteExpiresInMs(invite, now + 2000), INVITE_TTL_MS - 2000)
    assert.equal(inviteExpiresInMs(invite, now + INVITE_TTL_MS + 1), 0)
})
