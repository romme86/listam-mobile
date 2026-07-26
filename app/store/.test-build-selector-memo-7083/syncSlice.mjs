import { createSlice } from '@reduxjs/toolkit';
const initialState = {
    autobaseInviteKey: '',
    peerCount: 0,
    isWorkletReady: false,
    isJoining: false,
    joinPhase: null,
    networkStatus: 'connecting',
    baseId: null,
    epoch: null,
    writeBlock: null,
};
const syncSlice = createSlice({
    name: 'sync',
    initialState,
    reducers: {
        autobaseInviteKeySet(state, action) {
            state.autobaseInviteKey = action.payload;
        },
        peerCountSet(state, action) {
            state.peerCount = Number.isFinite(action.payload) ? Math.max(0, action.payload) : 0;
        },
        workletReadySet(state, action) {
            state.isWorkletReady = action.payload;
        },
        // The backend refused a mutation and said why. Mobile used to log these
        // and move on, so a change the user made just vanished with no signal.
        writeBlocked(state, action) {
            state.writeBlock = action.payload;
            if (action.payload === 'storage-fenced')
                state.isWorkletReady = false;
        },
        // A write went through again. 'storage-fenced' is exempt: the backend has
        // torn down, so a stray later success must never imply writes are
        // flowing again.
        writeBlockCleared(state) {
            if (state.writeBlock !== 'storage-fenced')
                state.writeBlock = null;
        },
        joiningSet(state, action) {
            state.isJoining = action.payload;
            if (!action.payload)
                state.joinPhase = null;
        },
        joinPhaseSet(state, action) {
            state.joinPhase = action.payload;
        },
        networkStatusSet(state, action) {
            const next = action.payload;
            if (next === 'connecting' || next === 'online' || next === 'offline') {
                state.networkStatus = next;
            }
        },
        baseStateReceived(state, action) {
            state.baseId = typeof action.payload.baseId === 'string' ? action.payload.baseId : null;
            state.epoch = Number.isInteger(action.payload.epoch) ? action.payload.epoch : null;
        },
        syncReset(state) {
            state.autobaseInviteKey = '';
            state.peerCount = 0;
            state.isJoining = false;
            state.joinPhase = null;
            state.networkStatus = 'connecting';
            state.baseId = null;
            state.epoch = null;
        },
    },
});
export const syncActions = syncSlice.actions;
export default syncSlice.reducer;
export const selectSyncState = (state) => state.sync;
