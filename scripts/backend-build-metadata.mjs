import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requireApp = createRequire(join(appRoot, 'package.json'))
const hash = (value) => createHash('sha256').update(value).digest('hex')
export function backendBuildMetadata() {
    const backendRoot = dirname(realpathSync(requireApp.resolve('@listam/backend')))
    const sharedRoot = join(backendRoot, '..', '..')
    const requireBackend = createRequire(join(backendRoot, 'package.json'))
    const source = createHash('sha256')
    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue
            const path = join(dir, entry.name)
            if (entry.isDirectory()) walk(path)
            else if (/\.(mjs|js|json|ts)$/.test(entry.name) && !/\.(test|scenario)\.mjs$/.test(entry.name)) {
                source.update(relative(sharedRoot, path)); source.update('\0'); source.update(readFileSync(path)); source.update('\0')
            }
        }
    }
    walk(join(sharedRoot, 'packages'))
    walk(join(appRoot, 'backend'))
    const versions = (resolve) => Object.fromEntries(['autobase', 'hyperswarm', 'hypercore', 'corestore', 'hyperdht', 'udx-native'].map((name) => [name, JSON.parse(readFileSync(resolve.resolve(`${name}/package.json`))).version]))
    return {
        version: 1,
        sourceSha256: source.digest('hex'),
        appLockSha256: hash(readFileSync(join(appRoot, 'package-lock.json'))),
        sharedLockSha256: hash(readFileSync(join(sharedRoot, 'package-lock.json'))),
        appDependencies: versions(requireApp), backendDependencies: versions(requireBackend),
    }
}
