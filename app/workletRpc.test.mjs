// The bare-rpc wire contract that sendRPC depends on, pinned.
//
// Regression under test: `sendRPC` guarded its `req.send()` on
// `payload !== undefined`, so every payload-less command built an
// OutgoingRequest and then transmitted NOTHING. RPC_NET_SUSPEND,
// RPC_NET_RESUME and RPC_CANCEL_JOIN — the entire mobile half of the 4G
// pairing fix — were dropped on the device and never reached the backend.
// The backend logged nothing, because nothing arrived; it looked exactly
// like a backend that had ignored the command.
//
// This is the same failure shape as the `candidate.close()` bug that caused
// the field outage in the first place: a third-party API used on an
// assumption nobody ever asserted. So assert it, against the real library.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Duplex } from 'node:stream'
import ts from 'typescript'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const RPC = require('bare-rpc')

// Two RPC endpoints over an in-memory duplex pair — the same shape as the
// worklet pipe, minus the worklet. node:stream rather than streamx so this test
// adds no dependency; bare-rpc only needs write()/push() and 'data'.
function connectedPair() {
    const received = []
    const a = new Duplex({ read() {}, write(data, _enc, cb) { b.push(data); cb() } })
    const b = new Duplex({ read() {}, write(data, _enc, cb) { a.push(data); cb() } })
    new RPC(b, (req) => {
        received.push({ command: req.command, data: req.data === null ? null : req.data.toString() })
    })
    return { client: new RPC(a, () => {}), received }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

test('request() without send() transmits nothing — the trap sendRPC fell into', async () => {
    const { client, received } = connectedPair()

    client.request(101)               // no send: what the old guard did
    client.request(102).send('')      // payload-less, sent
    await settle()

    assert.deepEqual(
        received.map((r) => r.command),
        [102],
        'a request that is never send()-ed must not reach the other endpoint',
    )
})

test('send("") delivers the command with a null body', async () => {
    const { client, received } = connectedPair()

    client.request(37).send('')
    await settle()

    assert.equal(received.length, 1)
    assert.equal(received[0].command, 37)
    // The backend reads these with parseRpcJson(req.data), whose try/catch
    // turns a null body into null rather than throwing. Pinned because
    // sendRPC now relies on it for every payload-less command.
    assert.equal(received[0].data, null)
})

test('a payload survives the round trip unchanged', async () => {
    const { client, received } = connectedPair()

    client.request(39).send(JSON.stringify({ limit: 300 }))
    await settle()

    assert.deepEqual(JSON.parse(received[0].data), { limit: 300 })
})

// The contract above is only useful if sendRPC actually honours it. Read the
// shipped source rather than a copy of it, and assert structurally (via the
// TypeScript AST, not a regex) that the send is unconditional.
test('sendRPC calls req.send() unconditionally, not behind a payload check', () => {
    const src = fs.readFileSync(path.join(APP_DIR, 'hooks', '_useWorklet.ts'), 'utf8')
    const sourceFile = ts.createSourceFile('_useWorklet.ts', src, ts.ScriptTarget.ES2020, true)

    let sendRpcBody = null
    const findDeclaration = (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'sendRPC') {
            // const sendRPC = useCallback((command, payload) => { ... }, [])
            const call = node.initializer
            if (call && ts.isCallExpression(call) && call.arguments.length > 0) {
                const fn = call.arguments[0]
                if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) sendRpcBody = fn.body
            }
        }
        ts.forEachChild(node, findDeclaration)
    }
    findDeclaration(sourceFile)
    assert.ok(sendRpcBody, 'could not locate the sendRPC callback in _useWorklet.ts')

    let sendCalls = 0
    let conditionalSendCalls = 0
    const walk = (node, insideCondition) => {
        const nowInside = insideCondition
            || ts.isIfStatement(node)
            || ts.isConditionalExpression(node)
            || ts.isBinaryExpression(node) && (
                node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
                || node.operatorToken.kind === ts.SyntaxKind.BarBarToken
            )
        if (
            ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && node.expression.name.text === 'send'
        ) {
            sendCalls += 1
            if (nowInside) conditionalSendCalls += 1
        }
        ts.forEachChild(node, (child) => walk(child, nowInside))
    }
    walk(sendRpcBody, false)

    assert.ok(sendCalls > 0, 'sendRPC must call req.send() — without it the command never leaves the device')
    assert.equal(
        conditionalSendCalls,
        0,
        'req.send() must not sit behind a condition: a skipped send is a silently dropped command',
    )
})
