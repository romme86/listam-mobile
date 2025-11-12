// /* global Bare, BareKit */

import RPC from 'bare-rpc'
import URL from 'bare-url'
import { join } from 'bare-path'
import { RPC_RESET, RPC_MESSAGE, RPC_UPDATE, RPC_ADD, RPC_DELETE, RPC_GET_KEY, SYNC_LIST } from '../rpc-commands.mjs'
import b4a from 'b4a'
import Autobase from 'autobase'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
const { IPC } = BareKit
import { randomBytes } from 'bare-crypto'

const startingList = [
    {text: 'Tap to mark as done', isDone: false, timeOfCompletion: 0},
    {text: 'Double tap to add new', isDone: false, timeOfCompletion: 0},
    {text: 'Slide left to delete', isDone: false, timeOfCompletion: 0},
    {text: 'Mozzarella', isDone: false, timeOfCompletion: 0},
    {text: 'Tomato Sauce', isDone: false, timeOfCompletion: 0},
    {text: 'Flour', isDone: false, timeOfCompletion: 0},
    {text: 'Yeast', isDone: false, timeOfCompletion: 0},
    {text: 'Salt', isDone: false, timeOfCompletion: 0},
    {text: 'Basil', isDone: false, timeOfCompletion: 0},
]


// "bundle:backend": "bare-pack backend/backend.mjs -o app/app.bundle.mjs"
// Helper function to log (visible in process stream)
function log(...args) {
    console.error('[Backend]', ...args)
}

console.error("bare backend is rocking.")
const storagePath = join(URL.fileURLToPath(Bare.argv[0]), 'lista') || './data'
const peerKeysString = Bare.argv[1] || '' // Comma-separated peer keys
 // Initialize Corestore
const store = new Corestore(storagePath)
await store.ready()
log('Corestore ready at:', storagePath)

function open(store) {
    console.log('opening store...', store.get('test'))
    return store.get('test')
}

async function apply(nodes, view, host) {
    console.log("apply started")
    for (const {value} of nodes) {
        if (value.addWriter()) {
            console.log("adding writer")
            await host.addWriter(value.addWriter, {indexer: true})
            continue
        }
        await view.append(value)
    }
}

// Simple inline schema validation
function validateItem(item) {
    if (typeof item !== 'object' || item === null) return false
    if (typeof item.id !== 'string') return false
    if (typeof item.text !== 'string') return false
    if (typeof item.isDone !== 'boolean') return false
    if (typeof item.timeOfCompletion !== 'number') return false
    if (typeof item.timestamp !== 'number') return false
    return true
}

// Create or load local writer core
const local = store.get({ name: 'local-writer' })
await local.ready()
log('Local writer key:', local.key.toString('hex'))
// TODO send this key to the react app

// Initialize Autobase with local input
// const autobase = new Autobase({
//     store: store,
//     inputs: [local],
//     localInput: local,
//     autostart: true,
//     storage: (name) => store.get({ name: 'autobase-' + name })
// })

const autobase = new Autobase(store, local.key, {apply, open})

await autobase.ready()

log('Autobase ready, writable? ', autobase.writable, ' key:', autobase.key?.toString('hex'))

if (peerKeysString) {
    const peerKeys = peerKeysString.split(',').filter(k => k.trim())
    for (const keyHex of peerKeys) {
        try {
            const peerKey = Buffer.from(keyHex.trim(), 'hex')
            const peerCore = store.get({ key: peerKey })
            await peerCore.ready()
            await autobase.addInput(peerCore)
            log('Added peer writer:', keyHex.trim())
        } catch (err) {
            log('Failed to add peer:', keyHex, err.message)
        }
    }
}

// In-memory view of the list (linearized from autobase)
let listView = new Map() // id -> item

// Function to apply operations to the view
function applyOp(op) {
    try {
        if (!validateItem(op.value)) {
            log('Invalid item:', op.value)
            return
        }

        switch (op.type) {
            case 'add':
            case 'update':
                listView.set(op.value.id, op.value)
                break
            case 'delete':
                listView.delete(op.value.id)
                break
        }
    } catch (err) {
        log('Invalid operation:', err)
    }
}


// Send current list state to UI
function sendListToUI() {
    try {
        // First send reset
        const resetReq = rpc.request(RPC_RESET)
        resetReq.send()

        // Then send all items sorted by timestamp
        let items = Array.from(listView.values())
            .sort((a, b) => {
                // Active items first, then by timestamp
                if (a.isDone !== b.isDone) {
                    return a.isDone ? 1 : -1
                }
                return a.timestamp - b.timestamp
            })
        if (items.length === 0) {
            listView.set("initialList", startingList)
            items = listView.get("initialList")
        }
        log('Sending', items.length, 'items to UI')
        const req = rpc.request(SYNC_LIST)
        req.send(JSON.stringify(items))
    } catch (err) {
        log('Error sending to UI:', err)
    }
}

