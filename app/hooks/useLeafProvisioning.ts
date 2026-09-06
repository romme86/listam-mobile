// BLE-central provisioning for a listam leaf, on the React Native JS thread
// (NOT the BareKit worklet — Bare can't do BLE). Wraps react-native-ble-plx as
// a transport behind the shared @listam/provisioning orchestrator, so the wire
// format (UUIDs, payload, framing, CRC) is identical to the headless/desktop
// provisioners. Requires a dev-client build (ble-plx is a native module) and a
// physical device (iOS BLE does not work in the simulator).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, PermissionsAndroid, Platform } from 'react-native'
import { BleManager, type Device, type Characteristic } from 'react-native-ble-plx'
import { fromByteArray, toByteArray } from 'base64-js'
import {
    SERVICE_UUID,
    ADVERTISED_NAME_PREFIX,
    DEFAULT_MTU,
    provisionLeaf,
    type ProvisioningPayload,
} from '@listam/provisioning'

export type LeafProvPhase = 'idle' | 'scanning' | 'connecting' | 'writing' | 'success' | 'error'
export type LeafProvReason = 'permissions' | 'bt-unavailable' | 'not-found' | 'failed'
export type LeafProvState = { phase: LeafProvPhase; reason?: LeafProvReason }
export type LeafProvResult = { ok: true } | { ok: false; reason: LeafProvReason }

const SCAN_TIMEOUT_MS = 20000

async function ensureAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true
    const wanted = Number(Platform.Version) < 31 ? [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] : [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ].filter(Boolean) as string[]
    const result = await PermissionsAndroid.requestMultiple(wanted as never)
    return Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
}

function scanForLeaf(manager: BleManager, timeoutMs: number, signal: AbortSignal): Promise<Device> {
    return new Promise((resolve, reject) => {
        let settled = false
        const finish = (error: Error | null, device?: Device) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
            void manager.stopDeviceScan().catch(() => {})
            if (error) reject(error)
            else if (device) resolve(device)
        }
        const onAbort = () => finish(new Error('provisioning cancelled'))
        const timer = setTimeout(() => finish(new Error('not-found')), timeoutMs)
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) { onAbort(); return }
        void manager.startDeviceScan([SERVICE_UUID], null, (error: Error | null, device: Device | null) => {
            if (error) {
                finish(error)
                return
            }
            if (!device) return
            const name = device.name ?? device.localName ?? ''
            const byName = name.startsWith(ADVERTISED_NAME_PREFIX)
            const bySvc = (device.serviceUUIDs ?? []).some((u: string) => u.toLowerCase() === SERVICE_UUID)
            if (byName || bySvc) {
                finish(null, device)
            }
        }).catch((error: Error) => finish(error))
    })
}

// Adapt a connected ble-plx Device to the @listam/provisioning transport
// contract. ble-plx speaks base64; the shared codec speaks Uint8Array.
function makeTransport(device: Device, mtu: number) {
    return {
        mtu,
        async write(charUuid: string, bytes: Uint8Array) {
            await device.writeCharacteristicWithResponseForService(
                SERVICE_UUID,
                charUuid,
                fromByteArray(bytes),
            )
        },
        async subscribe(charUuid: string, onValue: (value: Uint8Array) => void) {
            const sub = device.monitorCharacteristicForService(
                SERVICE_UUID,
                charUuid,
                (err: Error | null, ch: Characteristic | null) => {
                    if (err || !ch?.value) return
                    onValue(toByteArray(ch.value))
                },
            )
            return () => sub.remove()
        },
    }
}

