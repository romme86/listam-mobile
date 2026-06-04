import RPC from 'bare-rpc'
import URL from 'bare-url'
import { join } from 'bare-path'
import {
    RPC_UPDATE,
    RPC_ADD,
    RPC_DELETE,
    RPC_GET_KEY,
    RPC_JOIN_KEY,
    RPC_ADD_FROM_BACKEND,
    RPC_UPDATE_FROM_BACKEND,
    RPC_DELETE_FROM_BACKEND,
    SYNC_LIST,
    RPC_REQUEST_SYNC,
    RPC_CREATE_INVITE
} from '../rpc-commands.mjs'
import b4a from 'b4a'
import {syncListToFrontend, validateItem, addItem, updateItem, deleteItem} from './lib/item.mjs'
const { IPC } = BareKit
import {loadAutobaseKey, saveAutobaseKey, loadEncryptionKey} from "./lib/key.mjs"
import {initAutobase, joinViaInvite, createInvite} from "./lib/network.mjs"
import {
    autobase,
    store,
    swarm,
    discovery,
    pairing,
    rpc,
    currentList,
    baseKey,
    setRpc,
    setCurrentList,
    setBaseKey,
    setEncryptionKey
} from "./lib/state.mjs"
import fs from "bare-fs"
import { logger } from './lib/logger.mjs'

const INSTANCE_ID = Math.random().toString(36).slice(2, 8)
logger.log('[INFO] BACKEND INSTANCE:', INSTANCE_ID)

const argv0 = typeof Bare?.argv?.[0] === 'string' ? Bare.argv[0] : '';
let baseDir = '';
if (argv0) {
      try {
                baseDir = argv0.startsWith('file://') ? URL.fileURLToPath(argv0) : argv0;
          } catch {
            baseDir = '';
          }
    }
export const storagePath = baseDir ? join(baseDir, 'lista') : './data';
export const peerKeysString = Bare.argv[1] || '' // Comma-separated peer keys
const baseKeyHex = Bare.argv[2] || '' // Optional Autobase key (to join an existing base)
export const keyFilePath = baseDir ? join(baseDir, 'lista-autobase-key.txt') : './autobase-key.txt';
const localWriterKeyFilePath = baseDir ? join(baseDir, 'lista-local-writer-key.txt') : './local-writer-key.txt';
export const encKeyFilePath = baseDir ? join(baseDir, 'lista-encryption-key.txt') : './encryption-key.txt';
export const legacyInviteFilePath = baseDir ? join(baseDir, 'lista-invite.json') : './invite.json';

const LOCK_PATH = baseDir ? join(baseDir, 'lista.lock') : './lista.lock'

// Stagger lock acquisition with random delay to detect duplicate instances
const lockDelay = Math.floor(Math.random() * 500) + 100 // 100-600ms
logger.log(`[INFO] [${INSTANCE_ID}] Waiting ${lockDelay}ms before acquiring lock...`)
await new Promise(resolve => setTimeout(resolve, lockDelay))

let lockFd = null
try {
    // 'wx' => create exclusively, fail if exists
    lockFd = fs.openSync(LOCK_PATH, 'wx')
    fs.writeSync(lockFd, INSTANCE_ID + '\n')
    logger.log(`[INFO] [${INSTANCE_ID}] Acquired lock:`, LOCK_PATH)
} catch (e) {
    // Check who owns the lock
    try {
        const owner = fs.readFileSync(LOCK_PATH, 'utf-8').trim()
        logger.log(`[WARNING] [${INSTANCE_ID}] Lock owned by instance: ${owner}`)
    } catch {}
    logger.log(`[ERROR] [${INSTANCE_ID}] Another backend instance is already running (lock exists):`, LOCK_PATH)
    // Hard-exit this backend instance so it can't touch storage
    throw e
}

// Optional Autobase key from argv (initial base) or loaded from file
if (baseKeyHex) {
    try {
        setBaseKey(Buffer.from(baseKeyHex.trim(), 'hex'))
        logger.log('[INFO] Using existing Autobase key from argv[2]')
    } catch (err) {
        logger.log('[ERROR] Invalid base key hex, creating new base instead:', err.message)
        setBaseKey(null)
    }
}

// If no key from argv, try loading from file (for restart persistence)
if (!baseKey) {
    setBaseKey(loadAutobaseKey(keyFilePath))
}

// Load encryption key if we have a base key (for restart persistence)
if (baseKey) {
    const loadedEncKey = loadEncryptionKey(encKeyFilePath)
    if (loadedEncKey) {
        setEncryptionKey(loadedEncKey)
    }
}

