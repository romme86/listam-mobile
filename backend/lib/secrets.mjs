import { RPC_PERSIST_SECRET } from '../../rpc-commands.mjs'
import { rpc } from './state.mjs'
import { logger } from './logger.mjs'

const HEX_32_BYTE = /^[0-9a-f]{64}$/i
const BUFFER_SECRET_NAMES = new Set(['autobaseKey', 'encryptionKey', 'localWriterKey'])

export function parseBootSecretPayload(rawPayload) {
    const empty = { version: 1, mode: 'none', secrets: {} }
    if (!rawPayload || typeof rawPayload !== 'string') return empty

    try {
        const parsed = JSON.parse(rawPayload)
        const secrets = {}
        for (const name of BUFFER_SECRET_NAMES) {
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

export function persistBackendSecret(name, value) {
    const normalized = normalizeSecretValue(name, value)
    if (!normalized) {
        logger.log('[ERROR] Refusing to persist invalid backend secret', { name })
        return false
    }

    return sendSecretRequest({
        version: 1,
        op: 'set',
        name,
        value: normalized,
        fingerprint: secretFingerprint(normalized),
    })
}

export function deleteBackendSecret(name) {
    return sendSecretRequest({
        version: 1,
        op: 'delete',
        name,
    })
}

export function secretFingerprint(value) {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function sendSecretRequest(payload) {
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
        logger.log('[INFO] Requested backend secret persistence', {
            name: payload.name,
            op: payload.op,
            fingerprint: payload.fingerprint,
        })
        return true
    } catch (e) {
        logger.log('[ERROR] Failed to request backend secret persistence:', e)
        return false
    }
}

function normalizeSecretValue(name, raw) {
    if (!BUFFER_SECRET_NAMES.has(name)) return null

    if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
        return normalizeHex(Buffer.from(raw).toString('hex'))
    }

    if (typeof raw === 'string') {
        return normalizeHex(raw)
    }

    return null
}

function normalizeHex(raw) {
    const hex = raw.trim().toLowerCase()
    return HEX_32_BYTE.test(hex) ? hex : null
}

function fingerprintsFor(secrets) {
    const out = {}
    for (const [name, value] of Object.entries(secrets)) {
        out[name] = secretFingerprint(value)
    }
    return out
}
