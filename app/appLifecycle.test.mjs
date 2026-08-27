// The AppState → swarm-lifecycle mapping, driven through the real iOS and
// Android transition sequences rather than one edge at a time.
//
// Regression under test: suspending only on `prev === 'active' && next ===
// 'background'` never fires on iOS, because iOS interposes 'inactive' on the way
// down. The swarm stayed unsuspended, resumeNetwork() early-returned on
// `!swarm.suspended`, and the whole lifecycle fix was inert on the platform the
// 2026-08-26 field failure happened on.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(APP_DIR, `.test-build-app-lifecycle-${process.pid}`)

fs.mkdirSync(buildDir, { recursive: true })
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const src = path.join(APP_DIR, 'appLifecycle.ts')
const out = path.join(buildDir, 'appLifecycle.mjs')
fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(src, 'utf8'), {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        isolatedModules: true,
        esModuleInterop: true,
    },
    fileName: src,
}).outputText)

const { netLifecycleAction } = await import(pathToFileURL(out).href)

// Replay a sequence of AppState events the way the effect does — each event
// carries the state before it — and collect the actions it produced.
function replay(sequence) {
    const actions = []
    let prev = sequence[0]
    for (const next of sequence.slice(1)) {
        const action = netLifecycleAction(prev, next)
        if (action) actions.push(action)
        prev = next
    }
    return actions
}

test('iOS backgrounding suspends despite the inactive step', () => {
    // active → inactive → background is the real iOS sequence. The bug was that
    // 'background' arrives with prev === 'inactive', not 'active'.
    assert.deepEqual(replay(['active', 'inactive', 'background']), ['suspend'])
})

test('iOS foregrounding resumes', () => {
    assert.deepEqual(replay(['background', 'inactive', 'active']), ['resume'])
})

test('a full iOS background-and-return is exactly one suspend then one resume', () => {
    assert.deepEqual(
        replay(['active', 'inactive', 'background', 'inactive', 'active']),
        ['suspend', 'resume'],
    )
})

test('Android backgrounding suspends on the direct edge', () => {
    assert.deepEqual(replay(['active', 'background']), ['suspend'])
})

test('the share sheet does not churn the swarm', () => {
    // active → inactive → active. Suspending here would tear down the swarm on
    // the exact flow that hands an invite code to the other person.
    assert.deepEqual(replay(['active', 'inactive', 'active']), ['resume'])
    assert.equal(netLifecycleAction('active', 'inactive'), null)
})

test('a repeated active event is not a resume', () => {
    // Android reports 'unknown' before the first real state; neither it nor a
    // duplicate 'active' should trigger the catch-up RPC burst.
    assert.equal(netLifecycleAction('active', 'active'), null)
    assert.equal(netLifecycleAction('unknown', 'active'), null)
})
