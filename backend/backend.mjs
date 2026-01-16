// /* global Bare, BareKit */

import RPC from 'bare-rpc'
import URL from 'bare-url'
import { join } from 'bare-path'
import fs from 'bare-fs'
import {
    RPC_RESET,
    RPC_MESSAGE,
    RPC_UPDATE,
    RPC_ADD,
    RPC_DELETE,
    RPC_GET_KEY,
    RPC_JOIN_KEY,
    RPC_ADD_FROM_BACKEND,
    RPC_UPDATE_FROM_BACKEND,
    RPC_DELETE_FROM_BACKEND,
    SYNC_LIST,
    RPC_REQUEST_SYNC
} from '../rpc-commands.mjs'
import b4a from 'b4a'
import Autobase from 'autobase'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
const { IPC } = BareKit
import { randomBytes } from 'bare-crypto'

console.error('bare backend is rocking.')

// const storagePath = join(URL.fileURLToPath(Bare.argv[0]), 'lista') || './data'
const argv0 = typeof Bare?.argv?.[0] === 'string' ? Bare.argv[0] : '';
let baseDir = '';
if (argv0) {
      try {
            // expo-file-system gives "file://..." URLs; but allow plain absolute paths too.
                baseDir = argv0.startsWith('file://') ? URL.fileURLToPath(argv0) : argv0;
          } catch {
            baseDir = '';
          }
    }
const storagePath = baseDir ? join(baseDir, 'lista') : './data';
const keyFilePath = baseDir ? join(baseDir, 'lista-autobase-key.txt') : './autobase-key.txt';
const localWriterKeyFilePath = baseDir ? join(baseDir, 'lista-local-writer-key.txt') : './local-writer-key.txt';
const peerKeysString = Bare.argv[1] || '' // Comma-separated peer keys

const baseKeyHex = Bare.argv[2] || '' // Optional Autobase key (to join an existing base)

// Save autobase key to file for persistence across restarts
function saveAutobaseKey(key) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(keyFilePath, keyHex)
        console.error('Saved autobase key to file:', keyHex)
    } catch (e) {
        console.error('Failed to save autobase key:', e)
    }
}

// Load autobase key from file if it exists
function loadAutobaseKey() {
    try {
        if (fs.existsSync(keyFilePath)) {
            const keyHex = fs.readFileSync(keyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                console.error('Loaded autobase key from file:', keyHex)
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        console.error('Failed to load autobase key:', e)
    }
    return null
}

// Save local writer key to file for persistence
function saveLocalWriterKey(key) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(localWriterKeyFilePath, keyHex)
        console.error('Saved local writer key to file:', keyHex)
    } catch (e) {
        console.error('Failed to save local writer key:', e)
    }
}

