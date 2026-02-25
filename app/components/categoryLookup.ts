import {
    MULTILANG_ITEM_TO_CATEGORY,
    LANG_ITEM_SETS,
    SUPPORTED_LANGS,
    type SupportedLang,
} from './categoryTranslations'

// Keyword hints for partial/fuzzy fallback (language-agnostic or English-leaning)
const KEYWORD_HINTS = new Map<string, string>([
    // Fruits
    ['berry', 'Fruits'], ['berries', 'Fruits'], ['fruit', 'Fruits'],
    ['apple', 'Fruits'], ['banana', 'Fruits'], ['grape', 'Fruits'], ['mango', 'Fruits'],
    ['citrus', 'Fruits'], ['melon', 'Fruits'],
    // Vegetables
    ['lettuce', 'Vegetables'], ['salad', 'Vegetables'], ['veggie', 'Vegetables'],
    ['vegetable', 'Vegetables'], ['herb', 'Vegetables'], ['sprout', 'Vegetables'],
    // Bread & Bakery
    ['bread', 'Bread & Bakery'], ['bagel', 'Bread & Bakery'], ['croissant', 'Bread & Bakery'],
    ['muffin', 'Bread & Bakery'], ['cake', 'Bread & Bakery'], ['pastry', 'Bread & Bakery'],
    ['bun', 'Bread & Bakery'], ['roll', 'Bread & Bakery'],
    // Meat
    ['chicken', 'Meat'], ['beef', 'Meat'], ['pork', 'Meat'], ['lamb', 'Meat'],
    ['steak', 'Meat'], ['sausage', 'Meat'], ['mince', 'Meat'], ['meat', 'Meat'],
    ['bacon', 'Meat'], ['turkey', 'Meat'],
    // Fish & Seafood
    ['fish', 'Fish & Seafood'], ['salmon', 'Fish & Seafood'], ['tuna', 'Fish & Seafood'],
    ['shrimp', 'Fish & Seafood'], ['prawn', 'Fish & Seafood'], ['seafood', 'Fish & Seafood'],
    // Dairy
    ['milk', 'Dairy'], ['cheese', 'Dairy'], ['yogurt', 'Dairy'], ['yoghurt', 'Dairy'],
    ['cream', 'Dairy'], ['butter', 'Dairy'], ['egg', 'Dairy'],
    // Canned Goods
    ['canned', 'Canned Goods'], ['tinned', 'Canned Goods'],
    // Pasta/Rice/Cereal
    ['pasta', 'Pasta/Rice/Cereal'], ['rice', 'Pasta/Rice/Cereal'], ['cereal', 'Pasta/Rice/Cereal'],
    ['noodle', 'Pasta/Rice/Cereal'], ['oat', 'Pasta/Rice/Cereal'],
    // Condiments & Spices
    ['sauce', 'Condiments & Spices'], ['oil', 'Condiments & Spices'],
    ['spice', 'Condiments & Spices'], ['seasoning', 'Condiments & Spices'],
    ['vinegar', 'Condiments & Spices'], ['dressing', 'Condiments & Spices'],
    // Baking
    ['flour', 'Baking'], ['sugar', 'Baking'], ['baking', 'Baking'],
    // Snacks
    ['chips', 'Snacks'], ['snack', 'Snacks'], ['chocolate', 'Snacks'], ['candy', 'Snacks'],
    ['nut', 'Snacks'],
    // Beverages
    ['juice', 'Beverages'], ['coffee', 'Beverages'], ['tea', 'Beverages'],
    ['water', 'Beverages'], ['wine', 'Beverages'], ['beer', 'Beverages'],
    ['drink', 'Beverages'], ['soda', 'Beverages'],
    // Frozen Foods
    ['frozen', 'Frozen Foods'], ['ice cream', 'Frozen Foods'],
    // Personal Care
    ['shampoo', 'Personal Care'], ['toothpaste', 'Personal Care'],
    ['deodorant', 'Personal Care'], ['soap', 'Personal Care'],
    // Household & Cleaning
    ['detergent', 'Household & Cleaning'], ['cleaner', 'Household & Cleaning'],
    ['sponge', 'Household & Cleaning'], ['towel', 'Household & Cleaning'],
    ['foil', 'Household & Cleaning'], ['wrap', 'Household & Cleaning'],
    // Baby Items
    ['baby', 'Baby Items'], ['diaper', 'Baby Items'], ['nappy', 'Baby Items'],
    // Pet Care
    ['dog', 'Pet Care'], ['cat', 'Pet Care'], ['pet', 'Pet Care'],
])

