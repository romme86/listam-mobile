import Hyperswarm from "hyperswarm"
import fs from "bare-fs"
import BlindPairing from "blind-pairing"
import z32 from "z32"
import { apply, open, storagePath, peerKeysString, keyFilePath, encKeyFilePath, ownerAuthorityKeyFilePath, legacyInviteFilePath } from "../backend.mjs"
import { saveAutobaseKey, saveEncryptionKey, saveOwnerAuthorityKey, deleteOwnerAuthorityKey, saveEpochKey, deleteEpochKey, saveEpochEncryptionKey, deleteEpochEncryptionKey, deleteLegacyInviteFile } from "./key.mjs"
import { deleteBackendSecret } from "./secrets.mjs"
import { INVITE_MAX_USES, isInviteUsable, reserveInviteUse, withInvitePolicy } from "./invite-policy.mjs"
import { createJoinRollbackSnapshot, restoreJoinRollbackSnapshot } from "./join-rollback.mjs"
import { performMemberRemovalRekey } from "./rekey.mjs"
import {
    buildMembershipRoster,
    canCreateMembershipInvite,
    createAddWriterMembershipRecord,
    createMembershipState,
    createOwnerAuthorityKeyPair,
    createOwnerBootstrapRecord,
    nextMembershipSequence,
    ownerAuthorityPublicKeyHex,
    reduceMembershipLog,
} from "./membership.mjs"
import { ownerRecoveryCodeFromKeyPair, recoverOwnerAuthorityFromCode } from "./owner-recovery.mjs"
import {
    createEpochEncryptionKeyPair,
    epochPublicKeyHex,
    generateEpochKey,
} from './key-epochs.mjs'
import { RPC_MESSAGE, RPC_GET_KEY, SYNC_LIST } from "../../rpc-commands.mjs"
import Corestore from "corestore"
import Autobase from "autobase"
import b4a from "b4a"
import {
    autobase,
    rpc,
    addedStaticPeers,
    swarm,
    baseKey,
    store,
    discovery,
    peerCount,
    currentList,
    pairing,
    currentInvite,
    encryptionKey,
    ownerAuthorityKeyPair,
    epochKey,
    epochEncryptionKeyPair,
    membershipState,
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
    setCurrentList,
    setEncryptionKey,
    setOwnerAuthorityKeyPair,
    setEpochKey,
    setEpochEncryptionKeyPair,
    setMembershipState,
    isPendingJoinSuccess,
    setIsPendingJoinSuccess
} from "./state.mjs"
import { enqueueWrite, prepareListAppendOperation, rebuildListFromPersistedOps, readPersistedMembershipRecords, syncListToFrontend } from "./item.mjs"
import { logger } from "./logger.mjs"

let _initPromise = null
let _writableCheckTimer = null
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
            logger.log('[ERROR] waitForWritable update failed:', e)
        }
        // Clean up temp swarm as soon as main swarm has connections
        // (prevents host from seeing double peer count)
        if (_tempSwarm && swarm?.connections?.size > 0) {
            logger.log('[INFO] Main swarm connected, cleaning up temp swarm')
            cleanupTempSwarm()
        }

        // Sync whatever items have replicated so far
        try {
            const list = await rebuildListFromPersistedOps()
            setCurrentList(list)
            if (list.length > 0) syncListToFrontend(list)
        } catch (_) {}

        // Log status every 10 attempts
        if (attempts % 10 === 0) {
            const viewLen = autobase?.view?.length ?? '?'
            const mainConns = swarm?.connections?.size ?? '?'
            const tempConns = _tempSwarm?.connections?.size ?? 0
            logger.log(`[INFO] waitForWritable #${attempts}: writable=${autobase?.writable}, view=${viewLen}, mainSwarm=${mainConns}, tempSwarm=${tempConns}`)
        }

        if (autobase?.writable) {
            if (autobase.key) saveAutobaseKey(autobase.key)
            if (autobase.encryptionKey) {
                setEncryptionKey(autobase.encryptionKey)
                saveEncryptionKey(autobase.encryptionKey)
            }
            logger.log('[INFO] Guest became writable after', attempts, 'attempt(s)')

            // Phase 3: syncing — wait for main swarm peer connection
            if (swarm?.connections?.size > 0) {
                // Already connected, done!
                setIsPendingJoinSuccess(false)
                broadcastMessage({ type: 'join-success' })
                cleanupTempSwarm()
                return
            }

            // Switch to syncing phase and wait for main swarm connection
            broadcastJoinPhase('syncing')
            cleanupTempSwarm()
            waitForPeerConnection(MAX_ATTEMPTS - attempts)
            return
        }
        if (attempts >= MAX_ATTEMPTS) {
            setIsPendingJoinSuccess(false)
            const viewLen = autobase?.view?.length ?? '?'
            const mainConns = swarm?.connections?.size ?? '?'
            const tempConns = _tempSwarm?.connections?.size ?? 0
            logger.log(`[ERROR] Timed out waiting for write access after ${attempts} attempts. view=${viewLen}, mainSwarm=${mainConns}, tempSwarm=${tempConns}`)
            broadcastMessage({ type: 'join-error', message: 'Timed out waiting for write access from host.' })
            cleanupTempSwarm()
            return
        }
        _writableCheckTimer = setTimeout(check, 1000)
    }

    _writableCheckTimer = setTimeout(check, 1000)
}

