
// Add item operation (backend creates the canonical item)
import {RPC_MESSAGE} from "@listam/protocol";
import {generateId} from "./util.mjs";
import {autobase, store, rpc, currentList, epochKey, membershipState} from './state.mjs'
import {SYNC_LIST} from "@listam/protocol";
import { logger } from "./logger.mjs"
import { createEncryptedListOperation } from './key-epochs.mjs'
import {
    DEFAULT_LIST_ID,
    DEFAULT_LIST_TYPE,
    createListOperation,
    normalizeListItem,
    reduceListViewEntries,
} from './list-reducer.mjs'

// --- WRITE SERIALIZATION (prevents concurrent autobase.append / flush races) ---
let _writeChain = Promise.resolve()

// Exported so the membership re-key flow (rekey.mjs) can serialize its
// epoch-rotation appends against list writes through the same chain — otherwise
// a concurrent addItem could land between the epoch flip and the re-encrypted
// snapshot and be tagged with a mismatched epoch.
export function enqueueWrite (fn) {
    // ensures writes run one-at-a-time even if RPC calls arrive concurrently
    _writeChain = _writeChain.then(fn, fn)
    return _writeChain
}

export async function addItem (text, listId = DEFAULT_LIST_ID, listType = DEFAULT_LIST_TYPE) {
    if (!autobase) {
        logger.log('[WARNING] addItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        logger.log('[WARNING] addItem called but autobase is not writable yet - waiting to be added as writer')
        // Notify frontend about not being writable
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            logger.log('[ERROR] Failed to send not-writable message:', e)
        }
        return false
    }

    logger.log('[INFO] Command RPC_ADD addItem')

    const now = Date.now()
    const item = {
        id: generateId(),                    // extra metadata, frontend can ignore
        text,
        isDone: false,
        listId: listId || DEFAULT_LIST_ID,
        listType: listType || DEFAULT_LIST_TYPE,
        timeOfCompletion: 0,
        updatedAt: now,
        timestamp: now,
    }

    const op = createListOperation('add', item, { listId, listType })
    if (!op) return false

    return enqueueWrite(async () => {
        if (!autobase) return false
        if (autobase.closing) {
            logger.log('[WARNING] Mutation requested while Autobase is closing; ignoring.')
            return false
        }
        // Get length before append to verify it increases
        // const lengthBefore = autobase.local.length

        await autobase.append(prepareListAppendOperation(op))

        // Flush to disk and verify persistence
        // const persisted = await persistAndVerify(lengthBefore + 1, 'ADD')
        // if (!persisted) {
        //     logger.log('[WARNING] Add operation may not have been persisted to disk!')
        // }

        logger.log('[INFO] Added item')
        return true
    })
}

// Update item operation: AUTONOMOUS, NO BACKEND MEMORY
export async function updateItem (item) {
    if (!autobase) {
        logger.log('[WARNING] updateItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        logger.log('[WARNING] updateItem called but autobase is not writable yet')
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            logger.log('[ERROR] Failed to send not-writable message:', e)
        }
        return false
    }

    logger.log('[INFO] Command RPC_UPDATE updateItem')

    const op = createListOperation('update', {
        ...item,
        updatedAt: typeof item?.updatedAt === 'number' ? item.updatedAt : Date.now(),
    })
    if (!op) return false

    return enqueueWrite(async () => {
        if (!autobase) return false
        if (autobase.closing) {
            logger.log('[WARNING] Mutation requested while Autobase is closing; ignoring.')
            return false
        }
        const lengthBefore = autobase.local.length

        await autobase.append(prepareListAppendOperation(op))

        // const persisted = await persistAndVerify(lengthBefore + 1, 'UPDATE')
        // if (!persisted) {
        //     logger.log('[WARNING] Update operation may not have been persisted to disk!')
        // }

        logger.log('[INFO] Updated item')
        return true
    })
}