// Load local writer key from file if it exists
function loadLocalWriterKey() {
    try {
        if (fs.existsSync(localWriterKeyFilePath)) {
            const keyHex = fs.readFileSync(localWriterKeyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                console.error('Loaded local writer key from file:', keyHex)
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        console.error('Failed to load local writer key:', e)
    }
    return null
}

// Initialize Corestore
let store

// P2P state
let swarm = null
let autobase = null
let discovery = null
let currentTopic = null

// Handshake swarm for writer key exchange
let chatSwarm = null
let chatTopic = null
const knownWriters = new Set()
let addedStaticPeers = false

// Track connected replication peers
let peerCount = 0

// RPC instance (assigned later, but referenced by helper fns)
let rpc = null

// In-memory list state (rebuilt from autobase on startup)
let currentList = []

// Default list items for first-time users (persisted to autobase on empty start)
const DEFAULT_LIST = [
    { text: 'Tap to mark as done', isDone: false, timeOfCompletion: 0 },
    { text: 'Double tap to add new', isDone: false, timeOfCompletion: 0 },
    { text: 'Slide right slowly to delete', isDone: false, timeOfCompletion: 0 },
]

// Send current list to frontend
function syncListToFrontend () {
    if (!rpc) return
    try {
        const req = rpc.request(SYNC_LIST)
        req.send(JSON.stringify(currentList))
        console.error('Synced list to frontend:', currentList.length, 'items')
    } catch (e) {
        console.error('Failed to sync list to frontend:', e)
    }
}

// Optional Autobase key from argv (initial base) or loaded from file
let baseKey = null
if (baseKeyHex) {
    try {
        baseKey = Buffer.from(baseKeyHex.trim(), 'hex')
        console.error('Using existing Autobase key from argv[2]:', baseKeyHex.trim())
    } catch (err) {
        console.error('Invalid base key hex, creating new base instead:', err.message)
        baseKey = null
    }
}

// If no key from argv, try loading from file (for restart persistence)
if (!baseKey) {
    baseKey = loadAutobaseKey()
}

// Generate unique ID (used only for addItem)
function generateId () {
    return randomBytes(16).toString('hex')
}

// Verify startup integrity - ensures the correct hypercore is loaded on restart
async function verifyStartupIntegrity (savedLocalWriterKey, savedBaseKey) {
    console.error('=== STARTUP INTEGRITY CHECK ===')

    if (!autobase) {
        console.error('INTEGRITY CHECK: FAILED - autobase not initialized')
        return false
    }

    const checks = []

    // 1. Verify local writer key matches saved key (if we had one)
    if (savedLocalWriterKey) {
        const loadedLocalKeyHex = autobase.local?.key?.toString('hex')
        const savedLocalKeyHex = savedLocalWriterKey.toString('hex')
        const localKeyMatch = loadedLocalKeyHex === savedLocalKeyHex

        checks.push({
            name: 'Local writer key match',
            passed: localKeyMatch,
            expected: savedLocalKeyHex.slice(0, 16) + '...',
            actual: loadedLocalKeyHex?.slice(0, 16) + '...'
        })
    }

    // 2. Verify autobase key matches saved key (if we had one)
    if (savedBaseKey) {
        const loadedBaseKeyHex = autobase.key?.toString('hex')
        const savedBaseKeyHex = savedBaseKey.toString('hex')
        const baseKeyMatch = loadedBaseKeyHex === savedBaseKeyHex

        checks.push({
            name: 'Autobase key match',
            passed: baseKeyMatch,
            expected: savedBaseKeyHex.slice(0, 16) + '...',
            actual: loadedBaseKeyHex?.slice(0, 16) + '...'
        })
    }

    // 3. Verify local hypercore has data (if it's a restart)
    if (savedLocalWriterKey && autobase.local) {
        await autobase.local.ready()
        const hasData = autobase.local.length > 0

        checks.push({
            name: 'Local hypercore has persisted data',
            passed: hasData,
            expected: '> 0 entries',
            actual: `${autobase.local.length} entries`
        })
    }

    // 4. Verify storage path is accessible
    try {
        const storageExists = fs.existsSync(storagePath)
        checks.push({
            name: 'Storage path exists',
            passed: storageExists,
            expected: 'true',
            actual: String(storageExists)
        })
    } catch (e) {
        checks.push({
            name: 'Storage path exists',
            passed: false,
            expected: 'true',
            actual: `error: ${e.message}`
        })
    }

    // Log all checks
    let allPassed = true
    for (const check of checks) {
        const status = check.passed ? 'PASS' : 'FAIL'
        console.error(`  [${status}] ${check.name}: expected=${check.expected}, actual=${check.actual}`)
        if (!check.passed) allPassed = false
    }

    console.error(`=== INTEGRITY CHECK ${allPassed ? 'PASSED' : 'FAILED'} ===`)
    console.error(`Storage path: ${storagePath}`)
    console.error(`Autobase key: ${autobase.key?.toString('hex')}`)
    console.error(`Local writer key: ${autobase.local?.key?.toString('hex')}`)
    console.error(`Local writer length: ${autobase.local?.length}`)
    console.error(`Autobase writable: ${autobase.writable}`)

    return allPassed
}

// Persist and verify that an operation was written to disk
// Returns true if flush succeeded and length is correct, false otherwise
async function persistAndVerify (expectedLength, operationType) {
    if (!autobase || !autobase.local || !store) {
        console.error(`persistAndVerify (${operationType}): autobase, local core, or store not available`)
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
            console.error(`persistAndVerify (${operationType}): SUCCESS - flushed to disk, core ${keyHex}... length=${actualLength}`)
            return true
        } else {
            console.error(`persistAndVerify (${operationType}): LENGTH MISMATCH - core ${keyHex}... length=${actualLength}, expected >= ${expectedLength}`)
            return false
        }
    } catch (e) {
        console.error(`persistAndVerify (${operationType}): FLUSH FAILED -`, e.message)
        return false
    }
}

function sendHandshakeMessage (conn, msg) {
    const line = JSON.stringify(msg) + '\n'
    conn.write(line)
}

async function handleHandshakeMessage (msg) {
    if (!autobase) return
    if (!msg || msg.type !== 'writer-key') return

    const remoteKeyHex = msg.key
    if (!remoteKeyHex || typeof remoteKeyHex !== 'string') return

    if (knownWriters.has(remoteKeyHex)) return
    knownWriters.add(remoteKeyHex)

    // Only a writer can add other writers.
    if (!autobase.writable) {
        console.error('Not writable here, cannot add remote writer yet')
        return
    }

    console.error('Adding remote writer via autobase:', remoteKeyHex)

    await autobase.append({
        type: 'add-writer',
        key: remoteKeyHex
    })
}

async function setupHandshakeChannel (conn) {
    if (!autobase) {
        console.error('setupHandshakeChannel called before Autobase is initialized')
        return
    }

    // Send our writer key immediately
    await autobase.ready()
    const myWriterKeyHex = autobase.local.key.toString('hex')
    sendHandshakeMessage(conn, {
        type: 'writer-key',
        key: myWriterKeyHex
    })

    let buffer = ''
    conn.on('data', (chunk) => {
        buffer += chunk.toString()
        let idx
        while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 1)
            if (!line.trim()) continue

            // Fast-path: hypercore protocol frames and other binary garbage
            // are not going to start with '{', so just ignore them.
            if (line[0] !== '{') {
                continue
            }

            let msg
            try {
                msg = JSON.parse(line)
            } catch (e) {
                console.warn('invalid JSON from peer (handshake, ignored):', line)
                continue
            }

            handleHandshakeMessage(msg)
        }
    })
}

