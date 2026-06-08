import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type { SizeOption } from '../components/_types'
import type { ItemIconVariant } from '../components/itemIconMap'

export const SIZE_VALUES: SizeOption[] = ['small', 'medium', 'normal', 'large']
export const ITEM_ICON_VARIANTS: ItemIconVariant[] = ['illustrated', 'minimal']

export type LocaleChoice = 'system' | string

export type PreferencesState = {
    isGridView: boolean
    categoriesEnabled: boolean
    categoryHeadersVisible: boolean
    gridIconSize: SizeOption
    listTextSize: SizeOption
    itemIconVariant: ItemIconVariant
    localeChoice: LocaleChoice
}

const initialState: PreferencesState = {
    isGridView: false,
    categoriesEnabled: true,
    categoryHeadersVisible: true,
    gridIconSize: 'normal',
    listTextSize: 'normal',
    itemIconVariant: 'illustrated',
    localeChoice: 'system',
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
            if (isSizeOption(next.gridIconSize)) state.gridIconSize = next.gridIconSize
            if (isSizeOption(next.listTextSize)) state.listTextSize = next.listTextSize
            if (isItemIconVariant(next.itemIconVariant)) state.itemIconVariant = next.itemIconVariant
            if (typeof next.localeChoice === 'string' && next.localeChoice.trim()) {
                state.localeChoice = next.localeChoice
            }
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
        gridIconSizeSet(state, action: PayloadAction<SizeOption>) {
            state.gridIconSize = action.payload
        },
        listTextSizeSet(state, action: PayloadAction<SizeOption>) {
            state.listTextSize = action.payload
        },
        itemIconVariantSet(state, action: PayloadAction<ItemIconVariant>) {
            state.itemIconVariant = action.payload
        },
        localeChoiceSet(state, action: PayloadAction<LocaleChoice>) {
            state.localeChoice = action.payload || 'system'
        },
    },
})

export function isSizeOption(value: unknown): value is SizeOption {
    return typeof value === 'string' && (SIZE_VALUES as string[]).includes(value)
}

export function isItemIconVariant(value: unknown): value is ItemIconVariant {
    return typeof value === 'string' && (ITEM_ICON_VARIANTS as string[]).includes(value)
}

export const preferencesActions = preferencesSlice.actions
export default preferencesSlice.reducer

export const selectPreferences = (state: RootState) => state.preferences
