import test from 'node:test'
import assert from 'node:assert/strict'
import {
    createJoinRollbackSnapshot,
    restoreJoinRollbackSnapshot,
} from './join-rollback.mjs'

test('join rollback snapshots clone list and key material', () => {
    const list = [{ text: 'Milk', isDone: false, timeOfCompletion: 0 }]
    const baseKey = Buffer.from('a'.repeat(64), 'hex')
    const encryptionKey = Buffer.from('b'.repeat(64), 'hex')

    const snapshot = createJoinRollbackSnapshot({ currentList: list, baseKey, encryptionKey })

    list.push({ text: 'Eggs', isDone: false, timeOfCompletion: 0 })
    baseKey.fill(0)
    encryptionKey.fill(0)

    assert.deepEqual(snapshot.previousList, [{ text: 'Milk', isDone: false, timeOfCompletion: 0 }])
    assert.equal(snapshot.previousBaseKey.toString('hex'), 'a'.repeat(64))
    assert.equal(snapshot.previousEncryptionKey.toString('hex'), 'b'.repeat(64))
})

test('join rollback syncs previous list and restores previous base', async () => {
    const sent = []
    const restored = []
    const encryptionKeys = []
    const snapshot = createJoinRollbackSnapshot({
        currentList: [{ text: 'Milk', isDone: false, timeOfCompletion: 0 }],
        baseKey: Buffer.from('a'.repeat(64), 'hex'),
        encryptionKey: Buffer.from('b'.repeat(64), 'hex'),
    })

    const didRestore = await restoreJoinRollbackSnapshot(snapshot, {
        rpc: {
            request(command) {
                return {
                    send(payload) {
                        sent.push({ command, payload })
                    },
                }
            },
        },
        syncListCommand: 6,
        setEncryptionKey(key) {
            encryptionKeys.push(key?.toString('hex') || null)
        },
        async initAutobase(key) {
            restored.push(key.toString('hex'))
        },
    })

    assert.equal(didRestore, true)
    assert.deepEqual(sent, [{
        command: 6,
        payload: JSON.stringify([{ text: 'Milk', isDone: false, timeOfCompletion: 0 }]),
    }])
    assert.deepEqual(encryptionKeys, ['b'.repeat(64)])
    assert.deepEqual(restored, ['a'.repeat(64)])
})

test('join rollback without a previous base only restores visible list', async () => {
    const sent = []
    const didRestore = await restoreJoinRollbackSnapshot({
        previousList: [{ text: 'Milk', isDone: false, timeOfCompletion: 0 }],
        previousBaseKey: null,
        previousEncryptionKey: null,
    }, {
        rpc: {
            request(command) {
                return {
                    send(payload) {
                        sent.push({ command, payload })
                    },
                }
            },
        },
        syncListCommand: 6,
        setEncryptionKey() {
            throw new Error('setEncryptionKey should not run')
        },
        async initAutobase() {
            throw new Error('initAutobase should not run')
        },
    })

    assert.equal(didRestore, false)
    assert.equal(sent.length, 1)
})
