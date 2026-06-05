import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/secret-storage-core.ts')
const source = await readFile(modulePath, 'utf8')
const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
    },
})
const {
    LEGACY_SECRET_FILES,
    SECRET_METADATA_KEY,
    prepareBackendSecrets,
    persistBackendSecretRequest,
    secretStoreKey,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('secret migration moves plaintext key files into secure storage and deletes the legacy copies', async () => {
    const secure = createSecureStore()
    const legacy = createLegacyFiles({
        [LEGACY_SECRET_FILES.autobaseKey]: 'A'.repeat(64),
        [LEGACY_SECRET_FILES.encryptionKey]: 'b'.repeat(64),
        [LEGACY_SECRET_FILES.localWriterKey]: 'c'.repeat(64),
        [LEGACY_SECRET_FILES.pairingInvite]: '{"id":"legacy-invite"}',
    })
    const metadata = createMetadataStore()

    const prepared = await prepareBackendSecrets({
        secureStore: secure.adapter,
        legacyFiles: legacy.adapter,
        metadataStore: metadata.adapter,
    })

    assert.equal(prepared.mode, 'secure-store')
    assert.deepEqual(prepared.backendPayload.secrets, {
        autobaseKey: 'a'.repeat(64),
        encryptionKey: 'b'.repeat(64),
    })
    assert.equal(secure.values.get(secretStoreKey('autobaseKey')), 'a'.repeat(64))
    assert.equal(secure.values.get(secretStoreKey('encryptionKey')), 'b'.repeat(64))
    assert.equal(secure.values.get(secretStoreKey('localWriterKey')), 'c'.repeat(64))
    assert.equal(secure.values.get(secretStoreKey('pairingInvite')), '{"id":"legacy-invite"}')
    assert.deepEqual(new Set(legacy.deleted), new Set(Object.values(LEGACY_SECRET_FILES)))

    const metadataRecord = JSON.parse(metadata.values.get(SECRET_METADATA_KEY))
    assert.equal(metadataRecord.mode, 'secure-store')
    assert.equal(metadataRecord.fingerprints.autobaseKey.startsWith('fnv1a32:'), true)
    assert.equal(JSON.stringify(metadataRecord).includes('a'.repeat(64)), false)
})

test('secret migration is idempotent and re-readable from secure storage', async () => {
    const secure = createSecureStore()
    const legacy = createLegacyFiles({
        [LEGACY_SECRET_FILES.autobaseKey]: 'a'.repeat(64),
        [LEGACY_SECRET_FILES.encryptionKey]: 'b'.repeat(64),
    })

    await prepareBackendSecrets({
        secureStore: secure.adapter,
        legacyFiles: legacy.adapter,
    })

    const second = await prepareBackendSecrets({
        secureStore: secure.adapter,
        legacyFiles: legacy.adapter,
    })

    assert.deepEqual(second.backendPayload.secrets, {
        autobaseKey: 'a'.repeat(64),
        encryptionKey: 'b'.repeat(64),
    })
    assert.equal(legacy.reads.length >= 4, true)
    assert.deepEqual(legacy.remaining(), {})
})

test('secure-storage outage keeps plaintext files and boots through recovery payload', async () => {
    const secure = createSecureStore({ available: false })
    const legacy = createLegacyFiles({
        [LEGACY_SECRET_FILES.autobaseKey]: 'a'.repeat(64),
        [LEGACY_SECRET_FILES.encryptionKey]: 'b'.repeat(64),
    })

    const prepared = await prepareBackendSecrets({
        secureStore: secure.adapter,
        legacyFiles: legacy.adapter,
    })

    assert.equal(prepared.mode, 'plaintext-recovery')
    assert.deepEqual(prepared.backendPayload.secrets, {
        autobaseKey: 'a'.repeat(64),
        encryptionKey: 'b'.repeat(64),
    })
    assert.deepEqual(legacy.deleted, [])
    assert.deepEqual(legacy.remaining(), {
        [LEGACY_SECRET_FILES.autobaseKey]: 'a'.repeat(64),
        [LEGACY_SECRET_FILES.encryptionKey]: 'b'.repeat(64),
    })
})

test('backend secret persistence writes and deletes via secure storage', async () => {
    const secure = createSecureStore()
    const metadata = createMetadataStore()

    await persistBackendSecretRequest({
        name: 'autobaseKey',
        value: 'd'.repeat(64),
    }, {
        secureStore: secure.adapter,
        metadataStore: metadata.adapter,
    })

    assert.equal(secure.values.get(secretStoreKey('autobaseKey')), 'd'.repeat(64))
    assert.equal(JSON.parse(metadata.values.get(SECRET_METADATA_KEY)).mode, 'secure-store')

    await persistBackendSecretRequest({
        op: 'delete',
        name: 'autobaseKey',
    }, {
        secureStore: secure.adapter,
        metadataStore: metadata.adapter,
    })

    assert.equal(secure.values.has(secretStoreKey('autobaseKey')), false)
})

test('backend secret persistence falls back to session memory when secure storage is unavailable', async () => {
    const secure = createSecureStore({ available: false })
    const memory = createMemoryStore()

    const result = await persistBackendSecretRequest({
        name: 'encryptionKey',
        value: 'e'.repeat(64),
    }, {
        secureStore: secure.adapter,
        memoryStore: memory.adapter,
    })

    assert.equal(result.mode, 'memory-recovery')
    assert.equal(memory.values.get('encryptionKey'), 'e'.repeat(64))
})

function createSecureStore(options = {}) {
    const values = new Map(Object.entries(options.values ?? {}))
    return {
        values,
        adapter: {
            async isAvailable() {
                return options.available ?? true
            },
            async getItem(key) {
                return values.get(key) ?? null
            },
            async setItem(key, value) {
                values.set(key, value)
            },
            async deleteItem(key) {
                values.delete(key)
            },
        },
    }
}

function createLegacyFiles(initialFiles = {}) {
    const files = { ...initialFiles }
    const deleted = []
    const reads = []
    return {
        deleted,
        reads,
        remaining() {
            return { ...files }
        },
        adapter: {
            async readFile(filename) {
                reads.push(filename)
                return files[filename] ?? null
            },
            async deleteFile(filename) {
                deleted.push(filename)
                delete files[filename]
            },
        },
    }
}

function createMetadataStore() {
    const values = new Map()
    return {
        values,
        adapter: {
            async setItem(key, value) {
                values.set(key, value)
            },
        },
    }
}

function createMemoryStore() {
    const values = new Map()
    return {
        values,
        adapter: {
            get(name) {
                return values.get(name) ?? null
            },
            set(name, value) {
                values.set(name, value)
            },
            delete(name) {
                values.delete(name)
            },
            snapshot() {
                return Object.fromEntries(values.entries())
            },
        },
    }
}
