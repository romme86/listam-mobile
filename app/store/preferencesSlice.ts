import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { isLocaleChoice, type LocaleChoice } from '@listam/i18n'
import type { RegistryListView } from '@listam/domain/list-registry'
import type { RootState } from './store'
import type { ListAlignment, ListSpacing, SizeOption } from '../components/_types'
import type { ItemIconVariant } from '../components/itemIconMap'

export const SIZE_VALUES: SizeOption[] = ['small', 'medium', 'normal', 'large']
export const ITEM_ICON_VARIANTS: ItemIconVariant[] = ['illustrated', 'minimal']
export const LIST_ALIGNMENTS: ListAlignment[] = ['left', 'center']
export const LIST_SPACINGS: ListSpacing[] = ['compact', 'cozy', 'normal', 'relaxed']

/** Appearance override: follow the OS scheme, or force light/dark. */
export type ThemeChoice = 'system' | 'light' | 'dark'
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

// Progressive disclosure: the app boots in BASIC mode (one grocery list,
// theme + language) and grows features on demand. 'unset' = the user never
// decided — a fresh install stays basic, while evidence of prior use (see
// preferencesHydrated migration + the runtime auto-activation in index.tsx)
// flips it to 'on' so nothing an existing user relied on disappears.
export type AdvancedMode = 'unset' | 'on' | 'off'
export const ADVANCED_MODES: AdvancedMode[] = ['unset', 'on', 'off']

// The individually-toggleable features behind "Activate advanced options".
// boardEnabled / overviewEnabled predate this scheme and stay as their own
// top-level fields; everything newer lives here. All device-local, NEVER
// synced: a phone in basic mode must coexist with a desktop in full mode on
// the same base. Toggles hide ENTRY POINTS, never data — surfaces that
// already have content stay reachable (see registrySelectors' content-wins
// gates).
export type FeatureFlags = {
    todo: boolean
    multiList: boolean
    listGroups: boolean
    sharing: boolean
    peersDevices: boolean
    backups: boolean
    voice: boolean
    loyaltyCards: boolean
}
export const FEATURE_KEYS = [
    'todo', 'multiList', 'listGroups', 'sharing', 'peersDevices', 'backups', 'voice', 'loyaltyCards',
] as const satisfies ReadonlyArray<keyof FeatureFlags>
export type FeatureKey = (typeof FEATURE_KEYS)[number]

const FEATURES_ALL_OFF: FeatureFlags = {
    todo: false,
    multiList: false,
    listGroups: false,
    sharing: false,
    peersDevices: false,
    backups: false,
    voice: false,
    loyaltyCards: false,
}

// App-global, per-device preferences. List PRESENTATION settings (grid/list,
// categories, icons, sizes, spacing, alignment) are NOT here — they are per-list
// and synced on each list's registry meta-item (see registrySelectors DEFAULT_VIEW).
export type PreferencesState = {
    localeChoice: LocaleChoice
    themeChoice: ThemeChoice
    // Per-device: which list the app opens to on launch (null = first list).
    defaultListId: string | null
    // Per-device switch for the opt-in board capability (off by default — the
    // app is a grocery + to-do list app out of the box). When off, the "New
    // board" create tile is hidden; existing boards stay visible.
    boardEnabled: boolean
    // Per-device master switch for the day-plan Overview AND every plan
    // behavior that feeds it (triple-tap capture, swipe-right flag, long-press
    // plan sheet, tray row, per-list "Show in Overview"). Off by default;
    // independent of boardEnabled since 2026-07 (it used to ride it).
    overviewEnabled: boolean
    // Per-device source of truth for THIS device's human name. Also re-asserted
    // as a synced peer-label (keyed by this device's own writer key) so other
    // peers can tell devices apart in the members screen. '' = unnamed.
    deviceName: string
    // Progressive disclosure master state. Gating of app surfaces reads the
    // individual flags (boardEnabled / overviewEnabled / features.*), NOT this —
    // advancedMode only selects which Settings screen renders (basic screen
    // with the activation card vs the full sectioned screen).
    advancedMode: AdvancedMode
    features: FeatureFlags
    // Device-local view overrides for the BUILT-IN surfaces (Groceries / Board /
    // Todo, which all share listId 'default'). They carry no registry meta-item,
    // so their per-surface view can't ride the synced registry the way user lists
    // do — we persist it per-device, keyed by composite surface id (e.g.
    // 'default:shopping'). Partial: merged over DEFAULT_VIEW at read time. This is
    // what lets the categories toggle actually work on the built-in Spesa surface.
    builtinViews: Record<string, Partial<RegistryListView>>
}

