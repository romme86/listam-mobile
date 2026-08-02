import type { ListEntry } from '../components/_types'
import { decodeSyncListSnapshot as decodeClientSyncListSnapshot } from '@listam/client'

export type LegacySyncListSnapshot = {
    mode: 'legacy'
    items: ListEntry[]
    baseKey: string | null
}

export type StructuredSyncListSnapshot = {
    mode: 'bucket'
    listId: string
    listType: string
    items: ListEntry[]
    baseKey: string | null
}

export type SyncListSnapshot = LegacySyncListSnapshot | StructuredSyncListSnapshot

// SYNC_LIST historically carried a bare array containing the personal default
// list. Epoch repair now also emits an exact bucket envelope so a receiver can
// remove stale entries which no longer exist on the owner. Decode both shapes
// here, at the UI boundary, rather than teaching every reducer about transport
// details. The shared client decoder owns rolling-upgrade compatibility; this
// wrapper narrows its item arrays to the mobile app's ListEntry type.
export function decodeSyncListSnapshot(value: unknown): SyncListSnapshot | null {
    const decoded = decodeClientSyncListSnapshot(value)
    if (!decoded) return null
    return decoded as SyncListSnapshot
}

// Shared snapshots carry the base key on their envelope. Rows must be stamped
// before listsSlice keys them by (baseKey,listId,id), or subsequent tagged
// updates/deletes will miss the restart-restored copy.
export function materializeSnapshotItems(snapshot: SyncListSnapshot): ListEntry[] {
    if (!snapshot.baseKey) return snapshot.items
    return snapshot.items.map((item) => ({ ...item, baseKey: snapshot.baseKey as string }))
}