function setupChatSwarm (chatTopic) {
    if (!autobase) {
        console.error('setupChatSwarm called before Autobase is initialized')
        return
    }
    chatSwarm = new Hyperswarm()
    console.error('setting up chat swarm with topic:', chatTopic.toString('hex'))
    chatSwarm.on('connection', (conn, info) => {
        console.error('Handshake connection (chat swarm) with peer', info?.peer, info?.publicKey?.toString('hex'), info?.topics, info?.prioritized)
        conn.on('error', (err) => {
            console.error('Chat swarm connection error:', err)
        })
        setupHandshakeChannel(conn)
    })

    chatSwarm.on('error', (err) => {
        console.error('Chat swarm error:', err)
    })

    chatSwarm.join(chatTopic, { server: true, client: true })
    console.error('Handshake chat swarm joined on topic:', chatTopic.toString('hex'))
}

function broadcastPeerCount () {
    if (!rpc) return
    try {
        const req = rpc.request(RPC_MESSAGE)
        req.send(JSON.stringify({ type: 'peer-count', count: peerCount }))
    } catch (e) {
        console.error('Failed to broadcast peer count', e)
    }
}

async function initAutobase (newBaseKey) {
    // 1. Clean up previous Autobase instance (if any)
    if (autobase) {
        try {
            autobase.removeAllListeners('append')
            if (typeof autobase.close === 'function') {
                console.error('Closing previous Autobase instance...')
                await autobase.close()
            } else {
                console.error('Previous Autobase has no close() method, skipping close')
            }
        } catch (e) {
            console.error('Error while closing previous Autobase:', e)
        }
        autobase = null
    }

    // 2. Tear down networking bound to old store
    if (discovery) {
        try { await discovery.destroy() } catch (e) { console.error(e) }
        discovery = null
    }
    if (chatSwarm) {
        try { await chatSwarm.destroy() } catch (e) { console.error(e) }
        chatSwarm = null
    }

    // 3. Close old store
    if (store) {
        try {
            await store.close()
        } catch (e) {
            console.error('Error closing Corestore:', e)
        }
    }

    // 4. Create fresh Corestore
    store = new Corestore(storagePath)
    await store.ready()

    baseKey = newBaseKey || null
    console.error(
        'initializing a new autobase with key:',
        baseKey ? baseKey.toString('hex') : '(new base)'
    )

    // Try to load existing local writer for persistence
    let localInput = null
    const savedLocalWriterKey = loadLocalWriterKey()
    if (savedLocalWriterKey) {
        try {
            localInput = store.get({ key: savedLocalWriterKey })
            await localInput.ready()
            console.error('Loaded existing local writer from corestore:', savedLocalWriterKey.toString('hex'))
            console.error('  -> Local writer core length:', localInput.length)
        } catch (e) {
            console.error('Failed to load local writer, will create new one:', e)
            localInput = null
        }
    }

    // Create Autobase with localInput if we have one
    const autobaseOpts = { apply, open, valueEncoding: 'json' }
    if (localInput) {
        autobaseOpts.localInput = localInput
    }
    autobase = new Autobase(store, baseKey, autobaseOpts)

    console.error('Calling autobase.ready()...')
    await autobase.ready()
    console.error(
        'autobase.ready() resolved. Autobase ready, writable?',
        autobase.writable,
        ' key:',
        autobase.key?.toString('hex'),
        ' local writer key:',
        autobase.local?.key?.toString('hex')
    )

    // === STARTUP VERIFICATION ===
    // Verify that the loaded hypercore matches what we expect
    await verifyStartupIntegrity(savedLocalWriterKey, baseKey)

    // Save both keys for persistence across restarts
    if (autobase.key) {
        saveAutobaseKey(autobase.key)
    }
    if (autobase.local?.key) {
        saveLocalWriterKey(autobase.local.key)
    }

    if (autobase) {
        const req = rpc.request(RPC_GET_KEY)
        req.send(autobase.key?.toString('hex'))
    }

    // Reset in-memory list for fresh base
    currentList = []

    // Update the autobase to process any pending operations
    try {
        await autobase.update()
        console.error('Autobase update() completed')

        // IMPORTANT: Rebuild currentList by replaying ALL persisted operations
        // apply() only handles NEW operations, so we need to replay history on restart
        currentList = await rebuildListFromPersistedOps()
        console.error('Rebuilt currentList from persisted ops:', currentList.length, 'items')

        // If autobase is truly empty (first run), initialize with default list items
        if (currentList.length === 0 && autobase.local.length === 0 && autobase.writable) {
            console.error('Autobase is empty (first run), initializing with default list items...')
            for (const item of DEFAULT_LIST) {
                const op = {
                    type: 'add',
                    value: {
                        id: generateId(),
                        text: item.text,
                        isDone: item.isDone,
                        listId: null,
                        timeOfCompletion: item.timeOfCompletion,
                        updatedAt: Date.now(),
                        timestamp: Date.now(),
                    }
                }
                await autobase.append(op)
                console.error('Added default item:', item.text)
            }
            // Rebuild list again after adding defaults
            currentList = await rebuildListFromPersistedOps()
            console.error('Default items added, currentList now has', currentList.length, 'items')
        }

        // Sync the rebuilt list to the frontend
        syncListToFrontend()
    } catch (e) {
        console.error('Error updating autobase:', e)
        // Still sync (empty list) so frontend knows we're ready
        syncListToFrontend()
    }

    // Re-attach the append listener to the *new* instance
    autobase.on('append', async () => {
        console.error('New data appended, updating view...')
        try {
            await autobase.update()
            // Sync the updated list to frontend
            syncListToFrontend()
        } catch (e) {
            console.error('Error updating on append:', e)
        }
    })

    // Listen for view updates (triggered by replication)
    autobase.view.on('append', () => {
        console.error('View updated, syncing to frontend...')
        syncListToFrontend()
    })

    // Add static peers only once
    if (!addedStaticPeers && peerKeysString) {
        const peerKeys = peerKeysString.split(',').filter(k => k.trim())
        for (const keyHex of peerKeys) {
            try {
                const peerKey = Buffer.from(keyHex.trim(), 'hex')
                const peerCore = store.get({ key: peerKey })
                await peerCore.ready()
                await autobase.addInput(peerCore)
                console.error('Added peer writer from argv[1]:', keyHex.trim())
            } catch (err) {
                console.error('Failed to add peer from argv[1]:', keyHex, err.message)
            }
        }
        addedStaticPeers = true
    }

    // Reset peer count on new base
    peerCount = 0
    broadcastPeerCount()

    // --- Update replication swarm topic for this base ---
    const firstLocalAutobaseKey = randomBytes(32)
    const topic = autobase.key || firstLocalAutobaseKey
    console.error('Discovery topic (replication swarm):', topic.toString('hex'))

    // Switch discovery to new topic
    if (discovery) {
        try {
            await discovery.destroy()
        } catch (e) {
            console.error('Error destroying previous discovery:', e)
        }
    }

    swarm = new Hyperswarm()
    swarm.on('error', (err) => {
        console.error('Replication swarm error:', err)
    })

    swarm.on('connection', (conn) => {
        console.error('New peer connected (replication swarm)', b4a.from(conn.publicKey), conn.publicKey)
        conn.on('error', (err) => {
            console.error('Replication connection error:', err)
        })
        peerCount++
        broadcastPeerCount()

        conn.on('close', () => {
            peerCount = Math.max(0, peerCount - 1)
            broadcastPeerCount()
        })


        if (autobase) {
            autobase.replicate(conn)
        } else {
            console.error('No Autobase yet to replicate with')
        }
    })

    discovery = swarm.join(topic, { server: true, client: true })
    await discovery.flushed()
    console.error('Joined replication swarm for current base')

    // Restart chat swarm with new topic
    if (chatSwarm) {
        try {
            await chatSwarm.destroy()
        } catch (e) {
            console.error('Error destroying previous chat swarm:', e)
        }
        chatSwarm = null
    }
    setupChatSwarm(baseKey != null ? baseKey : autobase.key)
}

