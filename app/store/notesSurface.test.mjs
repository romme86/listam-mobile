// Regression tests for the notes list type on the mobile client.
//
// The bug this closes: every client's "is this a grocery item" test used to be
// the negative `!isBoardType && !isTodoType`, which is TRUE for a note — so the
// voice notetaker's items landed inside the Groceries surface and rendered as
// categorized grocery rows. matchesSurfaceType now subtracts notes as well, the
// per-list view clamps grid/categories off for notes the way it does for to-do,
// and the notes index picks a plain or a document row per note.
//
// Like listsSlice.test.mjs, this transpiles the REAL TS sources with the
// installed compiler and drives them under node:test (no jest in this repo).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { buildListMetaItem } from '@listam/domain/list-registry'
import { DEFAULT_LIST_TYPE, NOTES_LIST_TYPE, TODO_LIST_TYPE } from '@listam/domain/identity'
import { BOARD_WRITE_TYPE } from '@listam/domain/board'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(STORE_DIR, '..')
const NOTES_DIR = path.join(APP_DIR, 'components', 'notes')
const buildDir = path.join(STORE_DIR, `.test-build-notes-${process.pid}`)

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

let projection
let selectors
let noteRows
try {
    fs.mkdirSync(buildDir, { recursive: true })
    fs.writeFileSync(path.join(buildDir, 'listProjection.mjs'), transpile(path.join(APP_DIR, 'listProjection.ts')))
    // noteRows keys its rows by the shared identity, so it imports the projection
    // the same way the components do ('../../listProjection').
    fs.writeFileSync(
        path.join(buildDir, 'noteRows.mjs'),
        transpile(path.join(NOTES_DIR, 'noteRows.ts'), [["'../../listProjection'", "'./listProjection.mjs'"]]),
    )
    // labelsSlice only has runtime deps on @listam/domain + @reduxjs/toolkit; the
    // rest are type-only. registrySelectors imports it via './labelsSlice'.
    fs.writeFileSync(path.join(buildDir, 'labelsSlice.mjs'), transpile(path.join(STORE_DIR, 'labelsSlice.ts')))
    fs.writeFileSync(
        path.join(buildDir, 'registrySelectors.mjs'),
        transpile(path.join(STORE_DIR, 'registrySelectors.ts'), [["'./labelsSlice'", "'./labelsSlice.mjs'"]]),
    )
    projection = await import(pathToFileURL(path.join(buildDir, 'listProjection.mjs')).href)
    noteRows = await import(pathToFileURL(path.join(buildDir, 'noteRows.mjs')).href)
    selectors = await import(pathToFileURL(path.join(buildDir, 'registrySelectors.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { matchesSurfaceType } = projection
const { buildNoteRows, isDocumentNote, noteExcerpt } = noteRows
const { selectCurrentListView } = selectors

const NOTES_LIST_ID = 'list-notes'
const METRICS = { plainHeight: 60, documentHeight: 76, spacing: 16 }

function makeItem(listType, over = {}) {
    return { id: `id-${listType}`, listId: NOTES_LIST_ID, listType, text: 'A row', isDone: false, timeOfCompletion: 0, ...over }
}

// --- the surface predicate ------------------------------------------------

test('a notes surface admits notes items and nothing else', () => {
    assert.equal(matchesSurfaceType(NOTES_LIST_TYPE, makeItem(NOTES_LIST_TYPE)), true)
    assert.equal(matchesSurfaceType(NOTES_LIST_TYPE, makeItem(DEFAULT_LIST_TYPE)), false)
    assert.equal(matchesSurfaceType(NOTES_LIST_TYPE, makeItem(TODO_LIST_TYPE)), false)
    assert.equal(matchesSurfaceType(NOTES_LIST_TYPE, makeItem(BOARD_WRITE_TYPE)), false)
})

test('a note never falls into the grocery surface — the voice-notes bug', () => {
    // The grocery surface is the fallback (its own type, and the empty one), so
    // every typed surface has to be subtracted from it.
    assert.equal(matchesSurfaceType(DEFAULT_LIST_TYPE, makeItem(NOTES_LIST_TYPE)), false)
    assert.equal(matchesSurfaceType(undefined, makeItem(NOTES_LIST_TYPE)), false)
    assert.equal(matchesSurfaceType('', makeItem(NOTES_LIST_TYPE)), false)
    // …and the grocery rows themselves still match.
    assert.equal(matchesSurfaceType(DEFAULT_LIST_TYPE, makeItem(DEFAULT_LIST_TYPE)), true)
})

test('the board and to-do surfaces keep ignoring notes', () => {
    assert.equal(matchesSurfaceType(BOARD_WRITE_TYPE, makeItem(NOTES_LIST_TYPE)), false)
    assert.equal(matchesSurfaceType(TODO_LIST_TYPE, makeItem(NOTES_LIST_TYPE)), false)
})

// --- the per-list view clamp ----------------------------------------------

// selectCurrentListView reads state.lists (the registry meta-items live in
// itemsById), the separate state.labels, and state.preferences.
function makeState(type, view) {
    const meta = buildListMetaItem({ id: NOTES_LIST_ID, name: 'Notes', type, view, order: 1, updatedAt: 1 })
    return {
        lists: { itemsById: { [meta.id]: meta }, listsById: {}, selectedListId: NOTES_LIST_ID },
        labels: { itemsById: {} },
        preferences: { defaultListId: null, boardEnabled: false, features: {}, builtinViews: {} },
    }
}

test('a notes list clamps grid and categories off despite a synced override', () => {
    const view = selectCurrentListView(makeState(NOTES_LIST_TYPE, { isGridView: true, categoriesEnabled: true }))
    assert.equal(view.isGridView, false)
    assert.equal(view.categoriesEnabled, false)
})

test('a notes list keeps the three presentation settings it does own', () => {
    const view = selectCurrentListView(makeState(NOTES_LIST_TYPE, {
        isGridView: true,
        listTextSize: 'large',
        listAlignment: 'center',
        listItemSpacing: 'relaxed',
    }))
    assert.equal(view.listTextSize, 'large')
    assert.equal(view.listAlignment, 'center')
    assert.equal(view.listItemSpacing, 'relaxed')
})

test('the clamp is type-scoped — a grocery list still honors grid + categories', () => {
    const view = selectCurrentListView(makeState(DEFAULT_LIST_TYPE, { isGridView: true, categoriesEnabled: true }))
    assert.equal(view.isGridView, true)
    assert.equal(view.categoriesEnabled, true)
})

// --- plain vs document rows -----------------------------------------------

const plainNote = makeItem(NOTES_LIST_TYPE, { id: 'n1', text: 'Buy stamps' })
const documentNote = makeItem(NOTES_LIST_TYPE, {
    id: 'n2',
    text: 'Trip plan',
    blocks: [
        { id: 'b1', type: 'divider' },
        { id: 'b2', type: 'markdown', text: '\nFerry at 08:40\nthen the bus' },
    ],
})

test('a note is a plain row until it grows blocks', () => {
    assert.equal(isDocumentNote(plainNote), false)
    assert.equal(isDocumentNote({ ...plainNote, blocks: [] }), false)
    // A block written by a newer peer that this client cannot render is dropped
    // by normalizeBlocks, so it must not promote the row either.
    assert.equal(isDocumentNote({ ...plainNote, blocks: [{ id: 'b1', type: 'hologram' }] }), false)
    assert.equal(isDocumentNote(documentNote), true)
})

test('the excerpt is the first non-empty body line, in block order', () => {
    assert.equal(noteExcerpt(plainNote), '')
    // The leading divider serializes empty and is skipped, as is the blank line.
    assert.equal(noteExcerpt(documentNote), 'Ferry at 08:40')
})

test('rows carry their own height and a running offset for the focus lens', () => {
    const rows = buildNoteRows([plainNote, documentNote, plainNote], METRICS)
    assert.deepEqual(rows.map((r) => r.kind), ['plain', 'document', 'plain'])
    assert.deepEqual(rows.map((r) => r.height), [60, 76, 60])
    // Mixed heights, so the lens cannot derive its centre from index * height.
    assert.deepEqual(rows.map((r) => r.offset), [0, 76, 168])
    assert.deepEqual(rows.map((r) => r.index), [0, 1, 2])
    assert.deepEqual(rows.map((r) => r.blockCount), [0, 2, 0])
    assert.equal(rows[1].excerpt, 'Ferry at 08:40')
})

test('an empty notes list produces no rows', () => {
    assert.deepEqual(buildNoteRows([], METRICS), [])
})
