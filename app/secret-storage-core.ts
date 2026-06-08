export const SECRET_PAYLOAD_VERSION = 1

export const SECRET_STORE_KEY_PREFIX = 'listam.secret.v1.'
export const SECRET_METADATA_KEY = `${SECRET_STORE_KEY_PREFIX}metadata`

// Durable key material the backend needs at boot. These are the only secrets
// migrated into the platform keychain.
export const SECURE_SECRET_FILES = {
    autobaseKey: 'lista-autobase-key.txt',
    encryptionKey: 'lista-encryption-key.txt',
    ownerAuthorityKey: 'lista-owner-authority-key.txt',
    epochKey: 'lista-epoch-key.txt',
    epochEncryptionKey: 'lista-epoch-encryption-key.txt',
} as const

// Legacy plaintext files that must be removed but are never re-stored:
//  - the local writer key is derived from the corestore and has no consumer.
//  - invite material is an expiring bearer secret that Phase 1 deliberately
//    stopped persisting (H3); it must not be resurrected into secure storage.
export const LEGACY_CLEANUP_FILES = {
    localWriterKey: 'lista-local-writer-key.txt',
    pairingInvite: 'lista-invite.json',
} as const

// Full legacy file map, retained for diagnostics/tests.
export const LEGACY_SECRET_FILES = {
    ...SECURE_SECRET_FILES,
    ...LEGACY_CLEANUP_FILES,
} as const

export type SecretName = keyof typeof SECURE_SECRET_FILES

export type SecretMode = 'secure-store' | 'plaintext-recovery' | 'memory-recovery'

export type BackendSecretPayload = {
    version: number
    mode: SecretMode
    secrets: Partial<Record<SecretName, string>>
}

export type PreparedBackendSecrets = {
    backendPayload: BackendSecretPayload
    mode: SecretMode
    secureStorageAvailable: boolean
    warnings: string[]
}

export type SecureSecretStore = {
    isAvailable: () => Promise<boolean>
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    deleteItem?: (key: string) => Promise<void>
}

export type MetadataStore = {
    setItem: (key: string, value: string) => Promise<void>
}

export type LegacySecretFiles = {
    readFile: (filename: string) => Promise<string | null>
    deleteFile: (filename: string) => Promise<void>
}

export type MemorySecretStore = {
    get: (name: SecretName) => string | null
    set: (name: SecretName, value: string) => void
    delete: (name: SecretName) => void
    snapshot: () => Partial<Record<SecretName, string>>
}

export type SecretStorageAdapters = {
    secureStore: SecureSecretStore
    legacyFiles?: LegacySecretFiles
    metadataStore?: MetadataStore
    memoryStore?: MemorySecretStore
}

export type BackendSecretPersistRequest = {
    version?: number
    op?: 'set' | 'delete'
    name?: string
    value?: string | null
}

const SECRET_NAMES = Object.keys(SECURE_SECRET_FILES) as SecretName[]
const BACKEND_SECRET_NAMES: SecretName[] = ['autobaseKey', 'encryptionKey', 'ownerAuthorityKey', 'epochKey', 'epochEncryptionKey']
const HEX_SECRET_BYTES: Record<SecretName, number> = {
    autobaseKey: 32,
    encryptionKey: 32,
    ownerAuthorityKey: 64,
    epochKey: 32,
    epochEncryptionKey: 32,
}
const CLEANUP_FILES = Object.values(LEGACY_CLEANUP_FILES)
const HEX = /^[0-9a-f]+$/i

export function secretStoreKey(name: SecretName): string {
    return `${SECRET_STORE_KEY_PREFIX}${name}`
}

export function normalizeSecretValue(name: SecretName, raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    if (!trimmed) return null

    const hex = trimmed.toLowerCase()
    const bytes = HEX_SECRET_BYTES[name]
    return HEX.test(hex) && hex.length === bytes * 2 ? hex : null
}

