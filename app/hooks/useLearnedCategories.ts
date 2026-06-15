import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCategoryForItem, normalizeGroceryText } from '@listam/grocery'
import type { GroceryLocale } from '@listam/i18n'
import type { ListEntry } from '../components/_types'
import { appLogger } from '../logger'

const STORAGE_KEY = '@lista_learned_categories'

/** Map of normalized item text → canonical category key the user pinned by dragging. */
type LearnedMap = Record<string, string>

export type LearnedCategories = {
    /** Remember (or, when `canonicalKey` is the item's natural category, forget) a mapping. */
    learn: (text: string, canonicalKey: string, lang: GroceryLocale) => void
    /**
     * Return `entries` with a `categoryOverride` filled in from what was learned,
     * for any entry that doesn't already carry an explicit one. Index-aligned and
     * length-preserving, so callers can keep using the original indices.
     */
    apply: (entries: ListEntry[]) => ListEntry[]
}

/**
 * Persisted, device-local memory of category choices made by dragging. Learned
 * mappings auto-apply to future items of the same name without touching the
 * replicated data — an explicit per-item `categoryOverride` always wins.
 */
export function useLearnedCategories(): LearnedCategories {
    const [map, setMap] = useState<LearnedMap>({})
    const mapRef = useRef<LearnedMap>({})

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then((raw) => {
                if (!raw) return
                const parsed = JSON.parse(raw)
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    mapRef.current = parsed as LearnedMap
                    setMap(parsed as LearnedMap)
                }
            })
            .catch((error) => appLogger.warn('Failed to load learned categories', error))
    }, [])

    const persist = useCallback((next: LearnedMap) => {
        mapRef.current = next
        setMap(next)
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            .catch((error) => appLogger.warn('Failed to persist learned categories', error))
    }, [])

    const learn = useCallback((text: string, canonicalKey: string, lang: GroceryLocale) => {
        const key = normalizeGroceryText(text)
        if (!key) return
        const natural = getCategoryForItem(text, lang)
        const next = { ...mapRef.current }
        if (canonicalKey === natural) {
            // Dropping on the item's natural category means "forget my override".
            if (!(key in next)) return
            delete next[key]
        } else {
            if (next[key] === canonicalKey) return
            next[key] = canonicalKey
        }
        persist(next)
    }, [persist])

    const apply = useCallback((entries: ListEntry[]): ListEntry[] => {
        let changed = false
        const next = entries.map((entry) => {
            if (entry.categoryOverride) return entry
            const learnedKey = map[normalizeGroceryText(entry.text)]
            if (!learnedKey) return entry
            changed = true
            return { ...entry, categoryOverride: learnedKey }
        })
        return changed ? next : entries
    }, [map])

    return { learn, apply }
}
