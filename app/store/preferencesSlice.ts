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
            if (next.builtinViews && typeof next.builtinViews === 'object') {
                state.builtinViews = next.builtinViews
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

export const preferencesActions = preferencesSlice.actions
export default preferencesSlice.reducer

export const selectPreferences = (state: RootState) => state.preferences
