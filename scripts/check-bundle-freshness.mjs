import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appRoot, backendBuildMetadata } from './backend-build-metadata.mjs'

const expected = JSON.stringify(backendBuildMetadata())
for (const path of ['app/app.ios.bundle.mjs', 'app/assets/backend.android.bundle.mjs']) {
    const contents = readFileSync(join(appRoot, path), 'utf8')
    const match = contents.match(/^\/\/ build-metadata: (.+)$/m)
    if (!match || JSON.stringify(JSON.parse(match[1])) !== expected) {
        throw new Error(`${path} is stale; rebuild both Bare backends before releasing`)
    }
}
console.log('Both Bare bundles match current shared source, lockfiles and installed transport versions.')
