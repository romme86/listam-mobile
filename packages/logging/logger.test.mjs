import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLogLine, parseLogArgs, redactForLog, redactString } from './index.mjs'

test('logging redacts key and invite-shaped strings', () => {
    const hex = 'a'.repeat(64)
    const invite = 'ybndrfg8ejkmcpqxot1uwisza345h769'.repeat(2)

    assert.equal(redactString(`key=${hex}`), 'key=[redacted-hex]')
    assert.equal(redactString(`https://listam.ch/join?invite=${invite}`), 'https://listam.ch/join?invite=[redacted]')
})

test('logging redacts sensitive object fields and item payloads', () => {
    assert.deepEqual(redactForLog({
        key: Buffer.from('abc'),
        value: { text: 'Milk', isDone: false, timeOfCompletion: 0 },
        items: [{ text: 'Eggs', isDone: true, timeOfCompletion: 123 }],
    }), {
        key: '[redacted]',
        value: '[redacted]',
        items: '[items:1]',
    })
})

test('logging formats structured JSON lines with app labels', () => {
    const row = parseLogArgs(['[WARNING] Link', { invite: 'secret' }], { app: 'shared' })
    assert.equal(row.level, 'warn')
    assert.equal(row.app, 'shared')
    assert.equal(JSON.parse(formatLogLine(['[INFO] Ready'])).message, 'Ready')
})
