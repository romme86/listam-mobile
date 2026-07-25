import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { isPresenceItem, reducePresence, type PresenceEntry } from '@listam/domain'
import type { RootState } from './store'
import type { ListEntry } from '../components/_types'

// The synced presence/heartbeat channel rides the normal item stream (reserved
// '__presence__' bucket) exactly like the label channels, and is likewise filtered
// out of listsSlice so it never renders as a list row. This slice is the single
// place presence items are retained, keyed by item id, so the members screen can
// resolve each peer's online-now / last-seen / last-ping / avg-online. Kept
// separate from labelsSlice so frequent heartbeat writes don't churn the label
// selectors' memos. LWW resolution is delegated to reducePresence.
export type PresenceState = {
    itemsById: Record<string, ListEntry>
}

type PresenceSnapshotPayload = {
    listId: string
    listType: string
    items: ListEntry[]
}

const initialState: PresenceState = {
    itemsById: {},
}

const presenceSlice = createSlice({
    name: 'presence',
    initialState,
    reducers: {
        presenceApplied(state, action: PayloadAction<ListEntry[]>) {
            for (const item of action.payload) {
                if (isPresenceItem(item) && item.id) state.itemsById[item.id] = item
            }
        },
        // Exact structured snapshot for the reserved presence channel. Legacy
        // bare-array SYNC_LIST events remain additive via presenceApplied.
        presenceSnapshotApplied(state, action: PayloadAction<PresenceSnapshotPayload>) {
            const { listId, listType, items } = action.payload
            if (!isPresenceItem({ listType })) return

            for (const [itemId, item] of Object.entries(state.itemsById)) {
                if (isPresenceItem(item)) delete state.itemsById[itemId]
            }
            for (const item of items) {
                const normalized = {
                    ...item,
                    listId: item.listId || listId,
                    listType: item.listType || listType,
                }
                if (
                    isPresenceItem(normalized)
                    && normalized.listId === listId
                    && normalized.listType === listType
                    && normalized.id
                ) {
                    state.itemsById[normalized.id] = normalized
                }
            }
        },
        presenceItemApplied(state, action: PayloadAction<ListEntry>) {
            const item = action.payload
            if (isPresenceItem(item) && item.id) state.itemsById[item.id] = item
        },
        presenceItemRemoved(state, action: PayloadAction<ListEntry>) {
            const item = action.payload
            if (item.id && state.itemsById[item.id]) delete state.itemsById[item.id]
        },
        presenceCleared(state) {
            state.itemsById = {}
        },
    },
})

export const presenceActions = presenceSlice.actions
export default presenceSlice.reducer

const selectPresenceState = (state: RootState) => state.presence

// writerKeyHex -> presence entry (lastActiveAt, lastInteractionAt, avg, ...)
export const selectPresence = createSelector(
    selectPresenceState,
    (state): Map<string, PresenceEntry> => reducePresence(Object.values(state.itemsById)),
)
