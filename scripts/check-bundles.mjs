#!/usr/bin/env node
// Generated-artifact freshness gate for the Bare backend bundles.
//
// The bundles are build artifacts, not source: `npm run bundle:backend:ios` /
// `:android` write them, and since Release 6.1 they are gitignored so a clean
// checkout has none. That is the right call, but it left a blind spot.
//
// `app/bundles.d.ts` declares them with a WILDCARD (`declare module
// '*.bundle.mjs'`), so TypeScript is satisfied by any path ending in
// `.bundle.mjs` whether or not anything produces it. Change the `--out` path in
// a bundle script and `tsc --noEmit` still passes, the tests still pass, CI goes
// green — and the app fails at native build or worklet boot with a missing
// module. The declaration that makes a clean checkout typecheck is exactly what
// hides the drift.
//
// So compare the two ends directly: the paths the bundle scripts WRITE against
// the paths the worklet hook READS. They must be the same files.
import { readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// `bare-pack --out <raw>` then `wrap-bare-bundle.mjs <raw> <wrapped>`; the
// wrapped module is what source imports.
function producedBundles() {
    const produced = new Map() // wrapped path -> script name
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
        if (!name.startsWith('bundle:backend')) continue
        const wrap = script.match(/wrap-bare-bundle\.mjs\s+(\S+)\s+(\S+)/)
        if (!wrap) {
            fail([`${name}: could not find the wrap-bare-bundle step; this gate cannot verify it`])
        }
        const [, raw, wrapped] = wrap
        const out = script.match(/--out\s+(\S+)/)
        if (out && normalize(out[1]) !== normalize(raw)) {
            fail([`${name}: bare-pack writes ${out[1]} but wrap-bare-bundle reads ${raw}`])
        }
        produced.set(normalize(wrapped), name)
    }
    return produced
}

// Source-side: every import that resolves to a *.bundle.mjs, with the importer
// path so a failure says where to look.
function importedBundles() {
    const hook = 'app/hooks/_useWorklet.ts'
    const source = readFileSync(join(root, hook), 'utf8')
    const imported = new Map() // normalized path from repo root -> importer
    for (const m of source.matchAll(/from\s+['"](\.[^'"]*\.bundle\.mjs)['"]/g)) {
        imported.set(normalize(join('app', 'hooks', m[1])), hook)
    }
    return imported
}

function fail(lines) {
    console.error('check-bundles: FAIL\n')
    for (const line of lines) console.error(`  ${line}`)
    console.error('\nThe bundle scripts and the worklet import must name the same files.')
    process.exit(1)
}

const produced = producedBundles()
const imported = importedBundles()
const problems = []

if (produced.size === 0) problems.push('no bundle:backend:* scripts found — this gate is not checking anything')
if (imported.size === 0) problems.push('app/hooks/_useWorklet.ts imports no *.bundle.mjs — this gate is not checking anything')

for (const [path, importer] of imported) {
    if (!produced.has(path)) {
        problems.push(`${importer} imports ${path}, which no bundle:backend:* script produces`)
    }
}
for (const [path, script] of produced) {
    if (!imported.has(path)) {
        problems.push(`${script} produces ${path}, which nothing imports`)
    }
}

if (problems.length > 0) fail(problems)
console.log(`check-bundles: OK — ${produced.size} generated bundle(s) match their imports`)
