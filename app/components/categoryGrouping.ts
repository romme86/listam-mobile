import type { ListEntry } from './_types'
import { CATEGORY_ORDER } from './categoryConstants'
import { getCategoryForItem } from './categoryLookup'

export type IndexedEntry = { entry: ListEntry; originalIndex: number }
export type CategorySection = { category: string; items: IndexedEntry[] }

export function groupByCategory(data: ListEntry[]): CategorySection[] {
    if (!data || data.length === 0) return []

    const categoryMap = new Map<string, IndexedEntry[]>()

    for (let i = 0; i < data.length; i++) {
        const entry = data[i]
        const category = getCategoryForItem(entry?.text)

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

    // Sort sections by CATEGORY_ORDER
    const sections: CategorySection[] = []
    for (const category of CATEGORY_ORDER) {
        const items = categoryMap.get(category)
        if (items && items.length > 0) {
            sections.push({ category, items })
            categoryMap.delete(category)
        }
    }

    // Add any remaining categories not in CATEGORY_ORDER (shouldn't happen, but defensive)
    for (const [category, items] of categoryMap) {
        if (items.length > 0) {
            sections.push({ category, items })
        }
    }

    return sections
}
