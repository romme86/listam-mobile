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
import {
    buildItemPlanEntry,
    buildPeerLabelItem,
    buildSurfaceLabelItem,
    isPlanItem,
    PLAN_LIST_ID,
    PLAN_LIST_TYPE,
} from '@listam/domain'

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

const { default: reducer, listsActions, selectSelectedListItems, selectItemsForList, selectAllItems } = slice
const { selectedListChanged, listItemAdded, selectedListItemsSynced, selectedListItemsReplaced, listRemoved } = listsActions

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

// Deleting a named list must drop the WHOLE bucket record, not just its items —
// registrySelectors.extraLists scans listsById, so a leftover empty ListRecord
// would resurface as a stray "Ungrouped" list once the registry tombstone lands.
test('listRemoved drops the whole bucket so a deleted list cannot resurface', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-party', listType: 'shopping' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'Cups', listId: 'list-party' })))
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'list-party')), ['Cups'])

    store.dispatch(listRemoved({ listId: 'list-party' }))
    const { lists } = store.getState()
    assert.equal(lists.listsById['list-party'], undefined, 'the record itself is gone')
    assert.ok(!lists.listIds.includes('list-party'), 'unlinked from listIds')
    assert.ok(!lists.projectsById[lists.selectedProjectId].listIds.includes('list-party'), 'unlinked from project')
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'list-party')), [])
})

test('listRemoved refuses to remove the shared default bucket (built-in surfaces)', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Bread', listId: 'default' })))
    store.dispatch(listRemoved({ listId: 'default' }))
    assert.ok(store.getState().lists.listsById['default'], 'the built-in default bucket survives')
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['Bread'])
})

// Mesh-safety: peer/surface label meta-items (reserved '__peers__' /
// '__surfacenames__' buckets) ride the normal item pipeline but must NEVER
// project into a list — else a device name renders as a grocery row, or an
// empty phantom "Unknown" list appears. Verifies the listsSlice skip-filters.
test('a peer-label item added from the backend never enters a list bucket', () => {
    const store = makeStore()
    const label = buildPeerLabelItem({ writerKey: 'a1b2c3', name: "Fabio's MacBook", updatedAt: 1 })
    store.dispatch(listItemAdded(label))
    // No '__peers__' bucket forms, and the default/selected lists stay empty.
    assert.deepEqual(selectItemsForList(store.getState(), '__peers__'), [])
    assert.deepEqual(selectSelectedListItems(store.getState()), [])
})

test('label items in a SYNC_LIST snapshot are filtered, real items still land', () => {
    const store = makeStore()
    store.dispatch(selectedListItemsSynced([
        makeEntry({ text: 'Milk', listId: 'default' }),
        buildPeerLabelItem({ writerKey: 'k', name: 'Pi', updatedAt: 1 }),
        buildSurfaceLabelItem({ listId: 'default', type: 'shopping', name: 'Spesa', updatedAt: 1 }),
    ]))
    // Only the genuine grocery item lands; neither label leaks into the list.
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['Milk'])
    assert.deepEqual(selectItemsForList(store.getState(), '__surfacenames__'), [])
})

test('structured plan snapshot replaces stale plan meta-items exactly', () => {
    const store = makeStore()
    const keepRow = makeEntry({ id: 'source-keep', text: 'Keep row', listId: 'default' })
    const staleA = buildItemPlanEntry({ listId: 'default', itemId: 'stale-a', plannedFor: '2026-07-16', planOrder: 1, updatedAt: 1 })
    const staleB = buildItemPlanEntry({ listId: 'default', itemId: 'stale-b', plannedFor: '2026-07-17', planOrder: 2, updatedAt: 2 })
    const current = buildItemPlanEntry({ listId: 'default', itemId: 'current', plannedFor: '2026-07-18', planOrder: 3, updatedAt: 3 })

    store.dispatch(listItemAdded(keepRow))
    store.dispatch(listItemAdded(staleA))
    store.dispatch(listItemAdded(staleB))
    store.dispatch(selectedListItemsSynced({
        listId: PLAN_LIST_ID,
        listType: PLAN_LIST_TYPE,
        items: [current],
    }))

    const all = selectAllItems(store.getState())
    assert.deepEqual(all.filter(isPlanItem).map((item) => item.id), [current.id])
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['Keep row'])

    // An empty exact bucket must clear the final plan ref as well.
    store.dispatch(selectedListItemsSynced({
        listId: PLAN_LIST_ID,
        listType: PLAN_LIST_TYPE,
        items: [],
    }))
    assert.deepEqual(selectAllItems(store.getState()).filter(isPlanItem), [])
})

