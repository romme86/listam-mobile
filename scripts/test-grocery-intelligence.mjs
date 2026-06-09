#!/usr/bin/env node

import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import fs from 'node:fs'
import Module, { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getCategoryForItem } from '@listam/grocery'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'listam-grocery-test-'))
const outDir = path.join(tmpRoot, 'out')
const shimPath = path.join(tmpRoot, 'shims.d.ts')
const tmpSourceRoot = path.join(tmpRoot, 'src')
const tmpComponentRoot = path.join(tmpSourceRoot, 'app/components')

fs.mkdirSync(tmpComponentRoot, { recursive: true })
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tmpRoot, 'node_modules'), 'dir')

fs.writeFileSync(shimPath, [
    "declare function require(id: string): any",
    "declare module 'react-native' { export type ImageSourcePropType = any }",
    "declare module '@listam/grocery' {",
    "  export function containsLookupTerm(text: string, term: string): boolean",
    "  export function getFirstAsciiLetter(text: unknown): string",
    "  export function getCategoryForItem(text: unknown): string",
    "  export function normalizeGroceryText(text: unknown): string",
    "  export function toRawLookupText(text: unknown): string",
    "  export const TRANSLATED_ITEM_TO_EN: Record<string, string>",
    "}",
    '',
].join('\n'))

copyComponentSource('itemIconMap.ts', sanitizeItemIconMapForTsc)

const sources = [
    shimPath,
    path.join(tmpComponentRoot, 'itemIconMap.ts'),
]

const compile = childProcess.spawnSync('tsc', [
    '--target', 'ES2020',
    '--module', 'ES2022',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--strict', 'false',
    '--noEmitOnError', 'false',
    '--outDir', outDir,
    ...sources,
], {
    cwd: repoRoot,
    encoding: 'utf8',
})

if (compile.status !== 0) {
    process.stderr.write(compile.stdout)
    process.stderr.write(compile.stderr)
    process.exit(compile.status ?? 1)
}

const iconModulePath = findCompiledFile(outDir, 'itemIconMap.js')
installImageRequireHook()
installRequireForEsm(iconModulePath)

const { resolveIconKeyForItem } = await import(pathToFileURL(iconModulePath).href)

const categoryCases = [
    ['canned tuna', 'Canned Goods'],
    ['tinned tomatoes', 'Canned Goods'],
    ['frozen chicken breasts', 'Frozen Foods'],
    ['organic apples', 'Health & Organic'],
    ['fresh organic spinach', 'Health & Organic'],
    ['bio spinach', 'Health & Organic'],
    ['ready-to-eat beans', 'Ready Meals'],
    ['microwave rice', 'Ready Meals'],
    ['red curry paste', 'International Foods'],
    ['face-cream', 'Personal Care'],
    ['shaving-cream', 'Personal Care'],
    ['jalapeno', 'Vegetables'],
    ['café', 'Beverages'],
    ['pâtes bio', 'Health & Organic'],
    ['pepper', 'Condiments & Spices'],
    ['black pepper', 'Condiments & Spices'],
    ['胡椒', 'Condiments & Spices'],
    ['burrata', 'Dairy'],
    ['crackers', 'Snacks'],
    ['raisins', 'Snacks'],
    ['sweet chili sauce', 'Condiments & Spices'],
]

for (const [item, expected] of categoryCases) {
    assert.equal(getCategoryForItem(item), expected, `category for ${item}`)
}

const iconCases = [
    ['苹果', { type: 'image', key: 'apple' }],
    ['りんご', { type: 'image', key: 'apple' }],
    ['تفاح', { type: 'image', key: 'apple' }],
    ['सेब', { type: 'image', key: 'apple' }],
    ['pepper', { type: 'image', key: 'black pepper' }],
    ['胡椒', { type: 'image', key: 'black pepper' }],
    ['face cream', { type: 'letter', letter: 'f' }],
    ['unknown personal-care serum', { type: 'letter', letter: 'u' }],
    ['shaving cream', { type: 'image', key: 'shaving cream' }],
]

for (const [item, expected] of iconCases) {
    assert.deepEqual(resolveIconKeyForItem(item), expected, `icon for ${item}`)
}

const audit = auditGroceryData()
assert.equal(audit.englishItems, 1820, 'English grocery item count')
assert.equal(audit.categoryCollisions, 55, 'source category collision count')
assert.ok(audit.iconAliases >= 329, 'icon alias count should not regress')
assert.ok(Number(audit.exactIconCoverage) >= 15, 'exact icon coverage should not regress')

