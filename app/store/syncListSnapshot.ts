import type { ListEntry } from '../components/_types'

export type LegacySyncListSnapshot = {
    mode: 'legacy'
    items: ListEntry[]
}

export type StructuredSyncListSnapshot = {
    mode: 'bucket'
    listId: string
    listType: string
    items: ListEntry[]
}

export type SyncListSnapshot = LegacySyncListSnapshot | StructuredSyncListSnapshot

// SYNC_LIST historically carried a bare array containing the personal default
// list. Epoch repair now also emits an exact bucket envelope so a receiver can
// remove stale entries which no longer exist on the owner. Decode both shapes
// here, at the UI boundary, rather than teaching every reducer about transport
// details. The shared client decoder intentionally leaves this JSON field as
// `unknown`, so rolling upgrades remain backwards compatible.
export function decodeSyncListSnapshot(value: unknown): SyncListSnapshot | null {
    if (Array.isArray(value)) {
        return { mode: 'legacy', items: value as ListEntry[] }
    }

    if (!value || typeof value !== 'object') return null
    const candidate = value as Record<string, unknown>
    if (!Array.isArray(candidate.list)) return null
    if (typeof candidate.listId !== 'string' || candidate.listId.length === 0) return null
    if (typeof candidate.listType !== 'string' || candidate.listType.length === 0) return null

    return {
        mode: 'bucket',
        listId: candidate.listId,
        listType: candidate.listType,
        items: candidate.list as ListEntry[],
    }
}
