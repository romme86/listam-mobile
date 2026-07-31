// Progressive disclosure: the app boots in BASIC mode and grows features on
// demand. This drives the REAL preferencesSlice + registrySelectors TS sources
// (transpiled like listsSlice.test.mjs — no jest in this repo) and guards:
//   - defaults: advancedMode 'unset', every feature flag off
//   - advancedActivated: the standard set turns on, voice + loyalty stay off
//   - advancedAutoActivated: everything on, but only when still undecided
//   - hydration migration: legacy prefs with boards/overview on activate
//     advanced with every feature (nothing an existing user had disappears)
//   - parseFeatureFlags: persisted-JSON hardening
//   - nav library: feature switches expose creation actions, but do not
//     synthesize empty Board/Todo defaults; legacy content remains reachable.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { buildBuiltinVisibilityItem, surfaceLabelKey } from '@listam/domain'
import { DEFAULT_LIST_ID, DEFAULT_LIST_TYPE, TODO_LIST_TYPE } from '@listam/domain/identity'
import { BOARD_LIST_TYPE } from '@listam/domain/board'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-feat-${process.pid}`)

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

const { default: reducer, preferencesActions, FEATURE_KEYS, parseFeatureFlags } = prefs
const { selectNavLibrary } = selectors

const TODO_SURFACE = surfaceLabelKey(DEFAULT_LIST_ID, TODO_LIST_TYPE)
const BOARD_SURFACE = surfaceLabelKey(DEFAULT_LIST_ID, BOARD_LIST_TYPE)
const GROCERY_SURFACE = surfaceLabelKey(DEFAULT_LIST_ID, DEFAULT_LIST_TYPE)

const initial = () => reducer(undefined, { type: '@@INIT' })

test('defaults: basic mode, every feature off', () => {
    const state = initial()
    assert.equal(state.advancedMode, 'unset')
    for (const key of FEATURE_KEYS) assert.equal(state.features[key], false, key)
    assert.equal(state.boardEnabled, false)
    assert.equal(state.overviewEnabled, false)
})

test('advancedActivated turns on the standard set, leaves voice + loyalty off', () => {
    const state = reducer(initial(), preferencesActions.advancedActivated())
    assert.equal(state.advancedMode, 'on')
    assert.equal(state.boardEnabled, true)
    assert.equal(state.overviewEnabled, true)
    assert.equal(state.features.todo, true)
    assert.equal(state.features.multiList, true)
    assert.equal(state.features.listGroups, true)
    assert.equal(state.features.sharing, true)
    assert.equal(state.features.peersDevices, true)
    assert.equal(state.features.backups, true)
    assert.equal(state.features.voice, false)
    assert.equal(state.features.loyaltyCards, false)
})

test('advancedAutoActivated turns everything on, but only from unset', () => {
    const auto = reducer(initial(), preferencesActions.advancedAutoActivated())
    assert.equal(auto.advancedMode, 'on')
    for (const key of FEATURE_KEYS) assert.equal(auto.features[key], true, key)

    // Already decided (user activated, left voice off) → auto is a no-op.
    const decided = reducer(initial(), preferencesActions.advancedActivated())
    const after2 = reducer(decided, preferencesActions.advancedAutoActivated())
    assert.equal(after2.features.voice, false)
})

test('featureSet toggles one flag and ignores unknown keys', () => {
    let state = reducer(initial(), preferencesActions.featureSet({ feature: 'voice', enabled: true }))
    assert.equal(state.features.voice, true)
    state = reducer(state, preferencesActions.featureSet({ feature: 'voice', enabled: false }))
    assert.equal(state.features.voice, false)
    const before = state
    state = reducer(state, preferencesActions.featureSet({ feature: 'nope', enabled: true }))
    assert.deepEqual(state.features, before.features)
})

test('hydration migration: legacy boards/overview prefs activate everything', () => {
    const state = reducer(initial(), preferencesActions.preferencesHydrated({ boardEnabled: true }))
    assert.equal(state.advancedMode, 'on')
    for (const key of FEATURE_KEYS) assert.equal(state.features[key], true, key)
})

test('hydration without evidence stays basic; explicit values win over migration', () => {
    const fresh = reducer(initial(), preferencesActions.preferencesHydrated({ themeChoice: 'dark' }))
    assert.equal(fresh.advancedMode, 'unset')
    for (const key of FEATURE_KEYS) assert.equal(fresh.features[key], false, key)

    // A device that already persisted the new shape must NOT be re-migrated:
    // boards on + voice deliberately off stays exactly that.
    const kept = reducer(initial(), preferencesActions.preferencesHydrated({
        boardEnabled: true,
        advancedMode: 'on',
        features: { todo: true, voice: false },
    }))
    assert.equal(kept.advancedMode, 'on')
    assert.equal(kept.features.todo, true)
    assert.equal(kept.features.voice, false)
    assert.equal(kept.features.multiList, false)

    // A persisted features blob WITHOUT a persisted mode (mode write raced or
    // predates a crash) must also block the legacy migration — a deliberate
    // voice-off would otherwise flip back on every launch.
    const blobOnly = reducer(initial(), preferencesActions.preferencesHydrated({
        boardEnabled: true,
        features: { voice: false, todo: true },
    }))
    assert.equal(blobOnly.features.voice, false)
})

test('parseFeatureFlags hardens the persisted blob', () => {
    assert.deepEqual(parseFeatureFlags('{"todo":true,"voice":false,"junk":1}'), { todo: true, voice: false })
    assert.equal(parseFeatureFlags('not json'), null)
    assert.equal(parseFeatureFlags('[1,2]'), null)
    assert.equal(parseFeatureFlags(null), null)
    assert.deepEqual(parseFeatureFlags('{"todo":"yes"}'), {})
})

// ---- nav library: Board/Todo are content-only legacy surfaces ----

function navState({ todoEnabled, boardEnabled = false, items = {}, labels = {} }) {
    return {
        lists: { itemsById: items, listsById: {}, selectedListId: TODO_SURFACE },
        labels: { itemsById: labels },
        preferences: {
            defaultListId: null,
            boardEnabled,
            features: { todo: todoEnabled },
            builtinViews: {},
        },
    }
}

test('todo surface hidden in basic mode when default carries no todo items', () => {
    const lib = selectNavLibrary(navState({ todoEnabled: false }))
    assert.equal(lib.listsById[TODO_SURFACE], undefined)
    assert.equal(lib.listsById[BOARD_SURFACE], undefined)
})

test('creation features do not synthesize empty Board/Todo defaults', () => {
    const lib = selectNavLibrary(navState({ todoEnabled: true }))
    assert.equal(lib.listsById[TODO_SURFACE], undefined)
    const boards = selectNavLibrary(navState({ todoEnabled: true, boardEnabled: true }))
    assert.equal(boards.listsById[BOARD_SURFACE], undefined)
})

test('content wins: synced todo items keep the surface reachable with the flag off', () => {
    const lib = selectNavLibrary(navState({
        todoEnabled: false,
        items: { t1: { id: 't1', listId: DEFAULT_LIST_ID, listType: TODO_LIST_TYPE, text: 'call mum' } },
    }))
    assert.ok(lib.listsById[TODO_SURFACE])
})

test('a synced deletion hides Groceries until newer default content resurrects it', () => {
    const hidden = buildBuiltinVisibilityItem({
        listId: DEFAULT_LIST_ID,
        type: DEFAULT_LIST_TYPE,
        hidden: true,
        updatedAt: 10,
    })
    const withoutContent = selectNavLibrary(navState({
        todoEnabled: false,
        labels: { [hidden.id]: hidden },
    }))
    assert.equal(withoutContent.listsById[GROCERY_SURFACE], undefined)

    const resurrected = selectNavLibrary(navState({
        todoEnabled: false,
        labels: { [hidden.id]: hidden },
        items: {
            milk: { id: 'milk', listId: DEFAULT_LIST_ID, listType: DEFAULT_LIST_TYPE, text: 'Milk', updatedAt: 11 },
        },
    }))
    assert.ok(resurrected.listsById[GROCERY_SURFACE])
})
