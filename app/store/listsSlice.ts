import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type { ListEntry } from '../components/_types'
import { isLabelItem, sortByOrder } from '@listam/domain'
import {
    DEFAULT_LIST_ID,
    DEFAULT_LIST_TYPE,
    deleteListEntry,
    identityKey,
    normalizeListEntries,
    updateListEntry,
    upsertListEntry,
} from '../listProjection'

export const DEFAULT_PROJECT_ID = 'personal'
export const DEFAULT_FOLDER_ID = 'personal-root'

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
    selectedListId: DEFAULT_LIST_ID,
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
            const listId = action.payload.listId || DEFAULT_LIST_ID
            ensureProject(state, projectId)
            ensureList(state, listId, action.payload.listType || DEFAULT_LIST_TYPE, projectId)
            state.selectedProjectId = projectId
            state.selectedListId = listId
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
            replaceListItems(
                state,
                payload.listId || state.selectedListId,
                payload.listType || DEFAULT_LIST_TYPE,
                payload.items,
            )
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
            replaceListItems(state, state.selectedListId, DEFAULT_LIST_TYPE, [])
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
) {
    const list = ensureList(state, listId, listType)

    for (const itemId of list.itemIds) delete state.itemsById[itemId]

    // Label meta-items (peer/surface names) ride the normal item pipeline but
    // live in reserved buckets — never project them into a list row.
    const normalized = normalizeListEntries(
        entries
            .filter((entry) => !isLabelItem(entry))
            .map((entry) => ({
                ...entry,
                listId: entry.listId || listId,
                listType: entry.listType || list.type || listType,
            })),
    )

    const itemIds: string[] = []
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

    const normalized = normalizeListEntries([entry])[0]
    if (!normalized) return

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
// per-board/list settings screen's "delete all" action.
export const selectItemsForList = (state: RootState, listId: string): ListEntry[] => {
    const list = state.lists.listsById[listId]
    if (!list) return []
    return sortByOrder(
        list.itemIds
            .map((itemId) => state.lists.itemsById[itemId])
            .filter((item): item is ListEntry => Boolean(item)),
    )
}

// Items of the selected list in display order: insertion order with the user's
// manual `order` (set by reordering) layered on top via sortByOrder.
export const selectSelectedListItems = createSelector(
    selectListsState,
    (state) => {
        const list = state.listsById[state.selectedListId]
        if (!list) return []
        return sortByOrder(
            list.itemIds
                .map((itemId) => state.itemsById[itemId])
                .filter((item): item is ListEntry => Boolean(item)),
        )
    },
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
