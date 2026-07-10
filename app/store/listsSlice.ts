import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type { ListEntry } from '../components/_types'
import { isLabelItem, isPlanItem, sortByOrder, surfaceLabelKey } from '@listam/domain'
import { REGISTRY_LIST_TYPE } from '@listam/domain/list-registry'
import {
    DEFAULT_LIST_ID,
    DEFAULT_LIST_TYPE,
    decodeSurface,
    deleteListEntry,
    identityKey,
    matchesSurfaceType,
    normalizeListEntries,
    updateListEntry,
    upsertListEntry,
} from '../listProjection'

export const DEFAULT_PROJECT_ID = 'personal'
export const DEFAULT_FOLDER_ID = 'personal-root'

// The grocery built-in surface's composite nav id — the default selection until
// the launch effect applies the user's per-device default. (Items still live in
// the real DEFAULT_LIST_ID bucket; only the nav id is composite.)
export const DEFAULT_SURFACE_ID = surfaceLabelKey(DEFAULT_LIST_ID, DEFAULT_LIST_TYPE)

export type ProjectRecord = {
    id: string
    name: string
    folderIds: string[]
    listIds: string[]
}

export type FolderRecord = {
    id: string
    projectId: string
    name: string
    listIds: string[]
}

export type ListRecord = {
    id: string
    projectId: string
    folderId: string | null
    name: string
    type: string
    itemIds: string[]
}

export type ListsState = {
    selectedProjectId: string
    selectedListId: string
    projectIds: string[]
    projectsById: Record<string, ProjectRecord>
    folderIds: string[]
    foldersById: Record<string, FolderRecord>
    listIds: string[]
    listsById: Record<string, ListRecord>
    itemsById: Record<string, ListEntry>
}

const initialState: ListsState = {
    selectedProjectId: DEFAULT_PROJECT_ID,
    selectedListId: DEFAULT_SURFACE_ID,
    projectIds: [DEFAULT_PROJECT_ID],
    projectsById: {
        [DEFAULT_PROJECT_ID]: {
            id: DEFAULT_PROJECT_ID,
            name: 'Personal',
            folderIds: [DEFAULT_FOLDER_ID],
            listIds: [DEFAULT_LIST_ID],
        },
    },
    folderIds: [DEFAULT_FOLDER_ID],
    foldersById: {
        [DEFAULT_FOLDER_ID]: {
            id: DEFAULT_FOLDER_ID,
            projectId: DEFAULT_PROJECT_ID,
            name: 'Lists',
            listIds: [DEFAULT_LIST_ID],
        },
    },
    listIds: [DEFAULT_LIST_ID],
    listsById: {
        [DEFAULT_LIST_ID]: {
            id: DEFAULT_LIST_ID,
            projectId: DEFAULT_PROJECT_ID,
            folderId: DEFAULT_FOLDER_ID,
            name: 'Shopping',
            type: DEFAULT_LIST_TYPE,
            itemIds: [],
        },
    },
    itemsById: {},
}

type ReplaceListItemsPayload = {
    listId?: string
    listType?: string
    items: ListEntry[]
}

const listsSlice = createSlice({
    name: 'lists',
    initialState,
    reducers: {
        selectedListChanged(
            state,
            action: PayloadAction<{ projectId?: string; listId: string; listType?: string }>,
        ) {
            const projectId = action.payload.projectId || state.selectedProjectId
            const navId = action.payload.listId || DEFAULT_SURFACE_ID
            // A built-in surface's nav id is composite ('default:type'); the real
            // backend bucket is 'default'. Materialize the REAL bucket but remember
            // the composite as the selection so the pager/menu highlight it.
            const { listId } = decodeSurface(navId)
            ensureProject(state, projectId)
            ensureList(state, listId, action.payload.listType || DEFAULT_LIST_TYPE, projectId)
            state.selectedProjectId = projectId
            state.selectedListId = navId
        },
        selectedListItemsSynced(state, action: PayloadAction<ListEntry[] | ReplaceListItemsPayload>) {
            const payload = Array.isArray(action.payload)
                ? { items: action.payload }
                : action.payload
            // The backend's SYNC_LIST always carries the DEFAULT list (every other
            // list replicates per-item via add-from-backend), so fold it into the
            // default bucket — NOT the currently-selected list. Folding into the
            // selection would wipe a non-default list the user is viewing whenever
            // a startup/peer-connect rebuild sync lands.
            replaceListItems(
                state,
                payload.listId || DEFAULT_LIST_ID,
                payload.listType || DEFAULT_LIST_TYPE,
                payload.items,
            )
        },
        selectedListItemsReplaced(state, action: PayloadAction<ListEntry[] | ReplaceListItemsPayload>) {
            const payload = Array.isArray(action.payload)
                ? { items: action.payload }
                : action.payload
            // The payload is one surface's items (the visible, type-filtered list).
            // Decode to the REAL bucket and surface-scope the replace, so replacing
            // the grocery view never wipes the board/todo items in 'default'.
            const { listId, listType } = decodeSurface(payload.listId || state.selectedListId)
            replaceListItems(
                state,
                listId,
                payload.listType || listType || DEFAULT_LIST_TYPE,
                payload.items,
                listId === DEFAULT_LIST_ID ? listType : undefined,
            )
        },
        // Remove a whole named list bucket (used when a list is deleted). Emptying
        // the bucket is NOT enough: a leftover empty ListRecord in listsById would
        // reappear as a stray "Ungrouped" list once the registry tombstone lands
        // (extraLists in registrySelectors scans listsById, not items). So drop the
        // record and unlink it from every index. Built-ins ('default') are never
        // removed — they have no registry meta-item and share the bucket.
        listRemoved(state, action: PayloadAction<{ listId: string }>) {
            const listId = action.payload?.listId
            if (!listId || listId === DEFAULT_LIST_ID) return
            const list = state.listsById[listId]
            if (!list) return
            for (const itemId of list.itemIds) delete state.itemsById[itemId]
            delete state.listsById[listId]
            state.listIds = state.listIds.filter((id) => id !== listId)
            const project = state.projectsById[list.projectId]
            if (project) project.listIds = project.listIds.filter((id) => id !== listId)
            if (list.folderId) {
                const folder = state.foldersById[list.folderId]
                if (folder) folder.listIds = folder.listIds.filter((id) => id !== listId)
            }
        },
        listItemAdded(state, action: PayloadAction<ListEntry>) {
            applyItemProjection(state, action.payload, 'add')
        },
        listItemUpdated(state, action: PayloadAction<ListEntry>) {
            applyItemProjection(state, action.payload, 'update')
        },
        listItemDeleted(state, action: PayloadAction<ListEntry>) {
            applyItemProjection(state, action.payload, 'delete')
        },
        selectedListCleared(state) {
            const { listId, listType } = decodeSurface(state.selectedListId)
            replaceListItems(
                state,
                listId,
                listType || DEFAULT_LIST_TYPE,
                [],
                listId === DEFAULT_LIST_ID ? listType : undefined,
            )
        },
    },
})

