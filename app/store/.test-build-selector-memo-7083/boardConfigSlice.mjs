import { createSlice } from '@reduxjs/toolkit';
import { normalizeBoardConfig } from '@listam/domain/board';
const initialState = {
    config: null,
    canAdminister: false,
};
const boardConfigSlice = createSlice({
    name: 'boardConfig',
    initialState,
    reducers: {
        boardConfigReceived(state, action) {
            state.config = normalizeBoardConfig(action.payload.config ?? null);
            state.canAdminister = !!action.payload.canAdminister;
        },
        boardConfigReset(state) {
            state.config = null;
            state.canAdminister = false;
        },
    },
});
export const boardConfigActions = boardConfigSlice.actions;
export default boardConfigSlice.reducer;
// Never returns null — falls back to defaults, like the desktop selector.
export const selectBoardConfig = (state) => normalizeBoardConfig(state.boardConfig.config ?? null);
export const selectBoardConfigCanAdminister = (state) => state.boardConfig.canAdminister;
