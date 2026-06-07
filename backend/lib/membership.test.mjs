import test from 'node:test'
import assert from 'node:assert/strict'
import {
    ADD_WRITER_ACTION,
    createAddWriterMembershipRecord,
    createMembershipState,
    createOwnerAuthorityKeyPair,
    createOwnerBootstrapRecord,
    nextMembershipSequence,
    ownerAuthorityPublicKeyHex,
    reduceMembershipOperation,
} from './membership.mjs'

const baseKey = Buffer.from('a'.repeat(64), 'hex')
const ownerWriterKey = Buffer.from('b'.repeat(64), 'hex')
const guestWriterKey = Buffer.from('c'.repeat(64), 'hex')

test('owner bootstrap migrates a legacy single-user base once', () => {
    const owner = createOwnerAuthorityKeyPair()
    const bootstrap = createOwnerBootstrapRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: ownerWriterKey,
        baseKey,
        createdAt: 1000,
    })

    const result = reduceMembershipOperation(bootstrap, createMembershipState(), { baseKey })

    assert.equal(result.ok, true)
    assert.equal(result.state.ownerAuthorityKey, ownerAuthorityPublicKeyHex(owner))
    assert.equal(result.state.highestSequence, 1)
    assert.equal(result.state.writers.has(ownerWriterKey.toString('hex')), true)

    const second = reduceMembershipOperation(bootstrap, result.state, { baseKey })
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'owner-exists')
})

test('owner-signed add-writer records produce a writer-add effect', () => {
    const owner = createOwnerAuthorityKeyPair()
    const bootstrap = createOwnerBootstrapRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: ownerWriterKey,
        baseKey,
        createdAt: 1000,
    })
    const bootstrapped = reduceMembershipOperation(bootstrap, createMembershipState(), { baseKey }).state
    const addWriter = createAddWriterMembershipRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: guestWriterKey,
        baseKey,
        sequence: nextMembershipSequence(bootstrapped),
        createdAt: 2000,
    })

    const result = reduceMembershipOperation(addWriter, bootstrapped, { baseKey })

    assert.equal(result.ok, true)
    assert.deepEqual(result.effect, { addWriterKey: guestWriterKey.toString('hex') })
    assert.equal(result.state.highestSequence, 2)
    assert.equal(result.state.writers.has(guestWriterKey.toString('hex')), true)
})

test('non-owner and cross-base membership additions are rejected', () => {
    const owner = createOwnerAuthorityKeyPair()
    const nonOwner = createOwnerAuthorityKeyPair()
    const bootstrap = createOwnerBootstrapRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: ownerWriterKey,
        baseKey,
        createdAt: 1000,
    })
    const state = reduceMembershipOperation(bootstrap, createMembershipState(), { baseKey }).state

    const nonOwnerAdd = createAddWriterMembershipRecord({
        ownerAuthorityKeyPair: nonOwner,
        writerKey: guestWriterKey,
        baseKey,
        sequence: nextMembershipSequence(state),
        createdAt: 2000,
    })
    assert.equal(reduceMembershipOperation(nonOwnerAdd, state, { baseKey }).reason, 'wrong-owner')

    const wrongBaseAdd = createAddWriterMembershipRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: guestWriterKey,
        baseKey: Buffer.from('d'.repeat(64), 'hex'),
        sequence: nextMembershipSequence(state),
        createdAt: 2000,
    })
    assert.equal(reduceMembershipOperation(wrongBaseAdd, state, { baseKey }).reason, 'wrong-base')
})

test('malformed, unsigned, tampered, and replayed membership ops are rejected', () => {
    const owner = createOwnerAuthorityKeyPair()
    const bootstrap = createOwnerBootstrapRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: ownerWriterKey,
        baseKey,
        createdAt: 1000,
    })
    const state = reduceMembershipOperation(bootstrap, createMembershipState(), { baseKey }).state

    assert.equal(reduceMembershipOperation({ type: 'membership' }, state, { baseKey }).reason, 'malformed')

    const unsigned = {
        type: 'membership',
        version: 1,
        action: ADD_WRITER_ACTION,
        baseKey: baseKey.toString('hex'),
        ownerAuthorityKey: ownerAuthorityPublicKeyHex(owner),
        writerKey: guestWriterKey.toString('hex'),
        sequence: 2,
        createdAt: 2000,
    }
    assert.equal(reduceMembershipOperation(unsigned, state, { baseKey }).reason, 'unsigned')

    const signed = createAddWriterMembershipRecord({
        ownerAuthorityKeyPair: owner,
        writerKey: guestWriterKey,
        baseKey,
        sequence: 2,
        createdAt: 2000,
    })
    const tampered = { ...signed, writerKey: Buffer.from('e'.repeat(64), 'hex').toString('hex') }
    assert.equal(reduceMembershipOperation(tampered, state, { baseKey }).reason, 'bad-signature')

    const accepted = reduceMembershipOperation(signed, state, { baseKey })
    assert.equal(accepted.ok, true)
    assert.equal(reduceMembershipOperation(signed, accepted.state, { baseKey }).reason, 'replay')
})
