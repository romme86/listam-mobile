// The mapping that decides what a user is told when a join fails.
//
// On 2026-08-26 three people on 4G watched a spinner for two minutes and were
// then shown the backend's raw English `Error.message`. These assert that every
// reason the backend can report now resolves to translated, actionable copy —
// and, just as importantly, that an unrecognised one degrades to advice rather
// than to a blank or a raw string.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { MESSAGE_KEYS } from '@listam/i18n'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(APP_DIR, `.test-build-join-diagnostics-${process.pid}`)
fs.mkdirSync(buildDir, { recursive: true })
after(() => fs.rmSync(buildDir, { recursive: true, force: true }))

const src = path.join(APP_DIR, 'joinDiagnostics.ts')
const out = path.join(buildDir, 'joinDiagnostics.mjs')
fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(src, 'utf8'), {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        isolatedModules: true,
        esModuleInterop: true,
    },
    fileName: src,
}).outputText)

const {
    JOIN_SLOW_HINT_MS,
    formatDiagnosticsBundle,
    formatInviteCountdown,
    inviteRemainingMs,
    isRelayedNetwork,
    joinFailureMessageKey,
    joinHintMessageKey,
    listJoinFailureMessageKey,
} = await import(pathToFileURL(out).href)

const catalogKeys = new Set(MESSAGE_KEYS)

// The backend's JOIN_REASON vocabulary (@listam/backend lib/pairing-tuning).
const JOIN_REASONS = [
    'timeout',
    'invite-used',
    'invite-expired',
    'rejected',
    'invite-invalid',
    'no-network',
    'cancelled',
    'incomplete-credentials',
    'unknown',
]

test('every backend join reason maps to a real catalog key', () => {
    for (const reason of JOIN_REASONS) {
        const key = joinFailureMessageKey(reason)
        assert.ok(catalogKeys.has(key), `${reason} -> ${key} is not in the catalog`)
    }
})

test('distinct reasons get distinct copy', () => {
    // A map that collapsed several reasons onto one string would pass the check
    // above while telling the user nothing more than the old fixed message did.
    const keys = JOIN_REASONS.map(joinFailureMessageKey)
    assert.equal(new Set(keys).size, JOIN_REASONS.length)
})

test('an unknown or missing reason still gives advice, never a raw string', () => {
    for (const reason of [undefined, null, '', 'something-new-from-a-newer-backend']) {
        assert.equal(joinFailureMessageKey(reason), 'joining.failed.unknown')
    }
})

test('the list-join vocabulary folds onto the same copy', () => {
    // RPC_JOIN_LIST answers from an older vocabulary that never adopted
    // JOIN_REASON, and its catch collapses every transport failure into
    // 'join-failed'. Each of these used to render one fixed string.
    assert.equal(listJoinFailureMessageKey('join-timeout'), 'joining.failed.timeout')
    assert.equal(listJoinFailureMessageKey('bad-invite'), 'joining.failed.inviteInvalid')
    assert.equal(listJoinFailureMessageKey('not-ready'), 'joining.failed.noNetwork')
    assert.equal(listJoinFailureMessageKey('join-failed'), 'joining.failed.unknown')
    // And a reason from the NEW vocabulary passes straight through, so this
    // keeps working if the backend ever forwards the classified reason.
    assert.equal(listJoinFailureMessageKey('invite-used'), 'joining.failed.inviteUsed')
})

test('a structural list refusal keeps the list-specific string', () => {
    // "Ask for a fresh invite code" is wrong advice for these: the code was
    // fine, the list could not be adopted.
    for (const reason of ['cannot-join-builtin', 'list-id-conflict', 'registry-write-failed']) {
        assert.equal(listJoinFailureMessageKey(reason), 'joinList.failed')
    }
    assert.equal(listJoinFailureMessageKey(null), 'joinList.failed')
})