// Create RPC server
let rpcGenerated = new RPC(IPC, async (req, error) => {
    logger.log('[INFO] Got a request from react', req)
    if (error) {
        logger.log('[ERROR] Got an error from react', error)
    }
    try {
        switch (req.command) {
            case RPC_ADD: {
                const text = JSON.parse(b4a.toString(req.data))
                await addItem(text)
                break
            }
            case RPC_UPDATE: {
                const data = JSON.parse(req.data.toString())
                await updateItem(data.item)
                break
            }
            case RPC_DELETE: {
                const data = JSON.parse(req.data.toString())
                await deleteItem(data.item)
                break
            }
            case RPC_GET_KEY: {
                logger.log('[INFO] Command RPC_GET_KEY')
                if (!autobase) {
                    logger.log('[WARNING] RPC_GET_KEY requested before Autobase is ready')
                    break
                }
                const z32Invite = createInvite()
                if (z32Invite) {
                    const keyReq = rpc.request(RPC_GET_KEY)
                    keyReq.send(z32Invite)
                }
                break
            }
            case RPC_JOIN_KEY: {
                logger.log('[INFO] Command RPC_JOIN_KEY')
                const data = JSON.parse(req.data.toString())
                logger.log('[INFO] Joining via invite from RPC')
                await joinViaInvite(data.key)
                break
            }
            case RPC_CREATE_INVITE: {
                logger.log('[INFO] Command RPC_CREATE_INVITE')
                const z32Invite = createInvite()
                if (z32Invite && rpc) {
                    const keyReq = rpc.request(RPC_GET_KEY)
                    keyReq.send(z32Invite)
                }
                break
            }
            case RPC_REQUEST_SYNC: {
                logger.log('[INFO] Command RPC_REQUEST_SYNC - frontend requesting current list')
                syncListToFrontend()
                break
            }
        }
    } catch (err) {
        logger.log('[ERROR] Error handling RPC request:', err)
    }
})
setRpc(rpcGenerated)

// Initialize Autobase for the initial baseKey (from argv or new)
await initAutobase(baseKey).then(() => {
    logger.log('[INFO] Autobase ready 123')
}).catch((err) => {
    logger.log('[ERROR] initAutobase failed at startup:', err)
    throw err
})

// Backend ready


// Cleanup on teardown
Bare.on('teardown', async () => {
    logger.log('[INFO] Backend shutting down...')
    if (pairing) {
        try {
            await pairing.close()
        } catch (e) {
            logger.log('[ERROR] Error closing blind pairing:', e)
        }
    }
    if (swarm) {
        swarm.removeAllListeners('connection')
        try {
            await swarm.destroy()
        } catch (e) {
            logger.log('[ERROR] Error destroying replication swarm:', e)
        }
    }
    if (autobase) {
        try {
            await autobase.close()
        } catch (e) {
            logger.log('[ERROR] Error closing autobase:', e)
        }
    }
    if (discovery) {
        try {
            await discovery.destroy()
        } catch (e) {
            logger.log('[ERROR] Error destroying discovery:', e)
        }
    }
    if(store){
        try {
            await store.flush()
            await store.close()
        } catch (e) {
            logger.log('[ERROR] Error closing store:', e)
        }
    }
    try {
        if (lockFd) fs.closeSync(lockFd)
        fs.rmSync(LOCK_PATH, { force: true })
    } catch (e) {
        logger.log('[ERROR] Error releasing lock:', e)
    }
    logger.log('[INFO] Backend shutdown complete')
})

export function open (store) {
    const view = store.get({
        name: 'test',
        valueEncoding: 'json'
    })
    logger.log('[INFO] Opening store')
    return view
}

export async function apply (nodes, view, host) {
    if (autobase?.closing) {
        logger.log('[WARNING] Apply called while Autobase is closing; skipping.')
        return
    }
    logger.log('[INFO] Apply started')
    for (const { value } of nodes) {
        if (!value) continue

        // Handle writer membership updates coming from blind pairing
        if (value.type === 'add-writer' && typeof value.key === 'string') {
            try {
                const writerKey = Buffer.from(value.key, 'hex')
                await host.addWriter(writerKey, { indexer: true })
                logger.log('[INFO] Added writer from add-writer op')

                // Log whether the added writer is our own key (for debugging),
                // without printing the raw key material.
                if (autobase?.local) {
                    const ourKeyHex = autobase.local.key.toString('hex')
                    logger.log('[INFO] add-writer is our own key:', value.key === ourKeyHex)
                }
            } catch (err) {
                logger.log('[ERROR] Failed to add writer from add-writer op:', err)
            }
            continue
        }

        if (value.type === 'add') {
            if (!validateItem(value.value)) {
                logger.log('[WARNING] Invalid item schema in add operation:', value.value)
                continue
            }
            logger.log('[INFO] Applying add operation for item:', value.value)
            await view.append({ op: 'add', ...value.value })
            setCurrentList([value.value, ...currentList.filter(i => i.text !== value.value.text)])
            const addReq = rpc.request(RPC_ADD_FROM_BACKEND)
            addReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'delete') {
            if (!validateItem(value.value)) {
                logger.log('[WARNING] Invalid item schema in delete operation:', value.value)
                continue
            }
            logger.log('[INFO] Applying delete operation for item:', value.value)
            await view.append({ op: 'delete', text: value.value.text })
            setCurrentList(currentList.filter(i => i.text !== value.value.text))
            const deleteReq = rpc.request(RPC_DELETE_FROM_BACKEND)
            deleteReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'update') {
            if (!validateItem(value.value)) {
                logger.log('[WARNING] Invalid item schema in update operation:', value.value)
                continue
            }
            logger.log('[INFO] Applying update operation for item:', value.value)
            await view.append({ op: 'update', ...value.value })
            setCurrentList(currentList.map(i =>
                i.text === value.value.text ? value.value : i
            ))
            const updateReq = rpc.request(RPC_UPDATE_FROM_BACKEND)
            updateReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'list') {
            if (!Array.isArray(value.value)) {
                logger.log('[WARNING] Invalid list operation payload, expected array:', value.value)
                continue
            }
            logger.log('[INFO] Applying list operation for items:', value.value)
            const updateReq = rpc.request(SYNC_LIST)
            updateReq.send(JSON.stringify(value.value))
            continue
        }

        // All other values are appended to the view (for future use)
        await view.append(value)
    }
}