// Linearize and build the view
async function rebuildView() {
    const oldSize = listView.size
    listView.clear()

    try {
        for await (const node of autobase.createReadStream({ live: false })) {
            const op = JSON.parse(node.value.toString())
            applyOp(op)
        }
    } catch (err) {
        log('Error rebuilding view:', err)
    }

    log('View rebuilt:', oldSize, '->', listView.size, 'items')

    // Send the complete list to React Native
    sendListToUI()
}

// Listen for new data from any input
autobase.on('append', async () => {
    log('New data appended, rebuilding view...')
    await rebuildView()
})

// Generate unique ID
function generateId() {
    return randomBytes(16).toString('hex')
}

// Add item operation
async function addItem(text, listId) {
    console.error("command RPC_ADD addItem text", text )
    const item = {
        id: generateId(),
        text,
        isDone: false,
        listId: listId,
        timeOfCompletion: 0,
        updatedAt: Date.now(),
        timestamp: Date.now(),
        author: local.key.toString('hex').slice(0, 8)
    }

    const op = {
        type: 'add',
        value: item
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    await autobase.append(Buffer.from(JSON.stringify(op)))
    log('Added item:', text)
}

// Update item operation
async function updateItem(id, listId, updates) {
    console.error("command RPC_ADD updateItem  id ,  listId, updates", id ,  listId, updates)
    const existing = listView.get(id)
    if (!existing) {
        log('Item not found for update:', id)
        return
    }

    const item = {
        ...existing,
        ...updates,
        timestamp: Date.now()
    }

    const op = {
        type: 'update',
        value: item
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    log('Updated item:', item.text)
}

// Delete item operation
async function deleteItem(id) {
    console.error("command RPC_DELETE deleteItem  id ,  listId, updates", id ,  listId, updates)
    const existing = listView.get(id)
    if (!existing) {
        log('Item not found for delete:', id)
        return
    }

    const op = {
        type: 'delete',
        value: { id, timestamp: Date.now() }
    }

    await local.append(Buffer.from(JSON.stringify(op)))
    log('Deleted item:', existing.text)
}

// Initialize Hyperswarm for P2P replication
const swarm = new Hyperswarm()

// Replicate on connection
swarm.on('connection', (conn) => {
    log('New peer connected', conn, conn.publicKey)
    store.replicate(conn)
    // autobase.append(
    //     encode('@autopass/add-writer', {
    //         key: b4a.isBuffer(conn.key) ? conn.key : b4a.from(conn.key)
    //     })
    // )
})



const firstLocalAutobaseKey = randomBytes(32)
console.error("firstLocalAutobaseKey:", firstLocalAutobaseKey)

// Join a topic based on autobase key for discovery
const topic = autobase.key || firstLocalAutobaseKey
log('Discovery topic:', topic.toString('hex'))

const discovery = swarm.join(topic, { server: true, client: true })
await discovery.flushed()
log('Joined swarm')

const rpc = new RPC(IPC, async (req, error) => {
    console.error("got a request from react", req)
    if (error) {
        console.error("got an error from react", error)
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
                await updateItem(data.id, data.updates)
                break
            }
            case RPC_DELETE: {
                const data = JSON.parse(req.data.toString())
                await deleteItem(data.id)
                break
            }
            case RPC_GET_KEY: {
                // Send our writer key back to UI
                console.error("command RPC_GET_KEY")
                const keyReq = rpc.request(RPC_GET_KEY)
                keyReq.send(local.key.toString('hex'))
                break
            }
        }
    } catch (err) {
        log('Error handling RPC request:', err)
    }
})

// // Handle RPC requests from React Native
// rpc.on('request', async (req) => {
//     try {
//         switch (req.command) {
//             case RPC_ADD: {
//                 const data = JSON.parse(req.data.toString())
//                 await addItem(data.text)
//                 break
//             }
//
//             case RPC_UPDATE: {
//                 const data = JSON.parse(req.data.toString())
//                 await updateItem(data.id, data.updates)
//                 break
//             }
//
//             case RPC_DELETE: {
//                 const data = JSON.parse(req.data.toString())
//                 await deleteItem(data.id)
//                 break
//             }
//
//             case RPC_GET_KEY: {
//                 // Send our writer key back to UI
//                 const keyReq = rpc.request(RPC_GET_KEY)
//                 keyReq.send(local.key.toString('hex'))
//                 break
//             }
//         }
//     } catch (err) {
//         log('Error handling RPC request:', err)
//     }
// })

// Build initial view
await rebuildView()
log('Backend ready')

// Send our key to UI on startup
try {
    const keyReq = rpc.request(RPC_GET_KEY)
    keyReq.send(local.key.toString('hex'))
} catch (err) {
    log('Could not send key to UI:', err)
}

// Cleanup on teardown
Bare.on('teardown', async () => {
    log('Backend shutting down...')
    await swarm.destroy()
    await store.close()
    log('Backend shutdown complete')
})