test('legacy bare-array SYNC_LIST keeps its additive reserved-meta behavior', () => {
    const store = makeStore()
    const existingPlan = buildItemPlanEntry({ listId: 'default', itemId: 'old', plannedFor: '2026-07-17', planOrder: 1, updatedAt: 1 })
    store.dispatch(listItemAdded(existingPlan))

    // Bare arrays still mean "replace default rows". Their embedded plan items
    // are filtered from rows and do not claim to be an exact plan snapshot.
    store.dispatch(selectedListItemsSynced([
        makeEntry({ text: 'Legacy row', listId: 'default' }),
        buildItemPlanEntry({ listId: 'default', itemId: 'ignored', plannedFor: '2026-07-18', planOrder: 2, updatedAt: 2 }),
    ]))

    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default')), ['Legacy row'])
    assert.deepEqual(selectAllItems(store.getState()).filter(isPlanItem).map((item) => item.id), [existingPlan.id])
})

// The built-in surfaces (Groceries/Board/Todo) all live on the shared 'default'
// bucket and are selected via composite nav ids ('default:type'). The selectors
// must split that bucket by surface type so the three never bleed together.
test('a built-in surface selection splits the shared default bucket by type', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'default', listType: 'shopping' })))
    store.dispatch(listItemAdded(makeEntry({ text: 'Buy gift', listId: 'default', listType: 'todo' })))
    store.dispatch(listItemAdded(makeEntry({ text: 'Ticket', listId: 'default', listType: 'kanban' })))

    store.dispatch(selectedListChanged({ listId: 'default:shopping', listType: 'shopping' }))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['Milk'])
    store.dispatch(selectedListChanged({ listId: 'default:todo', listType: 'todo' }))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['Buy gift'])
    // Board is written with the legacy wire type 'kanban'; the canonical surface
    // type 'board' must still match it (isBoardType dual-reads).
    store.dispatch(selectedListChanged({ listId: 'default:board', listType: 'board' }))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['Ticket'])
})

// Optimistic list replacements (toggle-done reorder, clear-completed) operate on
// the visible, type-filtered surface. Surface-scoping the replace must keep the
// OTHER surfaces' items, which share the 'default' bucket.
test('replacing one built-in surface keeps the other surfaces intact', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'default', listType: 'shopping' })))
    store.dispatch(listItemAdded(makeEntry({ text: 'Buy gift', listId: 'default', listType: 'todo' })))

    store.dispatch(selectedListChanged({ listId: 'default:shopping', listType: 'shopping' }))
    store.dispatch(selectedListItemsReplaced([])) // e.g. clear-completed on groceries
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), [])
    // The to-do surface's item survives the grocery replace.
    store.dispatch(selectedListChanged({ listId: 'default:todo', listType: 'todo' }))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['Buy gift'])
})

test('selectItemsForList resolves a composite surface id to its typed items', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'default', listType: 'shopping' })))
    store.dispatch(listItemAdded(makeEntry({ text: 'Buy gift', listId: 'default', listType: 'todo' })))
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default:todo')), ['Buy gift'])
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'default:shopping')), ['Milk'])
})

// A user-created list (registry meta id 'list-<base36>', no colon) must accept
// items: select it, add an item carrying that listId, see it in the list.
test('a freshly created non-default list accepts items', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-new1', listType: 'todo' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'First task', listId: 'list-new1', listType: 'todo' })))
    assert.deepEqual(texts(selectSelectedListItems(store.getState())), ['First task'])
    assert.deepEqual(texts(selectItemsForList(store.getState(), 'list-new1')), ['First task'])
})