// Waits for the main swarm to establish at least one peer connection
// (phase 3: "syncing"). Once connected, the guest's green badge appears.
function waitForPeerConnection(remainingAttempts) {
    let attempts = 0
    const maxAttempts = Math.max(remainingAttempts, 30)

    function check() {
        if (!isPendingJoinSuccess) return
        attempts++

        if (swarm?.connections?.size > 0) {
            setIsPendingJoinSuccess(false)
            logger.log('[INFO] Guest main swarm connected after', attempts, 'syncing attempt(s)')
            broadcastMessage({ type: 'join-success' })
            return
        }

        if (attempts >= maxAttempts) {
            // Timed out waiting for peer, but we ARE writable — still success
            setIsPendingJoinSuccess(false)
            logger.log('[INFO] Syncing phase timed out, but guest is writable — sending join-success anyway')
            broadcastMessage({ type: 'join-success' })
            return
        }

        _writableCheckTimer = setTimeout(check, 1000)
    }

    _writableCheckTimer = setTimeout(check, 1000)
}

export function createInvite() {
    if (!autobase) return null
    if (!canCreateMembershipInvite(membershipState, ownerAuthorityKeyPair)) {
        setCurrentInvite(null)
        inviteUsesRemaining = 0
        logger.log('[WARNING] Invite creation rejected; only the owner device can create or revoke invites')
        return null
    }

    // Return an existing invite only while it is unexpired and unused.
    if (isInviteUsable(currentInvite, inviteUsesRemaining)) {
        return z32.encode(currentInvite.invite)
    }

    const inv = withInvitePolicy(BlindPairing.createInvite(autobase.key))
    setCurrentInvite(inv)
    inviteUsesRemaining = INVITE_MAX_USES
    deleteLegacyInviteFile(legacyInviteFilePath)

    return z32.encode(inv.invite)
}

function rotateInviteAndNotifyFrontend() {
    setCurrentInvite(null)
    inviteUsesRemaining = 0
    deleteLegacyInviteFile(legacyInviteFilePath)

    const newZ32 = createInvite()
    sendInviteKeyToFrontend(newZ32 || '')
}

function sendInviteKeyToFrontend(inviteKey) {
    if (!rpc) return
    const req = rpc.request(RPC_GET_KEY)
    req.send(inviteKey)
}

