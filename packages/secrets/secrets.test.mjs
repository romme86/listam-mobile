import test from 'node:test'
import assert from 'node:assert/strict'
import {
    createDeleteSecretPayload,
    createPersistSecretPayload,
    normalizeSecretValue,
    parseBackendSecretPayload,
    parseSecretAck,
    secretFingerprint,
} from './index.mjs'

test('secrets normalize supported key material and reject malformed values', () => {
    assert.equal(normalizeSecretValue('autobaseKey', 'A'.repeat(64)), 'a'.repeat(64))
    assert.equal(normalizeSecretValue('ownerAuthorityKey', Buffer.alloc(64, 1)), '01'.repeat(64))
    assert.equal(normalizeSecretValue('epochKey', 'a'.repeat(128)), null)
    assert.equal(normalizeSecretValue('unknown', 'a'.repeat(64)), null)
})

test('secrets parse boot payloads without leaking invalid values', () => {
    const parsed = parseBackendSecretPayload(JSON.stringify({
        version: 1,
        mode: 'secure-store',
        secrets: {
            autobaseKey: 'b'.repeat(64),
            ownerAuthorityKey: 'bad',
        },
    }))

    assert.deepEqual(parsed.secrets, { autobaseKey: 'b'.repeat(64) })
})

test('secrets build persistence payloads and parse acknowledgements', () => {
    const payload = createPersistSecretPayload('epochKey', 'c'.repeat(64))
    assert.equal(payload.fingerprint, secretFingerprint('c'.repeat(64)))
    assert.equal(createDeleteSecretPayload('epochKey').op, 'delete')
    assert.equal(parseSecretAck(JSON.stringify({ stored: true })), true)
    assert.equal(parseSecretAck(JSON.stringify({ stored: false })), false)
})
