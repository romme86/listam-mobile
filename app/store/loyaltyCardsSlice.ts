import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { loyaltyCardPayloadRef } from '@listam/secrets'
import type { RootState } from './store'

export type LoyaltyCardHandle = {
    id: string
    name: string
    type: string
    payloadRef: string
}

type LoyaltyCardsState = {
    cardIds: string[]
    cardsById: Record<string, LoyaltyCardHandle>
}

const initialState: LoyaltyCardsState = {
    cardIds: [],
    cardsById: {},
}

const loyaltyCardsSlice = createSlice({
    name: 'loyaltyCards',
    initialState,
    reducers: {
        loyaltyCardsHydrated(state, action: PayloadAction<LoyaltyCardHandle[]>) {
            state.cardIds = []
            state.cardsById = {}
            for (const handle of action.payload) upsertHandle(state, handle)
        },
        loyaltyCardAdded(state, action: PayloadAction<LoyaltyCardHandle>) {
            upsertHandle(state, action.payload)
        },
        loyaltyCardRemoved(state, action: PayloadAction<string>) {
            const id = action.payload
            delete state.cardsById[id]
            state.cardIds = state.cardIds.filter((cardId) => cardId !== id)
        },
    },
})

function upsertHandle(state: LoyaltyCardsState, handle: LoyaltyCardHandle) {
    if (!handle.id || !handle.name) return
    const normalized: LoyaltyCardHandle = {
        id: handle.id,
        name: handle.name,
        type: handle.type || 'unknown',
        payloadRef: handle.payloadRef || loyaltyCardPayloadRef(handle.id),
    }
    state.cardsById[normalized.id] = normalized
    if (!state.cardIds.includes(normalized.id)) state.cardIds.push(normalized.id)
}

export function toLoyaltyCardHandle(card: {
    id: string
    name: string
    type?: string
}): LoyaltyCardHandle {
    return {
        id: card.id,
        name: card.name,
        type: card.type || 'unknown',
        payloadRef: loyaltyCardPayloadRef(card.id),
    }
}

export const loyaltyCardsActions = loyaltyCardsSlice.actions
export default loyaltyCardsSlice.reducer

const selectLoyaltyCardsState = (state: RootState) => state.loyaltyCards

export const selectLoyaltyCardHandles = createSelector(
    selectLoyaltyCardsState,
    (state) => state.cardIds
        .map((id) => state.cardsById[id])
        .filter((card): card is LoyaltyCardHandle => Boolean(card)),
)
