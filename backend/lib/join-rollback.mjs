export function createJoinRollbackSnapshot({ currentList, baseKey, encryptionKey }) {
    return {
        previousList: Array.isArray(currentList) ? [...currentList] : [],
        previousBaseKey: cloneBuffer(baseKey),
        previousEncryptionKey: cloneBuffer(encryptionKey),
    }
}

export async function restoreJoinRollbackSnapshot(snapshot, {
    rpc,
    syncListCommand,
    setEncryptionKey,
    initAutobase,
}) {
    if (!snapshot) return false

    if (rpc && snapshot.previousList.length > 0) {
        const syncReq = rpc.request(syncListCommand)
        syncReq.send(JSON.stringify(snapshot.previousList))
    }

    if (!snapshot.previousBaseKey) return false

    setEncryptionKey(snapshot.previousEncryptionKey)
    await initAutobase(snapshot.previousBaseKey)
    return true
}

function cloneBuffer(value) {
    if (!value) return null
    return Buffer.from(value)
}
