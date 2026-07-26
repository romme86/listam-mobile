import { createSelector, createSlice } from '@reduxjs/toolkit';
import { isPresenceItem, reducePresence } from '@listam/domain';
const initialState = {
    itemsById: {},
};
const presenceSlice = createSlice({
    name: 'presence',
    initialState,
    reducers: {
        presenceApplied(state, action) {
            for (const item of action.payload) {
                if (isPresenceItem(item) && item.id)
                    state.itemsById[item.id] = item;
            }
        },
        // Exact structured snapshot for the reserved presence channel. Legacy
        // bare-array SYNC_LIST events remain additive via presenceApplied.
        presenceSnapshotApplied(state, action) {
            const { listId, listType, items } = action.payload;
            if (!isPresenceItem({ listType }))
                return;
            for (const [itemId, item] of Object.entries(state.itemsById)) {
                if (isPresenceItem(item))
                    delete state.itemsById[itemId];
            }
            for (const item of items) {
                const normalized = {
                    ...item,
                    listId: item.listId || listId,
                    listType: item.listType || listType,
                };
                if (isPresenceItem(normalized)
                    && normalized.listId === listId
                    && normalized.listType === listType
                    && normalized.id) {
                    state.itemsById[normalized.id] = normalized;
                }
            }
        },
        presenceItemApplied(state, action) {
            const item = action.payload;
            if (isPresenceItem(item) && item.id)
                state.itemsById[item.id] = item;
        },
        presenceItemRemoved(state, action) {
            const item = action.payload;
            if (item.id && state.itemsById[item.id])
                delete state.itemsById[item.id];
        },
        presenceCleared(state) {
            state.itemsById = {};
        },
    },
});
export const presenceActions = presenceSlice.actions;
export default presenceSlice.reducer;
const selectPresenceState = (state) => state.presence;
// writerKeyHex -> presence entry (lastActiveAt, lastInteractionAt, avg, ...)
export const selectPresence = createSelector(selectPresenceState, (state) => reducePresence(Object.values(state.itemsById)));
