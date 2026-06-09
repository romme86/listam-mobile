import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import {
    deleteAsync,
    getInfoAsync,
    readAsStringAsync,
} from 'expo-file-system/legacy'
import {
    LEGACY_SECRET_FILES,
    deleteLoyaltyCardPayload as deleteSharedLoyaltyCardPayload,
    prepareBackendSecrets,
    prepareLoyaltyCardPayloads as prepareSharedLoyaltyCardPayloads,
    persistLoyaltyCardPayload as persistSharedLoyaltyCardPayload,
    persistBackendSecretRequest,
    readLoyaltyCardPayload as readSharedLoyaltyCardPayload,
    type LegacySecretFiles,
    type LoyaltyCardHandle,
    type LoyaltyCardPayload,
    type MemorySecretStore,
    type SecretName,
    type SecureSecretStore,
} from '@listam/secrets'

const KEYCHAIN_SERVICE = 'listam.secrets.v1'

const secureStoreOptions: SecureStore.SecureStoreOptions = {
    keychainService: KEYCHAIN_SERVICE,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
}

const sessionSecrets = new Map<SecretName, string>()

const memoryStore: MemorySecretStore = {
    get(name) {
        return sessionSecrets.get(name) ?? null
    },
    set(name, value) {
        sessionSecrets.set(name, value)
    },
    delete(name) {
        sessionSecrets.delete(name)
    },
    snapshot() {
        return Object.fromEntries(sessionSecrets.entries()) as Partial<Record<SecretName, string>>
    },
}

const secureStore: SecureSecretStore = {
    isAvailable() {
        return SecureStore.isAvailableAsync()
    },
    getItem(key) {
        return SecureStore.getItemAsync(key, secureStoreOptions)
    },
    setItem(key, value) {
        return SecureStore.setItemAsync(key, value, secureStoreOptions)
    },
    deleteItem(key) {
        return SecureStore.deleteItemAsync(key, secureStoreOptions)
    },
}

const metadataStore = {
    setItem(key: string, value: string) {
        return AsyncStorage.setItem(key, value)
    },
}

const asyncStorageStore = {
    getItem(key: string) {
        return AsyncStorage.getItem(key)
    },
    setItem(key: string, value: string) {
        return AsyncStorage.setItem(key, value)
    },
    removeItem(key: string) {
        return AsyncStorage.removeItem(key)
    },
}

export function createLegacySecretFileAdapter(baseDirUri: string): LegacySecretFiles {
    return {
        async readFile(filename) {
            const uri = legacyFileUri(baseDirUri, filename)
            if (!uri) return null
            const info = await getInfoAsync(uri)
            if (!info.exists) return null
            return readAsStringAsync(uri)
        },
        async deleteFile(filename) {
            const uri = legacyFileUri(baseDirUri, filename)
            if (!uri) return
            const info = await getInfoAsync(uri)
            if (info.exists) await deleteAsync(uri, { idempotent: true })
        },
    }
}

export async function prepareBackendSecretPayload(baseDirUri: string) {
    return prepareBackendSecrets({
        secureStore,
        legacyFiles: createLegacySecretFileAdapter(baseDirUri),
        metadataStore,
        memoryStore,
    })
}

export function persistBackendSecretFromPayload(rawPayload: string) {
    return persistBackendSecretRequest(rawPayload, {
        secureStore,
        metadataStore,
        memoryStore,
    })
}

export function prepareLoyaltyCards() {
    return prepareSharedLoyaltyCardPayloads({
        secureStore,
        handleStore: asyncStorageStore,
        legacyStore: asyncStorageStore,
        metadataStore,
    })
}

export function persistLoyaltyCard(card: LoyaltyCardPayload) {
    return persistSharedLoyaltyCardPayload(card, {
        secureStore,
        handleStore: asyncStorageStore,
        legacyStore: asyncStorageStore,
        metadataStore,
    })
}

export function readLoyaltyCard(card: LoyaltyCardHandle | string) {
    return readSharedLoyaltyCardPayload(card, {
        secureStore,
        legacyStore: asyncStorageStore,
    })
}

export function deleteLoyaltyCard(card: LoyaltyCardHandle | string) {
    return deleteSharedLoyaltyCardPayload(card, {
        secureStore,
        handleStore: asyncStorageStore,
        legacyStore: asyncStorageStore,
        metadataStore,
    })
}

function legacyFileUri(baseDirUri: string, filename: string): string {
    if (!baseDirUri) return ''
    const root = baseDirUri.endsWith('/') ? baseDirUri : `${baseDirUri}/`
    return `${root}${filename}`
}

export { LEGACY_SECRET_FILES }
export type { LoyaltyCardHandle, LoyaltyCardPayload }
