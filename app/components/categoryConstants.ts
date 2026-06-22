export { CATEGORY_ORDER } from '@listam/grocery'

// MaterialCommunityIcons names (bundled in @expo/vector-icons). MDI carries
// category-specific food/grocery glyphs that Ionicons lacks (no bread, milk,
// spice, baking, diaper glyph), so every category gets a literal icon instead
// of the wrong-metaphor / basket-fallback set Ionicons forced. Render these
// with <MaterialCommunityIcons>, not <Ionicons>.
export const CATEGORY_ICONS: Record<string, string> = {
    'Fruits': 'food-apple',
    'Vegetables': 'carrot',
    'Bread & Bakery': 'baguette',
    'Deli': 'sausage',
    'Meat': 'food-drumstick',
    'Fish & Seafood': 'fish',
    'Dairy': 'cheese',
    'Canned Goods': 'food-variant',
    'Pasta/Rice/Cereal': 'pasta',
    'Condiments & Spices': 'shaker',
    'Baking': 'cupcake',
    'Snacks': 'cookie',
    'Beverages': 'bottle-soda-classic',
    'Frozen Foods': 'snowflake',
    'Ready Meals': 'food-takeout-box',
    'International Foods': 'noodles',
    'Health & Organic': 'leaf',
    'Personal Care': 'toothbrush-paste',
    'Household & Cleaning': 'spray-bottle',
    'Baby Items': 'baby-bottle',
    'Pet Care': 'paw',
    'Others': 'basket',
}
