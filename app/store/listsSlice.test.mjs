// Regression test for the multi-list add/sync routing fix.
//
// Two bugs were fixed when the app went multi-list (see the design note in
// listsSlice.ts selectedListItemsSynced):
//   1. an add must be filed under the SELECTED list, not always 'default';
//   2. the backend's SYNC_LIST always carries the DEFAULT list, so it must fold
//      into the 'default' bucket — never the currently-viewed list, which the
//      old code clobbered on every startup/peer-connect rebuild.
//
// This repo has no TS test runner (no jest), so we transpile the REAL
// listsSlice.ts + listProjection.ts with the installed TypeScript compiler into
// a temp dir and drive the actual reducer under node:test. Bare imports
// (@reduxjs/toolkit, @listam/domain) resolve from the package's node_modules
// because the temp dir lives under app/store/.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(STORE_DIR, '..')
const buildDir = path.join(STORE_DIR, `.test-build-${process.pid}`)

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

let slice
try {
    fs.mkdirSync(buildDir, { recursive: true })
    fs.writeFileSync(
        path.join(buildDir, 'listProjection.mjs'),
        transpile(path.join(APP_DIR, 'listProjection.ts')),
    )
    fs.writeFileSync(
        path.join(buildDir, 'listsSlice.mjs'),
        // the slice imports '../listProjection'; point it at our transpiled copy
        transpile(path.join(STORE_DIR, 'listsSlice.ts'), [["'../listProjection'", "'./listProjection.mjs'"]]),
    )
    slice = await import(pathToFileURL(path.join(buildDir, 'listsSlice.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { default: reducer, listsActions, selectSelectedListItems, selectItemsForList } = slice
const { selectedListChanged, listItemAdded, selectedListItemsSynced } = listsActions

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
        timestamp: n,
        ...over,
    }
}

// Minimal store: the selectors read state.lists, so wrap the slice state.
function makeStore() {
    let lists = reducer(undefined, { type: '@@INIT' })
    return {
        dispatch: (action) => { lists = reducer(lists, action) },
        getState: () => ({ lists }),
    }
}

const texts = (items) => items.map((i) => i.text)

test('add to the selected non-default list appears on that list', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc', listType: 'shopping' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'list-abc' })))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['Milk'])
})

test('an item bucketed under default does not leak into a selected non-default list', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc', listType: 'shopping' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'StrayDefault', listId: 'default' })))
    // The viewed (list-abc) list stays empty; the item lands in the default bucket.
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), [])
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['StrayDefault'])
})

test('SYNC_LIST (bare array) folds into default and does not clobber the viewed non-default list', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc', listType: 'shopping' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'KeepMe', listId: 'list-abc' })))
    // The backend's SYNC_LIST always carries the DEFAULT list as a bare array.
    store.dispatch(selectedListItemsSynced([makeEntry({ text: 'SyncedDefault', listId: 'default' })]))
    // Pre-fix this clobbered the viewed list; it must now stay intact...
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['KeepMe'])
    // ...and the synced items land in the default bucket.
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['SyncedDefault'])
})