export function setupBlindPairing() {
    if (!autobase || !swarm) return

    setPairing(new BlindPairing(swarm))

    setPairingMember(pairing.addMember({
        discoveryKey: autobase.discoveryKey,
        onadd: async (candidate) => {
            // Match invite
            if (!currentInvite || !b4a.equals(currentInvite.id, candidate.inviteId)) {
                try { candidate.close() } catch (_) {}
                return
            }

            const reservation = reserveInviteUse(currentInvite, inviteUsesRemaining)
            if (!reservation.ok) {
                try { candidate.close() } catch (_) {}
                rotateInviteAndNotifyFrontend()
                return
            }

            const reservedInvite = currentInvite
            inviteUsesRemaining = reservation.usesRemaining
            setCurrentInvite(null)

            try {
                // Open with invite's public key
                candidate.open(reservedInvite.publicKey)

                if (!autobase.writable) {
                    throw new Error('Host is not writable and cannot accept invite')
                }
                if (!canCreateMembershipInvite(membershipState, ownerAuthorityKeyPair)) {
                    throw new Error('Only the owner device can accept invite candidates')
                }

                // Get joiner's writer key and epoch public key from userData.
                const joiner = parseJoinCandidateUserData(candidate.userData)
                if (!joiner?.writerKey) throw new Error('Join candidate did not provide a writer key')

                const membershipRecord = createAddWriterMembershipRecord({
                    ownerAuthorityKeyPair,
                    writerKey: joiner.writerKey,
                    baseKey: autobase.key,
                    sequence: nextMembershipSequence(membershipState),
                    epochPublicKey: joiner.epochPublicKey,
                })
                await autobase.append(membershipRecord)
                await autobase.update()

                // Send our base key + encryption key
                candidate.confirm({
                    key: autobase.key,
                    encryptionKey: autobase.encryptionKey,
                    epochKey,
                    epoch: membershipState.currentEpoch || 1,
                })
            } catch (e) {
                logger.log('[ERROR] Failed to accept invite candidate:', e)
                try { candidate.close() } catch (_) {}
            } finally {
                rotateInviteAndNotifyFrontend()
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
            logger.log('[ERROR] Error closing blind pairing:', e)
        }
        setPairing(null)
        setPairingMember(null)
    }

    // 2. Clean up previous Autobase instance (if any)
    if (autobase) {
        try {
            autobase.removeAllListeners('append')
            if (typeof autobase.close === 'function') {
                logger.log('[INFO] Closing previous Autobase instance...')
                await autobase.close()
            } else {
                logger.log('[WARNING] Previous Autobase has no close() method, skipping close')
            }
        } catch (e) {
            logger.log('[ERROR] Error while closing previous Autobase:', e)
        }
        setAutobase(null)
    }

    // 3. Tear down networking bound to old store
    if (discovery) {
        try {
            await discovery.destroy()
        } catch (e) {
            logger.log('[ERROR] Error destroying discovery:', e)
        }
        setDiscovery(null)
    }

    if (swarm) {
        try {
            await swarm.destroy()
        } catch (e) {
            logger.log('[ERROR] Error destroying swarm:', e)
        }
        setSwarm(null)
    }

    // 4. Close old store
    if (store) {
        try {
            await store.close()
        } catch (e) {
            logger.log('[ERROR] Error closing Corestore:', e)
        }
    }
}

async function ensureOwnerMembership({ allowOwnerMigration }) {
    if (membershipState.ownerAuthorityKey) {
        if (allowOwnerMigration && ownerAuthorityKeyPair) {
            await ensureLocalEpochSecrets()
        }
        return
    }

    if (!allowOwnerMigration) {
        logger.log('[INFO] Owner membership migration skipped for joined base')
        return
    }
    if (!autobase?.writable || !autobase?.local?.key || !autobase?.key) {
        logger.log('[WARNING] Owner membership migration skipped; local base is not writable')
        return
    }

    let keyPair = ownerAuthorityKeyPair
    if (!keyPair) {
        keyPair = createOwnerAuthorityKeyPair()
        setOwnerAuthorityKeyPair(keyPair)
        await saveOwnerAuthorityKey(keyPair.secretKey)
    }

    const { localEpochEncryptionKeyPair, localEpochKey } = await ensureLocalEpochSecrets()

    const record = createOwnerBootstrapRecord({
        ownerAuthorityKeyPair: keyPair,
        writerKey: autobase.local.key,
        baseKey: autobase.key,
        epochPublicKey: epochPublicKeyHex(localEpochEncryptionKeyPair),
        epochKey: localEpochKey,
        epoch: 1,
    })
    await autobase.append(record)
    await autobase.update()

    logger.log('[INFO] Bootstrapped owner-signed membership record', {
        ownerAuthorityKey: ownerAuthorityPublicKeyHex(keyPair),
    })
}

async function ensureLocalEpochSecrets() {
    let localEpochEncryptionKeyPair = epochEncryptionKeyPair
    if (!localEpochEncryptionKeyPair) {
        localEpochEncryptionKeyPair = createEpochEncryptionKeyPair()
        setEpochEncryptionKeyPair(localEpochEncryptionKeyPair)
        await saveEpochEncryptionKey(localEpochEncryptionKeyPair.secretKey)
    }

    let localEpochKey = epochKey
    if (!localEpochKey) {
        localEpochKey = generateEpochKey()
        setEpochKey(localEpochKey)
        await saveEpochKey(localEpochKey)
    }

    return { localEpochEncryptionKeyPair, localEpochKey }
}

export async function initAutobase(newBaseKey, options = {}) {
    if (_initPromise) {
        logger.log('[WARNING] initAutobase already running — returning existing init promise')
        return _initPromise
    }

    const allowOwnerMigration = options.allowOwnerMigration !== false

    _initPromise = (async () => {

        await tearDownAutobaseSwarmStore()
        setMembershipState(createMembershipState())
        setCurrentInvite(null)
        inviteUsesRemaining = 0

        const baseStoragePath = `${storagePath}-local`

        setStore(new Corestore(baseStoragePath))
        await store.ready()
        setBaseKey(newBaseKey || null)
        logger.log(
            '[INFO] Initializing a new autobase with key:',
            baseKey ? baseKey.toString('hex') : '(new base)'
        )

        // Clear stale user data from the local core ONLY when the base key
        // is changing (e.g. guest joining a host's base).  boot.js reads
        // 'autobase/encryption' from the local core and uses it over the
        // key passed via opts.  Without clearing on base-key change, a
        // guest that previously ran its own fresh base would keep the OLD
        // encryption key instead of the one received via blind pairing.
        // On a normal restart (same base key), we must NOT clear — doing
        // so would wipe the boot record and break persistence.
        if (baseKey) {
            const lc = store.get({ name: 'local' })
            await lc.ready()
            const existingRef = await lc.getUserData('referrer')
            if (!existingRef || !b4a.equals(existingRef, baseKey)) {
                await lc.setUserData('autobase/encryption', null)
                await lc.setUserData('autobase/boot', null)
                await lc.setUserData('referrer', null)
                logger.log('[INFO] Cleared stale local-core user data (base key changed)')
            }
            await lc.close()
        }

        const autobaseOpts = {
            apply, open,
            valueEncoding: 'json',
            encrypt: true,
            encryptionKey: encryptionKey || undefined
        }
        setAutobase(new Autobase(store, baseKey, autobaseOpts))
        logger.log('[INFO] Calling autobase.ready()... encKey:', encryptionKey ? 'present' : 'none')
        try {
            await autobase.ready()
        } catch (e) {
            const msg = String(e?.stack || e?.message || e)
            if (msg.includes("reading 'signers'") || msg.includes('autobase/lib/store.js')) {
                logger.log('[ERROR] Autobase appears corrupted. Wiping local state and recreating a new base...')
                deleteBackendSecret('autobaseKey')
                deleteBackendSecret('encryptionKey')
                deleteBackendSecret('ownerAuthorityKey')
                deleteBackendSecret('epochKey')
                deleteBackendSecret('epochEncryptionKey')
                rmrfSafe(keyFilePath)
                rmrfSafe(encKeyFilePath)
                rmrfSafe(ownerAuthorityKeyFilePath)
                rmrfSafe(baseStoragePath)
                setEncryptionKey(null)
                setOwnerAuthorityKeyPair(null)
                setEpochKey(null)
                setEpochEncryptionKeyPair(null)
                // Clear the promise so recursive call can start fresh
                _initPromise = null
                return initAutobase(null)
            }
            throw e
        }
        logger.log(
            '[INFO] autobase.ready() resolved. writable?',
            autobase.writable,
            '| key:',
            autobase.key?.toString('hex'),
            '| encKey:',
            autobase.encryptionKey ? autobase.encryptionKey.toString('hex').slice(0, 16) + '...' : 'none',
        )

        // Save the autobase key for persistence across restarts
        if (autobase.key && autobase.writable) {
            saveAutobaseKey(autobase.key)
        }

        // Save encryption key after autobase is ready
        if (autobase.encryptionKey && autobase.writable) {
            setEncryptionKey(autobase.encryptionKey)
            saveEncryptionKey(autobase.encryptionKey)
        }

        autobase.on('append', async () => {
            logger.log('[INFO] New data appended, updating view...')
        })

        // Load existing items from view and sync to frontend
        await autobase.update()
        // Rebuild membership state from the records apply() persisted into the
        // view. Autobase does not re-run apply over history on restart, so
        // without this the owner key, writer set, and sequence high-water mark
        // would be empty here — re-bootstrapping the owner on every launch and
        // reusing sequence numbers. Seeding from the durable log makes the
        // bootstrap below run exactly once and keeps sequences monotonic.
        const persistedMembership = await readPersistedMembershipRecords()
        setMembershipState(reduceMembershipLog(persistedMembership, { baseKey: autobase.key }))
        await ensureOwnerMembership({ allowOwnerMigration })
        const rebuiltList = await rebuildListFromPersistedOps()
        setCurrentList(rebuiltList)
        syncListToFrontend(rebuiltList)
        broadcastMembershipRoster()

        // Add static peers only once
        if (!addedStaticPeers && peerKeysString) {
            const peerKeys = peerKeysString.split(',').filter(k => k.trim())
            for (const keyHex of peerKeys) {
                try {
                    const peerKey = Buffer.from(keyHex.trim(), 'hex')
                    const peerCore = store.get({ key: peerKey })
                    await peerCore.ready()
                    await autobase.addInput(peerCore)
                    logger.log('[INFO] Added peer writer from argv[1]')
                } catch (err) {
                    logger.log('[ERROR] Failed to add peer from argv[1]:', err.message)
                }
            }
            setAddedStaticPeers(true)
        }

        // Reset peer count on new base
        setPeerCount(0)
        broadcastPeerCount()

        // Use discoveryKey as swarm topic (NOT autobase.key)
        const topic = autobase.discoveryKey
        logger.log('[INFO] Discovery topic (replication swarm) ready')

        // Switch discovery to new topic
        if (discovery) {
            try {
                await discovery.destroy()
            } catch (e) {
                logger.log('[ERROR] Error destroying previous discovery:', e)
            }
        }

        setSwarm(new Hyperswarm())
        swarm.on('error', (err) => {
            logger.log('[ERROR] Replication swarm error:', err)
        })
        swarm.on('connection', (conn) => {
            logger.log('[INFO] New peer connected (replication swarm)', b4a.from(conn.publicKey).toString('hex'))
            conn.on('error', (err) => {
                logger.log('[ERROR] Replication connection error:', err)
            })
            setPeerCount(swarm.connections.size)
            broadcastPeerCount()
            conn.on('close', () => {
                setPeerCount(swarm.connections.size)
                broadcastPeerCount()
            })
            if (autobase) {
                autobase.replicate(conn)
            } else {
                logger.log('[WARNING] No Autobase yet to replicate with')
            }
        })
        setDiscovery(swarm.join(topic, { server: true, client: true }))
        await discovery.flushed()
        logger.log('[INFO] Joined replication swarm for current base')

        // Set up blind pairing for accepting joiners
        setupBlindPairing()

        // Create invite and send to frontend
        const z32Invite = createInvite()
        sendInviteKeyToFrontend(z32Invite || '')
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
        logger.log('[WARNING] joinViaInvite already running — returning existing join promise')
        return _joinPromise
    }

    _joinPromise = (async () => {
        const rollbackSnapshot = createJoinRollbackSnapshot({
            currentList,
            baseKey,
            encryptionKey,
            ownerAuthorityKeyPair,
            epochKey,
            epochEncryptionKeyPair,
        })
        const normalizedInvite = normalizeInviteCode(z32InviteStr)
        const joinEpochEncryptionKeyPair = createEpochEncryptionKeyPair()

        // Clean up any leftover temp resources from a previous attempt
        cleanupTempSwarm()

        try {
            if (!normalizedInvite) {
                throw new Error('Invite is empty or invalid')
            }

            // Notify frontend: phase 1 — pairing
            broadcastJoinPhase('pairing')

            // 1. Derive writer key from the already-open autobase's local core.
            //    autobase.local.key is stable across teardown/reinit of the same
            //    storage path, so the host will add the right key.
            if (!autobase?.local?.key) {
                throw new Error('autobase.local.key unavailable — cannot derive writer key')
            }
            const localWriterKey = autobase.local.key
            logger.log('[INFO] Guest localWriterKey ready')

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
                    userData: Buffer.from(JSON.stringify({
                        version: 1,
                        writerKey: localWriterKey.toString('hex'),
                        epochPublicKey: epochPublicKeyHex(joinEpochEncryptionKeyPair),
                    })),
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
            if (!result?.epochKey) {
                throw new Error('Pairing returned no epoch key')
            }

            // Notify frontend: phase 2 — permission (waiting for write access)
            broadcastJoinPhase('permission')

            logger.log('[INFO] Blind pairing succeeded')
            logger.log('[INFO] Temp swarm connections after pairing:', _tempSwarm.connections.size)

            // 3. Use initAutobase to set up the joined base — same proven code
            //    path the host uses. Set encryption key first so initAutobase
            //    picks it up.
            setOwnerAuthorityKeyPair(null)
            await deleteOwnerAuthorityKey()
            setEpochEncryptionKeyPair(joinEpochEncryptionKeyPair)
            await saveEpochEncryptionKey(joinEpochEncryptionKeyPair.secretKey)
            setEpochKey(result.epochKey)
            await saveEpochKey(result.epochKey)
            setEncryptionKey(result.encryptionKey)
            await initAutobase(result.key, { allowOwnerMigration: false })

            logger.log('[INFO] Guest initAutobase complete. writable:', autobase?.writable, '| swarm connections:', swarm?.connections?.size)

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
                    logger.log('[INFO] Guest: replicating autobase over temp swarm connection (alive:', !conn.destroyed, ')')
                    try {
                        autobase.replicate(conn)
                    } catch (e) {
                        logger.log('[ERROR] Failed to replicate over temp connection:', e)
                    }
                }
                logger.log('[INFO] Guest: replicated over', tempConnCount, 'temp connections')
            }

            // 5. Check writability
            if (autobase.writable) {
                logger.log('[INFO] Guest is already writable')
                broadcastMessage({ type: 'join-success' })
                cleanupTempSwarm()
            } else {
                logger.log('[INFO] Guest not yet writable — starting waitForWritable polling')
                setIsPendingJoinSuccess(true)
                waitForWritable()
            }
        } catch (e) {
            logger.log('[ERROR] joinViaInvite failed:', e)
            setIsPendingJoinSuccess(false)
            broadcastMessage({
                type: 'join-error',
                message: e?.message || 'Failed to join peer'
            })
            try {
                await restoreJoinRollbackSnapshot(rollbackSnapshot, {
                    rpc,
                    syncListCommand: SYNC_LIST,
                    setEncryptionKey,
                    setOwnerAuthorityKeyPair,
                    saveOwnerAuthorityKey,
                    deleteOwnerAuthorityKey,
                    setEpochKey,
                    saveEpochKey,
                    deleteEpochKey,
                    setEpochEncryptionKeyPair,
                    saveEpochEncryptionKey,
                    deleteEpochEncryptionKey,
                    initAutobase,
                })
            } catch (rollbackError) {
                logger.log('[ERROR] Failed to rollback previous session:', rollbackError)
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

export async function removeMemberAndRotateEpoch(writerKey) {
    // The orchestration (validation, grant construction, epoch rotation,
    // rollback, and post-commit snapshot retry) lives in rekey.mjs so it can be
    // unit-tested without the BareKit-bound backend graph. Pass the current
    // state values and persistence setters; rekey.mjs snapshots them for
    // rollback. prepareListAppendOperation reads live state itself, so the
    // snapshot is encrypted under the rotated epoch once apply() has advanced it.
    const result = await performMemberRemovalRekey(writerKey, {
        autobase,
        epochKey,
        membershipState,
        ownerAuthorityKeyPair,
        // Pass a getter, not the array: the live `currentList` binding is read
        // fresh inside the serialized write unit so the snapshot is current.
        getCurrentList: () => currentList,
        prepareListAppendOperation,
        enqueueWrite,
        setEpochKey,
        saveEpochKey,
        deleteEpochKey,
        setMembershipState,
        logger,
    })
    if (result.committed) broadcastMembershipRoster()
    broadcastMessage(result.ok
        ? { type: 'member-removed', writerKey: normalizeHex(writerKey, 32), snapshot: result.snapshot !== false }
        : { type: 'member-removal-failed', reason: result.reason })
    return result.ok
}

// Build the membership roster for the frontend: who the writers are, which one
// is the owner, which one is this device, and whether this device can administer
// (hold owner authority). Writer keys are opaque public identifiers, not secrets.
export function broadcastMembershipRoster() {
    const localWriterKey = autobase?.local?.key ? autobase.local.key.toString('hex') : null
    const roster = buildMembershipRoster(membershipState, {
        localWriterKey,
        hasOwnerAuthority: !!ownerAuthorityKeyPair && canCreateMembershipInvite(membershipState, ownerAuthorityKeyPair),
    })
    broadcastMessage({ type: 'membership-roster', roster })
}

// Reveal the owner recovery code so the owner can store it offline. Returns null
// unless this device currently holds owner authority. The code IS the owner
// secret — it is sent to the frontend for display only and never logged.
export function sendOwnerRecoveryCodeToFrontend() {
    if (!ownerAuthorityKeyPair || !canCreateMembershipInvite(membershipState, ownerAuthorityKeyPair)) {
        logger.log('[WARNING] Owner recovery code requested but this device is not the owner')
        broadcastMessage({ type: 'owner-recovery-code', code: null, reason: 'not-owner' })
        return
    }
    const code = ownerRecoveryCodeFromKeyPair(ownerAuthorityKeyPair)
    logger.log('[AUDIT] Owner recovery code revealed to the owner for offline backup')
    broadcastMessage({ type: 'owner-recovery-code', code })
}

// Restore owner authority on this device from a recovery code. The code is
// verified against the owner public key the base records, so a wrong code (or a
// code for another base) is rejected without side effects.
export async function recoverOwnerAuthority(code) {
    if (!membershipState?.ownerAuthorityKey) {
        logger.log('[WARNING] Owner recovery requested but the base has no recorded owner')
        broadcastMessage({ type: 'owner-recovery-failed', reason: 'no-owner-on-base' })
        return { ok: false, reason: 'no-owner-on-base' }
    }
    if (ownerAuthorityKeyPair && canCreateMembershipInvite(membershipState, ownerAuthorityKeyPair)) {
        broadcastMessage({ type: 'owner-recovered', alreadyOwner: true })
        return { ok: true, alreadyOwner: true }
    }

    const recovered = recoverOwnerAuthorityFromCode(code, membershipState.ownerAuthorityKey)
    if (!recovered) {
        logger.log('[WARNING] Owner recovery rejected an invalid or mismatched recovery code')
        broadcastMessage({ type: 'owner-recovery-failed', reason: 'invalid-code' })
        return { ok: false, reason: 'invalid-code' }
    }

    setOwnerAuthorityKeyPair(recovered)
    await saveOwnerAuthorityKey(recovered.secretKey)
    logger.log('[AUDIT] Owner authority recovered from recovery code')
    broadcastMembershipRoster()
    broadcastMessage({ type: 'owner-recovered' })
    return { ok: true }
}


function broadcastPeerCount() {
    broadcastMessage({ type: 'peer-count', count: peerCount })
}

function broadcastJoinPhase(phase) {
    broadcastMessage({ type: 'join-phase', phase })
}

function broadcastMessage(payload) {
    if (!rpc) return
    try {
        const req = rpc.request(RPC_MESSAGE)
        req.send(JSON.stringify(payload))
    } catch (e) {
        logger.log('[ERROR] Failed to broadcast message', e)
    }
}

function rmrfSafe(p) {
    try {
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch (e) {
        logger.log('[ERROR] rmrfSafe failed for', p, e)
    }
}

function normalizeInviteCode(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, '')
}

function parseJoinCandidateUserData(userData) {
    if (!userData) return null

    try {
        const text = Buffer.from(userData).toString('utf8')
        const parsed = JSON.parse(text)
        const writerKey = normalizeHex(parsed?.writerKey, 32)
        const epochPublicKey = normalizeHex(parsed?.epochPublicKey, 32)
        if (writerKey) return { writerKey, epochPublicKey }
    } catch {}

    const writerKey = normalizeHex(Buffer.from(userData), 32)
    return writerKey ? { writerKey, epochPublicKey: null } : null
}

function normalizeHex(value, bytes) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        const buffer = Buffer.from(value)
        return buffer.length === bytes ? buffer.toString('hex') : null
    }
    if (typeof value !== 'string') return null
    const hex = value.trim().toLowerCase()
    return /^[0-9a-f]+$/i.test(hex) && hex.length === bytes * 2 ? hex : null
}
