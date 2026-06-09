import type { ListEntry } from './_types'
import {
    getDisplayCategoryName as sharedGetDisplayCategoryName,
    groupByCategory as sharedGroupByCategory,
} from '@listam/grocery'
import type { SupportedLang } from '@listam/grocery'

export type IndexedEntry = { entry: ListEntry; originalIndex: number }
export type CategorySection = {
    /** Canonical English key — use for icon lookups */
    canonicalKey: string
    /** Translated display name in the dominant language */
    category: string
    items: IndexedEntry[]
}

export function getDisplayCategoryName(canonicalKey: string, lang: SupportedLang): string {
    return sharedGetDisplayCategoryName(canonicalKey, lang)
}

export function groupByCategory(data: ListEntry[]): CategorySection[] {
    return sharedGroupByCategory(data) as CategorySection[]
}
