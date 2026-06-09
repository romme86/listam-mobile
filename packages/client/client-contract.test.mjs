import assert from 'node:assert/strict'
import test from 'node:test'
import {
    decodeWithClientAdapter,
    nodeClientAdapter,
    workletClientAdapter,
} from './index.mjs'
import {
    RPC_ADD_FROM_BACKEND,
    RPC_DELETE_FROM_BACKEND,
    RPC_GET_KEY,
    RPC_MESSAGE,
    RPC_PERSIST_SECRET,
    RPC_RESET,
    RPC_UPDATE_FROM_BACKEND,
    SYNC_LIST,
} from '@listam/protocol'

const adapters = [workletClientAdapter, nodeClientAdapter]

for (const adapter of adapters) {
    test(`@listam/client backend event contract (${adapter.name})`, async (t) => {
        await t.test('decodes lifecycle and message events', () => {
            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_RESET, '').type, 'reset')

            const message = decodeWithClientAdapter(adapter, RPC_MESSAGE, {
                type: 'join-success',
            })
            assert.equal(message.type, 'message')
            assert.deepEqual(message.payload, { type: 'join-success' })
        })

        await t.test('decodes list mutation events', () => {
            const item = { id: 'item-1', text: 'milk', listId: 'groceries' }
            const list = [item]

            assert.deepEqual(decodeWithClientAdapter(adapter, SYNC_LIST, list), {
                type: 'sync-list',
                items: list,
                raw: JSON.stringify(list),
            })
            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_ADD_FROM_BACKEND, item).item, item)
            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_UPDATE_FROM_BACKEND, item).item, item)
            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_DELETE_FROM_BACKEND, item).item, item)
        })

        await t.test('decodes invite and secret persistence events', () => {
            const secretPayload = { op: 'persist', name: 'autobaseKey', value: '00' }

            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_GET_KEY, 'invite-z32'), {
                type: 'invite-key',
                key: 'invite-z32',
            })
            assert.deepEqual(decodeWithClientAdapter(adapter, RPC_PERSIST_SECRET, secretPayload), {
                type: 'persist-secret',
                payload: JSON.stringify(secretPayload),
            })
        })
    })
}
