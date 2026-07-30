import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/backup-password-setup.ts')
const source = await readFile(modulePath, 'utf8')
const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
    },
})
const { submitInitialBackupPassword } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('backup password setup validates both fields without sending an RPC', async () => {
    let requests = 0
    const send = async () => { requests += 1; return JSON.stringify({ ok: true }) }

    assert.deepEqual(await submitInitialBackupPassword('short', 'short', send), {
        ok: false,
        reason: 'too-short',
    })
    assert.deepEqual(await submitInitialBackupPassword('password1', 'password2', send), {
        ok: false,
        reason: 'mismatch',
    })
    assert.equal(requests, 0)
})

test('backup password setup sends only the exact new password', async () => {
    const payloads = []
    const result = await submitInitialBackupPassword(' pass word ', ' pass word ', async (payload) => {
        payloads.push(payload)
        return JSON.stringify({ ok: true })
    })

    assert.deepEqual(result, { ok: true })
    assert.equal(payloads.length, 1)
    assert.deepEqual(JSON.parse(payloads[0]), { next: ' pass word ' })
    assert.equal(Object.hasOwn(JSON.parse(payloads[0]), 'current'), false)
})

test('backup password setup fails safely for refused, malformed, and thrown replies', async (t) => {
    const cases = [
        ['refused', async () => JSON.stringify({ ok: false, reason: 'bad-password' })],
        ['empty', async () => null],
        ['malformed', async () => 'not json'],
        ['thrown', async () => { throw new Error('transport closed') }],
    ]

    for (const [name, send] of cases) {
        await t.test(name, async () => {
            assert.deepEqual(await submitInitialBackupPassword('password1', 'password1', send), {
                ok: false,
                reason: 'request-failed',
            })
        })
    }
})
