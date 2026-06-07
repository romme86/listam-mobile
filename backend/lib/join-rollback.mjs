export function createJoinRollbackSnapshot({ currentList, baseKey, encryptionKey, ownerAuthorityKeyPair }) {
    return {
        previousList: Array.isArray(currentList) ? [...currentList] : [],
        previousBaseKey: cloneBuffer(baseKey),
        previousEncryptionKey: cloneBuffer(encryptionKey),
        previousOwnerAuthorityKeyPair: cloneOwnerAuthorityKeyPair(ownerAuthorityKeyPair),
    }
}

export async function restoreJoinRollbackSnapshot(snapshot, {
    rpc,
    syncListCommand,
    setEncryptionKey,
    setOwnerAuthorityKeyPair,
    saveOwnerAuthorityKey,
    deleteOwnerAuthorityKey,
    initAutobase,
}) {
    if (!snapshot) return false

    if (rpc && snapshot.previousList.length > 0) {
        const syncReq = rpc.request(syncListCommand)
        syncReq.send(JSON.stringify(snapshot.previousList))
    }

    if (!snapshot.previousBaseKey) return false

    setEncryptionKey(snapshot.previousEncryptionKey)
    if (setOwnerAuthorityKeyPair) {
        setOwnerAuthorityKeyPair(snapshot.previousOwnerAuthorityKeyPair)
    }
    if (snapshot.previousOwnerAuthorityKeyPair?.secretKey && saveOwnerAuthorityKey) {
        await saveOwnerAuthorityKey(snapshot.previousOwnerAuthorityKeyPair.secretKey)
    } else if (!snapshot.previousOwnerAuthorityKeyPair && deleteOwnerAuthorityKey) {
        await deleteOwnerAuthorityKey()
    }
    await initAutobase(snapshot.previousBaseKey)
    return true
}

function cloneBuffer(value) {
    if (!value) return null
    return Buffer.from(value)
}

function cloneOwnerAuthorityKeyPair(keyPair) {
    if (!keyPair) return null
    return {
        publicKey: cloneBuffer(keyPair.publicKey),
        secretKey: cloneBuffer(keyPair.secretKey),
    }
}