console.log(`Grocery intelligence tests passed.`)
console.log(`Audit: ${audit.englishItems} English items, ${audit.iconAliases} icon aliases, ${audit.exactIconCoverage}% exact icon coverage.`)
console.log(`Audit: ${audit.categoryCollisions} category collisions reported by source data.`)

function findCompiledFile(root, basename) {
    const stack = [root]
    while (stack.length > 0) {
        const current = stack.pop()
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(full)
            } else if (entry.name === basename) {
                return full
            }
        }
    }
    throw new Error(`Compiled file not found: ${basename}`)
}

function copyComponentSource(filename, transform = value => value) {
    const sourcePath = path.join(repoRoot, 'app/components', filename)
    const destPath = path.join(tmpComponentRoot, filename)
    fs.writeFileSync(destPath, transform(fs.readFileSync(sourcePath, 'utf8')))
}

function sanitizeItemIconMapForTsc(source) {
    const start = source.indexOf('const MANUAL_TRANSLATIONS: Record<string, string> = {')
    const end = source.indexOf('\n}\n\n// Pre-compute', start)
    if (start === -1 || end === -1) return source

    const before = source.slice(0, start)
    const body = source
        .slice(start + 'const MANUAL_TRANSLATIONS: Record<string, string> = {'.length, end)
        .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '[$1, $2]')
    const after = source.slice(end + '\n}'.length)

    return `${before}const MANUAL_TRANSLATIONS: Record<string, string> = Object.fromEntries([${body}\n])${after}`
}

function installRequireForEsm(modulePath) {
    const source = fs.readFileSync(modulePath, 'utf8')
    const lines = source.split('\n')
    let insertIndex = 0
    while (insertIndex < lines.length && lines[insertIndex].startsWith('import ')) {
        insertIndex++
    }
    lines.unshift("import { createRequire } from 'node:module'")
    lines.splice(insertIndex + 1, 0, 'const require = createRequire(import.meta.url)')
    fs.writeFileSync(modulePath, lines.join('\n'))
}

function installImageRequireHook() {
    const originalResolve = Module._resolveFilename
    Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
        if (request.startsWith('@/')) {
            const candidate = path.join(repoRoot, request.slice(2))
            if (fs.existsSync(candidate)) return candidate
        }

        if (request.endsWith('.png') && parent?.filename) {
            let candidate
            if (request.startsWith('@/')) {
                candidate = path.join(repoRoot, request.slice(2))
            } else {
                candidate = path.resolve(repoRoot, 'app/components', request)
            }
            if (fs.existsSync(candidate)) return candidate
        }

        return originalResolve.call(this, request, parent, isMain, options)
    }

    require.extensions['.png'] = (module, filename) => {
        module.exports = filename
    }
}

function auditGroceryData() {
    const csv = fs.readFileSync(path.join(repoRoot, 'assets/data/grocery_categories_translated.csv'), 'utf8').trim().split(/\n/u)
    const header = csv[0].split(',')
    const itemEnIdx = header.indexOf('item_en')
    const categoryEnIdx = header.indexOf('category_en')
    const englishItems = new Set()
    const allValues = new Map()

    for (const line of csv.slice(1)) {
        const cols = line.split(',')
        const category = cols[categoryEnIdx]
        const englishItem = cols[itemEnIdx]?.trim().toLowerCase()
        if (englishItem) englishItems.add(englishItem)

        for (let i = 1; i < cols.length; i += 2) {
            const item = cols[i]?.trim().toLowerCase()
            if (!item) continue
            if (!allValues.has(item)) allValues.set(item, new Set())
            allValues.get(item).add(category)
        }
    }

    const iconSource = fs.readFileSync(path.join(repoRoot, 'app/components/itemIconMap.ts'), 'utf8')
    const iconBlock = iconSource.slice(
        iconSource.indexOf('const ITEM_ICONS'),
        iconSource.indexOf('const MINIMAL_ITEM_ICONS'),
    )
    const iconKeys = new Set(
        Array.from(iconBlock.matchAll(/^\s*['"]?([^'"\n:]+?)['"]?\s*:/gm), match => match[1].trim()),
    )
    const exactMatches = Array.from(englishItems, item => iconKeys.has(item)).filter(Boolean).length
    const collisions = Array.from(allValues.values(), categories => categories.size > 1).filter(Boolean).length

    return {
        englishItems: englishItems.size,
        iconAliases: iconKeys.size,
        exactIconCoverage: (100 * exactMatches / englishItems.size).toFixed(1),
        categoryCollisions: collisions,
    }
}
