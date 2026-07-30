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
