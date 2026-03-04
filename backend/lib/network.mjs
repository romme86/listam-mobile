import Hyperswarm from "hyperswarm"
import fs from "bare-fs"
import BlindPairing from "blind-pairing"
import z32 from "z32"
import { apply, open, storagePath, peerKeysString, keyFilePath, encKeyFilePath, inviteFilePath } from "../backend.mjs"
import { saveAutobaseKey, saveEncryptionKey, saveInvite, deleteInvite } from "./key.mjs"
import { RPC_MESSAGE, RPC_GET_KEY, SYNC_LIST } from "../../rpc-commands.mjs"
import Corestore from "corestore"
import Autobase from "autobase"
import b4a from "b4a"
import { randomBytes } from "hypercore-crypto"
import {
    autobase,
    rpc,
    addedStaticPeers,
    swarm,
    baseKey,
    store,
    discovery,
    knownWriters,
    peerCount,
    currentList,
    pairing,
    currentInvite,
    encryptionKey,
    setAutobase,
    setAddedStaticPeers,
    setSwarm,
    setDiscovery,
    setPeerCount,
    setStore,
    setBaseKey,
    setPairing,
    setPairingMember,
    setCurrentInvite,
    setEncryptionKey,
    setCurrentList,
    clearKnownWriters
} from "./state.mjs"
import { rebuildListFromPersistedOps, syncListToFrontend } from "./item.mjs"

let _initPromise = null
const INVITE_MAX_USES = 10
let inviteUsesRemaining = 0

export function createInvite() {
    if (!autobase) return null

    // Return existing invite while it still has available uses
    if (currentInvite && inviteUsesRemaining > 0) return z32.encode(currentInvite.invite)

    const inv = BlindPairing.createInvite(autobase.key)
    setCurrentInvite(inv)
    inviteUsesRemaining = INVITE_MAX_USES
    saveInvite(inv, inviteFilePath)

    return z32.encode(inv.invite)
}

export function setupBlindPairing() {
    if (!autobase || !swarm) return

    setPairing(new BlindPairing(swarm))

    setPairingMember(pairing.addMember({
        discoveryKey: autobase.discoveryKey,
        onadd: async (candidate) => {
            // Match invite
            if (!currentInvite || !b4a.equals(currentInvite.id, candidate.inviteId)) return

            // Open with invite's public key
            candidate.open(currentInvite.publicKey)

            // Get joiner's writer key from userData
            const writerKeyHex = candidate.userData.toString('hex')

            // Add as writer
            if (autobase.writable) {
                await autobase.append({ type: 'add-writer', key: writerKeyHex })
            }

            // Send our base key + encryption key
            candidate.confirm({
                key: autobase.key,
                encryptionKey: autobase.encryptionKey
            })

            // Allow multiple successful pairings per invite for smoother retries.
            inviteUsesRemaining = Math.max(0, inviteUsesRemaining - 1)

            // Track peer + auto-create next invite
            setPeerCount(peerCount + 1)
            broadcastPeerCount()

            // Rotate invite only after the usage budget is exhausted.
            if (inviteUsesRemaining <= 0) {
                setCurrentInvite(null)
                deleteInvite(inviteFilePath)
                const newZ32 = createInvite()
                if (newZ32 && rpc) {
                    const req = rpc.request(RPC_GET_KEY)
                    req.send(newZ32)
                }
            }
        }
    }))
}

async function tearDownAutobaseSwarmStore() {
    // 1. Clean up BlindPairing
    if (pairing) {
        try {
            await pairing.close()
        } catch (e) {
            console.error('[ERROR] Error closing blind pairing:', e)
        }
        setPairing(null)
        setPairingMember(null)
    }

    // 2. Clean up previous Autobase instance (if any)
    if (autobase) {
        try {
            autobase.removeAllListeners('append')
            if (typeof autobase.close === 'function') {
                console.error('[INFO] Closing previous Autobase instance...')
                await autobase.close()
            } else {
                console.error('[WARNING] Previous Autobase has no close() method, skipping close')
            }
        } catch (e) {
            console.error('[ERROR] Error while closing previous Autobase:', e)
        }
        setAutobase(null)
    }

    // 3. Tear down networking bound to old store
    if (discovery) {
        try {
            await discovery.destroy()
        } catch (e) {
            console.error('[ERROR] Error destroying discovery:', e)
        }
        setDiscovery(null)
    }

    if (swarm) {
        try {
            await swarm.destroy()
        } catch (e) {
            console.error('[ERROR] Error destroying swarm:', e)
        }
        setSwarm(null)
    }

    // 4. Close old store
    if (store) {
        try {
            await store.close()
        } catch (e) {
            console.error('[ERROR] Error closing Corestore:', e)
        }
    }
}

