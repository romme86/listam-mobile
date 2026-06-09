export const SECRET_PAYLOAD_VERSION = 1

export const SECRET_STORE_KEY_PREFIX = 'listam.secret.v1.'
export const SECRET_METADATA_KEY = `${SECRET_STORE_KEY_PREFIX}metadata`

export const SECURE_SECRET_FILES = {
    autobaseKey: 'lista-autobase-key.txt',
    encryptionKey: 'lista-encryption-key.txt',
    ownerAuthorityKey: 'lista-owner-authority-key.txt',
    epochKey: 'lista-epoch-key.txt',
    epochEncryptionKey: 'lista-epoch-encryption-key.txt',
}

export const LEGACY_CLEANUP_FILES = {
    localWriterKey: 'lista-local-writer-key.txt',
    pairingInvite: 'lista-invite.json',
}

export const LEGACY_SECRET_FILES = {
    ...SECURE_SECRET_FILES,
    ...LEGACY_CLEANUP_FILES,
}

export const SECRET_NAMES = Object.freeze(Object.keys(SECURE_SECRET_FILES))
export const BACKEND_SECRET_NAMES = Object.freeze([
    'autobaseKey',
    'encryptionKey',
    'ownerAuthorityKey',
    'epochKey',
    'epochEncryptionKey',
])

export const HEX_SECRET_BYTES = Object.freeze({
    autobaseKey: 32,
    encryptionKey: 32,
    ownerAuthorityKey: 64,
    epochKey: 32,
    epochEncryptionKey: 32,
})

const CLEANUP_FILES = Object.values(LEGACY_CLEANUP_FILES)
const HEX = /^[0-9a-f]+$/i

export function secretStoreKey(name) {
    return `${SECRET_STORE_KEY_PREFIX}${name}`
}

export function normalizeSecretValue(name, raw) {
    const bytes = HEX_SECRET_BYTES[name]
    if (!bytes) return null

    if (isBytes(raw)) {
        return normalizeHex(bytesToHex(raw), bytes)
    }

    if (typeof raw === 'string') {
        return normalizeHex(raw, bytes)
    }

    return null
}

export function parseSecretName(raw) {
    return typeof raw === 'string' && SECRET_NAMES.includes(raw) ? raw : null
}

