import { combineReducers, configureStore, createAction, type UnknownAction } from '@reduxjs/toolkit'
import listsReducer from './listsSlice'
import syncReducer from './syncSlice'
import preferencesReducer from './preferencesSlice'
import loyaltyCardsReducer from './loyaltyCardsSlice'
import devicesReducer from './devicesSlice'
import boardConfigReducer from './boardConfigSlice'
import labelsReducer from './labelsSlice'
import presenceReducer from './presenceSlice'

export const appReset = createAction('app/localDataReset')

const appReducer = combineReducers({
    lists: listsReducer,
    sync: syncReducer,
    preferences: preferencesReducer,
    loyaltyCards: loyaltyCardsReducer,
    devices: devicesReducer,
    boardConfig: boardConfigReducer,
    labels: labelsReducer,
    presence: presenceReducer,
})

const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: UnknownAction) =>
    appReducer(appReset.match(action) ? undefined : state, action)

export const store = configureStore({
    reducer: rootReducer,
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
