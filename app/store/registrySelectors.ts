import { createSelector } from '@reduxjs/toolkit'
import { reduceRegistry, REGISTRY_LIST_ID, REGISTRY_LIST_TYPE, type RegistryListView } from '@listam/domain/list-registry'
import { toNavLibrary, type NavLibrary } from '@listam/domain/list-nav'
import { DEFAULT_LIST_ID, DEFAULT_LIST_TYPE, TODO_LIST_TYPE, isTodoType } from '@listam/domain/identity'
import { BOARD_LIST_TYPE, isBoardType } from '@listam/domain/board'
import { PEER_LABEL_LIST_ID, SURFACE_LABEL_LIST_ID, BUILTIN_GROUP_LIST_ID, PLAN_LIST_ID, surfaceLabelKey } from '@listam/domain'
import { selectSurfaceLabels, selectBuiltinGroups } from './labelsSlice'
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
const selectBoardEnabled = (state: RootState) => state.preferences.boardEnabled
const selectCurrentListId = (state: RootState) => state.lists.selectedListId

export const selectRegistry = createSelector(selectListsState, (lists) => {
    const metaItems = Object.values(lists.itemsById).filter((it) => it.listType === REGISTRY_LIST_TYPE)
    return reduceRegistry(metaItems)
})

// The fixed display order of the built-in surfaces and the SHARED i18n key for
// each one's name when the user hasn't renamed it (the rename channel wins).
export const BUILTIN_SURFACE_TYPES = [DEFAULT_LIST_TYPE, BOARD_LIST_TYPE, TODO_LIST_TYPE] as const
export function builtinSurfaceNameKey(
    type: string,
): 'desktop.rail.board' | 'desktop.rail.todo' | 'desktop.rail.groceries' {
    if (isBoardType(type)) return 'desktop.rail.board'
    if (isTodoType(type)) return 'desktop.rail.todo'
    return 'desktop.rail.groceries'
}
// A nav id is a built-in surface when it is the composite surfaceLabelKey of the
// shared 'default' list (so `default:shopping|board|todo`).
export function isBuiltinSurfaceId(id: string): boolean {
    return typeof id === 'string' && id.startsWith(`${DEFAULT_LIST_ID}:`)
}

// The built-in surfaces (Groceries / Board / Todo) share listId 'default' and so
// have no registry meta-item. We synthesize one nav entry per surface with a
// COMPOSITE id (= surfaceLabelKey) so the pager can tell them apart, name each
// from the synced rename channel, and file each into its synced group placement.
// Board follows desktop's gate: shown when boardEnabled OR a board ticket already
// exists on 'default' (so an incoming shared board stays reachable).
export const selectNavLibrary = createSelector(
    selectListsState,
    selectRegistry,
    selectDefaultListId,
    selectSurfaceLabels,
    selectBuiltinGroups,
    selectBoardEnabled,
    (lists, registry, defaultListId, surfaceLabels, builtinGroups, boardEnabled): NavLibrary => {
        const items = Object.values(lists.itemsById)
        const hasBoardOnDefault = items.some((it) => it.listId === DEFAULT_LIST_ID && isBoardType(it.listType))
        const builtinLists = BUILTIN_SURFACE_TYPES.filter(
            (type) => !isBoardType(type) || boardEnabled || hasBoardOnDefault,
        ).map((type, i) => {
            const key = surfaceLabelKey(DEFAULT_LIST_ID, type)
            return {
                id: key,
                // '' when un-renamed; the consumer localizes via builtinSurfaceNameKey.
                name: surfaceLabels.get(key) ?? '',
                type,
                groupId: builtinGroups.get(key) || null,
                order: i,
                baseKey: null,
            }
        })

        // Lists that exist (have a ListRecord) but aren't filed in the registry yet
        // → Ungrouped. Reserved buckets ('__peers__','__surfacenames__',
        // '__builtingroups__','__plan__') must never surface as phantom lists, and
        // raw 'default' is now represented by the three built-in surfaces above.
        const filed = new Set(registry.lists.map((l) => l.id))
        const extraLists = Object.values(lists.listsById)
            .filter(
                (l) =>
                    l.id !== REGISTRY_LIST_ID &&
                    l.type !== REGISTRY_LIST_TYPE &&
                    l.id !== PEER_LABEL_LIST_ID &&
                    l.id !== SURFACE_LABEL_LIST_ID &&
                    l.id !== BUILTIN_GROUP_LIST_ID &&
                    l.id !== PLAN_LIST_ID &&
                    l.id !== DEFAULT_LIST_ID &&
                    !filed.has(l.id),
            )
            .map((l) => ({ id: l.id, name: l.name, type: l.type }))

        // Built-ins lead, then the registry's named lists (dropping any stale
        // 'default' meta-item a legacy rename may have written — desktop ignores
        // it too). toNavLibrary files everything by groupId, clamping an unknown
        // group to Ungrouped.
        const augmented = {
            groups: registry.groups,
            lists: [...builtinLists, ...registry.lists.filter((l) => l.id !== DEFAULT_LIST_ID)],
        }
        return toNavLibrary(augmented, { extraLists, defaultListId })
    },
)

// The shared-base key of the currently-selected list (null = personal base).
// Threaded onto RPC writes so a shared list's mutations route to its own base.
export const selectCurrentListBaseKey = createSelector(
    selectNavLibrary,
    selectCurrentListId,
    (lib, currentId): string | null => lib.listsById[currentId]?.baseKey ?? null,
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
