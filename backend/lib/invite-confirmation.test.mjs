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
    parseInviteLink,
    planIncomingLinkJoin,
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

test('parseInviteLink only recognizes invite links and flags untrusted hosts', () => {
    assert.deepEqual(parseInviteLink('https://listam.ch/join?invite=abc'), {
        invite: 'abc',
        sourceLabel: 'listam.ch',
        trusted: true,
    })
    assert.deepEqual(parseInviteLink('listam://join?invite=xyz'), {
        invite: 'xyz',
        sourceLabel: 'the Listam app',
        trusted: true,
    })
    assert.deepEqual(parseInviteLink('https://evil.example/join?invite=abc'), {
        invite: 'abc',
        sourceLabel: 'evil.example',
        trusted: false,
    })
    // Not a Listam invite link → ignored entirely.
    assert.equal(parseInviteLink('https://listam.ch/about'), null)
    assert.equal(parseInviteLink('not a url'), null)
    assert.equal(parseInviteLink(''), null)
})

test('cold-start and foreground links produce a confirmation showing the source', () => {
    const coldStart = planIncomingLinkJoin('https://listam.ch/join?invite=abc', {
        pendingInvite: '',
        isJoining: false,
    })
    assert.equal(coldStart.status, 'needs-confirmation')
    assert.equal(coldStart.invite, 'abc')
    assert.match(coldStart.message, /listam\.ch/)
    assert.doesNotMatch(coldStart.message, /not from listam\.ch/)

    // Foreground link from an untrusted host still confirms, but warns.
    const untrusted = planIncomingLinkJoin('https://evil.example/join?invite=abc', {
        pendingInvite: '',
        isJoining: false,
    })
    assert.equal(untrusted.status, 'needs-confirmation')
    assert.match(untrusted.message, /not from listam\.ch/)
})

test('non-invite links are ignored instead of prompting a join', () => {
    assert.equal(planIncomingLinkJoin('https://listam.ch/about', {
        pendingInvite: '',
        isJoining: false,
    }), null)
})

test('a duplicate link while one is pending is suppressed, not stacked', () => {
    // Same invite already pending → no second dialog.
    assert.equal(planIncomingLinkJoin('https://listam.ch/join?invite=abc', {
        pendingInvite: 'abc',
        isJoining: false,
    }).status, 'already-pending')

    // Different invite while a dialog is open → suppressed.
    const collision = planIncomingLinkJoin('https://listam.ch/join?invite=def', {
        pendingInvite: 'abc',
        isJoining: false,
    })
    assert.equal(collision.status, 'confirmation-open')
    assert.equal(collision.pendingInvite, 'abc')
})

test('a link arriving while already joining is rejected as busy', () => {
    assert.equal(planIncomingLinkJoin('https://listam.ch/join?invite=abc', {
        pendingInvite: '',
        isJoining: true,
    }).status, 'busy')
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
