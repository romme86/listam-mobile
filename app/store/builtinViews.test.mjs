// Regression test for the device-local built-in-surface view override.
//
// The built-in surfaces (Groceries/Spesa, Board, Todo) share listId 'default'
// and carry no synced registry meta-item, so their per-surface view can't ride
// the registry the way user lists do. We persist it per-device in
// preferences.builtinViews (keyed by composite surface id, e.g. 'default:shopping')
// and attach it to the built-in nav entry, so the categories toggle actually
// works on Spesa. This guards that round-trip: the reducer merge + the selector
// reflecting the override (and still clamping a to-do surface).
//
// Like listsSlice.test.mjs, this transpiles the REAL TS sources with the
// installed compiler and drives them under node:test (no jest in this repo).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { surfaceLabelKey } from '@listam/domain'
import { DEFAULT_LIST_ID, DEFAULT_LIST_TYPE, TODO_LIST_TYPE } from '@listam/domain/identity'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-bv-${process.pid}`)

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
let selectors
try {
    fs.mkdirSync(buildDir, { recursive: true })
    // labelsSlice only has runtime deps on @listam/domain + @reduxjs/toolkit; the
    // rest are type-only. registrySelectors imports it via './labelsSlice'.
    fs.writeFileSync(path.join(buildDir, 'labelsSlice.mjs'), transpile(path.join(STORE_DIR, 'labelsSlice.ts')))
    fs.writeFileSync(
        path.join(buildDir, 'registrySelectors.mjs'),
        transpile(path.join(STORE_DIR, 'registrySelectors.ts'), [["'./labelsSlice'", "'./labelsSlice.mjs'"]]),
    )
    fs.writeFileSync(path.join(buildDir, 'preferencesSlice.mjs'), transpile(path.join(STORE_DIR, 'preferencesSlice.ts')))
    prefs = await import(pathToFileURL(path.join(buildDir, 'preferencesSlice.mjs')).href)
    selectors = await import(pathToFileURL(path.join(buildDir, 'registrySelectors.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { default: preferencesReducer, preferencesActions } = prefs
const { selectCurrentListView, DEFAULT_VIEW } = selectors

const SHOPPING_SURFACE = surfaceLabelKey(DEFAULT_LIST_ID, DEFAULT_LIST_TYPE) // 'default:shopping'
const TODO_SURFACE = surfaceLabelKey(DEFAULT_LIST_ID, TODO_LIST_TYPE) // 'default:todo'

// selectCurrentListView reads state.lists (items/lists/selected), the separate
// state.labels (surface names + built-in group placement), and state.preferences.
function makeState(selectedListId, builtinViews) {
    return {
        lists: { itemsById: {}, listsById: {}, selectedListId },
        labels: { itemsById: {} },
        preferences: { defaultListId: null, boardEnabled: false, builtinViews },
    }
}

test('builtinViewPatched merges a partial patch without dropping prior keys', () => {
    let state = preferencesReducer(undefined, { type: '@@INIT' })
    state = preferencesReducer(state, preferencesActions.builtinViewPatched({ surfaceId: SHOPPING_SURFACE, patch: { isGridView: true } }))
    state = preferencesReducer(state, preferencesActions.builtinViewPatched({ surfaceId: SHOPPING_SURFACE, patch: { categoriesEnabled: false } }))
    assert.deepEqual(state.builtinViews[SHOPPING_SURFACE], { isGridView: true, categoriesEnabled: false })
})

test('selectCurrentListView reflects a built-in grocery override (Spesa categories off)', () => {
    const off = selectCurrentListView(makeState(SHOPPING_SURFACE, { [SHOPPING_SURFACE]: { categoriesEnabled: false } }))
    assert.equal(off.categoriesEnabled, false)
    // With no override it falls back to the default (categories on).
    const fallback = selectCurrentListView(makeState(SHOPPING_SURFACE, {}))
    assert.equal(fallback.categoriesEnabled, DEFAULT_VIEW.categoriesEnabled)
    assert.equal(DEFAULT_VIEW.categoriesEnabled, true)
})

test('a built-in to-do surface still clamps categories/grid off despite an override', () => {
    const view = selectCurrentListView(makeState(TODO_SURFACE, { [TODO_SURFACE]: { categoriesEnabled: true, isGridView: true } }))
    assert.equal(view.categoriesEnabled, false)
    assert.equal(view.isGridView, false)
})