function levenshtein(a: string, b: string): number {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
        }
    }

    return dp[m][n]
}

function stripQuantifiers(text: string): string {
    return text
        .replace(/\b\d+(\.\d+)?\s*(%|g|kg|ml|l|lb|oz|ct|pk|pack)\b/gi, '')
        .replace(/\b(organic|fresh|free-range|whole|large|small|medium|extra|lite|light|low-fat|fat-free|sugar-free|gluten-free|natural|raw|smoked|sliced|diced|chopped|ground|minced|boneless|skinless)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Detects the dominant language from an array of item text strings.
 * Returns the language code with the most exact matches in its item set,
 * defaulting to 'en' on a tie or when no matches are found.
 */
export function detectDominantLanguage(items: string[]): SupportedLang {
    const scores: Record<string, number> = {}
    for (const lang of SUPPORTED_LANGS) scores[lang] = 0

    for (const text of items) {
        if (!text) continue
        const normalized = text.toLowerCase().trim()
        for (const lang of SUPPORTED_LANGS) {
            if (LANG_ITEM_SETS[lang].has(normalized)) {
                scores[lang]++
            }
        }
    }

    let best: SupportedLang = 'en'
    let bestScore = 0
    for (const lang of SUPPORTED_LANGS) {
        if (scores[lang] > bestScore) {
            bestScore = scores[lang]
            best = lang as SupportedLang
        }
    }
    return best
}

/**
 * Returns the canonical English category key for an item text.
 * Checks the dominant language's items first (when preferredLang is provided),
 * then all other languages, then falls back to keyword/fuzzy matching.
 */
export function getCategoryForItem(text: unknown, preferredLang?: SupportedLang): string {
    try {
        if (text == null || typeof text !== 'string') return 'Others'

        const normalized = text.toLowerCase().trim()
        if (!normalized) return 'Others'

        // 1. Exact match in multilingual map (covers all languages, dominant lang already in map)
        const exact = MULTILANG_ITEM_TO_CATEGORY[normalized]
        if (exact) return exact

        // 2. Stripped match (remove quantities/qualifiers)
        const stripped = stripQuantifiers(normalized)
        if (stripped && stripped !== normalized) {
            const strippedMatch = MULTILANG_ITEM_TO_CATEGORY[stripped]
            if (strippedMatch) return strippedMatch
        }

        // 3. Keyword match (English fallback hints)
        for (const [keyword, category] of KEYWORD_HINTS) {
            if (normalized.includes(keyword)) {
                return category
            }
        }

        // 4. Substring match against multilingual map
        for (const [key, category] of Object.entries(MULTILANG_ITEM_TO_CATEGORY)) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return category
            }
        }

        // 5. Fuzzy/typo match — check preferred language first, then keyword hints
        const maxDistance = normalized.length <= 5 ? 1 : 2

        if (preferredLang) {
            for (const key of LANG_ITEM_SETS[preferredLang]) {
                if (levenshtein(normalized, key) <= maxDistance) {
                    return MULTILANG_ITEM_TO_CATEGORY[key] ?? 'Others'
                }
            }
        }

        for (const [keyword, category] of KEYWORD_HINTS) {
            if (levenshtein(normalized, keyword) <= maxDistance) {
                return category
            }
        }

        // 6. Fuzzy match words individually
        const words = normalized.split(/\s+/)
        for (const word of words) {
            if (word.length < 3) continue
            const wordMaxDist = word.length <= 5 ? 1 : 2
            for (const [keyword, category] of KEYWORD_HINTS) {
                if (levenshtein(word, keyword) <= wordMaxDist) {
                    return category
                }
            }
        }

        return 'Others'
    } catch {
        return 'Others'
    }
}
