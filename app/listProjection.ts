// Typed UI wrapper over the shared domain package. The implementation is
// shared verbatim with the backend reducer, so the
// materialized view and the UI projection cannot drift on ids, ordering,
// duplicate names, or last-write-wins resolution.
import type { ListEntry } from './components/_types'
import {
    DEFAULT_LIST_ID as SHARED_DEFAULT_LIST_ID,
    DEFAULT_LIST_TYPE as SHARED_DEFAULT_LIST_TYPE,
    identityKey as sharedIdentityKey,
    normalizeListEntry as sharedNormalizeListEntry,
    normalizeListEntries as sharedNormalizeListEntries,
    upsertListEntry as sharedUpsertListEntry,
    updateListEntry as sharedUpdateListEntry,
    deleteListEntry as sharedDeleteListEntry,
    sameListEntry as sharedSameListEntry,
} from '@listam/domain/identity'

export const DEFAULT_LIST_ID: string = SHARED_DEFAULT_LIST_ID
export const DEFAULT_LIST_TYPE: string = SHARED_DEFAULT_LIST_TYPE

export function normalizeListEntry(entry: ListEntry): ListEntry {
    return sharedNormalizeListEntry(entry)
}

export function normalizeListEntries(entries: ListEntry[]): ListEntry[] {
    return sharedNormalizeListEntries(entries)
}

export function upsertListEntry(
    entries: ListEntry[],
    entry: ListEntry,
    placement: 'front' | 'preserve' = 'front',
): ListEntry[] {
    return sharedUpsertListEntry(entries, entry, placement)
}

export function updateListEntry(entries: ListEntry[], entry: ListEntry): ListEntry[] {
    return sharedUpdateListEntry(entries, entry)
}

export function deleteListEntry(entries: ListEntry[], entry: ListEntry): ListEntry[] {
    return sharedDeleteListEntry(entries, entry)
}

export function sameListEntry(left: ListEntry, right: ListEntry): boolean {
    return sharedSameListEntry(left, right)
}

export function identityKey(entry: ListEntry): string {
    return sharedIdentityKey(entry)
}
