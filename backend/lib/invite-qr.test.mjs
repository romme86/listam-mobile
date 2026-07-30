import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createInviteQrPayload } from '@listam/protocol'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../app')
const buildDir = join(appDir, `.test-build-invite-qr-${process.pid}`)
mkdirSync(buildDir, { recursive: true })

const source = readFileSync(join(appDir, 'invite-qr.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
    },
})
const modulePath = join(buildDir, 'invite-qr.mjs')
writeFileSync(modulePath, outputText)
const { parseScannedInviteQr } = await import(pathToFileURL(modulePath).href)

after(() => rmSync(buildDir, { recursive: true, force: true }))

const rawInvite = 'y'.repeat(106)

test('typed QR invites retain and enforce their scope', () => {
    const listPayload = createInviteQrPayload(rawInvite, 'list')

    assert.deepEqual(parseScannedInviteQr(listPayload, 'list'), {
        status: 'ok',
        invite: rawInvite,
        scope: 'list',
        legacy: false,
    })
    assert.deepEqual(parseScannedInviteQr(listPayload, 'project'), {
        status: 'scope-mismatch',
        scope: 'list',
    })
})

test('legacy raw invites and trusted links inherit the open Join context', () => {
    assert.deepEqual(parseScannedInviteQr(rawInvite.toUpperCase(), 'project'), {
        status: 'ok',
        invite: rawInvite,
        scope: 'project',
        legacy: true,
    })
    assert.deepEqual(
        parseScannedInviteQr(`https://listam.ch/join?invite=${rawInvite}`, 'list'),
        { status: 'ok', invite: rawInvite, scope: 'list', legacy: true },
    )
    assert.deepEqual(
        parseScannedInviteQr(`ch.saynode.listam://join?invite=${rawInvite}`, 'project'),
        { status: 'ok', invite: rawInvite, scope: 'project', legacy: true },
    )
})

test('malformed typed envelopes, untrusted links and arbitrary QR text are rejected', () => {
    assert.deepEqual(
        parseScannedInviteQr(`listam-invite://v2/list?invite=${rawInvite}`, 'list'),
        { status: 'invalid' },
    )
    assert.deepEqual(
        parseScannedInviteQr(`https://evil.example/join?invite=${rawInvite}`, 'list'),
        { status: 'invalid' },
    )
    assert.deepEqual(parseScannedInviteQr('hello world', 'project'), { status: 'invalid' })
})
