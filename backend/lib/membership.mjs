import { keyPair, sign, verify } from 'hypercore-crypto'

export const MEMBERSHIP_RECORD_TYPE = 'membership'
export const MEMBERSHIP_RECORD_VERSION = 1
export const OWNER_BOOTSTRAP_ACTION = 'bootstrap-owner'
export const ADD_WRITER_ACTION = 'add-writer'
export const OWNER_AUTHORITY_SECRET_BYTES = 64
export const OWNER_AUTHORITY_PUBLIC_BYTES = 32
export const WRITER_KEY_BYTES = 32
export const SIGNATURE_BYTES = 64

const HEX = /^[0-9a-f]+$/i

export function createMembershipState() {
    return {
        ownerAuthorityKey: null,
        highestSequence: 0,
        writers: new Set(),
    }
}

export function cloneMembershipState(state) {
    return {
        ownerAuthorityKey: state?.ownerAuthorityKey || null,
        highestSequence: Number(state?.highestSequence) || 0,
        writers: new Set(state?.writers || []),
    }
}

export function createOwnerAuthorityKeyPair(secretKey = null) {
    if (!secretKey) return keyPair()

    const normalized = normalizeBuffer(secretKey, OWNER_AUTHORITY_SECRET_BYTES)
    if (!normalized) return null

    const derived = keyPair(normalized.subarray(0, 32))
    return bufferToHex(derived.secretKey) === bufferToHex(normalized) ? derived : null
}

export function ownerAuthorityPublicKeyHex(ownerAuthorityKeyPair) {
    return normalizeHex(ownerAuthorityKeyPair?.publicKey, OWNER_AUTHORITY_PUBLIC_BYTES)
}

export function ownerAuthoritySecretKeyHex(ownerAuthorityKeyPair) {
    return normalizeHex(ownerAuthorityKeyPair?.secretKey, OWNER_AUTHORITY_SECRET_BYTES)
}

export function ownerAuthorityMatchesState(ownerAuthorityKeyPair, state) {
    const publicKey = ownerAuthorityPublicKeyHex(ownerAuthorityKeyPair)
    return !!publicKey && !!state?.ownerAuthorityKey && state.ownerAuthorityKey === publicKey
}

export function canCreateMembershipInvite(state, ownerAuthorityKeyPair) {
    return ownerAuthorityMatchesState(ownerAuthorityKeyPair, state)
}

export function nextMembershipSequence(state) {
    return Math.max(0, Number(state?.highestSequence) || 0) + 1
}

export function createOwnerBootstrapRecord({
    ownerAuthorityKeyPair,
    writerKey,
    baseKey,
    createdAt = Date.now(),
}) {
    return createSignedMembershipRecord({
        action: OWNER_BOOTSTRAP_ACTION,
        ownerAuthorityKeyPair,
        writerKey,
        baseKey,
        sequence: 1,
        createdAt,
    })
}

export function createAddWriterMembershipRecord({
    ownerAuthorityKeyPair,
    writerKey,
    baseKey,
    sequence,
    createdAt = Date.now(),
}) {
    return createSignedMembershipRecord({
        action: ADD_WRITER_ACTION,
        ownerAuthorityKeyPair,
        writerKey,
        baseKey,
        sequence,
        createdAt,
    })
}

export function createSignedMembershipRecord({
    action,
    ownerAuthorityKeyPair,
    writerKey,
    baseKey,
    sequence,
    createdAt = Date.now(),
}) {
    const body = normalizeMembershipBody({
        type: MEMBERSHIP_RECORD_TYPE,
        version: MEMBERSHIP_RECORD_VERSION,
        action,
        baseKey,
        ownerAuthorityKey: ownerAuthorityPublicKeyHex(ownerAuthorityKeyPair),
        writerKey,
        sequence,
        createdAt,
    })
    if (!body) throw new Error('Invalid membership record body')

    const secretKey = normalizeBuffer(ownerAuthorityKeyPair?.secretKey, OWNER_AUTHORITY_SECRET_BYTES)
    if (!secretKey) throw new Error('Invalid owner authority key pair')

    return {
        ...body,
        signature: bufferToHex(sign(Buffer.from(membershipSigningPayload(body)), secretKey)),
    }
}

export function isMembershipRecord(value) {
    return value?.type === MEMBERSHIP_RECORD_TYPE
}