export async function initAutobase(newBaseKey) {
    if (_initPromise) {
        console.error('[WARNING] initAutobase already running — returning existing init promise')
        return _initPromise
    }

    _initPromise = (async () => {

        await tearDownAutobaseSwarmStore()

        const baseStoragePath = `${storagePath}-local`

        setStore(new Corestore(baseStoragePath))
        await store.ready()
        setBaseKey(newBaseKey || null)
        console.error(
            '[INFO] Initializing a new autobase with key:',
            baseKey ? baseKey.toString('hex') : '(new base)'
        )

        const autobaseOpts = {
            apply, open,
            valueEncoding: 'json',
            encrypt: true,
            encryptionKey: encryptionKey || undefined
        }
        setAutobase(new Autobase(store, baseKey, autobaseOpts))
        console.error('[INFO] Calling autobase.ready()...')
        try {
            await autobase.ready()
        } catch (e) {
            const msg = String(e?.stack || e?.message || e)
            if (msg.includes("reading 'signers'") || msg.includes('autobase/lib/store.js')) {
                console.error('[ERROR] Autobase appears corrupted. Wiping local state and recreating a new base...')
                rmrfSafe(keyFilePath)
                rmrfSafe(baseStoragePath)
                // Clear the promise so recursive call can start fresh
                _initPromise = null
                return initAutobase(null)
            }
            throw e
        }
        console.error(
            '[INFO] autobase.ready() resolved. Autobase ready, writable?',
            autobase.writable,
            ' key:',
            autobase.key?.toString('hex'),
        )

        // Save the autobase key for persistence across restarts
        if (autobase.key && autobase.writable) {
            saveAutobaseKey(autobase.key, keyFilePath)
        }

        // Save encryption key after autobase is ready
        if (autobase.encryptionKey && autobase.writable) {
            setEncryptionKey(autobase.encryptionKey)
            saveEncryptionKey(autobase.encryptionKey, encKeyFilePath)
        }

        autobase.on('append', async () => {
            console.error('[INFO] New data appended, updating view...')
        })

        // Load existing items from view and sync to frontend
        await autobase.update()
        const rebuiltList = await rebuildListFromPersistedOps()
        syncListToFrontend(rebuiltList)

        // Add static peers only once
        if (!addedStaticPeers && peerKeysString) {
            const peerKeys = peerKeysString.split(',').filter(k => k.trim())
            for (const keyHex of peerKeys) {
                try {
                    const peerKey = Buffer.from(keyHex.trim(), 'hex')
                    const peerCore = store.get({ key: peerKey })
                    await peerCore.ready()
                    await autobase.addInput(peerCore)
                    console.error('[INFO] Added peer writer from argv[1]:', keyHex.trim())
                } catch (err) {
                    console.error('[ERROR] Failed to add peer from argv[1]:', keyHex, err.message)
                }
            }
            setAddedStaticPeers(true)
        }

        // Reset peer count on new base
        setPeerCount(0)
        broadcastPeerCount()

        // Use discoveryKey as swarm topic (NOT autobase.key)
        const topic = autobase.discoveryKey
        console.error('[INFO] Discovery topic (replication swarm):', topic.toString('hex'))

        // Switch discovery to new topic
        if (discovery) {
            try {
                await discovery.destroy()
            } catch (e) {
                console.error('[ERROR] Error destroying previous discovery:', e)
            }
        }

        setSwarm(new Hyperswarm())
        swarm.on('error', (err) => {
            console.error('[ERROR] Replication swarm error:', err)
        })
        swarm.on('connection', (conn) => {
            console.error('[INFO] New peer connected (replication swarm)', b4a.from(conn.publicKey).toString('hex'))
            conn.on('error', (err) => {
                console.error('[ERROR] Replication connection error:', err)
            })
            setPeerCount(peerCount + 1)
            broadcastPeerCount()
            conn.on('close', () => {
                setPeerCount(Math.max(0, peerCount - 1))
                broadcastPeerCount()
            })
            if (autobase) {
                autobase.replicate(conn)
            } else {
                console.error('[WARNING] No Autobase yet to replicate with')
            }
        })
        setDiscovery(swarm.join(topic, { server: true, client: true }))
        await discovery.flushed()
        console.error('[INFO] Joined replication swarm for current base')

        // Set up blind pairing for accepting joiners
        setupBlindPairing()

        // Create invite and send to frontend
        const z32Invite = createInvite()
        if (z32Invite && rpc) {
            const req = rpc.request(RPC_GET_KEY)
            req.send(z32Invite)
        }
    })()

    try {
        return await _initPromise
    } finally {
        _initPromise = null
    }
}

