// /* global Bare, BareKit */

import RPC from 'bare-rpc'
import fs from 'bare-fs'
import URL from 'bare-url'
import { join } from 'bare-path'
import { RPC_RESET, RPC_MESSAGE, RPC_UPDATE } from '../rpc-commands.mjs'

import Autopass from 'autopass'
import Autobase from 'autobase'
import Corestore from 'corestore'
const { IPC } = BareKit

// "bundle:backend": "bare-pack backend/backend.mjs -o app/app.bundle.mjs"

console.error("bare backend is rocking.")
const path = join(URL.fileURLToPath(Bare.argv[0]), 'lista')

const rpc = new RPC(IPC, async (req, error) => {
    console.error("got a request from react", req, error)
    try {
        switch (req.command) {
            case RPC_ADD: {
                const data = JSON.parse(req.data.toString())
                await addItem(data.text)
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
                const keyReq = rpc.request(RPC_GET_KEY)
                keyReq.send(local.key.toString('hex'))
                break
            }
        }
    } catch (err) {
        log('Error handling RPC request:', err)
    }
})

// For a clean start
if (fs.existsSync(path)) {
    console.error("bare backend fs.sync")
    fs.rmSync(path, {
        recursive: true,
        force: true
    })
}

fs.mkdirSync(path)
const invite = Bare.argv[1]
const pair = Autopass.pair(new Corestore(path), invite)
const pass = await pair.finished()
Bare.on('teardown', () => pass.close())

await pass.ready()

pass.on('update', async (e) => {
    console.error("parmigiano update")

    const req = rpc.request(RPC_RESET)
    req.send('data')

    for await (const data of pass.list()) {
        const value = JSON.parse(data.value)

        if (value[0] === 'password') {
            const req = rpc.request(RPC_MESSAGE)
            req.send(JSON.stringify(value))
        }
    }
})

pass.on('error', (error) => {
    console.error("parmigiano error")
    console.error(error)
})

pass.on('reset', async (e) => {
    console.error("parmigiano reset")
})


