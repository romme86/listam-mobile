#!/usr/bin/env node
// Phase 0 dependency-hygiene gate.
//
// Fails if any source file imports a runtime package that is not declared in
// package.json (dependencies or devDependencies). Catches the class of bug
// where code relies on a transitively-installed package that can vanish on a
// clean install. Node builtins, the `@/` babel alias, and relative imports are
// ignored.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const SCAN_DIRS = ['app', 'backend', 'packages', 'scripts']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'assets'])

const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {})
])

// Matches `from '<spec>'`, `import '<spec>'`, and `require('<spec>')`.
const IMPORT_RE = /(?:from|import)\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g

function packageName(spec) {
    if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/')
    return spec.split('/')[0]
}

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (!SKIP_DIRS.has(entry)) yield* walk(full)
        } else if (CODE_EXT.has(extname(entry)) && !entry.endsWith('.bundle.mjs')) {
            yield full
        }
    }
}

const undeclared = new Map() // package name -> Set(files)

for (const dir of SCAN_DIRS) {
    const abs = join(root, dir)
    try {
        statSync(abs)
    } catch {
        continue
    }
    for (const file of walk(abs)) {
        const src = readFileSync(file, 'utf8')
        for (const match of src.matchAll(IMPORT_RE)) {
            const spec = match[1] ?? match[2]
            if (!spec) continue
            // Ignore anything that is not a valid bare specifier (e.g. the
            // `<spec>` placeholder inside a comment, or template fragments).
            if (!/^[@a-zA-Z0-9._/-]+$/.test(spec)) continue
            // Relative imports and the `@/` babel alias are local, not packages.
            if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) continue
            // `node:`-prefixed specifiers are always builtins (some, like
            // `node:test`, are absent from builtinModules).
            if (spec.startsWith('node:')) continue
            const name = packageName(spec)
            if (builtins.has(name) || builtins.has(spec)) continue
            if (declared.has(name)) continue
            if (!undeclared.has(name)) undeclared.set(name, new Set())
            undeclared.get(name).add(file.slice(root.length + 1))
        }
    }
}

if (undeclared.size === 0) {
    console.log('check-deps: OK — all imported packages are declared in package.json')
    process.exit(0)
}

console.error('check-deps: FAIL — undeclared runtime imports found:\n')
for (const [name, files] of [...undeclared].sort()) {
    console.error(`  ${name}`)
    for (const f of [...files].sort()) console.error(`    ${f}`)
}
console.error('\nAdd each package to package.json dependencies (or devDependencies).')
process.exit(1)
