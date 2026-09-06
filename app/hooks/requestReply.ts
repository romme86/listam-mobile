// bare-rpc 0.2.x retains completed non-stream requests and has no cancellation
// API. Keep this compatibility cleanup in one adapter; late replies are ignored
// by bare-rpc after the id is removed. Only use it for non-stream requests.
export async function awaitRpcReply(request: any, timeoutMs?: number): Promise<any> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const reply = request.reply()
        if (timeoutMs === undefined) return await reply
        return await Promise.race([
            reply,
            new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs) }),
        ])
    } finally {
        if (timer) clearTimeout(timer)
        request.rpc?._outgoingRequests?.delete(request.id)
    }
}
