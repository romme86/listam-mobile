// /* global Bare, BareKit */

import RPC from 'bare-rpc'
import fs from 'bare-fs'
import URL from 'bare-url'
import { join } from 'bare-path'
import { RPC_RESET, RPC_MESSAGE } from '../rpc-commands.mjs'

import Autopass from 'autopass'
import Autobase from 'autobase'
import Corestore from 'corestore'
const { IPC } = BareKit

// "bundle:backend": "bare-pack backend/backend.mjs -o app/app.bundle.mjs"


console.log("parmigiano bare backend")
// const path = join(URL.fileURLToPath(Bare.argv[0]), 'lista')

const rpc = new RPC(IPC, (req, error) => {
    console.log("parmigiano rpc 2 way", req, error)
})

// // For a clean start
// if (fs.existsSync(path)) {
//     console.log("parmigiano fs.sync")
//     fs.rmSync(path, {
//         recursive: true,
//         force: true
//     })
// }

// fs.mkdirSync(path)
console.log("parmigiano mkdirsync")
const invite = Bare.argv[1]
const pair = Autopass.pair(new Corestore(path), invite)
const pass = await pair.finished()
Bare.on('teardown', () => pass.close())

await pass.ready()

pass.on('update', async (e) => {
    console.log("parmigiano update")

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
    console.log("parmigiano error")
    console.error(error)
})

pass.on('reset', async (e) => {
    console.log("parmigiano reset")
})


