// Typed UI wrapper over the shared domain package. The implementation is
// shared verbatim with the backend reducer, so the
// materialized view and the UI projection cannot drift on ids, ordering,
// duplicate names, or last-write-wins resolution.
import type { ListEntry } from './components/_types'
import {
    DEFAULT_LIST_ID as SHARED_DEFAULT_LIST_ID,
    DEFAULT_LIST_TYPE as SHARED_DEFAULT_LIST_TYPE,
    TODO_LIST_TYPE as SHARED_TODO_LIST_TYPE,
    isTodoType as sharedIsTodoType,
    identityKey as sharedIdentityKey,
    normalizeListEntry as sharedNormalizeListEntry,
    normalizeListEntries as sharedNormalizeListEntries,
    upsertListEntry as sharedUpsertListEntry,
    updateListEntry as sharedUpdateListEntry,
    deleteListEntry as sharedDeleteListEntry,
    sameListEntry as sharedSameListEntry,
} from '@listam/domain/identity'
import { isBoardType as sharedIsBoardType } from '@listam/domain/board'

export const DEFAULT_LIST_ID: string = SHARED_DEFAULT_LIST_ID
export const DEFAULT_LIST_TYPE: string = SHARED_DEFAULT_LIST_TYPE
export const TODO_LIST_TYPE: string = SHARED_TODO_LIST_TYPE

export function isTodoType(type: string | undefined | null): boolean {
    return sharedIsTodoType(type)
}

// The built-in surfaces (Groceries / Board / Todo) all share listId 'default',
// so the nav presents them with COMPOSITE ids `default:<type>` (= surfaceLabelKey)
// to keep them distinct in the string-keyed pager. decodeSurface maps a nav id
// back to the REAL backend bucket: a composite → { 'default', <type> }, any other
// id → itself with an empty type (the caller falls back to the list's own type).
export function decodeSurface(navId: string): { listId: string; listType: string } {
    const idx = typeof navId === 'string' ? navId.indexOf(':') : -1
    if (idx > 0) return { listId: navId.slice(0, idx), listType: navId.slice(idx + 1) }
    return { listId: navId, listType: '' }
}

// Does an item belong to a given built-in surface? Mirrors desktop's typePredicate
// (ui.mjs): board = isBoardType (dual-reads 'board'/'kanban'), todo = isTodoType,
// grocery = neither (the empty/default surface type also means grocery). Used to
// split + surface-scope the shared 'default' bucket so the three surfaces never
// bleed into or wipe one another.
export function matchesSurfaceType(surfaceType: string | undefined, item: ListEntry): boolean {
    const t = item?.listType
    if (sharedIsBoardType(surfaceType)) return sharedIsBoardType(t)
    if (sharedIsTodoType(surfaceType)) return sharedIsTodoType(t)
    return !sharedIsBoardType(t) && !sharedIsTodoType(t)
}

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