// Delete item operation: AUTONOMOUS, NO BACKEND MEMORY
export async function deleteItem (item) {
    if (!autobase) {
        logger.log('[WARNING] deleteItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        logger.log('[WARNING] deleteItem called but autobase is not writable yet')
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            logger.log('[ERROR] Failed to send not-writable message:', e)
        }
        return false
    }

    logger.log('[INFO] Command RPC_DELETE deleteItem')

    const op = createListOperation('delete', item)
    if (!op) return false

    return enqueueWrite(async () => {
        if (!autobase) return false
        if (autobase.closing) {
            logger.log('[WARNING] Mutation requested while Autobase is closing; ignoring.')
            return false
        }
        const lengthBefore = autobase.local.length

        await autobase.append(prepareListAppendOperation(op))

        // const persisted = await persistAndVerify(lengthBefore + 1, 'DELETE')
        // if (!persisted) {
        //     logger.log('[WARNING] Delete operation may not have been persisted to disk!')
        // }

        logger.log('[INFO] Deleted item')
        return true
    })
}

// Simple inline schema validation matching the mobile ListEntry
export function validateItem (item) {
    return normalizeListItem(item) !== null
}

// Send current list to frontend
export function syncListToFrontend (list = currentList) {
    if (!rpc || !Array.isArray(list)) return
    try {
        const req = rpc.request(SYNC_LIST)
        req.send(JSON.stringify(list))
        logger.log('[INFO] Synced list to frontend:', list.length, 'items')
    } catch (e) {
        logger.log('[ERROR] Failed to sync list to frontend:', e)
    }
}

export function prepareListAppendOperation(op) {
    const currentEpoch = Number(membershipState?.currentEpoch) || 0
    if (!epochKey || currentEpoch <= 0) return op
    return createEncryptedListOperation(op, epochKey, currentEpoch) || op
}

// Persist and verify that an operation was written to disk
// Returns true if flush succeeded and length is correct, false otherwise
async function persistAndVerify (expectedLength, operationType) {
    if (!autobase || !autobase.local || !store) {
        logger.log(`[ERROR] persistAndVerify (${operationType}): autobase, local core, or store not available`)
        return false
    }

    try {
        // Force write to disk via Corestore - this flushes all cores to storage
        // Corestore.flush() ensures all pending writes are persisted
        if (typeof store.flush === 'function') {
            await store.flush()
        }

        const actualLength = autobase.local.length
        const keyHex = autobase.local.key.toString('hex').slice(0, 16)

        if (actualLength >= expectedLength) {
            logger.log(`[INFO] persistAndVerify (${operationType}): SUCCESS - flushed to disk, core ${keyHex}... length=${actualLength}`)
            return true
        } else {
            logger.log(`[WARNING] persistAndVerify (${operationType}): LENGTH MISMATCH - core ${keyHex}... length=${actualLength}, expected >= ${expectedLength}`)
            return false
        }
    } catch (e) {
        logger.log(`[ERROR] persistAndVerify (${operationType}): FLUSH FAILED -`, e.message)
        return false
    }
}

export async function rebuildListFromPersistedOps() {
    await autobase.update()
    if (!autobase || !autobase.view) {
        logger.log('[WARNING] rebuildListFromPersistedOps: autobase or view not available')
        return []
    }

    const view = autobase.view
    const length = view.length
    const entries = []

    for (let i = 0; i < length; i++) {
        try {
            const entry = await view.get(i)
            if (!entry) continue

            // Membership records share the view but are not list items; the
            // membership rebuild consumes them instead (readPersistedMembershipRecords).
            if (entry.op === 'membership') continue

            entries.push(entry)
        } catch (e) {
            logger.log(`[ERROR] rebuildListFromPersistedOps: error reading entry ${i}:`, e.message)
        }
    }

    return reduceListViewEntries(entries).items
}

// Read the owner-signed membership records that apply() persisted into the view,
// in linearized order. Callers fold these back through reduceMembershipLog to
// restore membership state after a restart (the in-memory state is not durable).
export async function readPersistedMembershipRecords() {
    await autobase.update()
    if (!autobase || !autobase.view) {
        logger.log('[WARNING] readPersistedMembershipRecords: autobase or view not available')
        return []
    }

    const view = autobase.view
    const length = view.length
    const records = []

    for (let i = 0; i < length; i++) {
        try {
            const entry = await view.get(i)
            if (entry && entry.op === 'membership' && entry.record) {
                records.push(entry.record)
            }
        } catch (e) {
            logger.log(`[ERROR] readPersistedMembershipRecords: error reading entry ${i}:`, e.message)
        }
    }

    return records
}
