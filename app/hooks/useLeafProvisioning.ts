// BLE-central provisioning for a listam leaf, on the React Native JS thread
// (NOT the BareKit worklet — Bare can't do BLE). Wraps react-native-ble-plx as
// a transport behind the shared @listam/provisioning orchestrator, so the wire
// format (UUIDs, payload, framing, CRC) is identical to the headless/desktop
// provisioners. Requires a dev-client build (ble-plx is a native module) and a
// physical device (iOS BLE does not work in the simulator).
import { useCallback, useEffect, useRef, useState } from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
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
    const wanted = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ].filter(Boolean) as string[]
    const result = await PermissionsAndroid.requestMultiple(wanted as never)
    return Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
}

function scanForLeaf(manager: BleManager, timeoutMs: number): Promise<Device> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            manager.stopDeviceScan()
            reject(new Error('not-found'))
        }, timeoutMs)
        manager.startDeviceScan([SERVICE_UUID], null, (error: Error | null, device: Device | null) => {
            if (error) {
                clearTimeout(timer)
                manager.stopDeviceScan()
                reject(error)
                return
            }
            if (!device) return
            const name = device.name ?? device.localName ?? ''
            const byName = name.startsWith(ADVERTISED_NAME_PREFIX)
            const bySvc = (device.serviceUUIDs ?? []).some((u: string) => u.toLowerCase() === SERVICE_UUID)
            if (byName || bySvc) {
                clearTimeout(timer)
                manager.stopDeviceScan()
                resolve(device)
            }
        })
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
    const [state, setState] = useState<LeafProvState>({ phase: 'idle' })

    useEffect(() => {
        return () => {
            managerRef.current?.destroy()
            managerRef.current = null
        }
    }, [])

    const reset = useCallback(() => setState({ phase: 'idle' }), [])

    const provision = useCallback(async (payload: ProvisioningPayload): Promise<LeafProvResult> => {
        let device: Device | null = null
        try {
            if (!(await ensureAndroidPermissions())) {
                setState({ phase: 'error', reason: 'permissions' })
                return { ok: false, reason: 'permissions' }
            }
            if (!managerRef.current) managerRef.current = new BleManager()
            const manager = managerRef.current

            // Wait (briefly) for the adapter to be powered on.
            if ((await manager.state()) !== 'PoweredOn') {
                const ready = await new Promise<boolean>((resolve) => {
                    const sub = manager.onStateChange((s: string) => {
                        if (s === 'PoweredOn') {
                            sub.remove()
                            resolve(true)
                        }
                    }, true)
                    setTimeout(() => {
                        sub.remove()
                        resolve(false)
                    }, 4000)
                })
                if (!ready) {
                    setState({ phase: 'error', reason: 'bt-unavailable' })
                    return { ok: false, reason: 'bt-unavailable' }
                }
            }

            setState({ phase: 'scanning' })
            device = await scanForLeaf(manager, SCAN_TIMEOUT_MS)

            setState({ phase: 'connecting' })
            const connected = await device.connect()
            await connected.discoverAllServicesAndCharacteristics()
            let mtu = DEFAULT_MTU
            try {
                const negotiated = await connected.requestMTU(247)
                mtu = Math.max(DEFAULT_MTU, (negotiated.mtu ?? 23) - 3)
            } catch {
                // keep the safe default
            }

            setState({ phase: 'writing' })
            await provisionLeaf({ transport: makeTransport(connected, mtu), payload, mtu })

            setState({ phase: 'success' })
            return { ok: true }
        } catch (err) {
            const reason: LeafProvReason = (err as Error)?.message === 'not-found' ? 'not-found' : 'failed'
            setState({ phase: 'error', reason })
            return { ok: false, reason }
        } finally {
            try {
                // The leaf reboots on success, so this often races a disconnect.
                await device?.cancelConnection()
            } catch {
                /* already gone */
            }
        }
    }, [])

    return { state, provision, reset }
}