async function joinNewBase (baseKeyHexStr) {
    if (!baseKeyHexStr || typeof baseKeyHexStr !== 'string') {
        console.error('joinNewBase: invalid baseKey', baseKeyHexStr)
        return
    }

    try {
        const newKey = Buffer.from(baseKeyHexStr.trim(), 'hex')
        if (newKey.length !== 32) {
            console.error('joinNewBase: baseKey must be 32 bytes, got', newKey.length)
            return
        }
        console.error('Joining new Autobase key at runtime:', baseKeyHexStr.trim())
        await initAutobase(newKey).then(() => {
            console.error('Backend ready')
        }).catch((err) => {
            console.error('initAutobase failed at startup:', err)
        })
    } catch (e) {
        console.error('joinNewBase failed:', e)
    }
}

// Create RPC server
rpc = new RPC(IPC, async (req, error) => {
    console.error('got a request from react', req)
    if (error) {
        console.error('got an error from react', error)
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
                console.error('command RPC_GET_KEY')
                if (!autobase) {
                    console.error('RPC_GET_KEY requested before Autobase is ready')
                    break
                }
                const keyReq = rpc.request(RPC_GET_KEY)
                keyReq.send(autobase.local.key.toString('hex'))
                break
            }
            case RPC_JOIN_KEY: {
                console.error('command RPC_JOIN_KEY')
                const data = JSON.parse(req.data.toString())
                console.error('Joining new base key from RPC:', data.key)
                await joinNewBase(data.key)
                break
            }
            case RPC_REQUEST_SYNC: {
                console.error('command RPC_REQUEST_SYNC - frontend requesting current list')
                syncListToFrontend()
                break
            }
        }
    } catch (err) {
        console.error('Error handling RPC request:', err)
    }
})

