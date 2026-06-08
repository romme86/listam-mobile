// Single source of truth for list-item identity and the array-based list
// projection. Imported by BOTH the backend materialized-view reducer
// (backend/lib/list-reducer.mjs) and the mobile UI projection
// (app/listProjection.ts) so the two cannot drift on ids, ordering, duplicate
// names, or last-write-wins resolution. Keep this module pure (no platform deps)
// so it bundles under bare-pack for the worklet and under Metro for the UI.
//
// Forward-compat: every item carries a `listId` (default 'default') and a list
// `type` (default 'shopping'); identity is `${listId}\0${itemId}` so items in
// different lists never collide. See the "Multiple Lists, Types, And Grouping"
// section of the multi-app plan.

export const DEFAULT_LIST_ID = 'default'
export const DEFAULT_LIST_TYPE = 'shopping'

export function normalizeListId(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_LIST_ID
}

export function normalizeListType(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_LIST_TYPE
}

// Stable id derived from a legacy text-only entry. Partitioned by listId so the
// same text in two different lists yields two different ids.
export function legacyItemId(text, listId = DEFAULT_LIST_ID) {
    return `legacy-${fnv1aHex(`${normalizeListId(listId)}\0${text}`)}`
}

// Resolve an item's stable id: an explicit id/itemId when present, otherwise the
// backfilled legacy id derived from its text. Returns null only when there is no
// usable id and no text to derive one from.
export function normalizeItemId(item) {
    if (!item || typeof item !== 'object') return null
    const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : typeof item.itemId === 'string' && item.itemId.trim()
            ? item.itemId.trim()
            : ''
    if (id) return id
    if (typeof item.text !== 'string') return null
    return legacyItemId(item.text, item.listId)
}

// `${listId}\0${itemId}` — the cross-list-safe identity used for React keys,
// reduction, and projection membership.
export function identityKey(item) {
    const listId = normalizeListId(item?.listId)
    return `${listId}\0${normalizeItemId({ ...item, listId }) ?? ''}`
}

export function updatedAtOf(item) {
    return typeof item?.updatedAt === 'number' ? item.updatedAt : 0
}

// Last-write-wins guard: an update carrying an older `updatedAt` than the item
// it would overwrite is stale and must not clobber the newer state. Equal/newer
// timestamps apply (log/dispatch order breaks ties), keeping the result the same
// on every node regardless of replay order.
export function isStaleUpdate(existing, incoming) {
    return updatedAtOf(incoming) < updatedAtOf(existing)
}

// --- Array projection (the shape the UI holds and the parity test exercises) ---

export function normalizeListEntry(entry) {
    const listId = normalizeListId(entry?.listId)
    const withList = { ...entry, listId }
    return {
        ...withList,
        id: normalizeItemId(withList) || legacyItemId(String(entry?.text ?? ''), listId),
        listType: normalizeListType(entry?.listType),
    }
}

export function normalizeListEntries(entries) {
    if (!Array.isArray(entries)) return []
    return entries.map(normalizeListEntry)
}

export function sameListEntry(left, right) {
    return identityKey(left) === identityKey(right)
}

export function upsertListEntry(entries, entry, placement = 'front') {
    const normalized = normalizeListEntry(entry)
    const existingIndex = entries.findIndex((candidate) => sameListEntry(candidate, normalized))
    if (existingIndex === -1) {
        return placement === 'front'
            ? [normalized, ...entries]
            : [...entries, normalized]
    }

    // A preserve-placement upsert is an update; drop it when it is stale so a
    // late-arriving edit cannot revert a newer one (matches the reducer).
    if (placement !== 'front' && isStaleUpdate(entries[existingIndex], normalized)) {
        return entries
    }

    const next = entries.map((candidate, index) => (
        index === existingIndex ? { ...candidate, ...normalized } : candidate
    ))
    if (placement !== 'front') return next

    const [moved] = next.splice(existingIndex, 1)
    return [moved, ...next]
}

export function updateListEntry(entries, entry) {
    return upsertListEntry(entries, entry, 'preserve')
}

export function deleteListEntry(entries, entry) {
    const normalized = normalizeListEntry(entry)
    return entries.filter((candidate) => !sameListEntry(candidate, normalized))
}

function fnv1aHex(value) {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}
