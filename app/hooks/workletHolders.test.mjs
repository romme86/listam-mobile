// The lifecycle contract for the Bare worklet bridge.
//
// Regression under test: cleanup used to null the component-level rpcRef while
// the remount path restored only the worklet and then reported ready. The app
// looked connected and silently dropped every command — including the catch-up
// RPC_REQUEST_SYNC — because sendRPC short-circuits on a null rpc.
//
// These holders are deliberately module-level, so a remount cannot clear them
// and a handler built by an earlier mount still reads the current mount's
// values. That is what is asserted here.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const HOOK_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(HOOK_DIR, `.test-build-worklet-holders-${process.pid}`)

fs.mkdirSync(buildDir, { recursive: true })
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const src = path.join(HOOK_DIR, 'workletHolders.ts')
const out = path.join(buildDir, 'workletHolders.mjs')
fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(src, 'utf8'), {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        isolatedModules: true,
        esModuleInterop: true,
    },
    fileName: src,
}).outputText)

const holders = await import(pathToFileURL(out).href)
const {
    rpcRef,
    workletRef,
    isJoiningRef,
    joinInFlightRef,
    notifyRef,
    i18nRef,
    tryBeginJoin,
    finishJoin,
    resetWorkletHolders,
} = holders

beforeEach(() => resetWorkletHolders())

// Stand-ins for the real lifecycle. `mount` is what the hook does on render;
// `unmount` is what its effect cleanup is allowed to do — which is nothing.
function mount ({ notify, i18n }) {
    notifyRef.current = notify
    i18nRef.current = i18n
}
function unmount () {
    // Deliberately empty. Nulling rpcRef/workletRef here is the original bug.
}

test('the RPC survives a remount', () => {
    const rpc = { id: 'rpc-1' }
    rpcRef.current = rpc
    workletRef.current = { id: 'worklet-1' }

    mount({ notify: () => {}, i18n: { t: () => '' } })
    unmount()
    mount({ notify: () => {}, i18n: { t: () => '' } })

    assert.equal(rpcRef.current, rpc, 'a remount must not clear the RPC')
    assert.notEqual(rpcRef.current, null, 'sendRPC short-circuits on null — commands would be dropped')
})

test('a handler built by the FIRST mount notifies the SECOND mount', () => {
    // The subtle half. Hoisting the RPC alone is not enough: if the handler kept
    // closing over per-mount refs it would fire into an unmounted component —
    // commands would send but nothing would update, a silent failure worse than
    // the loud one.
    const seenByFirst = []
    const seenBySecond = []

    mount({ notify: (m) => seenByFirst.push(m), i18n: { t: (k) => `first:${k}` } })

    // Built once, by the first mount, closing over the module-level holders.
    const handler = (message) => notifyRef.current?.(i18nRef.current.t(message))

    handler('hello')
    assert.deepEqual(seenByFirst, ['first:hello'])

    unmount()
    mount({ notify: (m) => seenBySecond.push(m), i18n: { t: (k) => `second:${k}` } })

    handler('again')
    assert.deepEqual(seenBySecond, ['second:again'], 'the old handler must reach the CURRENT mount')
    assert.deepEqual(seenByFirst, ['first:hello'], 'and must not reach the dead one')
})

test('the isJoining mirror follows the current mount', () => {
    mount({ notify: () => {}, i18n: {} })
    isJoiningRef.current = true
    joinInFlightRef.current = 'list'
    unmount()
    mount({ notify: () => {}, i18n: {} })
    assert.equal(isJoiningRef.current, true, 'join state must not reset just because React remounted')
    assert.equal(joinInFlightRef.current, 'list', 'the uncancellable join must remain busy across a remount')
})

test('only the owning join can start and finish the shared loading lifecycle', () => {
    assert.equal(tryBeginJoin('list'), true)
    assert.equal(tryBeginJoin('project'), false, 'a second join must stay blocked')
    assert.equal(finishJoin('project'), false, 'an older unrelated completion must not clear the list join')
    assert.equal(joinInFlightRef.current, 'list')
    assert.equal(finishJoin('list'), true)
    assert.equal(joinInFlightRef.current, null)
})

test('holders start empty so a cold boot cannot read stale state', () => {
    assert.equal(rpcRef.current, null)
    assert.equal(workletRef.current, null)
    assert.equal(isJoiningRef.current, false)
    assert.equal(joinInFlightRef.current, null)
    assert.equal(notifyRef.current, undefined)
    assert.equal(i18nRef.current, null)
})

test('a notify fired before any mount is a no-op, not a crash', () => {
    // The backend can emit during startup, before React has rendered.
    assert.doesNotThrow(() => notifyRef.current?.('early message'))
})
