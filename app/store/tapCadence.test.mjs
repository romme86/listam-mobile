// The triple-tap recognizers behind the Overview capture gesture.
//
//   Row mode — single taps stay instant (they toggle in place and settle
//   later), so taps 1–2 "pass"; the 3rd within the window is a "capture".
//   Card mode — a card tap opens its detail, so taps "wait" while a triple is
//   still possible and the caller opens only when settle() confirms the
//   cadence ended short.
//
// tapCadence.ts is a dependency-free pure module; transpile the real source
// and drive it with explicit clocks (no timers inside the module).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const COMPONENTS_DIR = path.resolve(STORE_DIR, '..', 'components')
const buildDir = path.join(STORE_DIR, `.test-build-tc-${process.pid}`)

function transpile(srcPath) {
    const { outputText } = ts.transpileModule(fs.readFileSync(srcPath, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
            isolatedModules: true,
            esModuleInterop: true,
        },
        fileName: srcPath,
    })
    return outputText
}

let mod
try {
    fs.mkdirSync(buildDir, { recursive: true })
    fs.writeFileSync(path.join(buildDir, 'tapCadence.mjs'), transpile(path.join(COMPONENTS_DIR, 'tapCadence.ts')))
    mod = await import(pathToFileURL(path.join(buildDir, 'tapCadence.mjs')).href)
} catch (err) {
    fs.rmSync(buildDir, { recursive: true, force: true })
    throw err
}
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const { createRowTapCadence, createCardTapCadence, TRIPLE_TAP_MS } = mod

test('row: three quick taps → pass, pass, capture', () => {
    const c = createRowTapCadence(300)
    assert.equal(c.register(1000), 'pass')
    assert.equal(c.register(1100), 'pass')
    assert.equal(c.register(1200), 'capture')
})

test('row: a gap beyond the window restarts the cadence', () => {
    const c = createRowTapCadence(300)
    assert.equal(c.register(1000), 'pass')
    assert.equal(c.register(1100), 'pass')
    // Too late for a triple — this is tap 1 of a new cadence.
    assert.equal(c.register(1500), 'pass')
    assert.equal(c.register(1600), 'pass')
    assert.equal(c.register(1700), 'capture')
})

test('row: capture resets — a fourth quick tap is a fresh single', () => {
    const c = createRowTapCadence(300)
    c.register(1000)
    c.register(1100)
    assert.equal(c.register(1200), 'capture')
    assert.equal(c.register(1300), 'pass')
})

test('row: two taps then silence never capture', () => {
    const c = createRowTapCadence(300)
    assert.equal(c.register(1000), 'pass')
    assert.equal(c.register(1100), 'pass')
    // The caller's toggles settle on their own; nothing else to assert here —
    // the next tap after the window starts over.
    assert.equal(c.register(2000), 'pass')
})

test('card: single tap waits, settle confirms exactly one open', () => {
    const c = createCardTapCadence(300)
    assert.equal(c.register(1000), 'wait')
    assert.equal(c.settle(), true, 'one tap was waiting — open the detail')
    assert.equal(c.settle(), false, 'already settled — nothing to open')
})

test('card: triple captures and leaves nothing waiting', () => {
    const c = createCardTapCadence(300)
    assert.equal(c.register(1000), 'wait')
    assert.equal(c.register(1100), 'wait')
    assert.equal(c.register(1200), 'capture')
    assert.equal(c.settle(), false, 'capture consumed the cadence — no open')
})

test('card: slow taps each settle as their own single', () => {
    const c = createCardTapCadence(300)
    assert.equal(c.register(1000), 'wait')
    assert.equal(c.settle(), true)
    assert.equal(c.register(2000), 'wait')
    assert.equal(c.settle(), true)
})

test('exports the shared window constant', () => {
    assert.equal(typeof TRIPLE_TAP_MS, 'number')
    assert.ok(TRIPLE_TAP_MS > 0)
})
