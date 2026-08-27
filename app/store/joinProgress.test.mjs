// The join/invite state the 4G pairing failure proved was missing.
//
// Two things had no representation at all: how long the current join has been
// running (the overlay had a spinner and nothing else for two minutes), and the
// facts about the invite the sharer was holding — that it is single-use and dies
// in ~10 minutes. These assert both, plus the lifecycle rule that matters most:
// a NEW attempt must never open on the previous attempt's numbers.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(STORE_DIR, `.test-build-join-progress-${process.pid}`)
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
const { syncActions, EMPTY_INVITE } = slice

const init = () => reducer(undefined, { type: '@@init' })

const progress = (over = {}) => ({ elapsedMs: 10000, relayed: false, online: true, ...over })

test('a fresh state has no join progress and no invite', () => {
    const state = init()
    assert.equal(state.joinProgress, null)
    assert.deepEqual(state.invite, EMPTY_INVITE)
})

test('the pairing heartbeat is recorded', () => {
    const state = reducer(init(), syncActions.joinProgressReported(progress({ elapsedMs: 40000, relayed: true })))
    assert.equal(state.joinProgress.elapsedMs, 40000)
    assert.equal(state.joinProgress.relayed, true)
})

test('a later heartbeat replaces the earlier one', () => {
    let state = reducer(init(), syncActions.joinProgressReported(progress({ elapsedMs: 10000 })))
    state = reducer(state, syncActions.joinProgressReported(progress({ elapsedMs: 20000 })))
    assert.equal(state.joinProgress.elapsedMs, 20000)
})

test('a finished join leaves no elapsed time behind', () => {
    let state = reducer(init(), syncActions.joiningSet(true))
    state = reducer(state, syncActions.joinProgressReported(progress({ elapsedMs: 48000 })))
    state = reducer(state, syncActions.joiningSet(false))
    assert.equal(state.joinProgress, null, '"48s elapsed" must not survive the overlay')
    assert.equal(state.joinPhase, null)
})

test('a NEW attempt does not open on the previous attempt s numbers', () => {
    // The regression this exists to prevent: cancel + retry with a fresh code
    // showing "90s elapsed" from the attempt the user just abandoned.
    let state = reducer(init(), syncActions.joiningSet(true))
    state = reducer(state, syncActions.joinProgressReported(progress({ elapsedMs: 90000, relayed: true })))
    state = reducer(state, syncActions.joiningSet(false))
    state = reducer(state, syncActions.joiningSet(true))
    assert.equal(state.joinProgress, null)
})

test('the invite envelope is kept whole, not reduced to the code', () => {
    const state = reducer(init(), syncActions.inviteReceived({
        key: 'abc',
        expiresAt: 1700000000000,
        singleUse: true,
        liveInvites: 3,
        maxInvites: 8,
    }))
    assert.equal(state.invite.key, 'abc')
    assert.equal(state.invite.expiresAt, 1700000000000)
    assert.equal(state.invite.singleUse, true)
    // Three live codes at once is the whole point of the fix: minting one for
    // the second friend no longer kills the first friend's code.
    assert.equal(state.invite.liveInvites, 3)
    assert.equal(state.invite.maxInvites, 8)
})

test('clearing the invite empties the envelope, not just the code', () => {
    let state = reducer(init(), syncActions.inviteReceived({
        key: 'abc',
        expiresAt: 1700000000000,
        singleUse: true,
        liveInvites: 1,
        maxInvites: 8,
    }))
    state = reducer(state, syncActions.inviteCleared())
    // A leftover expiresAt would drive a countdown for a code that is gone.
    assert.deepEqual(state.invite, EMPTY_INVITE)
})

test('a reset clears the invite and any in-flight join', () => {
    let state = reducer(init(), syncActions.inviteReceived({
        key: 'abc', expiresAt: 1, singleUse: true, liveInvites: 1, maxInvites: null,
    }))
    state = reducer(state, syncActions.joiningSet(true))
    state = reducer(state, syncActions.joinProgressReported(progress()))
    state = reducer(state, syncActions.syncReset())
    assert.deepEqual(state.invite, EMPTY_INVITE)
    assert.equal(state.joinProgress, null)
    assert.equal(state.isJoining, false)
})
