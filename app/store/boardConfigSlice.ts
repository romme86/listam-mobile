import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { normalizeBoardConfig, type BoardConfig } from '@listam/domain/board'
import type { RootState } from './store'

// Owner-signed board configuration (rigor mode, states, properties,
// rules, automations) pushed by the backend over RPC_MESSAGE {type:'board-config'}.
// Mirrors the desktop store's boardConfig + boardConfigCanAdminister split.
export type BoardConfigState = {
    config: BoardConfig | null
    canAdminister: boolean
}

const initialState: BoardConfigState = {
    config: null,
    canAdminister: false,
}

const boardConfigSlice = createSlice({
    name: 'boardConfig',
    initialState,
    reducers: {
        boardConfigReceived(state, action: PayloadAction<{ config: unknown; canAdminister: boolean }>) {
            state.config = normalizeBoardConfig(action.payload.config ?? null)
            state.canAdminister = !!action.payload.canAdminister
        },
        boardConfigReset(state) {
            state.config = null
            state.canAdminister = false
        },
    },
})

export const boardConfigActions = boardConfigSlice.actions
export default boardConfigSlice.reducer

// Never returns null — falls back to defaults, like the desktop selector.
export const selectBoardConfig = (state: RootState): BoardConfig =>
    normalizeBoardConfig(state.boardConfig.config ?? null)

export const selectBoardConfigCanAdminister = (state: RootState): boolean =>
    state.boardConfig.canAdminister
