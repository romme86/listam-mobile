import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.dirname(STORE_DIR)
const buildDir = path.join(STORE_DIR, `.test-build-local-reset-${process.pid}`)

fs.mkdirSync(buildDir, { recursive: true })
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const src = path.join(APP_DIR, 'localDataResetPlan.ts')
const out = path.join(buildDir, 'localDataResetPlan.mjs')
fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(src, 'utf8'), {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        isolatedModules: true,
        esModuleInterop: true,
    },
    fileName: src,
}).outputText)

const {
    CORE_LOCAL_SECRET_KEYS,
    listamDataEntryNames,
    localSecretKeys,
    localDataDocumentUris,
    localStorageKeysToDelete,
} = await import(pathToFileURL(out).href)

test('reset includes every fixed keychain secret, including owner-control identity', () => {
    assert.deepEqual(new Set(CORE_LOCAL_SECRET_KEYS), new Set([
        'listam.secret.v1.autobaseKey',
        'listam.secret.v1.encryptionKey',
        'listam.secret.v1.ownerAuthorityKey',
        'listam.secret.v1.epochKey',
        'listam.secret.v1.epochEncryptionKey',
        'listam.secret.v1.controlDeviceSeed',
    ]))
})

test('reset derives dynamic keychain entries from current and legacy loyalty cards', () => {
    const keys = localSecretKeys(
        JSON.stringify([
            { id: 'one', name: 'One', type: 'qr', payloadRef: 'card.custom-one' },
            { id: 'duplicate', name: 'Duplicate', type: 'qr', payloadRef: 'card.custom-one' },
        ]),
        JSON.stringify([
            { id: 'legacy two', name: 'Two', type: 'barcode', data: 'payload' },
        ]),
    )

    assert.equal(keys.filter((key) => key.endsWith('card.custom-one')).length, 1)
    assert.ok(keys.includes('listam.secret.v1.loyalty-card.card.legacy_two'))
})

test('reset targets only Listam files beneath the selected app data root', () => {
    const uris = localDataDocumentUris('file:///app/Documents')
    assert.ok(uris.includes('file:///app/Documents/lista'))
    assert.ok(uris.includes('file:///app/Documents/lista.lock'))
    assert.ok(uris.includes('file:///app/Documents/lista-autobase-key.txt'))
    assert.ok(uris.every((uri) => uri.startsWith('file:///app/Documents/')))
    assert.deepEqual(localDataDocumentUris(''), [])
})

// The regression this file exists for: the backend's storage root is
// `<data>/lista`, but the Corestore holding the personal base is the SIBLING
// `<data>/lista-local` (backend.mjs derives it as `${storagePath}-local`).
// Deleting only the root left the whole project database in place, so the app
// rebooted back into the base — and the shared lists — it had just "deleted".
test('reset deletes the personal-base Corestore, not just the storage root beside it', () => {
    const uris = localDataDocumentUris('file:///app/Documents')
    assert.ok(uris.includes('file:///app/Documents/lista-local'))
    assert.ok(uris.includes('file:///app/Documents/lista-healed-orphans.json'))
})

test('reset also sweeps backend siblings discovered in the data root', () => {
    const uris = localDataDocumentUris('file:///app/Documents', [
        'lista',
        'lista-local',
        'lista-local.quarantine-1784315132495',
        'lista.quarantine-1782561901310-1',
    ])
    assert.ok(uris.includes('file:///app/Documents/lista-local.quarantine-1784315132495'))
    assert.ok(uris.includes('file:///app/Documents/lista.quarantine-1782561901310-1'))
    assert.equal(new Set(uris).size, uris.length, 'known and discovered entries must not duplicate')
})

test('reset leaves non-Listam entries in the shared app data root alone', () => {
    assert.deepEqual(
        listamDataEntryNames([
            'lista',
            'lista-local',
            'RCTAsyncLocalStorage_V1',
            'ExponentExperienceData',
            'listaria-notes',
            'lista_export.json',
            'notlista',
        ]),
        ['lista', 'lista-local'],
    )
})

test('reset refuses directory entries that could escape the data root', () => {
    assert.deepEqual(listamDataEntryNames(['..', 'lista-local/../../Library', 'lista-x\\..\\y']), [])
})

test('reset preserves trial and paywall eligibility while deleting user content', () => {
    assert.deepEqual(localStorageKeysToDelete([
        '@lista_trial_start',
        '@lista_paywall_dismiss_count',
        '@lista_paywall_defer_until',
        '@lista_locale_choice',
        '@lista_learned_categories',
        '@lista_loyalty_card_handles',
    ]), [
        '@lista_locale_choice',
        '@lista_learned_categories',
        '@lista_loyalty_card_handles',
    ])
})