// Initialize Autobase for the initial baseKey (from argv or new)
await initAutobase(baseKey).then(() => {
    console.error('Backend ready')
}).catch((err) => {
    console.error('initAutobase failed at startup:', err)
})

// Backend ready
console.error('Backend ready')

// Cleanup on teardown
Bare.on('teardown', async () => {
    console.error('Backend shutting down...')
    try {
        await swarm.destroy()
    } catch (e) {
        console.error('Error destroying replication swarm:', e)
    }
    if (chatSwarm) {
        try {
            await chatSwarm.destroy()
        } catch (e) {
            console.error('Error destroying chat swarm:', e)
        }
    }
    if (discovery) {
        try {
            await discovery.destroy()
        } catch (e) {
            console.error('Error destroying discovery:', e)
        }
    }
    try {
        await store.close()
    } catch (e) {
        console.error('Error closing store:', e)
    }
    console.error('Backend shutdown complete')
})

function open (store) {
    const view = store.get({
        name: 'test',
        valueEncoding: 'json'
    })
    console.error('opening store...', view)
    return view
}

async function apply (nodes, view, host) {
    console.error('apply started')
    for (const { value } of nodes) {
        if (!value) continue

        // Handle writer membership updates coming from handshake
        if (value.type === 'add-writer' && typeof value.key === 'string') {
            try {
                const writerKey = Buffer.from(value.key, 'hex')
                await host.addWriter(writerKey, { indexer: false })
                console.error('Added writer from add-writer op:', value.key)
            } catch (err) {
                console.error('Failed to add writer from add-writer op:', err)
            }
            continue
        }

        if (value.type === 'add') {
            if (!validateItem(value.value)) {
                console.error('Invalid item schema in add operation:', value.value)
                continue
            }
            console.error('Applying add operation for item:', value.value)
            // Update in-memory list
            currentList = [value.value, ...currentList.filter(i => i.text !== value.value.text)]
            const addReq = rpc.request(RPC_ADD_FROM_BACKEND)
            addReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'delete') {
            if (!validateItem(value.value)) {
                console.error('Invalid item schema in delete operation:', value.value)
                continue
            }
            console.error('Applying delete operation for item:', value.value)
            // Update in-memory list
            currentList = currentList.filter(i => i.text !== value.value.text)
            const deleteReq = rpc.request(RPC_DELETE_FROM_BACKEND)
            deleteReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'update') {
            if (!validateItem(value.value)) {
                console.error('Invalid item schema in update operation:', value.value)
                continue
            }
            console.error('Applying update operation for item:', value.value)
            // Update in-memory list
            currentList = currentList.map(i =>
                i.text === value.value.text ? value.value : i
            )
            const updateReq = rpc.request(RPC_UPDATE_FROM_BACKEND)
            updateReq.send(JSON.stringify(value.value))
            continue
        }

        if (value.type === 'list') {
            if (!Array.isArray(value.value)) {
                console.error('Invalid list operation payload, expected array:', value.value)
                continue
            }
            console.error('Applying list operation for items:', value.value)
            const updateReq = rpc.request(SYNC_LIST)
            updateReq.send(JSON.stringify(value.value))
            continue
        }

        // All other values are appended to the view (for future use)
        await view.append(value)
    }
}

