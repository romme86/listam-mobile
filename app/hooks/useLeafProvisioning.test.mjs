import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as provisioning from '@listam/provisioning'

const compiled = ts.transpileModule(readFileSync(new URL('./useLeafProvisioning.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function harness(androidVersion = 31) {
    const handlers = new Set(), managers = [], requested = [], cleanups = []
    let currentState
    const react = {
        useRef: (current) => ({ current }), useCallback: (fn) => fn,
        useState: (initial) => { currentState = initial; return [initial, (next) => { currentState = next }] },
        useEffect: (fn) => { cleanups.push(fn()) },
    }
    const AppState = {
        currentState: 'active',
        addEventListener: (_, fn) => { handlers.add(fn); return { remove: () => handlers.delete(fn) } },
    }
    class BleManager {
        constructor() { managers.push(this); this.destroyed = false }
        state = async () => 'PoweredOn'
        startDeviceScan = async (_, __, callback) => { this.scan = callback }
        stopDeviceScan = async () => { this.scan = null }
        destroy = async () => { this.destroyed = true; this.scan = null }
    }
    const modules = {
        react,
        'react-native': {
            AppState, Platform: { OS: 'android', Version: androidVersion },
            PermissionsAndroid: {
                PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect', ACCESS_FINE_LOCATION: 'location' },
                RESULTS: { GRANTED: 'granted' },
                requestMultiple: async (names) => { requested.push(names); return Object.fromEntries(names.map((n) => [n, 'granted'])) },
            },
        },
        'react-native-ble-plx': { BleManager },
        'base64-js': { fromByteArray: (v) => Buffer.from(v).toString('base64'), toByteArray: (v) => new Uint8Array(Buffer.from(v, 'base64')) },
        '@listam/provisioning': provisioning,
    }
    const exports = {}
    new Function('require', 'exports', compiled)((name) => {
        if (!modules[name]) throw new Error(`unexpected import: ${name}`)
        return modules[name]
    }, exports)
    return {
        hook: exports.useLeafProvisioning(), managers, requested, cleanups,
        get state() { return currentState },
        background() { AppState.currentState = 'background'; for (const fn of handlers) fn('background') },
        foreground() { AppState.currentState = 'active'; for (const fn of handlers) fn('active') },
    }
}
const payload = provisioning.buildProvisioningPayload({ controlKey: '11'.repeat(32), hubAddr: '127.0.0.1:9993', wifi: [{ ssid: 'test' }] })
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('100 background/resume cycles dispose BLE sessions and allow a fresh attempt', { timeout: 5000 }, async () => {
    const h = harness()
    try {
        for (let i = 0; i < 100; i++) {
            const attempt = h.hook.provision(payload)
            await tick()
            assert.equal(h.state.phase, 'scanning')
            assert.deepEqual(await h.hook.provision(payload), { ok: false, reason: 'failed' })
            h.background()
            assert.deepEqual(await attempt, { ok: false, reason: 'failed' })
            assert.equal(h.managers.at(-1).destroyed, true)
            assert.equal(h.managers.at(-1).scan, null)
            h.foreground()
        }
        assert.equal(h.managers.length, 100)
    } finally { h.cleanups.forEach((fn) => fn()) }
})

test('Android before 12 requests location permission for BLE scanning', async () => {
    const h = harness(30), attempt = h.hook.provision(payload)
    await tick(); h.background(); await attempt
    assert.deepEqual(h.requested, [['location']])
    h.cleanups.forEach((fn) => fn())
})

test('unmount cancels an in-flight BLE scan', async () => {
    const h = harness(), attempt = h.hook.provision(payload)
    await tick(); h.cleanups.forEach((fn) => fn())
    assert.deepEqual(await attempt, { ok: false, reason: 'failed' })
    assert.equal(h.managers[0].destroyed, true)
})
