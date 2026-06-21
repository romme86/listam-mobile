import { configureStore } from '@reduxjs/toolkit'
import listsReducer from './listsSlice'
import syncReducer from './syncSlice'
import preferencesReducer from './preferencesSlice'
import loyaltyCardsReducer from './loyaltyCardsSlice'
import devicesReducer from './devicesSlice'
import boardConfigReducer from './boardConfigSlice'
import labelsReducer from './labelsSlice'

export const store = configureStore({
    reducer: {
        lists: listsReducer,
        sync: syncReducer,
        preferences: preferencesReducer,
        loyaltyCards: loyaltyCardsReducer,
        devices: devicesReducer,
        boardConfig: boardConfigReducer,
        labels: labelsReducer,
    },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
