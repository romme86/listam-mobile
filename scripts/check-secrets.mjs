#!/usr/bin/env node
// Phase 0 secret/log grep gate.
//
// Fails if the repository contains committed runtime logs, app-generated key/
// invite artifacts, or secret-shaped strings (long hex keys, z-base-32 invite
// blobs) in tracked source. Runs against `git ls-files` so node_modules and
// other untracked output are never scanned.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')

const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

// Files whose mere presence is a leak.
const FORBIDDEN_FILE = [
    /(^|\/)logs_/,
    /\.log$/,
    /(^|\/)(lista-)?(autobase|encryption|local-writer)-key\.txt$/,
    /(^|\/)(lista-)?invite\.json$/
]

// Paths excluded from content scanning: lockfile integrity hashes and binary/
// generated artifacts produce expected high-entropy strings that are not secrets.
const SKIP_CONTENT = [
    /^package-lock\.json$/,
    /(^|\/)assets\//,
    /\.bundle/, // any *.bundle* artifact (e.g. app.ios.bundle.mjs, backend.bundle.android.js)
    /(^|\/)app\.(android|ios)\.m?js$/, // generated Metro/Hermes app bundles
    /\.(png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|pdf|zip)$/
]
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|yml|yaml)$/

// 64+ hex chars = 32-byte Autobase/encryption/writer key. z-base-32 run of 52+
// chars = a BlindPairing invite blob.
const HEX_KEY = /\b[0-9a-f]{64,}\b/
const Z32_BLOB = /\b[ybndrfg8ejkmcpqxot1uwisza345h769]{52,}\b/

const fileViolations = []
const contentViolations = []

for (const file of tracked) {
    if (FORBIDDEN_FILE.some((re) => re.test(file))) {
        fileViolations.push(file)
        continue
    }
    if (!SCAN_EXT.test(file) || SKIP_CONTENT.some((re) => re.test(file))) continue
    let src
    try {
        src = readFileSync(join(root, file), 'utf8')
    } catch {
        continue
    }
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (HEX_KEY.test(line) || Z32_BLOB.test(line)) {
            contentViolations.push(`${file}:${i + 1}`)
        }
    }
}

if (fileViolations.length === 0 && contentViolations.length === 0) {
    console.log('check-secrets: OK — no committed logs or secret-shaped strings found')
    process.exit(0)
}

if (fileViolations.length) {
    console.error('check-secrets: FAIL — forbidden log/secret artifacts are committed:')
    for (const f of fileViolations) console.error(`    ${f}`)
}
if (contentViolations.length) {
    console.error('check-secrets: FAIL — secret-shaped strings in tracked source:')
    for (const v of contentViolations) console.error(`    ${v}`)
}
process.exit(1)
