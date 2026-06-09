import {
    EN_MESSAGES,
} from '../packages/i18n/catalogs/en.mjs'
import {
    ES_MESSAGES,
} from '../packages/i18n/catalogs/es.mjs'
import {
    LONG_LOCALE,
    PSEUDO_LOCALE,
    assertCompleteCatalog,
    createLongStringCatalog,
    createPseudoCatalog,
} from '../packages/i18n/index.mjs'

for (const [locale, catalog] of [
    ['es', ES_MESSAGES],
    [PSEUDO_LOCALE, createPseudoCatalog()],
    [LONG_LOCALE, createLongStringCatalog()],
]) {
    assertCompleteCatalog(locale, catalog, EN_MESSAGES)
}

console.log('i18n catalogs OK')
