// Drives the REAL presenceSlice.ts reducer + selectPresence under node:test.
// This repo has no TS test runner (no jest), so we transpile the slice with the
// installed TypeScript compiler and import it. Its non-type imports
// (@reduxjs/toolkit, @listam/domain) resolve from node_modules; the './store' and
// '../components/_types' imports are type-only and are erased by the transpile.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { buildPresenceItem } from '@listam/domain'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-presence-${process.pid}`)

function transpile(srcPath) {
    const { outputText } = ts.transpileModule(fs.readFileSync(srcPath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, isolatedModules: true, esModuleInterop: true },
        fileName: srcPath,
    })
    return outputText
}

let slice
try {
    fs.mkdirSync(buildDir, { recursive: true })
    fs.writeFileSync(path.join(buildDir, 'presenceSlice.mjs'), transpile(path.join(STORE_DIR, 'presenceSlice.ts')))
    slice = await import(pathToFileURL(path.join(buildDir, 'presenceSlice.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { default: reducer, presenceActions, selectPresence } = slice

test('presenceItemApplied retains only presence items, keyed by id', () => {
    let state = reducer(undefined, { type: '@@init' })
    state = reducer(state, presenceActions.presenceItemApplied(buildPresenceItem({ writerKey: 'k1', lastActiveAt: 100 })))
    // A non-presence item is ignored.
    state = reducer(state, presenceActions.presenceItemApplied({ id: 'x', listType: 'shopping', text: 'milk', isDone: false, timeOfCompletion: 0 }))
    assert.deepEqual(Object.keys(state.itemsById), ['k1'])
})

test('selectPresence reduces to newest-per-writer via reducePresence', () => {
    let state = reducer(undefined, { type: '@@init' })
    state = reducer(state, presenceActions.presenceApplied([
        buildPresenceItem({ writerKey: 'k1', lastActiveAt: 100, cumulativeOnlineMs: 10, sessionCount: 1 }),
        buildPresenceItem({ writerKey: 'k1', lastActiveAt: 300, cumulativeOnlineMs: 30, sessionCount: 2 }),
        buildPresenceItem({ writerKey: 'k2', lastActiveAt: 50 }),
    ]))
    const map = selectPresence({ presence: state })
    assert.equal(map.size, 2)
    assert.equal(map.get('k1').lastActiveAt, 300)
    assert.equal(map.get('k1').cumulativeOnlineMs, 30)
    assert.equal(map.get('k2').lastActiveAt, 50)
})

test('presenceItemRemoved and presenceCleared drop entries', () => {
    let state = reducer(undefined, { type: '@@init' })
    const item = buildPresenceItem({ writerKey: 'k9', lastActiveAt: 1 })
    state = reducer(state, presenceActions.presenceItemApplied(item))
    assert.equal(Object.keys(state.itemsById).length, 1)
    state = reducer(state, presenceActions.presenceItemRemoved(item))
    assert.equal(Object.keys(state.itemsById).length, 0)

    state = reducer(state, presenceActions.presenceItemApplied(item))
    state = reducer(state, presenceActions.presenceCleared())
    assert.equal(Object.keys(state.itemsById).length, 0)
})