// Simple inline schema validation matching the mobile ListEntry
function validateItem (item) {
    if (typeof item !== 'object' || item === null) return false
    if (typeof item.text !== 'string') return false
    if (typeof item.isDone !== 'boolean') return false
    if (typeof item.timeOfCompletion !== 'number') return false
    return true
}

// Rebuild currentList by replaying all persisted operations from the local hypercore
// This is called on startup to reconstruct state from disk
async function rebuildListFromPersistedOps () {
    if (!autobase || !autobase.local) {
        console.error('rebuildListFromPersistedOps: autobase or local core not available')
        return []
    }

    const rebuiltList = []
    const length = autobase.local.length

    console.error(`rebuildListFromPersistedOps: reading ${length} entries from local hypercore...`)

    for (let i = 0; i < length; i++) {
        try {
            const entry = await autobase.local.get(i)
            if (!entry) {
                console.error(`  entry ${i}: null/undefined`)
                continue
            }

            // Autobase stores entries in internal format:
            // { version, node: { heads, batch, value }, checkpoint, digest, optimistic, trace }
            // The actual user data is in entry.node.value as a byte array object {"0":123,"1":34,...}
            let op = null

            if (entry.node && entry.node.value) {
                // Extract the byte array from entry.node.value
                const valueObj = entry.node.value
                try {
                    // Convert byte array object {"0":123,"1":34,...} to Buffer then to string
                    const bytes = Object.values(valueObj)
                    const jsonStr = Buffer.from(bytes).toString('utf8')
                    op = JSON.parse(jsonStr)
                    console.error(`  entry ${i}: extracted op type=${op.type}`)
                } catch (parseErr) {
                    console.error(`  entry ${i}: failed to parse node.value: ${parseErr.message}`)
                    continue
                }
            } else if (Buffer.isBuffer(entry)) {
                // Fallback: direct buffer
                try {
                    op = JSON.parse(entry.toString())
                    console.error(`  entry ${i}: parsed from buffer, type=${op.type}`)
                } catch (parseErr) {
                    console.error(`  entry ${i}: failed to parse buffer: ${parseErr.message}`)
                    continue
                }
            } else if (typeof entry === 'object' && entry.type) {
                // Fallback: direct object with type property
                op = entry
                console.error(`  entry ${i}: direct object, type=${op.type}`)
            } else {
                console.error(`  entry ${i}: unknown format, keys=${Object.keys(entry).join(',')}`)
                continue
            }

            if (!op || !op.type) {
                console.error(`  entry ${i}: no valid op extracted`)
                continue
            }

            // Skip add-writer operations (not list data)
            if (op.type === 'add-writer') {
                console.error(`  entry ${i}: skipped add-writer op`)
                continue
            }

            if (op.type === 'add' && op.value && validateItem(op.value)) {
                // Add: insert at front, remove duplicates by text
                const filtered = rebuiltList.filter(item => item.text !== op.value.text)
                filtered.unshift(op.value)
                rebuiltList.length = 0
                rebuiltList.push(...filtered)
                console.error(`    -> added item: ${op.value.text}`)
            } else if (op.type === 'update' && op.value && validateItem(op.value)) {
                // Update: replace matching item
                const idx = rebuiltList.findIndex(item => item.text === op.value.text)
                if (idx !== -1) {
                    rebuiltList[idx] = op.value
                    console.error(`    -> updated item: ${op.value.text}`)
                }
            } else if (op.type === 'delete' && op.value) {
                // Delete: remove matching item
                const idx = rebuiltList.findIndex(item => item.text === op.value.text)
                if (idx !== -1) {
                    rebuiltList.splice(idx, 1)
                    console.error(`    -> deleted item: ${op.value.text}`)
                }
            } else {
                console.error(`    -> skipped (type=${op.type}, hasValue=${!!op.value}, valid=${op.value ? validateItem(op.value) : 'N/A'})`)
            }
        } catch (e) {
            console.error(`rebuildListFromPersistedOps: error reading entry ${i}:`, e.message)
        }
    }

    console.error(`rebuildListFromPersistedOps: rebuilt list with ${rebuiltList.length} items`)
    return rebuiltList
}

