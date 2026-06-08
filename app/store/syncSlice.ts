import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

export type JoinPhase = 'pairing' | 'permission' | 'syncing' | null

export type SyncState = {
    autobaseInviteKey: string
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    joinPhase: JoinPhase
}

const initialState: SyncState = {
    autobaseInviteKey: '',
    peerCount: 0,
    isWorkletReady: false,
    isJoining: false,
    joinPhase: null,
}

const syncSlice = createSlice({
    name: 'sync',
    initialState,
    reducers: {
        autobaseInviteKeySet(state, action: PayloadAction<string>) {
            state.autobaseInviteKey = action.payload
        },
        peerCountSet(state, action: PayloadAction<number>) {
            state.peerCount = Number.isFinite(action.payload) ? Math.max(0, action.payload) : 0
        },
        workletReadySet(state, action: PayloadAction<boolean>) {
            state.isWorkletReady = action.payload
        },
        joiningSet(state, action: PayloadAction<boolean>) {
            state.isJoining = action.payload
            if (!action.payload) state.joinPhase = null
        },
        joinPhaseSet(state, action: PayloadAction<JoinPhase>) {
            state.joinPhase = action.payload
        },
        syncReset(state) {
            state.autobaseInviteKey = ''
            state.peerCount = 0
            state.isJoining = false
            state.joinPhase = null
        },
    },
})

export const syncActions = syncSlice.actions
export default syncSlice.reducer

export const selectSyncState = (state: RootState) => state.sync
