import fs from 'bare-fs'


export function saveAutobaseKey(key, keyFilePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(keyFilePath, keyHex)
        console.error('[INFO] Saved autobase key to file:', keyHex)
    } catch (e) {
        console.error('[ERROR] Failed to save autobase key:', e)
    }
}

// Load autobase key from file if it exists
export function loadAutobaseKey(keyFilePath) {
    try {
        if (fs.existsSync(keyFilePath)) {
            const keyHex = fs.readFileSync(keyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                console.error('[INFO] Loaded autobase key from file:', keyHex)
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        console.error('[ERROR] Failed to load autobase key:', e)
    }
    return null
}

// Save local writer key to file for persistence
export function saveLocalWriterKey(key, localWriterKeyFilePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(localWriterKeyFilePath, keyHex)
        console.error('[INFO] Saved local writer key to file:', keyHex)
    } catch (e) {
        console.error('[ERROR] Failed to save local writer key:', e)
    }
}

// Load local writer key from file if it exists
export function loadLocalWriterKey(localWriterKeyFilePath) {
    try {
        if (fs.existsSync(localWriterKeyFilePath)) {
            const keyHex = fs.readFileSync(localWriterKeyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                console.error('[INFO] Loaded local writer key from file:', keyHex)
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        console.error('[ERROR] Failed to load local writer key:', e)
    }
    return null
}

// Save encryption key (hex-encoded 32-byte buffer)
export function saveEncryptionKey(key, filePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(filePath, keyHex)
        console.error('[INFO] Saved encryption key to file')
    } catch (e) {
        console.error('[ERROR] Failed to save encryption key:', e)
    }
}

// Load encryption key from file if it exists
export function loadEncryptionKey(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const keyHex = fs.readFileSync(filePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                console.error('[INFO] Loaded encryption key from file')
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        console.error('[ERROR] Failed to load encryption key:', e)
    }
    return null
}

// Save invite to file (JSON with hex-encoded buffers)
export function saveInvite(invite, filePath) {
    try {
        const serialized = {
            id: invite.id.toString('hex'),
            invite: invite.invite.toString('hex'),
            publicKey: invite.publicKey.toString('hex'),
            expires: invite.expires || 0
        }
        fs.writeFileSync(filePath, JSON.stringify(serialized))
        console.error('[INFO] Saved invite to file')
    } catch (e) {
        console.error('[ERROR] Failed to save invite:', e)
    }
}

// Load invite from file if it exists
export function loadInvite(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
            return {
                id: Buffer.from(data.id, 'hex'),
                invite: Buffer.from(data.invite, 'hex'),
                publicKey: Buffer.from(data.publicKey, 'hex'),
                expires: data.expires || 0
            }
        }
    } catch (e) {
        console.error('[ERROR] Failed to load invite:', e)
    }
    return null
}

// Delete invite file
export function deleteInvite(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            console.error('[INFO] Deleted invite file')
        }
    } catch (e) {
        console.error('[ERROR] Failed to delete invite:', e)
    }
}
