import fs from 'bare-fs'
import { logger } from './logger.mjs'
import {
    getBootSecretBuffer,
    persistBackendSecret,
    secretFingerprint,
} from './secrets.mjs'


export function saveAutobaseKey(key, keyFilePath) {
    if (persistBackendSecret('autobaseKey', key)) {
        logger.log('[INFO] Saved autobase key through secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
}

// Load autobase key from the platform adapter boot payload.
export function loadAutobaseKey(bootSecrets) {
    const key = getBootSecretBuffer(bootSecrets, 'autobaseKey')
    if (key) {
        logger.log('[INFO] Loaded autobase key from secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
    return key
}

// Save local writer key through the platform adapter for future migrations.
export function saveLocalWriterKey(key, localWriterKeyFilePath) {
    if (persistBackendSecret('localWriterKey', key)) {
        logger.log('[INFO] Saved local writer key through secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
}

// Load local writer key from the platform adapter boot payload if supplied.
export function loadLocalWriterKey(bootSecrets) {
    const key = getBootSecretBuffer(bootSecrets, 'localWriterKey')
    if (key) {
        logger.log('[INFO] Loaded local writer key from secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
    return key
}

// Save encryption key through the platform adapter.
export function saveEncryptionKey(key, filePath) {
    if (persistBackendSecret('encryptionKey', key)) {
        logger.log('[INFO] Saved encryption key through secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
}

// Load encryption key from the platform adapter boot payload.
export function loadEncryptionKey(bootSecrets) {
    const key = getBootSecretBuffer(bootSecrets, 'encryptionKey')
    if (key) {
        logger.log('[INFO] Loaded encryption key from secure adapter', {
            fingerprint: secretFingerprint(key.toString('hex')),
        })
    }
    return key
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
