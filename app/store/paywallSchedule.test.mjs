import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const STORE_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(STORE_DIR, '..')
const buildDir = path.join(STORE_DIR, `.test-build-paywall-${process.pid}`)
fs.mkdirSync(buildDir, { recursive: true })

const source = fs.readFileSync(path.join(APP_DIR, 'paywallSchedule.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, isolatedModules: true },
    fileName: 'paywallSchedule.ts',
})
const modulePath = path.join(buildDir, 'paywallSchedule.mjs')
fs.writeFileSync(modulePath, outputText)
const schedule = await import(pathToFileURL(modulePath).href)
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const at = (year, month, day) => new Date(year, month, day, 12, 0, 0).getTime()

test('dismissal cadence is 2 months, 3 months, then a year forever', () => {
    const now = at(2026, 6, 17)
    assert.equal(schedule.nextPaywallAt(now, 1), at(2026, 8, 17))
    assert.equal(schedule.nextPaywallAt(now, 2), at(2026, 9, 17))
    assert.equal(schedule.nextPaywallAt(now, 3), at(2027, 6, 17))
    assert.equal(schedule.nextPaywallAt(now, 4), at(2027, 6, 17))
})

test('calendar-month scheduling clamps safely at month end', () => {
    assert.equal(schedule.nextPaywallAt(at(2026, 11, 31), 1), at(2027, 1, 28))
    assert.equal(schedule.nextPaywallAt(at(2024, 1, 29), 3), at(2025, 1, 28))
})

test('dismiss button delay grows by 30 seconds after every dismissal', () => {
    assert.equal(schedule.paywallDismissDelaySeconds(0), 30)
    assert.equal(schedule.paywallDismissDelaySeconds(1), 60)
    assert.equal(schedule.paywallDismissDelaySeconds(2), 90)
    assert.equal(schedule.paywallDismissDelaySeconds(9), 300)
})

test('dismiss button delay safely handles invalid prior counts', () => {
    assert.equal(schedule.paywallDismissDelaySeconds(-1), 30)
    assert.equal(schedule.paywallDismissDelaySeconds(Number.NaN), 30)
})
