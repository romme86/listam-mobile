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