function ensureProject(state: ListsState, projectId: string): ProjectRecord {
    if (!state.projectsById[projectId]) {
        state.projectsById[projectId] = {
            id: projectId,
            name: projectId === DEFAULT_PROJECT_ID ? 'Personal' : 'Project',
            folderIds: [],
            listIds: [],
        }
        state.projectIds.push(projectId)
    }
    return state.projectsById[projectId]
}

function ensureFolder(state: ListsState, folderId: string, projectId: string): FolderRecord {
    ensureProject(state, projectId)
    if (!state.foldersById[folderId]) {
        state.foldersById[folderId] = {
            id: folderId,
            projectId,
            name: folderId === DEFAULT_FOLDER_ID ? 'Lists' : 'Folder',
            listIds: [],
        }
        state.folderIds.push(folderId)
    }

    const project = state.projectsById[projectId]
    if (!project.folderIds.includes(folderId)) project.folderIds.push(folderId)
    return state.foldersById[folderId]
}

function ensureList(
    state: ListsState,
    listId: string,
    listType: string,
    projectId = state.selectedProjectId,
): ListRecord {
    ensureProject(state, projectId)
    ensureFolder(state, DEFAULT_FOLDER_ID, projectId)

    if (!state.listsById[listId]) {
        state.listsById[listId] = {
            id: listId,
            projectId,
            folderId: DEFAULT_FOLDER_ID,
            name: listId === DEFAULT_LIST_ID ? 'Shopping' : 'List',
            type: listType,
            itemIds: [],
        }
        state.listIds.push(listId)
    } else {
        state.listsById[listId].type = listType || state.listsById[listId].type
    }

    const project = state.projectsById[projectId]
    const folder = state.foldersById[DEFAULT_FOLDER_ID]
    if (!project.listIds.includes(listId)) project.listIds.push(listId)
    if (!folder.listIds.includes(listId)) folder.listIds.push(listId)
    return state.listsById[listId]
}

// A registry meta-item tagged with a top-level baseKey is a SHARED base's own
// self-description (not the personal registry entry, which carries regBaseKey but
// no top-level baseKey). The personal registry stays authoritative for the nav.
function isSharedRegistryItem(entry: ListEntry): boolean {
    return entry.listType === REGISTRY_LIST_TYPE && !!entry.baseKey
}

function entriesForList(state: ListsState, listId: string): ListEntry[] {
    const list = state.listsById[listId]
    if (!list) return []
    return list.itemIds
        .map((itemId) => state.itemsById[itemId])
        .filter((item): item is ListEntry => Boolean(item))
}