const initialState: PreferencesState = {
    localeChoice: 'system',
    themeChoice: 'system',
    defaultListId: null,
    boardEnabled: false,
    overviewEnabled: false,
    deviceName: '',
    advancedMode: 'unset',
    features: FEATURES_ALL_OFF,
    builtinViews: {},
}

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        preferencesHydrated(state, action: PayloadAction<Partial<PreferencesState>>) {
            const next = action.payload
            if (isLocaleChoice(next.localeChoice)) {
                state.localeChoice = next.localeChoice
            }
            if (isThemeChoice(next.themeChoice)) state.themeChoice = next.themeChoice
            if (typeof next.defaultListId === 'string' || next.defaultListId === null) {
                state.defaultListId = next.defaultListId
            }
            if (typeof next.boardEnabled === 'boolean') state.boardEnabled = next.boardEnabled
            if (typeof next.overviewEnabled === 'boolean') state.overviewEnabled = next.overviewEnabled
            if (typeof next.deviceName === 'string') state.deviceName = next.deviceName
            if (isAdvancedMode(next.advancedMode)) state.advancedMode = next.advancedMode
            if (next.features && typeof next.features === 'object') {
                for (const key of FEATURE_KEYS) {
                    const value = (next.features as Partial<FeatureFlags>)[key]
                    if (typeof value === 'boolean') state.features[key] = value
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
                state.advancedMode = 'on'
                for (const key of FEATURE_KEYS) state.features[key] = true
            }
        },
        localeChoiceSet(state, action: PayloadAction<LocaleChoice>) {
            state.localeChoice = isLocaleChoice(action.payload) ? action.payload : 'system'
        },
        themeChoiceSet(state, action: PayloadAction<ThemeChoice>) {
            state.themeChoice = isThemeChoice(action.payload) ? action.payload : 'system'
        },
        defaultListIdSet(state, action: PayloadAction<string | null>) {
            state.defaultListId = action.payload
        },
        boardEnabledSet(state, action: PayloadAction<boolean>) {
            state.boardEnabled = !!action.payload
        },
        overviewEnabledSet(state, action: PayloadAction<boolean>) {
            state.overviewEnabled = !!action.payload
        },
        deviceNameSet(state, action: PayloadAction<string>) {
            state.deviceName = typeof action.payload === 'string' ? action.payload : ''
        },
        // The "Activate advanced options" button: one tap turns on the standard
        // set — every list feature plus sharing/peers/backups. Voice input and
        // loyalty cards stay opt-in (hardware- and camera-adjacent, and absent
        // from most users' workflows); each can be toggled individually after.
        advancedActivated(state) {
            state.advancedMode = 'on'
            state.boardEnabled = true
            state.overviewEnabled = true
            state.features.todo = true
            state.features.multiList = true
            state.features.listGroups = true
            state.features.sharing = true
            state.features.peersDevices = true
            state.features.backups = true
        },
        // Runtime auto-activation: evidence of real use appeared (synced user
        // lists, peers, an incoming share) on a device that never chose. Turns
        // everything on — the content came from a fuller mesh, so hiding any
        // entry point here would read as data loss. No-op once decided.
        advancedAutoActivated(state) {
            if (state.advancedMode !== 'unset') return
            state.advancedMode = 'on'
            state.boardEnabled = true
            state.overviewEnabled = true
            for (const key of FEATURE_KEYS) state.features[key] = true
        },
        featureSet(state, action: PayloadAction<{ feature: FeatureKey; enabled: boolean }>) {
            const { feature, enabled } = action.payload
            if (!(FEATURE_KEYS as readonly string[]).includes(feature)) return
            state.features[feature] = !!enabled
        },
        // Merge a partial view patch onto one built-in surface's device-local view.
        builtinViewPatched(state, action: PayloadAction<{ surfaceId: string; patch: Partial<RegistryListView> }>) {
            const { surfaceId, patch } = action.payload
            if (!surfaceId || !patch || typeof patch !== 'object') return
            state.builtinViews[surfaceId] = { ...(state.builtinViews[surfaceId] ?? {}), ...patch }
        },
    },
})

export function isSizeOption(value: unknown): value is SizeOption {
    return typeof value === 'string' && (SIZE_VALUES as string[]).includes(value)
}

export function isItemIconVariant(value: unknown): value is ItemIconVariant {
    return typeof value === 'string' && (ITEM_ICON_VARIANTS as string[]).includes(value)
}

export function isListAlignment(value: unknown): value is ListAlignment {
    return typeof value === 'string' && (LIST_ALIGNMENTS as string[]).includes(value)
}

export function isListSpacing(value: unknown): value is ListSpacing {
    return typeof value === 'string' && (LIST_SPACINGS as string[]).includes(value)
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
    return typeof value === 'string' && (THEME_CHOICES as string[]).includes(value)
}

export function isAdvancedMode(value: unknown): value is AdvancedMode {
    return typeof value === 'string' && (ADVANCED_MODES as string[]).includes(value)
}

/** Parse the persisted features JSON blob; unknown/malformed input → null. */
export function parseFeatureFlags(raw: string | null): Partial<FeatureFlags> | null {
    if (!raw) return null
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
        const out: Partial<FeatureFlags> = {}
        for (const key of FEATURE_KEYS) {
            const value = (parsed as Record<string, unknown>)[key]
            if (typeof value === 'boolean') out[key] = value
        }
        return out
    } catch {
        return null
    }
}

export const preferencesActions = preferencesSlice.actions
export default preferencesSlice.reducer

export const selectPreferences = (state: RootState) => state.preferences
export const selectFeatures = (state: RootState) => state.preferences.features
export const selectAdvancedMode = (state: RootState) => state.preferences.advancedMode
