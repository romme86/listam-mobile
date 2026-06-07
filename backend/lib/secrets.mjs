import { RPC_PERSIST_SECRET } from '../../rpc-commands.mjs'
import { rpc } from './state.mjs'
import { logger } from './logger.mjs'

const HEX = /^[0-9a-f]+$/i
const BUFFER_SECRET_BYTES = new Map([
    ['autobaseKey', 32],
    ['encryptionKey', 32],
    ['ownerAuthorityKey', 64],
])
const PERSIST_ACK_TIMEOUT_MS = 8000
const PERSIST_RETRIES = 2

export function parseBootSecretPayload(rawPayload) {
    const empty = { version: 1, mode: 'none', secrets: {} }
    if (!rawPayload || typeof rawPayload !== 'string') return empty

    try {
        const parsed = JSON.parse(rawPayload)
        const secrets = {}
        for (const name of BUFFER_SECRET_BYTES.keys()) {
            const value = normalizeSecretValue(name, parsed?.secrets?.[name])
            if (value) secrets[name] = value
        }
        logger.log('[INFO] Backend boot secrets received', {
            mode: parsed?.mode || 'unknown',
            fingerprints: fingerprintsFor(secrets),
        })
        return {
            version: Number(parsed?.version) || 1,
            mode: parsed?.mode || 'unknown',
            secrets,
        }
    } catch (e) {
        logger.log('[ERROR] Failed to parse backend boot secret payload:', e)
        return empty
    }
}

export function getBootSecretBuffer(bootSecrets, name) {
    const value = normalizeSecretValue(name, bootSecrets?.secrets?.[name])
    return value ? Buffer.from(value, 'hex') : null
}

// Persist a secret through the platform adapter and wait for an acknowledgement
// that it was durably stored. Returns true only when the frontend confirms a
// secure-store write, so the caller can safely retire the plaintext copy.
export function persistBackendSecret(name, value) {
    const normalized = normalizeSecretValue(name, value)
    if (!normalized) {
        logger.log('[ERROR] Refusing to persist invalid backend secret', { name })
        return Promise.resolve(false)
    }

    return sendSecretRequest({
        version: 1,
        op: 'set',
        name,
        value: normalized,
        fingerprint: secretFingerprint(normalized),
    }, PERSIST_RETRIES)
}

export function deleteBackendSecret(name) {
    return sendSecretRequest({
        version: 1,
        op: 'delete',
        name,
    }, 0)
}

export function secretFingerprint(value) {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

async function sendSecretRequest(payload, retries = 0) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (!rpc) {
            logger.log('[WARNING] Secret persistence requested before RPC was ready', {
                name: payload.name,
                op: payload.op,
            })
            return false
        }

        try {
            const req = rpc.request(RPC_PERSIST_SECRET)
            req.send(JSON.stringify(payload))
            const stored = parseSecretAck(await withTimeout(req.reply(), PERSIST_ACK_TIMEOUT_MS))
            if (stored) {
                logger.log('[INFO] Backend secret persistence acknowledged', {
                    name: payload.name,
                    op: payload.op,
                    fingerprint: payload.fingerprint,
                })
                return true
            }
            logger.log('[WARNING] Backend secret persistence not durably stored', {
                name: payload.name,
                op: payload.op,
                attempt,
            })
        } catch (e) {
            logger.log('[ERROR] Failed to confirm backend secret persistence:', e)
        }
    }
    return false
}

function parseSecretAck(ack) {
    try {
        const text = ack == null
            ? ''
            : typeof ack === 'string'
                ? ack
                : Buffer.from(ack).toString('utf8')
        return text ? JSON.parse(text)?.stored === true : false
    } catch {
        return false
    }
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('secret persistence ack timed out')), ms)
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })
}

function normalizeSecretValue(name, raw) {
    const bytes = BUFFER_SECRET_BYTES.get(name)
    if (!bytes) return null

    if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
        return normalizeHex(Buffer.from(raw).toString('hex'), bytes)
    }

    if (typeof raw === 'string') {
        return normalizeHex(raw, bytes)
    }

    return null
}

function normalizeHex(raw, bytes) {
    const hex = raw.trim().toLowerCase()
    return HEX.test(hex) && hex.length === bytes * 2 ? hex : null
}

function fingerprintsFor(secrets) {
    const out = {}
    for (const [name, value] of Object.entries(secrets)) {
        out[name] = secretFingerprint(value)
    }
    return out
}