// Sharing a list PROMOTES it: items are re-seeded into a new base with the SAME
// ids, then the personal copies are tombstoned. The two bases replicate
// independently, so the delete can land AFTER the seed — and identityKey
// (listId + itemId, no base) makes it match, emptying the list just shared.
test('a late personal tombstone cannot empty a list that was just shared', () => {
    const SHARED = 'a1b2c3'
    let state = reducer(undefined, { type: '@@init' })

    state = reducer(state, listsActions.listItemAdded({
        id: 'holiday', listId: '__registry__', listType: 'registry',
        regKind: 'list', regName: 'Holiday', regType: 'todo', regBaseKey: SHARED,
        text: 'Holiday', isDone: false, timeOfCompletion: 0, updatedAt: 1,
    }))

    state = reducer(state, listsActions.listItemAdded({
        id: 'x1', text: 'Passports', listId: 'holiday', listType: 'todo',
        baseKey: SHARED, isDone: false, timeOfCompletion: 0, updatedAt: 2,
    }))
    assert.equal(Object.values(state.itemsById).some((i) => i.id === 'x1'), true, 'seeded item present')

    state = reducer(state, listsActions.listItemDeleted({
        id: 'x1', text: 'Passports', listId: 'holiday', listType: 'todo',
        isDone: false, timeOfCompletion: 0, updatedAt: 3,
    }))

    assert.equal(
        Object.values(state.itemsById).some((i) => i.id === 'x1'),
        true,
        'an event from the base this list was promoted away from must be ignored',
    )
})

test('the base guard fails open for a list the registry has not described', () => {
    let state = reducer(undefined, { type: '@@init' })
    state = reducer(state, listsActions.listItemAdded({
        id: 'y1', text: 'Milk', listId: 'not-in-registry', listType: 'shopping',
        baseKey: 'ffff', isDone: false, timeOfCompletion: 0, updatedAt: 1,
    }))
    assert.equal(Object.values(state.itemsById).some((i) => i.id === 'y1'), true)
})

// The same promotion race, inside the window the GUARD cannot cover.
//
// isFromAuthoritativeBase fails open for a list the registry has not described
// yet — deliberately, because dropping items while the registry is still
// replicating would turn a slow sync into data loss. That fail-open window is
// exactly when the seed/tombstone race happens, so the guard alone never closed
// it. Base-scoped keys do: the personal tombstone and the shared copy are not
// the same row, so the delete cannot reach across.
test('a personal tombstone deletes only the personal row, not the shared copy', () => {
    const SHARED = 'a1b2c3'
    const row = {
        id: 'x1', text: 'Passports', listId: 'holiday', listType: 'todo',
        isDone: false, timeOfCompletion: 0,
    }
    // No registry meta-item at all: the list is unknown, so the guard accepts
    // everything and cannot be what saves the row below.
    let state = reducer(undefined, { type: '@@init' })
    state = reducer(state, listsActions.listItemAdded({ ...row, updatedAt: 1 }))
    state = reducer(state, listsActions.listItemAdded({ ...row, baseKey: SHARED, updatedAt: 2 }))
    assert.equal(
        Object.values(state.itemsById).filter((i) => i.id === 'x1').length, 2,
        'the personal and shared copies are distinct rows while both bases are believed to hold them',
    )

    state = reducer(state, listsActions.listItemDeleted({ ...row, updatedAt: 3 }))

    const survivors = Object.values(state.itemsById).filter((i) => i.id === 'x1')
    assert.equal(survivors.length, 1, 'the tombstone must remove exactly one row')
    assert.equal(
        survivors[0].baseKey, SHARED,
        'the row it removed must be the personal one — the shared copy is what the user just shared',
    )
})

// --- selector memoization -------------------------------------------------
// Both selectors used to memoize on the WHOLE lists slice, so ANY lists action —
// selecting a different list, a registry meta-item, a label landing in a
// reserved bucket — returned a fresh array identity and re-rendered every
// consumer, including the 1,800-line AppInner. These pin the narrower keys.

test('selectAllItems is stable when only the SELECTION changes', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'list-abc' })))
    const before = selectAllItems(store.getState())

    store.dispatch(selectedListChanged({ listId: 'list-xyz' }))

    assert.equal(selectAllItems(store.getState()), before, 'selecting a list does not change which items exist')
})