function replaceListItems(
    state: ListsState,
    listId: string,
    listType: string,
    entries: ListEntry[],
    // When set (only for the shared 'default' bucket), replace ONLY this surface's
    // items and KEEP the other built-in surfaces' items, which share the bucket.
    scopeType?: string,
) {
    const list = ensureList(state, listId, listType)

    const scoped = listId === DEFAULT_LIST_ID && scopeType !== undefined
    const keptIds: string[] = []
    for (const itemId of list.itemIds) {
        const existing = state.itemsById[itemId]
        if (scoped && existing && !matchesSurfaceType(scopeType, existing)) {
            keptIds.push(itemId) // a different built-in surface — leave it untouched
        } else {
            delete state.itemsById[itemId]
        }
    }

    // Label + plan meta-items ride the normal item pipeline but live in reserved
    // buckets — never project them into a list row.
    const normalized = normalizeListEntries(
        entries
            .filter((entry) => !isLabelItem(entry) && !isPlanItem(entry) && !isSharedRegistryItem(entry))
            .map((entry) => ({
                ...entry,
                listId: entry.listId || listId,
                listType: entry.listType || list.type || listType,
            })),
    )

    const itemIds: string[] = [...keptIds]
    for (const item of normalized) {
        const itemId = identityKey(item)
        state.itemsById[itemId] = item
        if (!itemIds.includes(itemId)) itemIds.push(itemId)
    }

    list.itemIds = itemIds
}

function applyItemProjection(
    state: ListsState,
    entry: ListEntry,
    operation: 'add' | 'update' | 'delete',
) {
    // Label meta-items (peer/surface names) live in reserved buckets and must
    // never spawn a phantom list or render as a row — drop them here so an
    // un-updated peer tolerates desktop/headless writing labels.
    if (isLabelItem(entry)) return
    // A SHARED single-list base seeds its OWN self-describing registry meta-item,
    // which the backend pushes here tagged with a top-level baseKey. The personal
    // registry is authoritative for the nav, so drop it — otherwise it collides
    // by identityKey with the personal entry and clobbers its regBaseKey
    // (→ writes mis-route to the personal base).
    if (isSharedRegistryItem(entry)) return

    const normalized = normalizeListEntries([entry])[0]
    if (!normalized) return

    // Plan meta-items (the day-plan channel) also ride the item pipeline but are
    // a cross-list overlay, not list rows: keep them in itemsById (so the
    // Overview can read them) but never file them under a list bucket.
    if (isPlanItem(normalized)) {
        const planKey = identityKey(normalized)
        if (operation === 'delete') delete state.itemsById[planKey]
        else state.itemsById[planKey] = normalized
        return
    }

    const listId = normalized.listId || DEFAULT_LIST_ID
    const listType = normalized.listType || DEFAULT_LIST_TYPE
    ensureList(state, listId, listType)

    const current = entriesForList(state, listId)
    const next = operation === 'delete'
        ? deleteListEntry(current, normalized)
        : operation === 'update'
            ? updateListEntry(current, normalized)
            : upsertListEntry(current, normalized)

    replaceListItems(state, listId, listType, next)
}

export const listsActions = listsSlice.actions
export default listsSlice.reducer

const selectListsState = (state: RootState) => state.lists

export const selectSelectedProjectId = createSelector(
    selectListsState,
    (state) => state.selectedProjectId,
)

export const selectSelectedListId = createSelector(
    selectListsState,
    (state) => state.selectedListId,
)

// Items belonging to an arbitrary list (not just the selected one) — used by the
// per-board/list settings screen's "delete all" action. A built-in surface's
// composite id resolves to the real 'default' bucket, filtered to that surface.
export const selectItemsForList = (state: RootState, navId: string): ListEntry[] => {
    const { listId, listType } = decodeSurface(navId)
    const list = state.lists.listsById[listId]
    if (!list) return []
    const items = list.itemIds
        .map((itemId) => state.lists.itemsById[itemId])
        .filter((item): item is ListEntry => Boolean(item))
    const scoped = listId === DEFAULT_LIST_ID
        ? items.filter((item) => matchesSurfaceType(listType, item))
        : items
    return sortByOrder(scoped)
}

// Items of the selected list in display order: insertion order with the user's
// manual `order` (set by reordering) layered on top via sortByOrder.
export const selectSelectedListItems = createSelector(
    selectListsState,
    (state) => {
        // For a built-in surface the selection is a composite id over the shared
        // 'default' bucket — read the real bucket and keep only this surface's
        // typed items so grocery/board/todo never bleed into one another.
        const { listId, listType } = decodeSurface(state.selectedListId)
        const list = state.listsById[listId]
        if (!list) return []
        const items = list.itemIds
            .map((itemId) => state.itemsById[itemId])
            .filter((item): item is ListEntry => Boolean(item))
        const scoped = listId === DEFAULT_LIST_ID
            ? items.filter((item) => matchesSurfaceType(listType, item))
            : items
        return sortByOrder(scoped)
    },
)

// Every materialized item across every bucket (real rows + reserved meta-items
// like the plan channel). The Overview reduces the plan entries out of this and
// joins them back to their source rows.
export const selectAllItems = createSelector(
    selectListsState,
    (state) => Object.values(state.itemsById),
)

export const selectListLibrary = createSelector(
    selectListsState,
    (state) => ({
        selectedProjectId: state.selectedProjectId,
        selectedListId: state.selectedListId,
        projectIds: state.projectIds,
        projectsById: state.projectsById,
        folderIds: state.folderIds,
        foldersById: state.foldersById,
        listIds: state.listIds,
        listsById: state.listsById,
    }),
)
