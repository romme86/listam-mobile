// Keep the generated native project aligned with the committed Expo version.
// Do not allow a fresh Expo template's debug signing to become a release.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
const version = expo.version
const code = expo.android.versionCode
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(code) || code < 1) {
    throw new Error('Set a valid expo.version and positive android.versionCode in app.json')
}

const path = fileURLToPath(new URL('../android/app/build.gradle', import.meta.url))
let source = readFileSync(path, 'utf8')
const buildTypes = source.slice(source.indexOf('    buildTypes {'))
if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release\b/.test(buildTypes)) {
    throw new Error('Configure the Android release build to use signingConfigs.release and your upload key before building')
}

function replaceOne(pattern, replacement, setting) {
    if ([...source.matchAll(pattern)].length !== 1) {
        throw new Error(`Expected one ${setting} in android/app/build.gradle; review the native project`)
    }
    source = source.replace(pattern, replacement)
}
replaceOne(/(^[\t ]*versionCode[\t ]+)\d+$/gm, `$1${code}`, 'versionCode')
replaceOne(/(^[\t ]*versionName[\t ]+)["'][^"']+["']$/gm, `$1"${version}"`, 'versionName')
writeFileSync(path, source)
console.log(`Android release metadata synchronized: ${version} (${code})`)
