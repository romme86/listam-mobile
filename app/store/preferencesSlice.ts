import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { isLocaleChoice, type LocaleChoice } from '@listam/i18n'
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

export type PreferencesState = {
    isGridView: boolean
    categoriesEnabled: boolean
    categoryHeadersVisible: boolean
    showFab: boolean
    gridIconSize: SizeOption
    listTextSize: SizeOption
    listAlignment: ListAlignment
    listItemSpacing: ListSpacing
    itemIconVariant: ItemIconVariant
    localeChoice: LocaleChoice
    themeChoice: ThemeChoice
}

const initialState: PreferencesState = {
    isGridView: false,
    categoriesEnabled: true,
    categoryHeadersVisible: true,
    // Off by default: items are added by double-tapping the empty list area.
    // Turning this on shows the floating add button as well.
    showFab: false,
    gridIconSize: 'normal',
    listTextSize: 'normal',
    listAlignment: 'left',
    listItemSpacing: 'normal',
    itemIconVariant: 'illustrated',
    localeChoice: 'system',
    themeChoice: 'system',
}

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        preferencesHydrated(state, action: PayloadAction<Partial<PreferencesState>>) {
            const next = action.payload
            if (typeof next.isGridView === 'boolean') state.isGridView = next.isGridView
            if (typeof next.categoriesEnabled === 'boolean') state.categoriesEnabled = next.categoriesEnabled
            if (typeof next.categoryHeadersVisible === 'boolean') {
                state.categoryHeadersVisible = next.categoryHeadersVisible
            }
            if (typeof next.showFab === 'boolean') state.showFab = next.showFab
            if (isSizeOption(next.gridIconSize)) state.gridIconSize = next.gridIconSize
            if (isSizeOption(next.listTextSize)) state.listTextSize = next.listTextSize
            if (isListAlignment(next.listAlignment)) state.listAlignment = next.listAlignment
            if (isListSpacing(next.listItemSpacing)) state.listItemSpacing = next.listItemSpacing
            if (isItemIconVariant(next.itemIconVariant)) state.itemIconVariant = next.itemIconVariant
            if (isLocaleChoice(next.localeChoice)) {
                state.localeChoice = next.localeChoice
            }
            if (isThemeChoice(next.themeChoice)) state.themeChoice = next.themeChoice
        },
        gridViewSet(state, action: PayloadAction<boolean>) {
            state.isGridView = action.payload
        },
        categoriesEnabledSet(state, action: PayloadAction<boolean>) {
            state.categoriesEnabled = action.payload
        },
        categoryHeadersVisibleSet(state, action: PayloadAction<boolean>) {
            state.categoryHeadersVisible = action.payload
        },
        showFabSet(state, action: PayloadAction<boolean>) {
            state.showFab = action.payload
        },
        gridIconSizeSet(state, action: PayloadAction<SizeOption>) {
            state.gridIconSize = action.payload
        },
        listTextSizeSet(state, action: PayloadAction<SizeOption>) {
            state.listTextSize = action.payload
        },
        listAlignmentSet(state, action: PayloadAction<ListAlignment>) {
            state.listAlignment = action.payload
        },
        listItemSpacingSet(state, action: PayloadAction<ListSpacing>) {
            state.listItemSpacing = action.payload
        },
        itemIconVariantSet(state, action: PayloadAction<ItemIconVariant>) {
            state.itemIconVariant = action.payload
        },
        localeChoiceSet(state, action: PayloadAction<LocaleChoice>) {
            state.localeChoice = isLocaleChoice(action.payload) ? action.payload : 'system'
        },
        themeChoiceSet(state, action: PayloadAction<ThemeChoice>) {
            state.themeChoice = isThemeChoice(action.payload) ? action.payload : 'system'
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
