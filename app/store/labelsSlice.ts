import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
    isLabelItem,
    isPresenceItem,
    isPeerLabelItem,
    isSurfaceLabelItem,
    isBuiltinGroupItem,
    isValueReturnItem,
    reducePeerLabels,
    reduceSurfaceLabels,
    reduceBuiltinGroups,
    reduceValueReturn,
} from '@listam/domain'
import type { RootState } from './store'
import type { ListEntry } from '../components/_types'

// isLabelItem now also covers the presence channel (so every list projection
// hides presence too), but presence lives in its own slice — exclude it here so
// frequent heartbeat writes don't churn the label selectors' memos.
const isLabelOnly = (item: ListEntry) => isLabelItem(item) && !isPresenceItem(item)

// Peer/surface name labels are reserved meta-items that ride the normal item
// pipeline but live in the '__peers__'/'__surfacenames__' buckets. They are
// deliberately filtered OUT of listsSlice (so they never render as a list row
// or spawn a phantom list); this slice is the single place they are retained,
// keyed by item id, so the members screen + built-in surface names can resolve
// human-readable labels. LWW resolution is delegated to the shared reducers.
export type LabelsState = {
    // item id -> raw label item
    itemsById: Record<string, ListEntry>
}

type LabelsSnapshotPayload = {
    listId: string
    listType: string
    items: ListEntry[]
}

const initialState: LabelsState = {
    itemsById: {},
}

const labelsSlice = createSlice({
    name: 'labels',
    initialState,
    reducers: {
        // Fold a batch of items additively (used on the SYNC_LIST snapshot,
        // which is default-list-only — labels live in reserved buckets and
        // mostly arrive per-item, so this must NOT clear existing labels).
        labelsApplied(state, action: PayloadAction<ListEntry[]>) {
            for (const item of action.payload) {
                if (isLabelOnly(item) && item.id) state.itemsById[item.id] = item
            }
        },
        // A structured SYNC_LIST envelope is an exact snapshot of one reserved
        // label bucket. Clear only that channel, leaving the other independent
        // label channels intact, then install the owner's current contents.
        labelsSnapshotApplied(state, action: PayloadAction<LabelsSnapshotPayload>) {
            const { listId, listType, items } = action.payload
            if (!isLabelOnly({ listType } as ListEntry)) return

            for (const [itemId, item] of Object.entries(state.itemsById)) {
                if (item.listId === listId || (!item.listId && item.listType === listType)) {
                    delete state.itemsById[itemId]
                }
            }
            for (const item of items) {
                const normalized = {
                    ...item,
                    listId: item.listId || listId,
                    listType: item.listType || listType,
                }
                if (
                    isLabelOnly(normalized)
                    && normalized.listId === listId
                    && normalized.listType === listType
                    && normalized.id
                ) {
                    state.itemsById[normalized.id] = normalized
                }
            }
        },
        // Fold a single incremental item (add/update). Non-label items are ignored.
        labelItemApplied(state, action: PayloadAction<ListEntry>) {
            const item = action.payload
            if (isLabelOnly(item) && item.id) state.itemsById[item.id] = item
        },
        labelItemRemoved(state, action: PayloadAction<ListEntry>) {
            const item = action.payload
            if (item.id && state.itemsById[item.id]) delete state.itemsById[item.id]
        },
        labelsCleared(state) {
            state.itemsById = {}
        },
    },
})

export const labelsActions = labelsSlice.actions
export default labelsSlice.reducer

const selectLabelsState = (state: RootState) => state.labels

const selectLabelItems = createSelector(selectLabelsState, (state) =>
    Object.values(state.itemsById),
)

// writerKeyHex -> human name
export const selectPeerLabels = createSelector(selectLabelItems, (items) =>
    reducePeerLabels(items.filter(isPeerLabelItem)),
)

// surfaceKey ('listId:type') -> human name
export const selectSurfaceLabels = createSelector(selectLabelItems, (items) =>
    reduceSurfaceLabels(items.filter(isSurfaceLabelItem)),
)

// surfaceKey ('listId:type') -> groupId: which group each built-in surface is
// filed into. Synced (desktop drag / migration) so a joined device shows the
// built-ins in the same group as desktop instead of Ungrouped.
export const selectBuiltinGroups = createSelector(selectLabelItems, (items) =>
    reduceBuiltinGroups(items.filter(isBuiltinGroupItem)),
)

// surfaceKey ('listId:type') -> true: which surfaces have the value-return
// property enabled (each item must be rated 1-10 value + 1-10 delay to add it).
export const selectValueReturnEnabled = createSelector(selectLabelItems, (items) =>
    reduceValueReturn(items.filter(isValueReturnItem)),
)