test('the slow hint waits, and the relayed hint does not', () => {
    assert.equal(joinHintMessageKey(0, false), null, 'nothing useful to say yet')
    assert.equal(joinHintMessageKey(JOIN_SLOW_HINT_MS - 1, false), null)
    assert.equal(joinHintMessageKey(JOIN_SLOW_HINT_MS, false), 'joining.hint.slow')
    // Relayed outranks slow even early: it explains WHY this is slow and that it
    // will still work, which is the calmer of the two messages.
    assert.equal(joinHintMessageKey(0, true), 'joining.hint.relayed')
    assert.equal(joinHintMessageKey(60000, true), 'joining.hint.relayed')
})

test('both hint keys exist in the catalog', () => {
    for (const key of ['joining.hint.slow', 'joining.hint.relayed']) {
        assert.ok(catalogKeys.has(key))
    }
})

test('invite countdown keeps the seconds a 10-minute window needs', () => {
    assert.equal(formatInviteCountdown(600000), '10:00')
    assert.equal(formatInviteCountdown(59000), '0:59')
    assert.equal(formatInviteCountdown(7000), '0:07')
    assert.equal(formatInviteCountdown(0), '0:00')
    // Never a negative clock once the deadline passes.
    assert.equal(formatInviteCountdown(-5000), '0:00')
})

test('an undated invite reports no remaining time rather than zero', () => {
    // A pre-envelope backend sends no expiresAt. Rendering "0:00" there would
    // claim a code is dead when we simply were not told.
    assert.equal(inviteRemainingMs(null, 1000), null)
    assert.equal(inviteRemainingMs(undefined, 1000), null)
    assert.equal(inviteRemainingMs(5000, 1000), 4000)
    assert.equal(inviteRemainingMs(1000, 5000), 0, 'clamped, never negative')
})

test('only randomized === true counts as a relayed network', () => {
    // The backend reports null when the DHT has not decided yet; treating that
    // as "relayed" would tell every user their network blocks connections.
    assert.equal(isRelayedNetwork({ randomized: true }), true)
    assert.equal(isRelayedNetwork({ randomized: false }), false)
    assert.equal(isRelayedNetwork({ randomized: null }), false)
    assert.equal(isRelayedNetwork({}), false)
    assert.equal(isRelayedNetwork(null), false)
})

test('the bundle carries every transport field, including the falsy ones', () => {
    const bundle = formatDiagnosticsBundle({
        diagnostics: {
            bootstrapped: true,
            online: false,
            firewalled: true,
            randomized: true,
            punches: 0,
            relaying: 0,
            relayConfigured: 0,
            tempConnections: 0,
            mainConnections: 0,
        },
        logLines: ['[INFO] one', '[WARNING] two'],
        dropped: 4,
        platform: 'ios 18.0',
        now: 0,
    })
    // `online: false` and `punches: 0` are the interesting values in a failure;
    // a formatter that skipped falsy fields would drop exactly the evidence.
    assert.match(bundle, /online: false/)
    assert.match(bundle, /punches: 0/)
    assert.match(bundle, /relayConfigured: 0/)
    assert.match(bundle, /randomized: true/)
    assert.match(bundle, /platform: ios 18\.0/)
    assert.match(bundle, /log: 2 lines, 4 dropped/)
    assert.match(bundle, /\[WARNING\] two/)
})

test('a backend that never answered says so instead of looking empty', () => {
    const bundle = formatDiagnosticsBundle({ diagnostics: null, logLines: [], now: 0 })
    assert.match(bundle, /diagnostics: unavailable/)
    // "The backend did not answer" IS the finding; an empty-looking bundle would
    // be indistinguishable from a healthy device with nothing to report.
    assert.match(bundle, /log: 0 lines/)
})

test('a missing diagnostic field reads n/a rather than undefined', () => {
    const bundle = formatDiagnosticsBundle({ diagnostics: { online: true }, now: 0 })
    assert.match(bundle, /firewalled: n\/a/)
    assert.doesNotMatch(bundle, /undefined/)
})
