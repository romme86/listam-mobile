import type { ImageSourcePropType } from 'react-native'

// Static require maps — React Native needs literal require() calls

const ITEM_ICONS: Record<string, ImageSourcePropType> = {
    // apple.png
    apple: require('../assets/icons/items/apple.png'),
    apples: require('../assets/icons/items/apple.png'),
    // avocado.png
    avocado: require('../assets/icons/items/avocado.png'),
    avocados: require('../assets/icons/items/avocado.png'),
    // bacon.png
    bacon: require('../assets/icons/items/bacon.png'),
    // bagels - donuts.png
    bagel: require('../assets/icons/items/bagels-donuts.png'),
    bagels: require('../assets/icons/items/bagels-donuts.png'),
    donut: require('../assets/icons/items/bagels-donuts.png'),
    donuts: require('../assets/icons/items/bagels-donuts.png'),
    // baguette - bread.png
    baguette: require('../assets/icons/items/baguette-bread.png'),
    bread: require('../assets/icons/items/baguette-bread.png'),
    // bananas.png
    banana: require('../assets/icons/items/bananas.png'),
    bananas: require('../assets/icons/items/bananas.png'),
    // beans.png
    bean: require('../assets/icons/items/beans.png'),
    beans: require('../assets/icons/items/beans.png'),
    // bell-peppers.png
    'bell pepper': require('../assets/icons/items/bell-peppers.png'),
    'bell peppers': require('../assets/icons/items/bell-peppers.png'),
    // broccoli.png
    broccoli: require('../assets/icons/items/broccoli.png'),
    // butter.png
    butter: require('../assets/icons/items/butter.png'),
    // carrots.png
    carrot: require('../assets/icons/items/carrots.png'),
    carrots: require('../assets/icons/items/carrots.png'),
    // crackers.png
    cracker: require('../assets/icons/items/crackers.png'),
    crackers: require('../assets/icons/items/crackers.png'),
    // cream.png
    cream: require('../assets/icons/items/cream.png'),
    // croissants - pastry - sweets.png
    croissant: require('../assets/icons/items/croissants-pastry-sweets.png'),
    croissants: require('../assets/icons/items/croissants-pastry-sweets.png'),
    pastry: require('../assets/icons/items/croissants-pastry-sweets.png'),
    sweets: require('../assets/icons/items/croissants-pastry-sweets.png'),
    // eggs.png
    egg: require('../assets/icons/items/eggs.png'),
    eggs: require('../assets/icons/items/eggs.png'),
    // extra-virgin-olive-oil.png
    'olive oil': require('../assets/icons/items/extra-virgin-olive-oil.png'),
    'extra virgin olive oil': require('../assets/icons/items/extra-virgin-olive-oil.png'),
    // flour.png
    flour: require('../assets/icons/items/flour.png'),
    // garlic.png
    garlic: require('../assets/icons/items/garlic.png'),
    // grapes.png
    grape: require('../assets/icons/items/grapes.png'),
    grapes: require('../assets/icons/items/grapes.png'),
    // hummus.png
    hummus: require('../assets/icons/items/hummus.png'),
    // lemons.png
    lemon: require('../assets/icons/items/lemons.png'),
    lemons: require('../assets/icons/items/lemons.png'),
    // margarine.png
    margarine: require('../assets/icons/items/margarine.png'),
    // milk.png
    milk: require('../assets/icons/items/milk.png'),
    // mozzarella.png
    mozzarella: require('../assets/icons/items/mozzarella.png'),
    // mushrooms.png
    mushroom: require('../assets/icons/items/mushrooms.png'),
    mushrooms: require('../assets/icons/items/mushrooms.png'),
    // onion.png
    onion: require('../assets/icons/items/onion.png'),
    onions: require('../assets/icons/items/onion.png'),
    // oranges.png
    orange: require('../assets/icons/items/oranges.png'),
    oranges: require('../assets/icons/items/oranges.png'),
    // parmigiano - grana.png
    parmigiano: require('../assets/icons/items/parmigiano-grana.png'),
    parmesan: require('../assets/icons/items/parmigiano-grana.png'),
    grana: require('../assets/icons/items/parmigiano-grana.png'),
    // pasta - penne - spaghetti.png
    pasta: require('../assets/icons/items/pasta-penne-spaghetti.png'),
    penne: require('../assets/icons/items/pasta-penne-spaghetti.png'),
    spaghetti: require('../assets/icons/items/pasta-penne-spaghetti.png'),
    fusilli: require('../assets/icons/items/pasta-penne-spaghetti.png'),
    macaroni: require('../assets/icons/items/pasta-penne-spaghetti.png'),
    // pepper.png
    pepper: require('../assets/icons/items/pepper.png'),
    peppers: require('../assets/icons/items/pepper.png'),
    // pizza.png
    pizza: require('../assets/icons/items/pizza.png'),
    // potatoes.png
    potato: require('../assets/icons/items/potatoes.png'),
    potatoes: require('../assets/icons/items/potatoes.png'),
    // radicchio.png
    radicchio: require('../assets/icons/items/radicchio.png'),
    // rice.png
    rice: require('../assets/icons/items/rice.png'),
    // salad - lettuce - iceberg.png
    salad: require('../assets/icons/items/salad-lettuce-iceberg.png'),
    lettuce: require('../assets/icons/items/salad-lettuce-iceberg.png'),
    iceberg: require('../assets/icons/items/salad-lettuce-iceberg.png'),
    // salami.png
    salami: require('../assets/icons/items/salami.png'),
    // salt.png
    salt: require('../assets/icons/items/salt.png'),
    // spinach.png
    spinach: require('../assets/icons/items/spinach.png'),
    // sugar.png
    sugar: require('../assets/icons/items/sugar.png'),
    // tea.png
    tea: require('../assets/icons/items/tea.png'),
    // toast-bread.png
    toast: require('../assets/icons/items/toast-bread.png'),
    // tomato.png
    tomato: require('../assets/icons/items/tomato.png'),
    tomatoes: require('../assets/icons/items/tomato.png'),
    // yogurt.png
    yogurt: require('../assets/icons/items/yogurt.png'),
    yoghurt: require('../assets/icons/items/yogurt.png'),
    // zucchini.png
    zucchini: require('../assets/icons/items/zucchini.png'),
    courgette: require('../assets/icons/items/zucchini.png'),
}