export function reduceMembershipOperation(record, state = createMembershipState(), options = {}) {
    const current = cloneMembershipState(state)
    const body = normalizeMembershipBody(record)
    if (!body) return rejected('malformed', current)

    const expectedBaseKey = normalizeHex(options.baseKey, WRITER_KEY_BYTES)
    if (expectedBaseKey && body.baseKey !== expectedBaseKey) {
        return rejected('wrong-base', current)
    }

    const signature = normalizeHex(record.signature, SIGNATURE_BYTES)
    if (!signature) return rejected('unsigned', current)

    const verified = verify(
        Buffer.from(membershipSigningPayload(body)),
        Buffer.from(signature, 'hex'),
        Buffer.from(body.ownerAuthorityKey, 'hex'),
    )
    if (!verified) return rejected('bad-signature', current)

    if (body.action === OWNER_BOOTSTRAP_ACTION) {
        if (current.ownerAuthorityKey) return rejected('owner-exists', current)
        if (body.sequence !== 1) return rejected('invalid-sequence', current)

        const next = cloneMembershipState(current)
        next.ownerAuthorityKey = body.ownerAuthorityKey
        next.highestSequence = body.sequence
        next.writers.add(body.writerKey)
        return accepted(next, null)
    }

    if (body.action === ADD_WRITER_ACTION) {
        if (!current.ownerAuthorityKey) return rejected('missing-owner', current)
        if (body.ownerAuthorityKey !== current.ownerAuthorityKey) return rejected('wrong-owner', current)
        if (body.sequence <= current.highestSequence) return rejected('replay', current)

        const next = cloneMembershipState(current)
        next.highestSequence = body.sequence
        const alreadyKnown = next.writers.has(body.writerKey)
        next.writers.add(body.writerKey)
        return accepted(next, alreadyKnown ? null : { addWriterKey: body.writerKey })
    }

    return rejected('unknown-action', current)
}

function accepted(state, effect) {
    return {
        ok: true,
        state,
        effect,
        reason: null,
    }
}

function rejected(reason, state) {
    return {
        ok: false,
        state,
        effect: null,
        reason,
    }
}

function normalizeMembershipBody(raw) {
    const action = raw?.action
    if (action !== OWNER_BOOTSTRAP_ACTION && action !== ADD_WRITER_ACTION) return null

    const baseKey = normalizeHex(raw?.baseKey, WRITER_KEY_BYTES)
    const ownerAuthorityKey = normalizeHex(raw?.ownerAuthorityKey, OWNER_AUTHORITY_PUBLIC_BYTES)
    const writerKey = normalizeHex(raw?.writerKey, WRITER_KEY_BYTES)
    const sequence = Number(raw?.sequence)
    const createdAt = Number(raw?.createdAt)

    if (raw?.type !== MEMBERSHIP_RECORD_TYPE) return null
    if (Number(raw?.version) !== MEMBERSHIP_RECORD_VERSION) return null
    if (!baseKey || !ownerAuthorityKey || !writerKey) return null
    if (!Number.isSafeInteger(sequence) || sequence <= 0) return null
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null

    return {
        type: MEMBERSHIP_RECORD_TYPE,
        version: MEMBERSHIP_RECORD_VERSION,
        action,
        baseKey,
        ownerAuthorityKey,
        writerKey,
        sequence,
        createdAt,
    }
}

function membershipSigningPayload(body) {
    return JSON.stringify({
        type: body.type,
        version: body.version,
        action: body.action,
        baseKey: body.baseKey,
        ownerAuthorityKey: body.ownerAuthorityKey,
        writerKey: body.writerKey,
        sequence: body.sequence,
        createdAt: body.createdAt,
    })
}

function normalizeHex(value, bytes) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return bufferToHex(value, bytes)
    }
    if (typeof value !== 'string') return null
    const hex = value.trim().toLowerCase()
    return HEX.test(hex) && hex.length === bytes * 2 ? hex : null
}

function normalizeBuffer(value, bytes) {
    const hex = normalizeHex(value, bytes)
    return hex ? Buffer.from(hex, 'hex') : null
}

function bufferToHex(value, bytes = null) {
    if (!value) return null
    const buffer = Buffer.from(value)
    if (bytes != null && buffer.length !== bytes) return null
    return buffer.toString('hex')
}
