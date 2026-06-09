import RPC from 'bare-rpc'
import URL from 'bare-url'
import { join } from 'bare-path'
import fs from 'bare-fs'

export function createBareKitPlatform({ Bare, BareKit }) {
    if (!BareKit?.IPC) throw new Error('BareKit IPC is required')
    return {
        argv: Array.isArray(Bare?.argv) ? Bare.argv : [],
        fs,
        join,
        fileURLToPath: URL.fileURLToPath,
        createRpc(handler) {
            return new RPC(BareKit.IPC, handler)
        },
        onTeardown(handler) {
            Bare?.on?.('teardown', handler)
        },
    }
}
