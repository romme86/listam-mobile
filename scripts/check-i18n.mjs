import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    EN_MESSAGES,
} from '../packages/i18n/catalogs/en.mjs'
import {
    ES_MESSAGES,
} from '../packages/i18n/catalogs/es.mjs'
import {
    LONG_LOCALE,
    MESSAGE_KEYS,
    PSEUDO_LOCALE,
    assertCompleteCatalog,
    createLongStringCatalog,
    createPseudoCatalog,
} from '../packages/i18n/index.mjs'

const errors = []

// 1. Catalog parity: every non-default catalog must define exactly the EN keys.
for (const [locale, catalog] of [
    ['es', ES_MESSAGES],
    [PSEUDO_LOCALE, createPseudoCatalog()],
    [LONG_LOCALE, createLongStringCatalog()],
]) {
    try {
        assertCompleteCatalog(locale, catalog, EN_MESSAGES)
    } catch (err) {
        errors.push(err.message)
    }
}

// 2. Source references: every `i18n.t('key')` / `current.t('key')` literal in the
//    app must resolve to a real catalog key. This catches typos and removed keys
//    that would otherwise render the raw key string at runtime.
//
//    Dynamically-indexed keys (typed arrays/records such as P2P_MESSAGE_KEYS) are
//    intentionally not matched here — they are guaranteed by the `MessageKey` type
//    in @listam/i18n, which is why only literal call sites need this runtime gate.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['app']
const SOURCE_EXT = new Set(['.ts', '.tsx'])
const CALL_RE = /\.t\(\s*(['"])([^'"]+)\1/g

const validKeys = new Set(MESSAGE_KEYS)
const missing = []
let scannedFiles = 0
let references = 0

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(full)
        } else if (SOURCE_EXT.has(path.extname(entry.name))) {
            scanFile(full)
        }
    }
}

function scanFile(file) {
    const text = fs.readFileSync(file, 'utf8')
    scannedFiles += 1
    CALL_RE.lastIndex = 0
    let match
    while ((match = CALL_RE.exec(text)) !== null) {
        references += 1
        const key = match[2]
        if (!validKeys.has(key)) {
            const line = text.slice(0, match.index).split('\n').length
            missing.push({ file: path.relative(ROOT, file), line, key })
        }
    }
}

for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (fs.existsSync(abs)) walk(abs)
}

if (missing.length) {
    const list = missing.map(({ file, line, key }) => `  ${file}:${line}  ${key}`).join('\n')
    errors.push(
        `${missing.length} i18n key reference(s) not found in the catalog:\n${list}\n` +
        `  Add the missing key(s) to packages/i18n/catalogs/{en,es}.mjs, or fix the typo.`,
    )
}

if (errors.length) {
    console.error(`i18n check failed:\n${errors.join('\n')}`)
    process.exit(1)
}

console.log(
    `i18n catalogs OK (${MESSAGE_KEYS.length} keys; ` +
    `${references} .t() references across ${scannedFiles} files all resolve)`,
)
