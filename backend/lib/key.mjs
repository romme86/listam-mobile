import fs from 'bare-fs'
import { logger } from './logger.mjs'


export function saveAutobaseKey(key, keyFilePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(keyFilePath, keyHex)
        logger.log('[INFO] Saved autobase key to file')
    } catch (e) {
        logger.log('[ERROR] Failed to save autobase key:', e)
    }
}

// Load autobase key from file if it exists
export function loadAutobaseKey(keyFilePath) {
    try {
        if (fs.existsSync(keyFilePath)) {
            const keyHex = fs.readFileSync(keyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                logger.log('[INFO] Loaded autobase key from file')
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        logger.log('[ERROR] Failed to load autobase key:', e)
    }
    return null
}

// Save local writer key to file for persistence
export function saveLocalWriterKey(key, localWriterKeyFilePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(localWriterKeyFilePath, keyHex)
        logger.log('[INFO] Saved local writer key to file')
    } catch (e) {
        logger.log('[ERROR] Failed to save local writer key:', e)
    }
}

// Load local writer key from file if it exists
export function loadLocalWriterKey(localWriterKeyFilePath) {
    try {
        if (fs.existsSync(localWriterKeyFilePath)) {
            const keyHex = fs.readFileSync(localWriterKeyFilePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                logger.log('[INFO] Loaded local writer key from file')
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        logger.log('[ERROR] Failed to load local writer key:', e)
    }
    return null
}

// Save encryption key (hex-encoded 32-byte buffer)
export function saveEncryptionKey(key, filePath) {
    try {
        const keyHex = key.toString('hex')
        fs.writeFileSync(filePath, keyHex)
        logger.log('[INFO] Saved encryption key to file')
    } catch (e) {
        logger.log('[ERROR] Failed to save encryption key:', e)
    }
}

// Load encryption key from file if it exists
export function loadEncryptionKey(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const keyHex = fs.readFileSync(filePath, 'utf8').trim()
            if (keyHex && keyHex.length === 64) {
                logger.log('[INFO] Loaded encryption key from file')
                return Buffer.from(keyHex, 'hex')
            }
        }
    } catch (e) {
        logger.log('[ERROR] Failed to load encryption key:', e)
    }
    return null
}

// Remove stale invite files from the old plaintext invite-persistence path.
export function deleteLegacyInviteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            logger.log('[INFO] Deleted legacy invite file')
        }
    } catch (e) {
        logger.log('[ERROR] Failed to delete legacy invite file:', e)
    }
}
