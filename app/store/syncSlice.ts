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

// What the backend told us about the invite it just minted. Mobile used to hold
// the bare z32 code alone, so the two facts that made "the code stopped working"
// look like a bug — it is single-use, and it dies in ~10 minutes — were never
// shown to the person sharing it.
export type InviteInfo = {
    key: string
    expiresAt: number | null
    singleUse: boolean
    // How many codes are currently live. Minting a second code no longer kills
    // the first, so this is what tells the owner "one code per friend" works.
    liveInvites: number
    maxInvites: number | null
}

export const EMPTY_INVITE: InviteInfo = {
    key: '',
    expiresAt: null,
    singleUse: true,
    liveInvites: 0,
    maxInvites: null,
}

// The 10-second `join-progress` heartbeat the backend broadcasts during pairing.
// Without it the overlay had nothing but a spinner to show for two minutes.
export type JoinProgress = {
    elapsedMs: number
    // hyperdht's `randomized`: this network blocks direct connections, so every
    // connection is relayed. It is the carrier-NAT signature from the field.
    relayed: boolean
    online: boolean
}

export type SyncState = {
    invite: InviteInfo
    peerCount: number
    isWorkletReady: boolean
    isJoining: boolean
    joinPhase: JoinPhase
    joinProgress: JoinProgress | null
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
    invite: EMPTY_INVITE,
    peerCount: 0,
    isWorkletReady: false,
    isJoining: false,
    joinPhase: null,
    joinProgress: null,
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
        inviteReceived(state, action: PayloadAction<InviteInfo>) {
            state.invite = action.payload
        },
        // Clear before re-minting: the backend can hand back a code we already
        // hold, and an unchanged store value would never re-trigger the effect
        // that opens the share sheet.
        inviteCleared(state) {
            state.invite = EMPTY_INVITE
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
            // Both edges clear it: a finished join must not leave "48s elapsed"
            // behind, and a NEW attempt must not open on the old one's numbers.
            state.joinProgress = null
        },
        joinPhaseSet(state, action: PayloadAction<JoinPhase>) {
            state.joinPhase = action.payload
        },
        joinProgressReported(state, action: PayloadAction<JoinProgress>) {
            state.joinProgress = action.payload
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
            state.invite = EMPTY_INVITE
            state.peerCount = 0
            state.isJoining = false
            state.joinPhase = null
            state.joinProgress = null
            state.networkStatus = 'connecting'
            state.baseId = null
            state.epoch = null
        },
    },
})

export const syncActions = syncSlice.actions
export default syncSlice.reducer

export const selectSyncState = (state: RootState) => state.sync
