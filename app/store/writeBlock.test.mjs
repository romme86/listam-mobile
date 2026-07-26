// Mobile used to LOG a refused mutation and move on, so a change the user made
// could simply vanish with no signal. These assert the state that now carries
// the reason, including the one refusal that must never be cleared.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-write-block-${process.pid}`)
fs.mkdirSync(buildDir, { recursive: true })
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const src = path.join(STORE_DIR, 'syncSlice.ts')
const out = path.join(buildDir, 'syncSlice.mjs')
fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(src, 'utf8'), {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        isolatedModules: true,
        esModuleInterop: true,
    },
    fileName: src,
}).outputText)

const slice = await import(pathToFileURL(out).href)
const reducer = slice.default
const { syncActions } = slice

const init = () => reducer(undefined, { type: '@@init' })

test('a fresh state has no write block', () => {
    assert.equal(init().writeBlock, null)
})

test('each refusal reason is recorded', () => {
    for (const reason of ['not-writable', 'sync-stalled', 'epoch-key-stale']) {
        const state = reducer(init(), syncActions.writeBlocked(reason))
        assert.equal(state.writeBlock, reason)
    }
})

test('a successful write clears a recoverable block', () => {
    let state = reducer(init(), syncActions.writeBlocked('sync-stalled'))
    state = reducer(state, syncActions.writeBlockCleared())
    assert.equal(state.writeBlock, null)
})

test('storage-fenced is TERMINAL and survives a later success', () => {
    // The backend has torn itself down because another process took the data
    // directory. A stray later success must never imply writes are flowing.
    let state = reducer(init(), syncActions.writeBlocked('storage-fenced'))
    assert.equal(state.isWorkletReady, false, 'a fenced backend is not ready')
    state = reducer(state, syncActions.writeBlockCleared())
    assert.equal(state.writeBlock, 'storage-fenced', 'the terminal block must not clear')
})

test('a later refusal replaces a recoverable one', () => {
    let state = reducer(init(), syncActions.writeBlocked('not-writable'))
    state = reducer(state, syncActions.writeBlocked('epoch-key-stale'))
    assert.equal(state.writeBlock, 'epoch-key-stale')
})
