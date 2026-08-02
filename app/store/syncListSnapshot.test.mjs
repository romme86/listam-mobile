import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import {
    buildPeerLabelItem,
    buildPresenceItem,
    buildBuiltinVisibilityItem,
    buildSurfaceLabelItem,
    PEER_LABEL_LIST_ID,
    PEER_LABEL_LIST_TYPE,
    PRESENCE_LIST_ID,
    PRESENCE_LIST_TYPE,
} from '@listam/domain'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-sync-snapshot-${process.pid}`)

function transpile(srcPath) {
    return ts.transpileModule(fs.readFileSync(srcPath, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
            isolatedModules: true,
            esModuleInterop: true,
        },
        fileName: srcPath,
    }).outputText
}

let decoder
let labels
let presence
try {
    fs.mkdirSync(buildDir, { recursive: true })
    for (const name of ['syncListSnapshot', 'labelsSlice', 'presenceSlice']) {
        fs.writeFileSync(path.join(buildDir, `${name}.mjs`), transpile(path.join(STORE_DIR, `${name}.ts`)))
    }
    decoder = await import(pathToFileURL(path.join(buildDir, 'syncListSnapshot.mjs')).href)
    labels = await import(pathToFileURL(path.join(buildDir, 'labelsSlice.mjs')).href)
    presence = await import(pathToFileURL(path.join(buildDir, 'presenceSlice.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

test('SYNC_LIST decoder accepts legacy arrays and exact bucket envelopes', () => {
    const legacy = [{ id: 'milk' }]
    assert.deepEqual(decoder.decodeSyncListSnapshot(legacy), {
        mode: 'legacy',
        items: legacy,
        baseKey: null,
    })

    const list = [{ id: 'planned' }]
    assert.deepEqual(decoder.decodeSyncListSnapshot({
        list,
        listId: '__plan__',
        listType: 'plan',
    }), {
        mode: 'bucket',
        items: list,
        listId: '__plan__',
        listType: 'plan',
        baseKey: null,
    })

    assert.deepEqual(decoder.decodeSyncListSnapshot({ list }), {
        mode: 'legacy',
        items: list,
        baseKey: null,
    }, 'older envelopes without bucket identity retain legacy compatibility')
    assert.equal(decoder.decodeSyncListSnapshot({ list: {}, listId: 'x', listType: 'todo' }), null)
})

test('shared snapshot materializes its envelope base key onto every restored row', () => {
    const baseKey = 'ab'.repeat(32)
    const raw = [{ id: 'milk', listId: 'spesa-2', listType: 'shopping' }]
    const snapshot = decoder.decodeSyncListSnapshot({
        list: raw,
        listId: 'spesa-2',
        listType: 'shopping',
        baseKey,
    })

    assert.equal(snapshot.baseKey, baseKey)
    assert.deepEqual(decoder.materializeSnapshotItems(snapshot), [
        { ...raw[0], baseKey },
    ])
    assert.equal(raw[0].baseKey, undefined, 'transport decoding does not mutate the durable row')
})

test('structured label snapshot replaces only its named reserved bucket', () => {
    const { default: reducer, labelsActions } = labels
    let state = reducer(undefined, { type: '@@INIT' })
    const oldA = buildPeerLabelItem({ writerKey: 'writer-a', name: 'Old A', updatedAt: 1 })
    const oldB = buildPeerLabelItem({ writerKey: 'writer-b', name: 'Old B', updatedAt: 1 })
    const surface = buildSurfaceLabelItem({ listId: 'default', type: 'shopping', name: 'Groceries', updatedAt: 1 })
    state = reducer(state, labelsActions.labelsApplied([oldA, oldB, surface]))

    const current = buildPeerLabelItem({ writerKey: 'writer-a', name: 'Current A', updatedAt: 2 })
    state = reducer(state, labelsActions.labelsSnapshotApplied({
        listId: PEER_LABEL_LIST_ID,
        listType: PEER_LABEL_LIST_TYPE,
        items: [current],
    }))

    const rows = Object.values(state.itemsById)
    assert.equal(rows.find((item) => item.listId === PEER_LABEL_LIST_ID)?.labelName, 'Current A')
    assert.equal(rows.some((item) => item.writerKey === 'writer-b'), false, 'stale peer label was removed')
    assert.ok(rows.some((item) => item.listId === surface.listId && item.id === surface.id), 'the independent surface-label bucket survives')
})

test('metadata channels that reuse a surface id coexist in the label store', () => {
    const { default: reducer, labelsActions } = labels
    let state = reducer(undefined, { type: '@@INIT' })
    const surface = buildSurfaceLabelItem({ listId: 'default', type: 'shopping', name: 'Weekly shop', updatedAt: 1 })
    const visibility = buildBuiltinVisibilityItem({ listId: 'default', type: 'shopping', hidden: true, updatedAt: 2 })

    state = reducer(state, labelsActions.labelsApplied([surface, visibility]))

    const rows = Object.values(state.itemsById)
    assert.equal(rows.length, 2)
    assert.ok(rows.some((item) => item.listId === surface.listId && item.labelName === 'Weekly shop'))
    assert.ok(rows.some((item) => item.listId === visibility.listId && item.builtinHidden === true))
})

test('structured presence snapshot removes stale peers, including when empty', () => {
    const { default: reducer, presenceActions } = presence
    let state = reducer(undefined, { type: '@@INIT' })
    const oldA = buildPresenceItem({ writerKey: 'writer-a', lastActiveAt: 1 })
    const oldB = buildPresenceItem({ writerKey: 'writer-b', lastActiveAt: 1 })
    state = reducer(state, presenceActions.presenceApplied([oldA, oldB]))

    const current = buildPresenceItem({ writerKey: 'writer-a', lastActiveAt: 2 })
    state = reducer(state, presenceActions.presenceSnapshotApplied({
        listId: PRESENCE_LIST_ID,
        listType: PRESENCE_LIST_TYPE,
        items: [current],
    }))
    assert.deepEqual(Object.keys(state.itemsById), ['writer-a'])
    assert.equal(state.itemsById['writer-a'].lastActiveAt, 2)

    state = reducer(state, presenceActions.presenceSnapshotApplied({
        listId: PRESENCE_LIST_ID,
        listType: PRESENCE_LIST_TYPE,
        items: [],
    }))
    assert.deepEqual(state.itemsById, {})
})
