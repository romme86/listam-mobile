import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'

export type MembershipMember = {
    writerKey: string
    isOwner: boolean
    isSelf: boolean
}

export type MembershipRoster = {
    currentEpoch: number
    ownerWriterKey: string | null
    canAdminister: boolean
    writers: MembershipMember[]
}

export type DevicesState = {
    hasRoster: boolean
    currentEpoch: number
    ownerWriterKey: string | null
    canAdminister: boolean
    writerIds: string[]
    writersById: Record<string, MembershipMember>
}

const initialState: DevicesState = {
    hasRoster: false,
    currentEpoch: 0,
    ownerWriterKey: null,
    canAdminister: false,
    writerIds: [],
    writersById: {},
}

const devicesSlice = createSlice({
    name: 'devices',
    initialState,
    reducers: {
        rosterReceived(state, action: PayloadAction<MembershipRoster | null>) {
            const roster = action.payload
            if (!roster) {
                state.hasRoster = false
                state.currentEpoch = 0
                state.ownerWriterKey = null
                state.canAdminister = false
                state.writerIds = []
                state.writersById = {}
                return
            }

            state.hasRoster = true
            state.currentEpoch = Number.isFinite(roster.currentEpoch) ? roster.currentEpoch : 0
            state.ownerWriterKey = roster.ownerWriterKey
            state.canAdminister = roster.canAdminister
            state.writerIds = []
            state.writersById = {}

            for (const member of roster.writers) {
                if (!member.writerKey) continue
                state.writerIds.push(member.writerKey)
                state.writersById[member.writerKey] = {
                    writerKey: member.writerKey,
                    isOwner: member.isOwner,
                    isSelf: member.isSelf,
                }
            }
        },
    },
})

export const devicesActions = devicesSlice.actions
export default devicesSlice.reducer

const selectDevicesState = (state: RootState) => state.devices

export const selectMembershipRoster = createSelector(
    selectDevicesState,
    (state): MembershipRoster | null => {
        if (!state.hasRoster) return null
        return {
            currentEpoch: state.currentEpoch,
            ownerWriterKey: state.ownerWriterKey,
            canAdminister: state.canAdminister,
            writers: state.writerIds
                .map((writerKey) => state.writersById[writerKey])
                .filter((member): member is MembershipMember => Boolean(member)),
        }
    },
)
