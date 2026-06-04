import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/invite-confirmation.ts')
const source = await readFile(modulePath, 'utf8')
const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
    },
})
const {
    createJoinConfirmationRequest,
    extractInviteFromInput,
    resolveJoinConfirmation,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('invite confirmation extracts manual codes and deep-link invite params', () => {
    assert.equal(extractInviteFromInput(' abc def '), 'abcdef')
    assert.equal(
        extractInviteFromInput('https://listam.ch/join?invite=abc%20def'),
        'abcdef'
    )
    assert.equal(
        extractInviteFromInput('listam://join?unused=1&invite=xyz'),
        'xyz'
    )
})

test('deep links require confirmation instead of starting a join immediately', () => {
    const request = createJoinConfirmationRequest('https://listam.ch/join?invite=abc', {
        source: 'link',
        pendingInvite: '',
        isJoining: false,
    })

    assert.equal(request.status, 'needs-confirmation')
    assert.equal(request.invite, 'abc')
    assert.equal(request.pendingInvite, 'abc')
    assert.match(request.message, /may switch this device/)
})

test('cancel clears pending invite without confirming a join', () => {
    const result = resolveJoinConfirmation('abc', 'abc', false)

    assert.deepEqual(result, {
        pendingInvite: '',
        confirmedInvite: '',
    })
})

test('confirm returns the invite only while it is still pending', () => {
    assert.deepEqual(resolveJoinConfirmation('abc', 'abc', true), {
        pendingInvite: '',
        confirmedInvite: 'abc',
    })
    assert.deepEqual(resolveJoinConfirmation('different', 'abc', true), {
        pendingInvite: 'different',
        confirmedInvite: '',
    })
})

test('invalid and busy join requests never create a pending confirmation', () => {
    assert.deepEqual(createJoinConfirmationRequest('', {
        source: 'manual',
        pendingInvite: 'old',
        isJoining: false,
    }), {
        status: 'invalid',
        invite: '',
        pendingInvite: 'old',
        notification: 'Enter a valid invite key or link',
    })

    assert.deepEqual(createJoinConfirmationRequest('abc', {
        source: 'manual',
        pendingInvite: 'old',
        isJoining: true,
    }), {
        status: 'busy',
        invite: 'abc',
        pendingInvite: 'old',
        notification: 'Already joining an invite',
    })
})
