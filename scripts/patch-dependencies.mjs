// Reproducible, version-checked compatibility/security patches. Run after every
// install and fail if upstream changes the code: updates need an explicit review.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function patch(name, version, file, before, after) {
    const directory = resolve(root, 'node_modules', name)
    const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
    if (pkg.version !== version) throw new Error(`Review the ${name} patch for ${pkg.version}; expected ${version}`)
    const path = resolve(directory, file)
    const source = readFileSync(path, 'utf8')
    if (source.includes(after)) return
    if (source.split(before).length !== 2) throw new Error(`Patch context changed: ${name}/${file}`)
    writeFileSync(path, source.replace(before, after))
}

// 0.5.0 fixes GHSA-vcc3-ghjq-m6fr. query-string 7 expects a CommonJS callable
// and the old '+' decoding behavior; retain those without retaining its unsafe
// recursive decoder. ESM default imports also work with this CommonJS module.
patch('decode-uri-component', '0.5.0', 'index.js',
    'export default function decodeUriComponent(encodedURI) {',
    'module.exports = function decodeUriComponent(encodedURI) {')
patch('decode-uri-component', '0.5.0', 'index.js',
    '\ttry {\n\t\t// Try the built in decoder first',
    "\tencodedURI = encodedURI.replace(/\\+/g, ' ');\n\ttry {\n\t\t// Try the built in decoder first")
patch('decode-uri-component', '0.5.0', 'package.json', '"type": "module"', '"type": "commonjs"')

// No patched image-size release exists for GHSA-w3rx-r6r6-pgpr and
// GHSA-5p2g-fcmc-qvqq. Reject invalid/non-progressing headers before parsers loop.
// Payload bytes may be outside image-size's 512 KiB read window; only require
// the header locally, while bounding the entry against its declared file size.
patch('image-size', '1.2.1', 'dist/types/icns.js',
    '    const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;',
    `    if (imageOffset + 8 > input.length) throw new TypeError('Truncated ICNS entry');
    const entryLength = (0, utils_1.readUInt32BE)(input, imageOffset + ENTRY_LENGTH_OFFSET);
    const fileLength = (0, utils_1.readUInt32BE)(input, FILE_LENGTH_OFFSET);
    if (entryLength < 8 || entryLength > fileLength - imageOffset) throw new TypeError('Invalid ICNS entry length');
    const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;`)
patch('image-size', '1.2.1', 'dist/types/utils.js',
    '    if (input.length - offset < 4)',
    '    if (!Number.isInteger(offset) || offset < 0 || input.length - offset < 8)')
patch('image-size', '1.2.1', 'dist/types/utils.js',
    '    if (input.length - offset < boxSize)',
    '    if (boxSize < 8 || input.length - offset < boxSize)')

// React Native's first Debug build assumes an unmarked CocoaPods cache is
// already Debug. A cached Release framework lacks DebugStringConvertible and
// Sealable symbols and fails to link. Extract the matching archive once, then
// let the existing configuration marker handle subsequent builds.
patch('react-native', '0.81.5', 'scripts/replace-rncore-version.js',
    `  // Assumption: if there is no stored last build, we assume that it was build for debug.
  if (!fileExists && configuration === 'Debug') {
    console.log(
      'No previous build detected, but Debug Configuration. No need to replace React-Core-prebuilt',
    );
    return false;
  }
`,
    '  // An unmarked CocoaPods cache may contain a Release binary; extract the requested configuration.\n')

console.log('Dependency compatibility and parser safety patches verified.')
