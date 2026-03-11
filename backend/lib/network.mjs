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
    clearKnownWriters,
    isPendingJoinSuccess,
    setIsPendingJoinSuccess
} from "./state.mjs"
import { rebuildListFromPersistedOps, syncListToFrontend } from "./item.mjs"

let _initPromise = null
let _writableCheckTimer = null
const INVITE_MAX_USES = 10
let inviteUsesRemaining = 0

// Temp swarm/pairing kept alive until waitForWritable completes
let _tempSwarm = null
let _tempPairing = null

// Polls autobase.update() every second until the local node becomes writable,
// then broadcasts join-success. Falls back to join-error after 120 s.
// Also syncs replicated items on each attempt so the guest sees the host's
// list even before write access is confirmed.
function cleanupTempSwarm() {
    if (_tempPairing) {
        try { _tempPairing.close() } catch (_) {}
        _tempPairing = null
    }
    if (_tempSwarm) {
        try { _tempSwarm.destroy() } catch (_) {}
        _tempSwarm = null
    }
}

function waitForWritable() {
    if (_writableCheckTimer) clearTimeout(_writableCheckTimer)
    let attempts = 0
    const MAX_ATTEMPTS = 120

    async function check() {
        if (!isPendingJoinSuccess) return
        attempts++
        try {
            if (autobase) await autobase.update()
        } catch (e) {
            console.error('[ERROR] waitForWritable update failed:', e)
        }
        // Sync whatever items have replicated so far
        try {
            const list = await rebuildListFromPersistedOps()
            if (list.length > 0) syncListToFrontend(list)
        } catch (_) {}

        // Log status every 10 attempts
        if (attempts % 10 === 0) {
            const viewLen = autobase?.view?.length ?? '?'
            const mainConns = swarm?.connections?.size ?? '?'
            const tempConns = _tempSwarm?.connections?.size ?? 0
            console.error(`[INFO] waitForWritable #${attempts}: writable=${autobase?.writable}, view=${viewLen}, mainSwarm=${mainConns}, tempSwarm=${tempConns}`)
        }

        if (autobase?.writable) {
            setIsPendingJoinSuccess(false)
            if (autobase.key) saveAutobaseKey(autobase.key, keyFilePath)
            console.error('[INFO] Guest became writable after', attempts, 'attempt(s)')
            broadcastMessage({ type: 'join-success' })
            cleanupTempSwarm()
            return
        }
        if (attempts >= MAX_ATTEMPTS) {
            setIsPendingJoinSuccess(false)
            const viewLen = autobase?.view?.length ?? '?'
            const mainConns = swarm?.connections?.size ?? '?'
            const tempConns = _tempSwarm?.connections?.size ?? 0
            console.error(`[ERROR] Timed out waiting for write access after ${attempts} attempts. view=${viewLen}, mainSwarm=${mainConns}, tempSwarm=${tempConns}`)
            broadcastMessage({ type: 'join-error', message: 'Timed out waiting for write access from host.' })
            cleanupTempSwarm()
            return
        }
        _writableCheckTimer = setTimeout(check, 1000)
    }

    _writableCheckTimer = setTimeout(check, 1000)
}

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
    // Cancel any pending writable-check polling
    if (_writableCheckTimer) {
        clearTimeout(_writableCheckTimer)
        _writableCheckTimer = null
    }
    setIsPendingJoinSuccess(false)

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

        // Clean up any leftover temp resources from a previous attempt
        cleanupTempSwarm()

        try {
            if (!normalizedInvite) {
                throw new Error('Invite is empty or invalid')
            }

            // 1. Derive writer key from the already-open autobase's local core.
            //    autobase.local.key is stable across teardown/reinit of the same
            //    storage path, so the host will add the right key.
            if (!autobase?.local?.key) {
                throw new Error('autobase.local.key unavailable — cannot derive writer key')
            }
            const localWriterKey = autobase.local.key
            console.error('[INFO] Guest localWriterKey:', localWriterKey.toString('hex'))

            // 2. Temp swarm for blind pairing only.
            //    DO NOT close the candidate in onadd — closing it kills the
            //    underlying Noise connection, which is the only live link to the
            //    host. The temp swarm stays alive so we can replicate over it.
            _tempSwarm = new Hyperswarm()
            _tempPairing = new BlindPairing(_tempSwarm)

            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Pairing timed out'))
                }, 120000)

                _tempPairing.addCandidate({
                    invite: z32.decode(normalizedInvite),
                    userData: localWriterKey,
                    onadd: async (paired) => {
                        clearTimeout(timeout)
                        resolve(paired)
                        // NOTE: do NOT call candidate.close() here — it kills
                        // the connection we need for replication bootstrapping.
                    }
                })
            })

            if (!result?.key || !result?.encryptionKey) {
                throw new Error('Pairing returned incomplete credentials')
            }

            console.error('[INFO] Blind pairing succeeded. Host base key:', result.key.toString('hex'))
            console.error('[INFO] Temp swarm connections after pairing:', _tempSwarm.connections.size)

            // 3. Use initAutobase to set up the joined base — same proven code
            //    path the host uses. Set encryption key first so initAutobase
            //    picks it up.
            setEncryptionKey(result.encryptionKey)
            await initAutobase(result.key)

            console.error('[INFO] Guest initAutobase complete. writable:', autobase?.writable, '| swarm connections:', swarm?.connections?.size)

            // 4. Replicate over the temp swarm's existing connections.
            //    The temp swarm has a live connection to the host from blind
            //    pairing. The main swarm needs DHT to find the host (can take
            //    30-60s or fail entirely on restricted networks). By replicating
            //    over the temp connection, we get immediate data exchange.
            if (_tempSwarm) {
                let tempConnCount = 0
                for (const conn of _tempSwarm.connections) {
                    if (conn.destroyed || conn.closed) continue
                    tempConnCount++
                    console.error('[INFO] Guest: replicating autobase over temp swarm connection (alive:', !conn.destroyed, ')')
                    try {
                        autobase.replicate(conn)
                    } catch (e) {
                        console.error('[ERROR] Failed to replicate over temp connection:', e)
                    }
                }
                console.error('[INFO] Guest: replicated over', tempConnCount, 'temp connections')
            }

            // 5. Check writability
            if (autobase.writable) {
                console.error('[INFO] Guest is already writable')
                broadcastMessage({ type: 'join-success' })
                cleanupTempSwarm()
            } else {
                console.error('[INFO] Guest not yet writable — starting waitForWritable polling')
                setIsPendingJoinSuccess(true)
                waitForWritable()
            }
        } catch (e) {
            console.error('[ERROR] joinViaInvite failed:', e)
            setIsPendingJoinSuccess(false)
            broadcastMessage({
                type: 'join-error',
                message: e?.message || 'Failed to join peer'
            })
            if (rpc && previousList.length > 0) {
                const syncReq = rpc.request(SYNC_LIST)
                syncReq.send(JSON.stringify(previousList))
            }
            // Rollback to previous base if we already tore down
            if (previousBaseKey) {
                try {
                    setEncryptionKey(previousEncryptionKey)
                    await initAutobase(previousBaseKey)
                } catch (rollbackError) {
                    console.error('[ERROR] Failed to rollback previous session:', rollbackError)
                }
            }
        } finally {
            if (!isPendingJoinSuccess) {
                cleanupTempSwarm()
            }
        }
    })()

    try { return await _joinPromise }
    finally { _joinPromise = null }
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