// Add item operation (backend creates the canonical item)
async function addItem (text, listId) {
    if (!autobase) {
        console.error('addItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        console.error('addItem called but autobase is not writable yet - waiting to be added as writer')
        // Notify frontend about not being writable
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            console.error('Failed to send not-writable message:', e)
        }
        return false
    }

    console.error('command RPC_ADD addItem text', text)

    const item = {
        id: generateId(),                    // extra metadata, frontend can ignore
        text,
        isDone: false,
        listId: listId || null,
        timeOfCompletion: 0,
        updatedAt: Date.now(),
        timestamp: Date.now(),
    }

    const op = {
        type: 'add',
        value: item
    }

    // Get length before append to verify it increases
    const lengthBefore = autobase.local.length

    await autobase.append(op)

    // Flush to disk and verify persistence
    const persisted = await persistAndVerify(lengthBefore + 1, 'ADD')
    if (!persisted) {
        console.error('WARNING: Add operation may not have been persisted to disk!')
    }

    console.error('Added item:', text, '- persisted:', persisted)
    return persisted
}

// Update item operation: AUTONOMOUS, NO BACKEND MEMORY
async function updateItem (item) {
    if (!autobase) {
        console.error('updateItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        console.error('updateItem called but autobase is not writable yet')
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            console.error('Failed to send not-writable message:', e)
        }
        return false
    }

    console.error('command RPC_UPDATE updateItem item', item)

    const op = {
        type: 'update',
        value: item
    }

    // Get length before append to verify it increases
    const lengthBefore = autobase.local.length

    await autobase.append(op)

    // Flush to disk and verify persistence
    const persisted = await persistAndVerify(lengthBefore + 1, 'UPDATE')
    if (!persisted) {
        console.error('WARNING: Update operation may not have been persisted to disk!')
    }

    console.error('Updated item:', item.text, '- persisted:', persisted)
    return persisted
}

// Delete item operation: AUTONOMOUS, NO BACKEND MEMORY
async function deleteItem (item) {
    if (!autobase) {
        console.error('deleteItem called before Autobase is initialized')
        return false
    }

    if (!autobase.writable) {
        console.error('deleteItem called but autobase is not writable yet')
        try {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify({ type: 'not-writable', message: 'Waiting to be added as a writer by the host...' }))
        } catch (e) {
            console.error('Failed to send not-writable message:', e)
        }
        return false
    }

    console.error('command RPC_DELETE deleteItem item', item)

    const op = {
        type: 'delete',
        value: item
    }

    // Get length before append to verify it increases
    const lengthBefore = autobase.local.length

    await autobase.append(op)

    // Flush to disk and verify persistence
    const persisted = await persistAndVerify(lengthBefore + 1, 'DELETE')
    if (!persisted) {
        console.error('WARNING: Delete operation may not have been persisted to disk!')
    }

    console.error('Deleted item:', item.text, '- persisted:', persisted)
    return persisted
}
