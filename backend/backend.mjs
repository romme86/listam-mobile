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
import {loadAutobaseKey, saveAutobaseKey, loadEncryptionKey, saveEncryptionKey, loadOwnerAuthorityKey, saveOwnerAuthorityKey, deleteLegacyKeyFile, deleteLegacyInviteFile} from "./lib/key.mjs"
import {initAutobase, joinViaInvite, createInvite} from "./lib/network.mjs"
import { parseBootSecretPayload } from './lib/secrets.mjs'
import { isMembershipRecord, reduceMembershipOperation } from './lib/membership.mjs'
import {
    autobase,
    store,
    swarm,
    discovery,
    pairing,
    rpc,
    currentList,
    baseKey,
    membershipState,
    setRpc,
    setCurrentList,
    setBaseKey,
    setEncryptionKey,
    setMembershipState,
    setOwnerAuthorityKeyPair
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
const bootSecrets = parseBootSecretPayload(Bare.argv[3] || '')
export const keyFilePath = baseDir ? join(baseDir, 'lista-autobase-key.txt') : './autobase-key.txt';
const localWriterKeyFilePath = baseDir ? join(baseDir, 'lista-local-writer-key.txt') : './local-writer-key.txt';
export const encKeyFilePath = baseDir ? join(baseDir, 'lista-encryption-key.txt') : './encryption-key.txt';
export const ownerAuthorityKeyFilePath = baseDir ? join(baseDir, 'lista-owner-authority-key.txt') : './owner-authority-key.txt';
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

// If no key from argv, load from the adapter boot payload, falling back to the
// backend's own legacy plaintext file (authoritative path) so an existing base
// is never lost if the pre-boot migration could not reach the file.
let autobaseKeyFromLegacyFile = false
let encryptionKeyFromLegacyFile = false
let ownerAuthorityKeyFromLegacyFile = false
let loadedEncryptionKey = null
let loadedOwnerAuthorityKeyPair = null
if (!baseKey) {
    const loaded = loadAutobaseKey(bootSecrets, keyFilePath)
    setBaseKey(loaded.key)
    autobaseKeyFromLegacyFile = loaded.source === 'legacy-file'
}

// Load encryption key if we have a base key (for restart persistence)
if (baseKey) {
    const loaded = loadEncryptionKey(bootSecrets, encKeyFilePath)
    if (loaded.key) {
        setEncryptionKey(loaded.key)
        loadedEncryptionKey = loaded.key
        encryptionKeyFromLegacyFile = loaded.source === 'legacy-file'
    }
}

const loadedOwnerAuthority = loadOwnerAuthorityKey(bootSecrets, ownerAuthorityKeyFilePath)
if (loadedOwnerAuthority.keyPair) {
    setOwnerAuthorityKeyPair(loadedOwnerAuthority.keyPair)
    loadedOwnerAuthorityKeyPair = loadedOwnerAuthority.keyPair
    ownerAuthorityKeyFromLegacyFile = loadedOwnerAuthority.source === 'legacy-file'
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
                const keyReq = rpc.request(RPC_GET_KEY)
                keyReq.send(z32Invite || '')
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
                if (rpc) {
                    const keyReq = rpc.request(RPC_GET_KEY)
                    keyReq.send(z32Invite || '')
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

// Re-secure any key material that was only found in the backend's own legacy
// plaintext files, then remove the plaintext once the secure write is
// acknowledged. The backend owns the authoritative file paths, so this is the
// safety net if the frontend's pre-boot migration could not reach them. Also
// clear the unused writer-key / invite plaintext (never re-stored).
await reconcileLegacyKeyFiles()

async function reconcileLegacyKeyFiles() {
    if (autobaseKeyFromLegacyFile && baseKey) {
        if (await saveAutobaseKey(baseKey)) {
            deleteLegacyKeyFile(keyFilePath)
            logger.log('[INFO] Migrated legacy autobase key file into secure storage')
        }
    }
    if (encryptionKeyFromLegacyFile && loadedEncryptionKey) {
        if (await saveEncryptionKey(loadedEncryptionKey)) {
            deleteLegacyKeyFile(encKeyFilePath)
            logger.log('[INFO] Migrated legacy encryption key file into secure storage')
        }
    }
    if (ownerAuthorityKeyFromLegacyFile && loadedOwnerAuthorityKeyPair?.secretKey) {
        if (await saveOwnerAuthorityKey(loadedOwnerAuthorityKeyPair.secretKey)) {
            deleteLegacyKeyFile(ownerAuthorityKeyFilePath)
            logger.log('[INFO] Migrated legacy owner authority key file into secure storage')
        }
    }
    // The local writer key is derived from the corestore (no consumer) and the
    // invite is an expiring bearer secret (H3); neither is ever re-stored.
    deleteLegacyKeyFile(localWriterKeyFilePath)
    deleteLegacyInviteFile(legacyInviteFilePath)
}

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

        if (isMembershipRecord(value)) {
            const result = reduceMembershipOperation(value, membershipState, { baseKey: autobase?.key })
            setMembershipState(result.state)
            if (!result.ok) {
                logger.log('[WARNING] Rejected membership op', { reason: result.reason })
                continue
            }

            if (result.effect?.addWriterKey) {
                try {
                    const writerKey = Buffer.from(result.effect.addWriterKey, 'hex')
                    await host.addWriter(writerKey, { indexer: true })
                    logger.log('[INFO] Added writer from owner-signed membership op')
                } catch (err) {
                    logger.log('[ERROR] Failed to add writer from membership op:', err)
                }
            }
            continue
        }

        // Legacy add-writer records are intentionally no longer authoritative.
        // Phase 3 only supports revoking unused invites; true member removal
        // requires the Phase 4 re-key flow.
        if (value.type === 'add-writer' && typeof value.key === 'string') {
            logger.log('[WARNING] Rejected legacy add-writer op; owner-signed membership is required')
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
