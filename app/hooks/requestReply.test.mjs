import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PassThrough } from 'node:stream'
import RPC from 'bare-rpc'
import ts from 'typescript'

const directory = path.dirname(fileURLToPath(import.meta.url))
const build = path.join(directory, `.test-build-rpc-${process.pid}`)
fs.mkdirSync(build, { recursive: true })
after(() => fs.rmSync(build, { recursive: true, force: true }))
const output = path.join(build, 'requestReply.mjs')
fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(path.join(directory, 'requestReply.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText)
const { awaitRpcReply } = await import(pathToFileURL(output).href)

test('200 real non-stream RPC requests release their retained records after reply', async () => {
    const stream = new PassThrough()
    const rpc = new RPC(stream, (request) => request.reply('done'))
    for (let i = 0; i < 200; i++) {
        const request = rpc.request(1)
        request.send('')
        assert.equal((await awaitRpcReply(request, 100)).toString(), 'done')
    }
    assert.equal(rpc._outgoingRequests.size, 0)
    stream.destroy()
})

test('timeouts release requests and a late response cannot affect a newer request', async () => {
    const requests = [], stream = new PassThrough()
    const rpc = new RPC(stream, (request) => requests.push(request))
    const expired = rpc.request(1); expired.send('')
    assert.equal(await awaitRpcReply(expired, 10), null)
    assert.equal(rpc._outgoingRequests.size, 0)
    const current = rpc.request(1); current.send('')
    const reply = awaitRpcReply(current, 100)
    requests[0].reply('old')
    requests[1].reply('new')
    assert.equal((await reply).toString(), 'new')
    assert.equal(rpc._outgoingRequests.size, 0)
    stream.destroy()
})
