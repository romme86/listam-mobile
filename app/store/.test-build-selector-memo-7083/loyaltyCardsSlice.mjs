import { createSelector, createSlice } from '@reduxjs/toolkit';
import { loyaltyCardPayloadRef } from '@listam/secrets';
const initialState = {
    cardIds: [],
    cardsById: {},
};
const loyaltyCardsSlice = createSlice({
    name: 'loyaltyCards',
    initialState,
    reducers: {
        loyaltyCardsHydrated(state, action) {
            state.cardIds = [];
            state.cardsById = {};
            for (const handle of action.payload)
                upsertHandle(state, handle);
        },
        loyaltyCardAdded(state, action) {
            upsertHandle(state, action.payload);
        },
        loyaltyCardRemoved(state, action) {
            const id = action.payload;
            delete state.cardsById[id];
            state.cardIds = state.cardIds.filter((cardId) => cardId !== id);
        },
    },
});
function upsertHandle(state, handle) {
    if (!handle.id || !handle.name)
        return;
    const normalized = {
        id: handle.id,
        name: handle.name,
        type: handle.type || 'unknown',
        payloadRef: handle.payloadRef || loyaltyCardPayloadRef(handle.id),
    };
    state.cardsById[normalized.id] = normalized;
    if (!state.cardIds.includes(normalized.id))
        state.cardIds.push(normalized.id);
}
export function toLoyaltyCardHandle(card) {
    return {
        id: card.id,
        name: card.name,
        type: card.type || 'unknown',
        payloadRef: loyaltyCardPayloadRef(card.id),
    };
}
export const loyaltyCardsActions = loyaltyCardsSlice.actions;
export default loyaltyCardsSlice.reducer;
const selectLoyaltyCardsState = (state) => state.loyaltyCards;
export const selectLoyaltyCardHandles = createSelector(selectLoyaltyCardsState, (state) => state.cardIds
    .map((id) => state.cardsById[id])
    .filter((card) => Boolean(card)));
