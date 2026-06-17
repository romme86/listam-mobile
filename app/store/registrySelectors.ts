import { createSelector } from '@reduxjs/toolkit'
import { reduceRegistry, REGISTRY_LIST_ID, REGISTRY_LIST_TYPE, type RegistryListView } from '@listam/domain/list-registry'
import { toNavLibrary, type NavLibrary } from '@listam/domain/list-nav'
import { isTodoType } from '@listam/domain/identity'
import type { RootState } from './store'

// Defaults for a list's view settings, applied when a list carries no override.
// (Lifted from the former global preferences defaults — now per-list & synced.)
export const DEFAULT_VIEW: RegistryListView = {
    isGridView: false,
    categoriesEnabled: true,
    categoryHeadersVisible: true,
    showFab: false,
    gridIconSize: 'normal',
    listTextSize: 'normal',
    listAlignment: 'left',
    listItemSpacing: 'normal',
    itemIconVariant: 'illustrated',
}

// The list registry (groups + typed lists + order) is synced as reserved
// meta-items (listType === 'registry') that ride the normal item pipeline, so
// it lives inside listsSlice.itemsById. These selectors project it into the
// ordered NavLibrary the menu + swipe pager consume. (No separate slice.)

const selectListsState = (state: RootState) => state.lists
const selectDefaultListId = (state: RootState) => state.preferences.defaultListId
const selectCurrentListId = (state: RootState) => state.lists.selectedListId

export const selectRegistry = createSelector(selectListsState, (lists) => {
    const metaItems = Object.values(lists.itemsById).filter((it) => it.listType === REGISTRY_LIST_TYPE)
    return reduceRegistry(metaItems)
})

// Lists that exist (have a ListRecord) but aren't filed in the registry yet →
// surfaced in the implicit Ungrouped group so nothing is ever lost.
export const selectNavLibrary = createSelector(
    selectListsState,
    selectRegistry,
    selectDefaultListId,
    (lists, registry, defaultListId): NavLibrary => {
        const filed = new Set(registry.lists.map((l) => l.id))
        const extraLists = Object.values(lists.listsById)
            .filter((l) => l.id !== REGISTRY_LIST_ID && l.type !== REGISTRY_LIST_TYPE && !filed.has(l.id))
            .map((l) => ({ id: l.id, name: l.name, type: l.type }))
        return toNavLibrary(registry, { extraLists, defaultListId })
    },
)

export type GroupedLists = Array<{
    group: NavLibrary['groups'][number]
    lists: NavLibrary['listsById'][string][]
}>

export const selectGroupedLists = createSelector(selectNavLibrary, (lib): GroupedLists =>
    lib.groups.map((group) => ({
        group,
        lists: group.listIds.map((id) => lib.listsById[id]).filter(Boolean),
    })),
)

// The effective view settings for the currently-selected list: the list's own
// synced overrides merged over DEFAULT_VIEW, so components always get a full set.
//
// To-do lists are plain text only — they can never be grid or categorized, so we
// clamp those two flags off here regardless of any (possibly stale) synced
// override. This is the single source of truth the whole list screen reads, so
// the clamp guarantees the grocery-intelligence surfaces (grid, category
// grouping, category drag) stay dark for a to-do list everywhere at once.
export const selectCurrentListView = createSelector(
    selectNavLibrary,
    selectCurrentListId,
    (lib, currentId): RegistryListView => {
        const view: RegistryListView = {
            ...DEFAULT_VIEW,
            ...(lib.listsById[currentId]?.view ?? {}),
        }
        if (isTodoType(lib.listsById[currentId]?.type)) {
            return { ...view, isGridView: false, categoriesEnabled: false }
        }
        return view
    },
)