let _joinPromise = null

export async function joinViaInvite(z32InviteStr) {
    if (_joinPromise) {
        console.error('[WARNING] joinViaInvite already running — returning existing join promise')
        return _joinPromise
    }

    _joinPromise = (async () => {
        const previousList = [...currentList]
        const previousBaseKey = baseKey ? Buffer.from(baseKey) : null
        const previousEncryptionKey = encryptionKey ? Buffer.from(encryptionKey) : null
        const normalizedInvite = normalizeInviteCode(z32InviteStr)
        const mainStoragePath = `${storagePath}-local`
        const tempStoragePath = `${storagePath}-join-temp-${Date.now()}`
        let tempStore = null
        let tempSwarm = null
        let tempPairing = null
        let commitStarted = false

        try {
            if (!normalizedInvite) {
                throw new Error('Invite is empty or invalid')
            }

            // 1. Pair in an isolated temporary environment.
            tempStore = new Corestore(tempStoragePath)
            await tempStore.ready()
            tempSwarm = new Hyperswarm({
                keyPair: await tempStore.createKeyPair('hyperswarm')
            })
            tempSwarm.on('connection', (conn) => {
                tempStore.replicate(conn)
            })

            // 2. Use a temp local writer key for blind pairing userData.
            const localCore = Autobase.getLocalCore(tempStore)
            await localCore.ready()
            const localWriterKey = localCore.key
            await localCore.close()

            // 3. Blind pairing as candidate.
            tempPairing = new BlindPairing(tempSwarm)

            const result = await new Promise((resolve, reject) => {
                let candidate = null
                const timeout = setTimeout(() => {
                    if (candidate) candidate.close()
                    reject(new Error('Pairing timed out'))
                }, 120000)  // 2 min timeout

                candidate = tempPairing.addCandidate({
                    invite: z32.decode(normalizedInvite),
                    userData: localWriterKey,
                    onadd: async (paired) => {
                        clearTimeout(timeout)
                        resolve(paired)
                        candidate.close()
                    }
                })
            })

            if (!result?.key || !result?.encryptionKey) {
                throw new Error('Pairing returned incomplete credentials')
            }

            // 4. Pairing succeeded. Commit by switching to the joined base.
            commitStarted = true
            await tearDownAutobaseSwarmStore()
            setBaseKey(result.key)
            setEncryptionKey(result.encryptionKey)
            setStore(new Corestore(mainStoragePath))
            await store.ready()
            setSwarm(new Hyperswarm({
                keyPair: await store.createKeyPair('hyperswarm')
            }))
            swarm.on('error', (err) => {
                console.error('[ERROR] Replication swarm error:', err)
            })

            const autobaseOpts = {
                apply, open,
                valueEncoding: 'json',
                encrypt: true,
                encryptionKey: result.encryptionKey
            }
            setAutobase(new Autobase(store, result.key, autobaseOpts))
            await autobase.ready()

            // Set up autobase replication on swarm
            swarm.on('connection', (conn) => {
                conn.on('error', (err) => console.error('[ERROR]', err))
                setPeerCount(peerCount + 1)
                broadcastPeerCount()
                conn.on('close', () => {
                    setPeerCount(Math.max(0, peerCount - 1))
                    broadcastPeerCount()
                })
                autobase.replicate(conn)
            })
            setPeerCount(swarm.connections.size)
            broadcastPeerCount()

            // Join discovery topic
            setDiscovery(swarm.join(autobase.discoveryKey, { server: true, client: true }))
            await discovery.flushed()

            // Set up blind pairing for future joiners
            setupBlindPairing()

            // Rebuild list
            await autobase.update()
            const rebuiltList = await rebuildListFromPersistedOps()
            syncListToFrontend(rebuiltList)
            saveAutobaseKey(result.key, keyFilePath)
            saveEncryptionKey(result.encryptionKey, encKeyFilePath)

            // Send invite to frontend
            const z32Invite = createInvite()
            if (z32Invite && rpc) {
                const req = rpc.request(RPC_GET_KEY)
                req.send(z32Invite)
            }
            broadcastMessage({ type: 'join-success' })
        } catch (e) {
            console.error('[ERROR] joinViaInvite failed:', e)
            broadcastMessage({
                type: 'join-error',
                message: e?.message || 'Failed to join peer'
            })
            if (rpc && previousList.length > 0) {
                const syncReq = rpc.request(SYNC_LIST)
                syncReq.send(JSON.stringify(previousList))
            }
            if (commitStarted) {
                try {
                    setEncryptionKey(previousEncryptionKey)
                    await initAutobase(previousBaseKey)
                } catch (rollbackError) {
                    console.error('[ERROR] Failed to rollback previous session after join failure:', rollbackError)
                }
            }
        } finally {
            try {
                if (tempPairing) await tempPairing.close()
            } catch (err) {
                console.error('[ERROR] Failed to close temp pairing:', err)
            }
            try {
                if (tempSwarm) await tempSwarm.destroy()
            } catch (err) {
                console.error('[ERROR] Failed to close temp swarm:', err)
            }
            try {
                if (tempStore) await tempStore.close()
            } catch (err) {
                console.error('[ERROR] Failed to close temp store:', err)
            }
            rmrfSafe(tempStoragePath)
        }
    })()

    try { return await _joinPromise }
    finally { _joinPromise = null }
}