export function secretFingerprint(value: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

export async function prepareBackendSecrets(
    adapters: SecretStorageAdapters,
): Promise<PreparedBackendSecrets> {
    const warnings: string[] = []
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

    // Remove never-stored legacy plaintext (writer key, invite). These are pure
    // liability: the writer key is unused and the invite is an expiring bearer
    // secret that must not be persisted (H3). The backend also clears these at
    // boot as a fallback if the adapter cannot reach them here.
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

export async function persistBackendSecretRequest(
    rawRequest: string | BackendSecretPersistRequest,
    adapters: SecretStorageAdapters,
): Promise<{ mode: SecretMode; warning?: string }> {
    const request = parsePersistRequest(rawRequest)
    const name = parseSecretName(request.name)
    if (!name) throw new Error('Invalid secret name')

    const op = request.op === 'delete' || request.value == null ? 'delete' : 'set'
    const warnings: string[] = []
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

function parsePersistRequest(rawRequest: string | BackendSecretPersistRequest): BackendSecretPersistRequest {
    if (typeof rawRequest !== 'string') return rawRequest
    return JSON.parse(rawRequest)
}

function parseSecretName(raw: unknown): SecretName | null {
    return typeof raw === 'string' && SECRET_NAMES.includes(raw as SecretName)
        ? raw as SecretName
        : null
}

async function isSecureStoreAvailable(
    secureStore: SecureSecretStore,
    warnings: string[],
): Promise<boolean> {
    try {
        return await secureStore.isAvailable()
    } catch {
        warnings.push('Secure storage availability check failed.')
        return false
    }
}

async function readSecureSecrets(
    secureStore: SecureSecretStore,
    warnings: string[],
): Promise<Partial<Record<SecretName, string>>> {
    const secrets: Partial<Record<SecretName, string>> = {}
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

async function deleteCleanupFiles(
    legacyFiles: LegacySecretFiles,
    warnings: string[],
) {
    for (const filename of CLEANUP_FILES) {
        try {
            await legacyFiles.deleteFile(filename)
        } catch {
            warnings.push(`Legacy cleanup deletion failed for ${filename}.`)
        }
    }
}

async function readLegacySecrets(
    legacyFiles: LegacySecretFiles,
    warnings: string[],
): Promise<Partial<Record<SecretName, string>>> {
    const secrets: Partial<Record<SecretName, string>> = {}
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
}: {
    secureStore: SecureSecretStore
    legacyFiles: LegacySecretFiles
    legacySecrets: Partial<Record<SecretName, string>>
    secureSecrets: Partial<Record<SecretName, string>>
    warnings: string[]
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

async function flushMemorySecrets(
    secureStore: SecureSecretStore,
    memoryStore: MemorySecretStore | undefined,
    memorySecrets: Partial<Record<SecretName, string>>,
    secureSecrets: Partial<Record<SecretName, string>>,
    warnings: string[],
) {
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

async function writeAndConfirmSecret(
    secureStore: SecureSecretStore,
    name: SecretName,
    value: string,
) {
    await secureStore.setItem(secretStoreKey(name), value)
    const confirmed = normalizeSecretValue(name, await secureStore.getItem(secretStoreKey(name)))
    if (confirmed !== value) throw new Error('Secure storage confirmation failed')
}

async function writeSecretMetadata(
    metadataStore: MetadataStore | undefined,
    mode: SecretMode,
    secrets: Partial<Record<SecretName, string>>,
    warnings: string[],
) {
    if (!metadataStore) return

    const fingerprints: Partial<Record<SecretName, string>> = {}
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

function pickBackendSecrets(
    secrets: Partial<Record<SecretName, string>>,
): Partial<Record<SecretName, string>> {
    const out: Partial<Record<SecretName, string>> = {}
    for (const name of BACKEND_SECRET_NAMES) {
        const value = secrets[name]
        if (value) out[name] = value
    }
    return out
}