export function secretFingerprint(value) {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

export function emptyBackendSecretPayload() {
    return { version: SECRET_PAYLOAD_VERSION, mode: 'none', secrets: {} }
}

export function parseBackendSecretPayload(rawPayload, options = {}) {
    const empty = emptyBackendSecretPayload()
    if (!rawPayload || typeof rawPayload !== 'string') return empty

    try {
        const parsed = JSON.parse(rawPayload)
        const secrets = {}
        for (const name of BACKEND_SECRET_NAMES) {
            const value = normalizeSecretValue(name, parsed?.secrets?.[name])
            if (value) secrets[name] = value
        }
        options.logger?.log?.('[INFO] Backend boot secrets received', {
            mode: parsed?.mode || 'unknown',
            fingerprints: fingerprintsFor(secrets),
        })
        return {
            version: Number(parsed?.version) || SECRET_PAYLOAD_VERSION,
            mode: parsed?.mode || 'unknown',
            secrets,
        }
    } catch (e) {
        options.logger?.log?.('[ERROR] Failed to parse backend boot secret payload:', e)
        return empty
    }
}

export function getBackendSecretValue(bootSecrets, name) {
    return normalizeSecretValue(name, bootSecrets?.secrets?.[name])
}

export function createPersistSecretPayload(name, value) {
    const normalized = normalizeSecretValue(name, value)
    if (!normalized) return null
    return {
        version: SECRET_PAYLOAD_VERSION,
        op: 'set',
        name,
        value: normalized,
        fingerprint: secretFingerprint(normalized),
    }
}

export function createDeleteSecretPayload(name) {
    if (!parseSecretName(name)) return null
    return {
        version: SECRET_PAYLOAD_VERSION,
        op: 'delete',
        name,
    }
}

export function parseSecretAck(ack) {
    try {
        const text = ack == null
            ? ''
            : typeof ack === 'string'
                ? ack
                : bytesToUtf8(ack)
        return text ? JSON.parse(text)?.stored === true : false
    } catch {
        return false
    }
}

export async function prepareBackendSecrets(adapters) {
    const warnings = []
    const secureStorageAvailable = await isSecureStoreAvailable(adapters.secureStore, warnings)
    const secureSecrets = secureStorageAvailable
        ? await readSecureSecrets(adapters.secureStore, warnings)
        : {}
    const legacySecrets = adapters.legacyFiles
        ? await readLegacySecrets(adapters.legacyFiles, warnings)
        : {}

    if (secureStorageAvailable && adapters.legacyFiles) {
        await migrateLegacySecrets({
            secureStore: adapters.secureStore,
            legacyFiles: adapters.legacyFiles,
            legacySecrets,
            secureSecrets,
            warnings,
        })
    }

    if (adapters.legacyFiles) {
        await deleteCleanupFiles(adapters.legacyFiles, warnings)
    }

    const memorySecrets = adapters.memoryStore?.snapshot() ?? {}
    if (secureStorageAvailable) {
        await flushMemorySecrets(adapters.secureStore, adapters.memoryStore, memorySecrets, secureSecrets, warnings)
    }

    const effectiveSecrets = secureStorageAvailable
        ? secureSecrets
        : {
            ...legacySecrets,
            ...memorySecrets,
        }

    const mode = secureStorageAvailable
        ? 'secure-store'
        : Object.keys(legacySecrets).length > 0
            ? 'plaintext-recovery'
            : 'memory-recovery'

    await writeSecretMetadata(adapters.metadataStore, mode, effectiveSecrets, warnings)

    return {
        backendPayload: {
            version: SECRET_PAYLOAD_VERSION,
            mode,
            secrets: pickBackendSecrets(effectiveSecrets),
        },
        mode,
        secureStorageAvailable,
        warnings,
    }
}

export async function persistBackendSecretRequest(rawRequest, adapters) {
    const request = parsePersistRequest(rawRequest)
    const name = parseSecretName(request.name)
    if (!name) throw new Error('Invalid secret name')

    const op = request.op === 'delete' || request.value == null ? 'delete' : 'set'
    const warnings = []
    const secureStorageAvailable = await isSecureStoreAvailable(adapters.secureStore, warnings)

    if (op === 'delete') {
        if (secureStorageAvailable) {
            await adapters.secureStore.deleteItem?.(secretStoreKey(name))
        }
        adapters.memoryStore?.delete(name)
        await writeSecretMetadata(adapters.metadataStore, secureStorageAvailable ? 'secure-store' : 'memory-recovery', {}, warnings)
        return { mode: secureStorageAvailable ? 'secure-store' : 'memory-recovery' }
    }

    const value = normalizeSecretValue(name, request.value)
    if (!value) throw new Error('Invalid secret value')

    if (secureStorageAvailable) {
        await writeAndConfirmSecret(adapters.secureStore, name, value)
        adapters.memoryStore?.delete(name)
        await writeSecretMetadata(adapters.metadataStore, 'secure-store', { [name]: value }, warnings)
        return { mode: 'secure-store' }
    }

    adapters.memoryStore?.set(name, value)
    await writeSecretMetadata(adapters.metadataStore, 'memory-recovery', { [name]: value }, warnings)
    return {
        mode: 'memory-recovery',
        warning: 'Secure storage is unavailable; key material is only cached for this app session.',
    }
}

function parsePersistRequest(rawRequest) {
    if (typeof rawRequest !== 'string') return rawRequest
    return JSON.parse(rawRequest)
}

async function isSecureStoreAvailable(secureStore, warnings) {
    try {
        return await secureStore.isAvailable()
    } catch {
        warnings.push('Secure storage availability check failed.')
        return false
    }
}

async function readSecureSecrets(secureStore, warnings) {
    const secrets = {}
    for (const name of SECRET_NAMES) {
        try {
            const value = normalizeSecretValue(name, await secureStore.getItem(secretStoreKey(name)))
            if (value) secrets[name] = value
        } catch {
            warnings.push(`Secure storage read failed for ${name}.`)
        }
    }
    return secrets
}

async function deleteCleanupFiles(legacyFiles, warnings) {
    for (const filename of CLEANUP_FILES) {
        try {
            await legacyFiles.deleteFile(filename)
        } catch {
            warnings.push(`Legacy cleanup deletion failed for ${filename}.`)
        }
    }
}

async function readLegacySecrets(legacyFiles, warnings) {
    const secrets = {}
    for (const name of SECRET_NAMES) {
        const filename = SECURE_SECRET_FILES[name]
        try {
            const value = normalizeSecretValue(name, await legacyFiles.readFile(filename))
            if (value) secrets[name] = value
        } catch {
            warnings.push(`Legacy secret read failed for ${name}.`)
        }
    }
    return secrets
}

async function migrateLegacySecrets({
    secureStore,
    legacyFiles,
    legacySecrets,
    secureSecrets,
    warnings,
}) {
    for (const name of SECRET_NAMES) {
        const legacyValue = legacySecrets[name]
        if (!legacyValue) continue

        const secureValue = secureSecrets[name]
        if (!secureValue) {
            try {
                await writeAndConfirmSecret(secureStore, name, legacyValue)
                secureSecrets[name] = legacyValue
                await legacyFiles.deleteFile(SECURE_SECRET_FILES[name])
            } catch {
                warnings.push(`Legacy migration failed for ${name}; plaintext copy kept for recovery.`)
            }
            continue
        }

        if (secureValue === legacyValue) {
            try {
                await legacyFiles.deleteFile(SECURE_SECRET_FILES[name])
            } catch {
                warnings.push(`Legacy deletion failed for ${name}.`)
            }
        } else {
            warnings.push(`Legacy ${name} differs from secure storage; plaintext copy kept for recovery.`)
        }
    }
}

async function flushMemorySecrets(secureStore, memoryStore, memorySecrets, secureSecrets, warnings) {
    if (!memoryStore) return

    for (const name of SECRET_NAMES) {
        const value = memorySecrets[name]
        if (!value || secureSecrets[name]) continue
        try {
            await writeAndConfirmSecret(secureStore, name, value)
            secureSecrets[name] = value
            memoryStore.delete(name)
        } catch {
            warnings.push(`Session recovery secret could not be moved to secure storage for ${name}.`)
        }
    }
}

async function writeAndConfirmSecret(secureStore, name, value) {
    await secureStore.setItem(secretStoreKey(name), value)
    const confirmed = normalizeSecretValue(name, await secureStore.getItem(secretStoreKey(name)))
    if (confirmed !== value) throw new Error('Secure storage confirmation failed')
}

async function writeSecretMetadata(metadataStore, mode, secrets, warnings) {
    if (!metadataStore) return

    const fingerprints = {}
    for (const name of SECRET_NAMES) {
        const value = secrets[name]
        if (value) fingerprints[name] = secretFingerprint(value)
    }

    try {
        await metadataStore.setItem(SECRET_METADATA_KEY, JSON.stringify({
            version: SECRET_PAYLOAD_VERSION,
            mode,
            updatedAt: new Date().toISOString(),
            fingerprints,
            warnings,
        }))
    } catch {
        // Metadata is diagnostic only; never block secret migration on it.
    }
}

function pickBackendSecrets(secrets) {
    const out = {}
    for (const name of BACKEND_SECRET_NAMES) {
        const value = secrets[name]
        if (value) out[name] = value
    }
    return out
}

function fingerprintsFor(secrets) {
    const out = {}
    for (const [name, value] of Object.entries(secrets)) {
        out[name] = secretFingerprint(value)
    }
    return out
}

function normalizeHex(raw, bytes) {
    const hex = String(raw).trim().toLowerCase()
    return HEX.test(hex) && hex.length === bytes * 2 ? hex : null
}

function isBytes(value) {
    return typeof value?.byteLength === 'number' &&
        typeof value !== 'string' &&
        (value instanceof Uint8Array || value.constructor?.name === 'Buffer')
}

function bytesToHex(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
    let out = ''
    for (const byte of bytes) {
        out += byte.toString(16).padStart(2, '0')
    }
    return out
}

function bytesToUtf8(value) {
    if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('utf8')
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(value)
    return String.fromCharCode(...new Uint8Array(value))
}