export async function nukeData() {
    console.error('[INFO] NUKE: starting full wipe and reinit')

    // 1. Tear down autobase, swarm, store, pairing
    await tearDownAutobaseSwarmStore()

    // 2. Delete all persisted files
    const baseStoragePath = `${storagePath}-local`
    rmrfSafe(baseStoragePath)
    rmrfSafe(keyFilePath)
    rmrfSafe(encKeyFilePath)
    rmrfSafe(inviteFilePath)

    // 3. Reset in-memory state
    setBaseKey(null)
    setEncryptionKey(null)
    setCurrentInvite(null)
    setCurrentList([])
    clearKnownWriters()
    setAddedStaticPeers(false)

    // 4. Tell frontend to clear its list
    if (rpc) {
        const resetReq = rpc.request(RPC_RESET)
        resetReq.send('')
    }

    // 5. Fresh autobase — new keys, new invite
    console.error('[INFO] NUKE: reinitializing fresh autobase')
    return initAutobase(null)
}

function broadcastPeerCount() {
    broadcastMessage({ type: 'peer-count', count: peerCount })
}

function broadcastMessage(payload) {
    if (!rpc) return
    try {
        const req = rpc.request(RPC_MESSAGE)
        req.send(JSON.stringify(payload))
    } catch (e) {
        console.error('[ERROR] Failed to broadcast message', e)
    }
}

function rmrfSafe(p) {
    try {
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch (e) {
        console.error('[ERROR] rmrfSafe failed for', p, e)
    }
}

function normalizeInviteCode(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, '')
}
