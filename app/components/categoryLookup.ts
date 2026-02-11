const ITEM_CATEGORY_MAP = new Map<string, string>([
    // Fruits
    ['apple', 'Fruits'], ['apples', 'Fruits'], ['banana', 'Fruits'], ['bananas', 'Fruits'],
    ['orange', 'Fruits'], ['oranges', 'Fruits'], ['lemon', 'Fruits'], ['lemons', 'Fruits'],
    ['lime', 'Fruits'], ['limes', 'Fruits'], ['grapes', 'Fruits'], ['strawberries', 'Fruits'],
    ['strawberry', 'Fruits'], ['blueberries', 'Fruits'], ['blueberry', 'Fruits'],
    ['raspberries', 'Fruits'], ['raspberry', 'Fruits'], ['blackberries', 'Fruits'],
    ['mango', 'Fruits'], ['mangoes', 'Fruits'], ['pineapple', 'Fruits'], ['watermelon', 'Fruits'],
    ['melon', 'Fruits'], ['peach', 'Fruits'], ['peaches', 'Fruits'], ['pear', 'Fruits'],
    ['pears', 'Fruits'], ['plum', 'Fruits'], ['plums', 'Fruits'], ['kiwi', 'Fruits'],
    ['cherry', 'Fruits'], ['cherries', 'Fruits'], ['avocado', 'Fruits'], ['avocados', 'Fruits'],
    ['grapefruit', 'Fruits'], ['pomegranate', 'Fruits'], ['nectarine', 'Fruits'],
    ['tangerine', 'Fruits'], ['clementine', 'Fruits'], ['coconut', 'Fruits'],
    ['fig', 'Fruits'], ['figs', 'Fruits'], ['dates', 'Fruits'], ['passion fruit', 'Fruits'],
    ['papaya', 'Fruits'],

    // Vegetables
    ['tomato', 'Vegetables'], ['tomatoes', 'Vegetables'], ['potato', 'Vegetables'],
    ['potatoes', 'Vegetables'], ['onion', 'Vegetables'], ['onions', 'Vegetables'],
    ['garlic', 'Vegetables'], ['carrot', 'Vegetables'], ['carrots', 'Vegetables'],
    ['broccoli', 'Vegetables'], ['spinach', 'Vegetables'], ['lettuce', 'Vegetables'],
    ['cucumber', 'Vegetables'], ['cucumbers', 'Vegetables'], ['pepper', 'Vegetables'],
    ['peppers', 'Vegetables'], ['bell pepper', 'Vegetables'], ['bell peppers', 'Vegetables'],
    ['zucchini', 'Vegetables'], ['courgette', 'Vegetables'], ['eggplant', 'Vegetables'],
    ['aubergine', 'Vegetables'], ['mushroom', 'Vegetables'], ['mushrooms', 'Vegetables'],
    ['celery', 'Vegetables'], ['corn', 'Vegetables'], ['sweet corn', 'Vegetables'],
    ['peas', 'Vegetables'], ['green beans', 'Vegetables'], ['beans', 'Vegetables'],
    ['cabbage', 'Vegetables'], ['cauliflower', 'Vegetables'], ['kale', 'Vegetables'],
    ['asparagus', 'Vegetables'], ['leek', 'Vegetables'], ['leeks', 'Vegetables'],
    ['radish', 'Vegetables'], ['radishes', 'Vegetables'], ['beet', 'Vegetables'],
    ['beetroot', 'Vegetables'], ['sweet potato', 'Vegetables'], ['sweet potatoes', 'Vegetables'],
    ['pumpkin', 'Vegetables'], ['squash', 'Vegetables'], ['artichoke', 'Vegetables'],
    ['fennel', 'Vegetables'], ['parsnip', 'Vegetables'], ['turnip', 'Vegetables'],
    ['spring onion', 'Vegetables'], ['spring onions', 'Vegetables'], ['rocket', 'Vegetables'],
    ['arugula', 'Vegetables'], ['salad', 'Vegetables'], ['mixed salad', 'Vegetables'],
    ['herbs', 'Vegetables'], ['parsley', 'Vegetables'], ['basil', 'Vegetables'],
    ['cilantro', 'Vegetables'], ['coriander', 'Vegetables'], ['mint', 'Vegetables'],
    ['dill', 'Vegetables'], ['chives', 'Vegetables'], ['ginger', 'Vegetables'],

    // Bread & Bakery
    ['bread', 'Bread & Bakery'], ['white bread', 'Bread & Bakery'],
    ['whole wheat bread', 'Bread & Bakery'], ['sourdough', 'Bread & Bakery'],
    ['baguette', 'Bread & Bakery'], ['rolls', 'Bread & Bakery'],
    ['bread rolls', 'Bread & Bakery'], ['croissant', 'Bread & Bakery'],
    ['croissants', 'Bread & Bakery'], ['bagel', 'Bread & Bakery'],
    ['bagels', 'Bread & Bakery'], ['pita', 'Bread & Bakery'],
    ['pita bread', 'Bread & Bakery'], ['tortilla', 'Bread & Bakery'],
    ['tortillas', 'Bread & Bakery'], ['wraps', 'Bread & Bakery'],
    ['muffin', 'Bread & Bakery'], ['muffins', 'Bread & Bakery'],
    ['cake', 'Bread & Bakery'], ['cookies', 'Bread & Bakery'],
    ['biscuits', 'Bread & Bakery'], ['pastry', 'Bread & Bakery'],
    ['toast', 'Bread & Bakery'], ['crumpets', 'Bread & Bakery'],
    ['brioche', 'Bread & Bakery'], ['naan', 'Bread & Bakery'],
    ['flatbread', 'Bread & Bakery'], ['breadsticks', 'Bread & Bakery'],

    // Deli
    ['ham', 'Deli'], ['salami', 'Deli'], ['prosciutto', 'Deli'],
    ['mortadella', 'Deli'], ['turkey breast', 'Deli'], ['chorizo', 'Deli'],
    ['pepperoni', 'Deli'], ['pastrami', 'Deli'], ['hummus', 'Deli'],
    ['olives', 'Deli'], ['pickles', 'Deli'], ['sauerkraut', 'Deli'],

    // Meat
    ['chicken', 'Meat'], ['chicken breast', 'Meat'], ['chicken thighs', 'Meat'],
    ['chicken wings', 'Meat'], ['whole chicken', 'Meat'], ['ground beef', 'Meat'],
    ['minced meat', 'Meat'], ['mince', 'Meat'], ['beef', 'Meat'], ['steak', 'Meat'],
    ['pork', 'Meat'], ['pork chops', 'Meat'], ['bacon', 'Meat'],
    ['sausage', 'Meat'], ['sausages', 'Meat'], ['lamb', 'Meat'],
    ['lamb chops', 'Meat'], ['turkey', 'Meat'], ['duck', 'Meat'],
    ['veal', 'Meat'], ['liver', 'Meat'], ['ribs', 'Meat'],

    // Fish & Seafood
    ['salmon', 'Fish & Seafood'], ['tuna', 'Fish & Seafood'], ['cod', 'Fish & Seafood'],
    ['shrimp', 'Fish & Seafood'], ['prawns', 'Fish & Seafood'], ['sardines', 'Fish & Seafood'],
    ['mackerel', 'Fish & Seafood'], ['trout', 'Fish & Seafood'], ['sea bass', 'Fish & Seafood'],
    ['squid', 'Fish & Seafood'], ['calamari', 'Fish & Seafood'], ['mussels', 'Fish & Seafood'],
    ['crab', 'Fish & Seafood'], ['lobster', 'Fish & Seafood'], ['anchovies', 'Fish & Seafood'],
    ['fish', 'Fish & Seafood'], ['fish fingers', 'Fish & Seafood'], ['fish sticks', 'Fish & Seafood'],

    // Dairy
    ['milk', 'Dairy'], ['whole milk', 'Dairy'], ['semi-skimmed milk', 'Dairy'],
    ['skimmed milk', 'Dairy'], ['oat milk', 'Dairy'], ['almond milk', 'Dairy'],
    ['soy milk', 'Dairy'], ['butter', 'Dairy'], ['cheese', 'Dairy'],
    ['cheddar', 'Dairy'], ['mozzarella', 'Dairy'], ['parmesan', 'Dairy'],
    ['cream cheese', 'Dairy'], ['gouda', 'Dairy'], ['brie', 'Dairy'],
    ['feta', 'Dairy'], ['goat cheese', 'Dairy'], ['yogurt', 'Dairy'],
    ['yoghurt', 'Dairy'], ['greek yogurt', 'Dairy'], ['cream', 'Dairy'],
    ['sour cream', 'Dairy'], ['whipping cream', 'Dairy'], ['eggs', 'Dairy'],
    ['egg', 'Dairy'], ['cottage cheese', 'Dairy'], ['mascarpone', 'Dairy'],
    ['ricotta', 'Dairy'],

    // Canned Goods
    ['canned tomatoes', 'Canned Goods'], ['tomato paste', 'Canned Goods'],
    ['tomato sauce', 'Canned Goods'], ['canned beans', 'Canned Goods'],
    ['chickpeas', 'Canned Goods'], ['lentils', 'Canned Goods'],
    ['canned corn', 'Canned Goods'], ['canned tuna', 'Canned Goods'],
    ['canned soup', 'Canned Goods'], ['coconut milk', 'Canned Goods'],
    ['canned peas', 'Canned Goods'], ['baked beans', 'Canned Goods'],

    // Pasta/Rice/Cereal
    ['pasta', 'Pasta/Rice/Cereal'], ['spaghetti', 'Pasta/Rice/Cereal'],
    ['penne', 'Pasta/Rice/Cereal'], ['fusilli', 'Pasta/Rice/Cereal'],
    ['macaroni', 'Pasta/Rice/Cereal'], ['lasagna', 'Pasta/Rice/Cereal'],
    ['lasagne', 'Pasta/Rice/Cereal'], ['noodles', 'Pasta/Rice/Cereal'],
    ['rice', 'Pasta/Rice/Cereal'], ['basmati rice', 'Pasta/Rice/Cereal'],
    ['brown rice', 'Pasta/Rice/Cereal'], ['risotto', 'Pasta/Rice/Cereal'],
    ['couscous', 'Pasta/Rice/Cereal'], ['quinoa', 'Pasta/Rice/Cereal'],
    ['oats', 'Pasta/Rice/Cereal'], ['porridge', 'Pasta/Rice/Cereal'],
    ['cereal', 'Pasta/Rice/Cereal'], ['muesli', 'Pasta/Rice/Cereal'],
    ['granola', 'Pasta/Rice/Cereal'], ['cornflakes', 'Pasta/Rice/Cereal'],

    // Condiments & Spices
    ['salt', 'Condiments & Spices'], ['black pepper', 'Condiments & Spices'], ['olive oil', 'Condiments & Spices'],
    ['vegetable oil', 'Condiments & Spices'], ['sunflower oil', 'Condiments & Spices'],
    ['vinegar', 'Condiments & Spices'], ['balsamic vinegar', 'Condiments & Spices'],
    ['soy sauce', 'Condiments & Spices'], ['ketchup', 'Condiments & Spices'],
    ['mustard', 'Condiments & Spices'], ['mayonnaise', 'Condiments & Spices'],
    ['hot sauce', 'Condiments & Spices'], ['worcestershire sauce', 'Condiments & Spices'],
    ['paprika', 'Condiments & Spices'], ['cumin', 'Condiments & Spices'],
    ['turmeric', 'Condiments & Spices'], ['cinnamon', 'Condiments & Spices'],
    ['oregano', 'Condiments & Spices'], ['thyme', 'Condiments & Spices'],
    ['rosemary', 'Condiments & Spices'], ['curry powder', 'Condiments & Spices'],
    ['chili flakes', 'Condiments & Spices'], ['nutmeg', 'Condiments & Spices'],
    ['bay leaves', 'Condiments & Spices'], ['pesto', 'Condiments & Spices'],
    ['salsa', 'Condiments & Spices'], ['jam', 'Condiments & Spices'],
    ['marmalade', 'Condiments & Spices'], ['honey', 'Condiments & Spices'],
    ['maple syrup', 'Condiments & Spices'], ['peanut butter', 'Condiments & Spices'],
    ['nutella', 'Condiments & Spices'],

    // Baking
    ['flour', 'Baking'], ['all-purpose flour', 'Baking'], ['sugar', 'Baking'],
    ['brown sugar', 'Baking'], ['powdered sugar', 'Baking'], ['icing sugar', 'Baking'],
    ['baking powder', 'Baking'], ['baking soda', 'Baking'], ['yeast', 'Baking'],
    ['vanilla extract', 'Baking'], ['vanilla', 'Baking'], ['cocoa powder', 'Baking'],
    ['chocolate chips', 'Baking'], ['cornstarch', 'Baking'], ['gelatin', 'Baking'],

    // Snacks
    ['chips', 'Snacks'], ['crisps', 'Snacks'], ['popcorn', 'Snacks'],
    ['nuts', 'Snacks'], ['almonds', 'Snacks'], ['cashews', 'Snacks'],
    ['peanuts', 'Snacks'], ['walnuts', 'Snacks'], ['pistachios', 'Snacks'],
    ['trail mix', 'Snacks'], ['granola bar', 'Snacks'], ['granola bars', 'Snacks'],
    ['chocolate', 'Snacks'], ['dark chocolate', 'Snacks'], ['candy', 'Snacks'],
    ['sweets', 'Snacks'], ['gummy bears', 'Snacks'], ['pretzels', 'Snacks'],
    ['crackers', 'Snacks'], ['rice cakes', 'Snacks'], ['dried fruit', 'Snacks'],
    ['raisins', 'Snacks'],

    // Beverages
    ['water', 'Beverages'], ['sparkling water', 'Beverages'], ['mineral water', 'Beverages'],
    ['juice', 'Beverages'], ['orange juice', 'Beverages'], ['apple juice', 'Beverages'],
    ['coffee', 'Beverages'], ['tea', 'Beverages'], ['green tea', 'Beverages'],
    ['herbal tea', 'Beverages'], ['soda', 'Beverages'], ['cola', 'Beverages'],
    ['lemonade', 'Beverages'], ['beer', 'Beverages'], ['wine', 'Beverages'],
    ['red wine', 'Beverages'], ['white wine', 'Beverages'], ['energy drink', 'Beverages'],
    ['sports drink', 'Beverages'], ['smoothie', 'Beverages'],

    // Frozen Foods
    ['frozen pizza', 'Frozen Foods'], ['frozen vegetables', 'Frozen Foods'],
    ['frozen fruit', 'Frozen Foods'], ['frozen fries', 'Frozen Foods'],
    ['french fries', 'Frozen Foods'], ['ice cream', 'Frozen Foods'],
    ['frozen fish', 'Frozen Foods'], ['frozen chicken', 'Frozen Foods'],
    ['frozen berries', 'Frozen Foods'], ['frozen spinach', 'Frozen Foods'],
    ['frozen peas', 'Frozen Foods'],

    // Personal Care
    ['shampoo', 'Personal Care'], ['conditioner', 'Personal Care'],
    ['body wash', 'Personal Care'], ['soap', 'Personal Care'],
    ['toothpaste', 'Personal Care'], ['toothbrush', 'Personal Care'],
    ['deodorant', 'Personal Care'], ['razor', 'Personal Care'],
    ['razors', 'Personal Care'], ['shaving cream', 'Personal Care'],
    ['lotion', 'Personal Care'], ['body lotion', 'Personal Care'],
    ['hand cream', 'Personal Care'], ['sunscreen', 'Personal Care'],
    ['lip balm', 'Personal Care'], ['cotton pads', 'Personal Care'],
    ['tissues', 'Personal Care'], ['toilet paper', 'Personal Care'],

    // Household & Cleaning
    ['dish soap', 'Household & Cleaning'], ['dishwasher tablets', 'Household & Cleaning'],
    ['laundry detergent', 'Household & Cleaning'], ['fabric softener', 'Household & Cleaning'],
    ['bleach', 'Household & Cleaning'], ['all-purpose cleaner', 'Household & Cleaning'],
    ['glass cleaner', 'Household & Cleaning'], ['sponge', 'Household & Cleaning'],
    ['sponges', 'Household & Cleaning'], ['paper towels', 'Household & Cleaning'],
    ['trash bags', 'Household & Cleaning'], ['garbage bags', 'Household & Cleaning'],
    ['bin bags', 'Household & Cleaning'], ['aluminum foil', 'Household & Cleaning'],
    ['cling film', 'Household & Cleaning'], ['plastic wrap', 'Household & Cleaning'],
    ['baking paper', 'Household & Cleaning'], ['parchment paper', 'Household & Cleaning'],
    ['batteries', 'Household & Cleaning'], ['light bulbs', 'Household & Cleaning'],
    ['candles', 'Household & Cleaning'],

    // Baby Items
    ['diapers', 'Baby Items'], ['nappies', 'Baby Items'], ['baby wipes', 'Baby Items'],
    ['baby food', 'Baby Items'], ['baby formula', 'Baby Items'], ['baby milk', 'Baby Items'],
    ['baby cereal', 'Baby Items'], ['baby shampoo', 'Baby Items'], ['baby lotion', 'Baby Items'],

    // Pet Care
    ['dog food', 'Pet Care'], ['cat food', 'Pet Care'], ['cat litter', 'Pet Care'],
    ['dog treats', 'Pet Care'], ['cat treats', 'Pet Care'], ['pet food', 'Pet Care'],
])

