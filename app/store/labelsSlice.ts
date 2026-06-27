import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
    isLabelItem,
    isPeerLabelItem,
    isSurfaceLabelItem,
    isBuiltinGroupItem,
    reducePeerLabels,
    reduceSurfaceLabels,
    reduceBuiltinGroups,
} from '@listam/domain'
import type { RootState } from './store'
import type { ListEntry } from '../components/_types'

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
                if (isLabelItem(item) && item.id) state.itemsById[item.id] = item
            }
        },
        // Fold a single incremental item (add/update). Non-label items are ignored.
        labelItemApplied(state, action: PayloadAction<ListEntry>) {
            const item = action.payload
            if (isLabelItem(item) && item.id) state.itemsById[item.id] = item
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
