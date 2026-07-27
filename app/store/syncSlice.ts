import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

export type JoinPhase = 'pairing' | 'permission' | 'syncing' | null

// Reachability of the replication swarm, reported by the backend:
//   'connecting' — worklet/DHT still coming up (header dot: blinking grey)
//   'online'     — on the p2p network / syncing (header dot: green)
//   'offline'    — DHT unreachable, e.g. no connection (header dot: grey)
export type NetworkStatus = 'connecting' | 'online' | 'offline'

// Why the backend refused a mutation. 'storage-fenced' is TERMINAL — another
// process took over this data directory and the backend has torn down, so
// nothing short of relaunching recovers. The others clear when a write lands.
export type WriteBlock =
    | 'not-writable'
    | 'sync-stalled'
    | 'epoch-key-stale'
    | 'storage-fenced'
    | 'write-needs-decision'
    | null

export type SyncState = {
    autobaseInviteKey: string
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    joinPhase: JoinPhase
    networkStatus: NetworkStatus
    baseId: string | null
    epoch: number | null
    writeBlock: WriteBlock
    // Ids of mutations the backend kept in its durable outbox because the writer
    // could not flush. The row exists locally and will sync later — the UI marks
    // it rather than pretending the edit was lost or that it landed.
    pendingWriteIds: string[]
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
    writeBlock: null,
    pendingWriteIds: [],
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
        // The backend refused a mutation and said why. Mobile used to log these
        // and move on, so a change the user made just vanished with no signal.
        writeQueued(state, action: PayloadAction<string>) {
            const id = action.payload
            if (typeof id === 'string' && id && !state.pendingWriteIds.includes(id)) {
                state.pendingWriteIds.push(id)
            }
        },
        // The outbox drained. It reports a count rather than ids, so clear the
        // whole set: anything still queued re-announces itself on the next
        // refusal, and a stale badge is worse than briefly showing none.
        writesReplayed(state) {
            if (state.pendingWriteIds.length) state.pendingWriteIds = []
        },
        writeBlocked(state, action: PayloadAction<WriteBlock>) {
            state.writeBlock = action.payload
            if (action.payload === 'storage-fenced') state.isWorkletReady = false
        },
        // A write went through again. 'storage-fenced' is exempt: the backend has
        // torn down, so a stray later success must never imply writes are
        // flowing again.
        writeBlockCleared(state) {
            if (state.writeBlock !== 'storage-fenced') state.writeBlock = null
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
