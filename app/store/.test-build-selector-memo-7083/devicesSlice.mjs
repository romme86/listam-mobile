import { createSelector, createSlice } from '@reduxjs/toolkit';
const initialState = {
    hasRoster: false,
    currentEpoch: 0,
    ownerWriterKey: null,
    canAdminister: false,
    localWriterKey: null,
    writable: false,
    writerIds: [],
    writersById: {},
};
const devicesSlice = createSlice({
    name: 'devices',
    initialState,
    reducers: {
        rosterReceived(state, action) {
            const roster = action.payload;
            if (!roster) {
                state.hasRoster = false;
                state.currentEpoch = 0;
                state.ownerWriterKey = null;
                state.canAdminister = false;
                state.localWriterKey = null;
                state.writable = false;
                state.writerIds = [];
                state.writersById = {};
                return;
            }
            state.hasRoster = true;
            state.currentEpoch = Number.isFinite(roster.currentEpoch) ? roster.currentEpoch : 0;
            state.ownerWriterKey = roster.ownerWriterKey;
            state.canAdminister = roster.canAdminister;
            state.localWriterKey = typeof roster.localWriterKey === 'string' ? roster.localWriterKey : null;
            // Undefined (an older roster) is treated as writable so name advertising
            // isn't blocked; only an explicit false makes the frontend wait.
            state.writable = roster.writable !== false;
            state.writerIds = [];
            state.writersById = {};
            for (const member of roster.writers) {
                if (!member.writerKey)
                    continue;
                state.writerIds.push(member.writerKey);
                state.writersById[member.writerKey] = {
                    writerKey: member.writerKey,
                    isOwner: member.isOwner,
                    isSelf: member.isSelf,
                    joinedAt: typeof member.joinedAt === 'number' ? member.joinedAt : null,
                };
            }
        },
    },
});
export const devicesActions = devicesSlice.actions;
export default devicesSlice.reducer;
const selectDevicesState = (state) => state.devices;
export const selectMembershipRoster = createSelector(selectDevicesState, (state) => {
    if (!state.hasRoster)
        return null;
    return {
        currentEpoch: state.currentEpoch,
        ownerWriterKey: state.ownerWriterKey,
        canAdminister: state.canAdminister,
        localWriterKey: state.localWriterKey,
        writable: state.writable,
        writers: state.writerIds
            .map((writerKey) => state.writersById[writerKey])
            .filter((member) => Boolean(member)),
    };
});
