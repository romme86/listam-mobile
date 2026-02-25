import type { ListEntry } from './_types'
import { CATEGORY_ORDER } from './categoryConstants'
import { getCategoryForItem, detectDominantLanguage } from './categoryLookup'
import { CATEGORY_TRANSLATIONS, type SupportedLang } from './categoryTranslations'

export type IndexedEntry = { entry: ListEntry; originalIndex: number }
export type CategorySection = {
    /** Canonical English key — use for icon lookups */
    canonicalKey: string
    /** Translated display name in the dominant language */
    category: string
    items: IndexedEntry[]
}

/**
 * Returns the display name for a canonical category key in the given language.
 * Falls back to English, then the key itself.
 */
export function getDisplayCategoryName(canonicalKey: string, lang: SupportedLang): string {
    return CATEGORY_TRANSLATIONS[canonicalKey]?.[lang]
        ?? CATEGORY_TRANSLATIONS[canonicalKey]?.en
        ?? canonicalKey
}

export function groupByCategory(data: ListEntry[]): CategorySection[] {
    if (!data || data.length === 0) return []

    const lang = detectDominantLanguage(data.map(e => e?.text ?? ''))

    const categoryMap = new Map<string, IndexedEntry[]>()

    for (let i = 0; i < data.length; i++) {
        const entry = data[i]
        const category = getCategoryForItem(entry?.text, lang)

        if (!categoryMap.has(category)) {
            categoryMap.set(category, [])
        }
        categoryMap.get(category)!.push({ entry, originalIndex: i })
    }

    // Sort items within each category: active first, then done
    for (const items of categoryMap.values()) {
        items.sort((a, b) => {
            if (a.entry.isDone === b.entry.isDone) return 0
            return a.entry.isDone ? 1 : -1
        })
    }

    // Sort sections by CATEGORY_ORDER, translating keys to display names
    const sections: CategorySection[] = []
    for (const canonicalCategory of CATEGORY_ORDER) {
        const items = categoryMap.get(canonicalCategory)
        if (items && items.length > 0) {
            sections.push({
                canonicalKey: canonicalCategory,
                category: getDisplayCategoryName(canonicalCategory, lang),
                items,
            })
            categoryMap.delete(canonicalCategory)
        }
    }

    // Add remaining categories not in CATEGORY_ORDER
    for (const [canonicalCategory, items] of categoryMap) {
        if (items.length > 0) {
            sections.push({
                canonicalKey: canonicalCategory,
                category: getDisplayCategoryName(canonicalCategory, lang),
                items,
            })
        }
    }

    return sections
}
