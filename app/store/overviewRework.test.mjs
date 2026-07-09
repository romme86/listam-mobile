// Overview rework regressions (2026-07): the opt-in preference and the
// two-phase toggle's core assumption.
//
//   1. preferences.overviewEnabled — off by default, hydration accepts only
//      real booleans, and the toggle action round-trips.
//   2. listsActions.listItemUpdated updates an item IN PLACE (same position in
//      the bucket). The deferred-reorder toggle (index.tsx handleToggleDone)
//      relies on this: taps flip state without moving the row, and only the
//      settle pass reorders.
//
// Like listsSlice.test.mjs, this transpiles the REAL TS sources with the
// installed compiler and drives them under node:test (no jest in this repo).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(STORE_DIR, '..')
const buildDir = path.join(STORE_DIR, `.test-build-ov-${process.pid}`)

function transpile(srcPath, rewrites = []) {
    const { outputText } = ts.transpileModule(fs.readFileSync(srcPath, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
            isolatedModules: true,
            esModuleInterop: true,
        },
        fileName: srcPath,
    })
    return rewrites.reduce((out, [from, to]) => out.split(from).join(to), outputText)
}

let prefs
let slice
try {
    fs.mkdirSync(buildDir, { recursive: true })
    fs.writeFileSync(path.join(buildDir, 'preferencesSlice.mjs'), transpile(path.join(STORE_DIR, 'preferencesSlice.ts')))
    fs.writeFileSync(path.join(buildDir, 'listProjection.mjs'), transpile(path.join(APP_DIR, 'listProjection.ts')))
    fs.writeFileSync(
        path.join(buildDir, 'listsSlice.mjs'),
        transpile(path.join(STORE_DIR, 'listsSlice.ts'), [["'../listProjection'", "'./listProjection.mjs'"]]),
    )
    prefs = await import(pathToFileURL(path.join(buildDir, 'preferencesSlice.mjs')).href)
    slice = await import(pathToFileURL(path.join(buildDir, 'listsSlice.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { default: preferencesReducer, preferencesActions } = prefs
const { default: listsReducer, listsActions, selectSelectedListItems } = slice

// --- preferences.overviewEnabled ------------------------------------------

test('overviewEnabled defaults to false (opt-in)', () => {
    const state = preferencesReducer(undefined, { type: '@@INIT' })
    assert.equal(state.overviewEnabled, false)
})

test('hydration only accepts real booleans for overviewEnabled', () => {
    const init = preferencesReducer(undefined, { type: '@@INIT' })
    const on = preferencesReducer(init, preferencesActions.preferencesHydrated({ overviewEnabled: true }))
    assert.equal(on.overviewEnabled, true)
    // A stray persisted string must not flip it.
    const junk = preferencesReducer(init, preferencesActions.preferencesHydrated({ overviewEnabled: '1' }))
    assert.equal(junk.overviewEnabled, false)
    // A payload without the field leaves it untouched.
    const absent = preferencesReducer(on, preferencesActions.preferencesHydrated({}))
    assert.equal(absent.overviewEnabled, true)
})

test('overviewEnabledSet round-trips', () => {
    let state = preferencesReducer(undefined, { type: '@@INIT' })
    state = preferencesReducer(state, preferencesActions.overviewEnabledSet(true))
    assert.equal(state.overviewEnabled, true)
    state = preferencesReducer(state, preferencesActions.overviewEnabledSet(false))
    assert.equal(state.overviewEnabled, false)
})

// --- in-place update (two-phase toggle's assumption) -----------------------

let seq = 0
function makeEntry(over = {}) {
    const n = ++seq
    return {
        id: `id-${n}`,
        text: `Item ${n}`,
        listId: 'default',
        listType: 'shopping',
        isDone: false,
        timeOfCompletion: 0,
        updatedAt: n,
        ...over,
    }
}

test('listItemUpdated flips state in place — position in the bucket is preserved', () => {
    let state = listsReducer(undefined, { type: '@@INIT' })
    const a = makeEntry()
    const b = makeEntry()
    const c = makeEntry()
    for (const it of [a, b, c]) state = listsReducer(state, listsActions.listItemAdded(it))
    const before = selectSelectedListItems({ lists: state }).map((it) => it.id)
    assert.equal(before.length, 3)

    // Flip the middle row done via the in-place path (phase 1 of the toggle).
    const middle = selectSelectedListItems({ lists: state })[1]
    const flipped = { ...middle, isDone: true, timeOfCompletion: 123, updatedAt: Date.now() }
    state = listsReducer(state, listsActions.listItemUpdated(flipped))

    const after = selectSelectedListItems({ lists: state })
    assert.deepEqual(after.map((it) => it.id), before, 'order must not change on update')
    assert.equal(after[1].isDone, true, 'the flip itself must land')
})