const KEYWORD_HINTS = new Map<string, string>([
    // Fruits
    ['berry', 'Fruits'], ['berries', 'Fruits'], ['melon', 'Fruits'], ['fruit', 'Fruits'],
    ['apple', 'Fruits'], ['banana', 'Fruits'], ['grape', 'Fruits'], ['mango', 'Fruits'],
    ['citrus', 'Fruits'],
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

export function getCategoryForItem(text: unknown): string {
    try {
        if (text == null || typeof text !== 'string') return 'Others'

        const normalized = text.toLowerCase().trim()
        if (!normalized) return 'Others'

        // 1. Exact match
        const exact = ITEM_CATEGORY_MAP.get(normalized)
        if (exact) return exact

        // 2. Stripped match (remove quantities/qualifiers)
        const stripped = stripQuantifiers(normalized)
        if (stripped && stripped !== normalized) {
            const strippedMatch = ITEM_CATEGORY_MAP.get(stripped)
            if (strippedMatch) return strippedMatch
        }

        // 3. Keyword match
        for (const [keyword, category] of KEYWORD_HINTS) {
            if (normalized.includes(keyword)) {
                return category
            }
        }

        // 4. Substring match (map key is substring of input, or input is substring of map key)
        for (const [key, category] of ITEM_CATEGORY_MAP) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return category
            }
        }

        // 5. Fuzzy/typo match via Levenshtein distance
        const maxDistance = normalized.length <= 5 ? 1 : 2

        // Check against keyword hints first (smaller set)
        for (const [keyword, category] of KEYWORD_HINTS) {
            if (levenshtein(normalized, keyword) <= maxDistance) {
                return category
            }
        }

        // Check against map keys
        for (const [key, category] of ITEM_CATEGORY_MAP) {
            if (levenshtein(normalized, key) <= maxDistance) {
                return category
            }
        }

        // Also check individual words of multi-word inputs against keywords
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

        // 6. Fallback
        return 'Others'
    } catch {
        return 'Others'
    }
}