export function useLeafProvisioning() {
    const managerRef = useRef<BleManager | null>(null)
    const sessionRef = useRef<AbortController | null>(null)
    const mountedRef = useRef(true)
    const closingRef = useRef<Promise<void>>(Promise.resolve())
    const [state, setState] = useState<LeafProvState>({ phase: 'idle' })

    useEffect(() => {
        mountedRef.current = true
        const cancel = () => {
            sessionRef.current?.abort()
            const manager = managerRef.current
            managerRef.current = null
            if (manager) closingRef.current = manager.destroy().catch(() => {})
        }
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'background') cancel()
        })
        return () => {
            mountedRef.current = false
            subscription.remove()
            cancel()
        }
    }, [])

    const reset = useCallback(() => setState({ phase: 'idle' }), [])

    const provision = useCallback(async (payload: ProvisioningPayload): Promise<LeafProvResult> => {
        if (sessionRef.current || AppState.currentState === 'background') return { ok: false, reason: 'failed' }
        const session = new AbortController()
        sessionRef.current = session
        const cancelled = new Promise<never>((_, reject) => {
            session.signal.addEventListener('abort', () => reject(new Error('provisioning cancelled')), { once: true })
        })
        // Every stage spends the same budget, including adapter startup,
        // discovery and native writes. OS suspension invalidates the session.
        const deadline = setTimeout(() => session.abort(), 60_000)
        const step = <T,>(operation: Promise<T>) => Promise.race([operation, cancelled]).then((value) => {
            if (session.signal.aborted) throw new Error('provisioning cancelled')
            return value
        })
        const report = (next: LeafProvState) => { if (mountedRef.current) setState(next) }
        let device: Device | null = null
        try {
            if (!(await step(ensureAndroidPermissions()))) {
                report({ phase: 'error', reason: 'permissions' })
                return { ok: false, reason: 'permissions' }
            }
            await step(closingRef.current)
            if (!managerRef.current) managerRef.current = new BleManager()
            const manager = managerRef.current

            // Wait (briefly) for the adapter to be powered on.
            if ((await step(manager.state())) !== 'PoweredOn') {
                const ready = await step(new Promise<boolean>((resolve) => {
                    let timer: ReturnType<typeof setTimeout>
                    const finish = (value: boolean) => {
                        clearTimeout(timer)
                        sub.remove()
                        session.signal.removeEventListener('abort', onAbort)
                        resolve(value)
                    }
                    const onAbort = () => finish(false)
                    const sub = manager.onStateChange((s: string) => {
                        if (s === 'PoweredOn') finish(true)
                    }, false)
                    timer = setTimeout(() => finish(false), 4000)
                    session.signal.addEventListener('abort', onAbort, { once: true })
                    // Close the gap between the state read and subscription.
                    void manager.state().then((s) => { if (s === 'PoweredOn') finish(true) }).catch(() => finish(false))
                }))
                if (!ready) {
                    report({ phase: 'error', reason: 'bt-unavailable' })
                    return { ok: false, reason: 'bt-unavailable' }
                }
            }

            report({ phase: 'scanning' })
            device = await step(scanForLeaf(manager, SCAN_TIMEOUT_MS, session.signal))

            report({ phase: 'connecting' })
            const connected = await step(device.connect({ timeout: 15_000 }))
            await step(connected.discoverAllServicesAndCharacteristics())
            let mtu = DEFAULT_MTU
            try {
                const negotiated = await step(connected.requestMTU(247))
                mtu = Math.max(DEFAULT_MTU, (negotiated.mtu ?? 23) - 3)
            } catch {
                if (session.signal.aborted) throw new Error('provisioning cancelled')
                // keep the safe default
            }

            report({ phase: 'writing' })
            await step(provisionLeaf({ transport: makeTransport(connected, mtu), payload, mtu, signal: session.signal }))

            report({ phase: 'success' })
            return { ok: true }
        } catch (err) {
            const reason: LeafProvReason = (err as Error)?.message === 'not-found' ? 'not-found' : 'failed'
            report({ phase: 'error', reason })
            return { ok: false, reason }
        } finally {
            clearTimeout(deadline)
            session.abort()
            // Native teardown is best effort and must not keep the UI waiting.
            if (device) void device.cancelConnection().catch(() => {})
            const manager = managerRef.current
            managerRef.current = null
            if (manager) closingRef.current = manager.destroy().catch(() => {})
            sessionRef.current = null
        }
    }, [])

    return { state, provision, reset }
}
