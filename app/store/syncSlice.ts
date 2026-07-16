import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

export type JoinPhase = 'pairing' | 'permission' | 'syncing' | null

// Reachability of the replication swarm, reported by the backend:
//   'connecting' — worklet/DHT still coming up (header dot: blinking grey)
//   'online'     — on the p2p network / syncing (header dot: green)
//   'offline'    — DHT unreachable, e.g. no connection (header dot: grey)
export type NetworkStatus = 'connecting' | 'online' | 'offline'

export type SyncState = {
    autobaseInviteKey: string
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    joinPhase: JoinPhase
    networkStatus: NetworkStatus
    baseId: string | null
    epoch: number | null
}

const initialState: SyncState = {
    autobaseInviteKey: '',
    peerCount: 0,
    isWorkletReady: false,
    isJoining: false,
    joinPhase: null,
    networkStatus: 'connecting',
    baseId: null,
    epoch: null,
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
        networkStatusSet(state, action: PayloadAction<NetworkStatus>) {
            const next = action.payload
            if (next === 'connecting' || next === 'online' || next === 'offline') {
                state.networkStatus = next
            }
        },
        baseStateReceived(state, action: PayloadAction<{ baseId?: string | null; epoch?: number | null }>) {
            state.baseId = typeof action.payload.baseId === 'string' ? action.payload.baseId : null
            state.epoch = Number.isInteger(action.payload.epoch) ? action.payload.epoch as number : null
        },
        syncReset(state) {
            state.autobaseInviteKey = ''
            state.peerCount = 0
            state.isJoining = false
            state.joinPhase = null
            state.networkStatus = 'connecting'
            state.baseId = null
            state.epoch = null
        },
    },
})

export const syncActions = syncSlice.actions
export default syncSlice.reducer

export const selectSyncState = (state: RootState) => state.sync