test('selectAllItems DOES change when an item is added', () => {
    const store = makeStore()
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'list-abc' })))
    const before = selectAllItems(store.getState())

    store.dispatch(listItemAdded(makeEntry({ text: 'Bread', listId: 'list-abc' })))

    assert.notEqual(selectAllItems(store.getState()), before)
})

test('selectSelectedListItems survives a write to a reserved bucket', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'list-abc' })))
    const before = selectSelectedListItems(store.getState())

    // A peer label: reserved bucket, dropped by the projection, so the selected
    // list's contents cannot have changed.
    store.dispatch(listItemAdded({
        id: 'peer-1', listId: '__peers__', listType: 'peer', labelName: 'Laptop',
        text: 'Laptop', isDone: false, timeOfCompletion: 0, updatedAt: 2,
    }))

    assert.equal(
        selectSelectedListItems(store.getState()),
        before,
        'a reserved-bucket write must not re-render the list',
    )
})

test('selectSelectedListItems recomputes when its own list changes', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(makeEntry({ text: 'Milk', listId: 'list-abc' })))
    const before = selectSelectedListItems(store.getState())

    store.dispatch(listItemAdded(makeEntry({ text: 'Bread', listId: 'list-abc' })))

    assert.notEqual(selectSelectedListItems(store.getState()), before)
})

// --- keyed projection semantics -------------------------------------------
// applyItemProjection now mutates itemsById/itemIds directly instead of
// rebuilding the bucket through the shared list-entry helpers. That means their
// semantics are reimplemented inline — these pin them so the two cannot drift.
const entryFor = (id, text, over = {}) => ({
    id, text, listId: 'list-abc', listType: 'shopping',
    isDone: false, timeOfCompletion: 0, updatedAt: 10, timestamp: 10, ...over,
})
const textsOf = (store) => selectSelectedListItems(store.getState()).map((i) => i.text)

test('add prepends a new row and moves an existing one to the front', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(entryFor('a', 'Milk')))
    store.dispatch(listItemAdded(entryFor('b', 'Bread')))
    assert.deepEqual(textsOf(store), ['Bread', 'Milk'], 'a new add goes to the front')

    store.dispatch(listItemAdded(entryFor('a', 'Oat milk')))
    assert.deepEqual(textsOf(store), ['Oat milk', 'Bread'], 'an existing id merges and moves to the front')
})

test('update keeps position, and appends when the row is new', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(entryFor('a', 'Milk')))
    store.dispatch(listItemAdded(entryFor('b', 'Bread')))

    store.dispatch(listsActions.listItemUpdated(entryFor('a', 'Oat milk', { updatedAt: 99 })))
    assert.deepEqual(textsOf(store), ['Bread', 'Oat milk'], 'position preserved')

    store.dispatch(listsActions.listItemUpdated(entryFor('z', 'Late', { updatedAt: 99 })))
    assert.deepEqual(textsOf(store), ['Bread', 'Oat milk', 'Late'], 'an unknown row appends')
})

test('a stale update is ignored, but a stale ADD still wins', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(entryFor('a', 'Current', { updatedAt: 500 })))

    store.dispatch(listsActions.listItemUpdated(entryFor('a', 'Older', { updatedAt: 100 })))
    assert.deepEqual(textsOf(store), ['Current'], 'LWW rejects the older update')

    // upsertListEntry with 'front' placement has no staleness check — an
    // explicit add always wins. Reproduced deliberately.
    store.dispatch(listItemAdded(entryFor('a', 'Forced', { updatedAt: 100 })))
    assert.deepEqual(textsOf(store), ['Forced'], 'an add is not staleness-gated')
})

test('delete removes the row and its bucket entry', () => {
    const store = makeStore()
    store.dispatch(selectedListChanged({ listId: 'list-abc' }))
    store.dispatch(listItemAdded(entryFor('a', 'Milk')))
    store.dispatch(listItemAdded(entryFor('b', 'Bread')))

    store.dispatch(listsActions.listItemDeleted(entryFor('a', 'Milk')))
    assert.deepEqual(textsOf(store), ['Bread'])
})
