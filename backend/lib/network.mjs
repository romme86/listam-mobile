import Hyperswarm from "hyperswarm";
import {autobase, chatSwarm, discovery, store, baseKey, addedStaticPeers, peerCount, swarm, rpc, apply, open, storagePath, peerKeysString} from "../backend.mjs";
import {RPC_MESSAGE} from "../../rpc-commands.mjs";
import Corestore from "corestore";
import Autobase from "autobase";

export function sendHandshakeMessage (conn, msg) {
    const line = JSON.stringify(msg) + '\n'
    conn.write(line)
}

export async function handleHandshakeMessage (msg) {
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

export async function setupHandshakeChannel (conn) {
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

export function setupChatSwarm (chatTopic) {
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



export async function initAutobase (newBaseKey) {
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
    // let localInput = null
    // const savedLocalWriterKey = loadLocalWriterKey(localWriterKeyFilePath)
    // if (savedLocalWriterKey) {
    //     try {
    //         localInput = store.get({ key: savedLocalWriterKey })
    //         await localInput.ready()
    //         console.error('Loaded existing local writer from corestore:', savedLocalWriterKey.toString('hex'))
    //         console.error('  -> Local writer core length:', localInput.length)
    //     } catch (e) {
    //         console.error('Failed to load local writer, will create new one:', e)
    //         localInput = null
    //     }
    // }

    // Create Autobase with localInput if we have one
    const autobaseOpts = { apply, open, valueEncoding: 'json' }
    // if (localInput) {
    //     autobaseOpts.localInput = localInput
    // }
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
    // await verifyStartupIntegrity(savedLocalWriterKey, baseKey)
    //
    // // Save both keys for persistence across restarts
    // if (autobase.key) {
    //     saveAutobaseKey(autobase.key, keyFilePath)
    // }
    // if (autobase.local?.key) {
    //     saveLocalWriterKey(autobase.local.key, localWriterKeyFilePath)
    // }

    if (autobase) {
        const req = rpc.request(RPC_GET_KEY)
        req.send(autobase.key?.toString('hex'))
    }

    // Reset in-memory list for fresh base
    // currentList = []

    // Update the autobase to process any pending operations
    // try {
    //     await autobase.update()
    //     console.error('Autobase update() completed')
    //
    //     // IMPORTANT: Rebuild currentList by replaying ALL persisted operations
    //     // apply() only handles NEW operations, so we need to replay history on restart
    //     currentList = await rebuildListFromPersistedOps()
    //     console.error('Rebuilt currentList from persisted ops:', currentList.length, 'items')
    //
    //     // If autobase is truly empty (first run), initialize with default list items
    //     if (currentList.length === 0 && autobase.local.length === 0 && autobase.writable) {
    //         console.error('Autobase is empty (first run), initializing with default list items...')
    //         for (const item of DEFAULT_LIST) {
    //             const op = {
    //                 type: 'add',
    //                 value: {
    //                     id: generateId(),
    //                     text: item.text,
    //                     isDone: item.isDone,
    //                     listId: null,
    //                     timeOfCompletion: item.timeOfCompletion,
    //                     updatedAt: Date.now(),
    //                     timestamp: Date.now(),
    //                 }
    //             }
    //             await autobase.append(op)
    //             console.error('Added default item:', item.text)
    //         }
    //         // Rebuild list again after adding defaults
    //         currentList = await rebuildListFromPersistedOps()
    //         console.error('Default items added, currentList now has', currentList.length, 'items')
    //     }
    //
    //     // Sync the rebuilt list to the frontend
    //     syncListToFrontend()
    // } catch (e) {
    //     console.error('Error updating autobase:', e)
    //     // Still sync (empty list) so frontend knows we're ready
    //     syncListToFrontend()
    // }

    // Re-attach the append listener to the *new* instance
    autobase.on('append', async () => {
        console.error('New data appended, updating view...')
        //     try {
        //         await autobase.update()
        //         // Sync the updated list to frontend
        //         syncListToFrontend()
        //     } catch (e) {
        //         console.error('Error updating on append:', e)
        //     }
        // })
        //
        // // Listen for view updates (triggered by replication)
        // autobase.view.on('append', () => {
        //     console.error('View updated, syncing to frontend...')
        //     syncListToFrontend()
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

export async function joinNewBase (baseKeyHexStr) {
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

function broadcastPeerCount () {
    if (!rpc) return
    try {
        const req = rpc.request(RPC_MESSAGE)
        req.send(JSON.stringify({ type: 'peer-count', count: peerCount }))
    } catch (e) {
        console.error('Failed to broadcast peer count', e)
    }
}