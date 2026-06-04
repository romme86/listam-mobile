const LEVEL_PREFIX = /^\[(INFO|WARNING|WARN|ERROR|FATAL|AUDIT|DEBUG|TRACE)\]\s*/i
const HEX_KEY = /\b[0-9a-f]{64,}\b/gi
const Z32_BLOB = /\b[ybndrfg8ejkmcpqxot1uwisza345h769]{52,}\b/gi
const INVITE_PARAM = /([?&]invite=)[^&\s]+/gi
const SENSITIVE_KEYS = new Set([
    'key',
    'baseKey',
    'autobaseKey',
    'encryptionKey',
    'encKey',
    'invite',
    'inviteKey',
    'publicKey',
    'privateKey',
    'writerKey',
    'writerKeyHex',
    'localWriterKey',
    'peerKey',
    'peerKeys',
    'topic',
    'topicId',
    'discoveryKey',
    'userData',
    'data',
    'value',
    'payload',
    'authorization',
    'authHeader',
    'token'
].map((key) => key.toLowerCase()))

const ITEM_KEYS = ['text', 'isDone', 'timeOfCompletion']

export function redactForLog(value, depth = 0, seen = new WeakSet()) {
    if (value == null) return value
    if (depth > 4) return '[redacted-depth]'

    if (typeof value === 'string') return redactString(value)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function') return `[function:${value.name || 'anonymous'}]`

    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactString(value.message || '')
        }
    }

    if (isBytes(value)) {
        return `[bytes:${value.byteLength}]`
    }

    if (Array.isArray(value)) {
        if (value.some(isListItemShape)) return `[items:${value.length}]`
        return value.map((entry) => redactForLog(entry, depth + 1, seen))
    }

    if (typeof value === 'object') {
        if (isListItemShape(value)) return '[item]'
        if (seen.has(value)) return '[circular]'
        seen.add(value)

        const out = {}
        for (const [key, entry] of Object.entries(value)) {
            if (SENSITIVE_KEYS.has(key.toLowerCase())) {
                out[key] = '[redacted]'
            } else {
                out[key] = redactForLog(entry, depth + 1, seen)
            }
        }
        return out
    }

    return '[redacted]'
}

export function redactString(value) {
    return String(value)
        .replace(INVITE_PARAM, '$1[redacted]')
        .replace(HEX_KEY, '[redacted-hex]')
        .replace(Z32_BLOB, '[redacted-invite]')
}

export function parseLogArgs(args) {
    let level = 'info'
    let message = ''
    const details = [...args]

    if (typeof details[0] === 'string') {
        message = details.shift()
        const match = message.match(LEVEL_PREFIX)
        if (match) {
            level = match[1].toLowerCase()
            if (level === 'warning') level = 'warn'
            message = message.replace(LEVEL_PREFIX, '')
        }
    }

    return {
        ts: new Date().toISOString(),
        level,
        app: 'backend',
        message: redactString(message),
        details: details.map((entry) => redactForLog(entry))
    }
}

export const logger = {
    log(...args) {
        const row = parseLogArgs(args)
        console.error(JSON.stringify(row))
    },
    info(message, ...details) {
        logger.log(`[INFO] ${message}`, ...details)
    },
    warn(message, ...details) {
        logger.log(`[WARNING] ${message}`, ...details)
    },
    error(message, ...details) {
        logger.log(`[ERROR] ${message}`, ...details)
    }
}

function isBytes(value) {
    return typeof value?.byteLength === 'number' &&
        typeof value !== 'string' &&
        (value instanceof Uint8Array || value.constructor?.name === 'Buffer')
}

function isListItemShape(value) {
    return value &&
        typeof value === 'object' &&
        ITEM_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}