const LETTER_ICONS: Record<string, ImageSourcePropType> = {
    a: require('../assets/icons/letters/a.png'),
    b: require('../assets/icons/letters/b.png'),
    c: require('../assets/icons/letters/c.png'),
    d: require('../assets/icons/letters/d.png'),
    e: require('../assets/icons/letters/e.png'),
    f: require('../assets/icons/letters/f.png'),
    g: require('../assets/icons/letters/g.png'),
    h: require('../assets/icons/letters/h.png'),
    i: require('../assets/icons/letters/i.png'),
    j: require('../assets/icons/letters/j.png'),
    k: require('../assets/icons/letters/k.png'),
    l: require('../assets/icons/letters/l.png'),
    m: require('../assets/icons/letters/m.png'),
    n: require('../assets/icons/letters/n.png'),
    o: require('../assets/icons/letters/o.png'),
    p: require('../assets/icons/letters/p.png'),
    q: require('../assets/icons/letters/q.png'),
    r: require('../assets/icons/letters/r.png'),
    s: require('../assets/icons/letters/s.png'),
    t: require('../assets/icons/letters/t.png'),
    u: require('../assets/icons/letters/u.png'),
    v: require('../assets/icons/letters/v.png'),
    w: require('../assets/icons/letters/w.png'),
    x: require('../assets/icons/letters/x.png'),
    y: require('../assets/icons/letters/y.png'),
    z: require('../assets/icons/letters/z.png'),
}

// Pre-compute multi-word keys sorted by length (longest first) for priority matching
const MULTI_WORD_KEYS = Object.keys(ITEM_ICONS)
    .filter((k) => k.includes(' '))
    .sort((a, b) => b.length - a.length)

const SINGLE_WORD_KEYS = Object.keys(ITEM_ICONS).filter((k) => !k.includes(' '))

function stripQuantifiers(text: string): string {
    return text
        .replace(/\b\d+(\.\d+)?\s*(%|g|kg|ml|l|lb|oz|ct|pk|pack)\b/gi, '')
        .replace(
            /\b(organic|fresh|free-range|whole|large|small|medium|extra|lite|light|low-fat|fat-free|sugar-free|gluten-free|natural|raw|smoked|sliced|diced|chopped|ground|minced|boneless|skinless)\b/gi,
            '',
        )
        .replace(/\s+/g, ' ')
        .trim()
}

type IconResult = { type: 'image' | 'letter'; source: ImageSourcePropType }

export function getIconForItem(text: string): IconResult {
    const normalized = text.toLowerCase().trim()
    const stripped = stripQuantifiers(normalized)

    // 1. Exact match on normalized text
    if (ITEM_ICONS[normalized]) {
        return { type: 'image', source: ITEM_ICONS[normalized] }
    }

    // 2. Exact match on stripped text
    if (stripped && stripped !== normalized && ITEM_ICONS[stripped]) {
        return { type: 'image', source: ITEM_ICONS[stripped] }
    }

    // 3. Multi-word key match (longest first — "bell peppers" before "pepper")
    for (const key of MULTI_WORD_KEYS) {
        if (normalized.includes(key) || stripped.includes(key)) {
            return { type: 'image', source: ITEM_ICONS[key] }
        }
    }

    // 4. Word match — split text into words, check each against single-word keys
    const words = normalized.split(/\s+/)
    for (const word of words) {
        if (ITEM_ICONS[word]) {
            return { type: 'image', source: ITEM_ICONS[word] }
        }
    }

    // 5. Substring match — check if any single-word key is contained in the text
    for (const key of SINGLE_WORD_KEYS) {
        if (normalized.includes(key) || stripped.includes(key)) {
            return { type: 'image', source: ITEM_ICONS[key] }
        }
    }

    // 6. Letter fallback
    const letterMatch = text.match(/[a-zA-Z]/)
    const letter = letterMatch ? letterMatch[0].toLowerCase() : 'a'
    return { type: 'letter', source: LETTER_ICONS[letter] }
}
