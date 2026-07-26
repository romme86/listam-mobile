import { createSlice } from '@reduxjs/toolkit';
import { isLocaleChoice } from '@listam/i18n';
export const SIZE_VALUES = ['small', 'medium', 'normal', 'large'];
export const ITEM_ICON_VARIANTS = ['illustrated', 'minimal'];
export const LIST_ALIGNMENTS = ['left', 'center'];
export const LIST_SPACINGS = ['compact', 'cozy', 'normal', 'relaxed'];
export const THEME_CHOICES = ['system', 'light', 'dark'];
export const ADVANCED_MODES = ['unset', 'on', 'off'];
export const FEATURE_KEYS = [
    'todo', 'multiList', 'listGroups', 'sharing', 'peersDevices', 'backups', 'voice', 'loyaltyCards',
];
const FEATURES_ALL_OFF = {
    todo: false,
    multiList: false,
    listGroups: false,
    sharing: false,
    peersDevices: false,
    backups: false,
    voice: false,
    loyaltyCards: false,
};
const initialState = {
    localeChoice: 'system',
    themeChoice: 'system',
    defaultListId: null,
    boardEnabled: false,
    overviewEnabled: false,
    deviceName: '',
    advancedMode: 'unset',
    features: FEATURES_ALL_OFF,
    builtinViews: {},
};
const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        preferencesHydrated(state, action) {
            const next = action.payload;
            if (isLocaleChoice(next.localeChoice)) {
                state.localeChoice = next.localeChoice;
            }
            if (isThemeChoice(next.themeChoice))
                state.themeChoice = next.themeChoice;
            if (typeof next.defaultListId === 'string' || next.defaultListId === null) {
                state.defaultListId = next.defaultListId;
            }
            if (typeof next.boardEnabled === 'boolean')
                state.boardEnabled = next.boardEnabled;
            if (typeof next.overviewEnabled === 'boolean')
                state.overviewEnabled = next.overviewEnabled;
            if (typeof next.deviceName === 'string')
                state.deviceName = next.deviceName;
            if (isAdvancedMode(next.advancedMode))
                state.advancedMode = next.advancedMode;
            if (next.features && typeof next.features === 'object') {
                for (const key of FEATURE_KEYS) {
                    const value = next.features[key];
                    if (typeof value === 'boolean')
                        state.features[key] = value;
                }
            }
            // Migration: persisted prefs that predate progressive disclosure carry
            // no advancedMode AND no features blob. A device that had boards or the
            // Overview switched on was clearly past basic mode — activate advanced
            // with EVERY feature on (those users had every entry point visible
            // before this restructure, so a partial set would silently take things
            // away). A payload that carries features is post-restructure and must
            // never be re-migrated (it would clobber deliberate offs). Devices with
            // neither flag stay 'unset' and can still auto-activate at runtime on
            // content evidence (user lists, peers) once the backend hydrates.
            if (!isAdvancedMode(next.advancedMode) && !next.features && state.advancedMode === 'unset'
                && (state.boardEnabled || state.overviewEnabled)) {
                state.advancedMode = 'on';
                for (const key of FEATURE_KEYS)
                    state.features[key] = true;
            }
        },
        localeChoiceSet(state, action) {
            state.localeChoice = isLocaleChoice(action.payload) ? action.payload : 'system';
        },
        themeChoiceSet(state, action) {
            state.themeChoice = isThemeChoice(action.payload) ? action.payload : 'system';
        },
        defaultListIdSet(state, action) {
            state.defaultListId = action.payload;
        },
        boardEnabledSet(state, action) {
            state.boardEnabled = !!action.payload;
        },
        overviewEnabledSet(state, action) {
            state.overviewEnabled = !!action.payload;
        },
        deviceNameSet(state, action) {
            state.deviceName = typeof action.payload === 'string' ? action.payload : '';
        },
        // The "Activate advanced options" button: one tap turns on the standard
        // set — every list feature plus sharing/peers/backups. Voice input and
        // loyalty cards stay opt-in (hardware- and camera-adjacent, and absent
        // from most users' workflows); each can be toggled individually after.
        advancedActivated(state) {
            state.advancedMode = 'on';
            state.boardEnabled = true;
            state.overviewEnabled = true;
            state.features.todo = true;
            state.features.multiList = true;
            state.features.listGroups = true;
            state.features.sharing = true;
            state.features.peersDevices = true;
            state.features.backups = true;
        },
        // Runtime auto-activation: evidence of real use appeared (synced user
        // lists, peers, an incoming share) on a device that never chose. Turns
        // everything on — the content came from a fuller mesh, so hiding any
        // entry point here would read as data loss. No-op once decided.
        advancedAutoActivated(state) {
            if (state.advancedMode !== 'unset')
                return;
            state.advancedMode = 'on';
            state.boardEnabled = true;
            state.overviewEnabled = true;
            for (const key of FEATURE_KEYS)
                state.features[key] = true;
        },
        featureSet(state, action) {
            const { feature, enabled } = action.payload;
            if (!FEATURE_KEYS.includes(feature))
                return;
            state.features[feature] = !!enabled;
        },
        // Merge a partial view patch onto one built-in surface's device-local view.
        builtinViewPatched(state, action) {
            const { surfaceId, patch } = action.payload;
            if (!surfaceId || !patch || typeof patch !== 'object')
                return;
            state.builtinViews[surfaceId] = { ...(state.builtinViews[surfaceId] ?? {}), ...patch };
        },
    },
});
export function isSizeOption(value) {
    return typeof value === 'string' && SIZE_VALUES.includes(value);
}
export function isItemIconVariant(value) {
    return typeof value === 'string' && ITEM_ICON_VARIANTS.includes(value);
}
export function isListAlignment(value) {
    return typeof value === 'string' && LIST_ALIGNMENTS.includes(value);
}
export function isListSpacing(value) {
    return typeof value === 'string' && LIST_SPACINGS.includes(value);
}
export function isThemeChoice(value) {
    return typeof value === 'string' && THEME_CHOICES.includes(value);
}
export function isAdvancedMode(value) {
    return typeof value === 'string' && ADVANCED_MODES.includes(value);
}
/** Parse the persisted features JSON blob; unknown/malformed input → null. */
export function parseFeatureFlags(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const out = {};
        for (const key of FEATURE_KEYS) {
            const value = parsed[key];
            if (typeof value === 'boolean')
                out[key] = value;
        }
        return out;
    }
    catch {
        return null;
    }
}
export const preferencesActions = preferencesSlice.actions;
export default preferencesSlice.reducer;
export const selectPreferences = (state) => state.preferences;
export const selectFeatures = (state) => state.preferences.features;
export const selectAdvancedMode = (state) => state.preferences.advancedMode;
