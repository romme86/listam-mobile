import {
    LEGACY_LOYALTY_CARDS_KEY,
    LEGACY_SECRET_FILES,
    LOYALTY_CARD_HANDLES_KEY,
    HEX_SECRET_BYTES,
    SECRET_STORE_KEY_PREFIX,
    loyaltyCardPayloadRef,
    loyaltyCardPayloadStoreKey,
    parseLoyaltyCardHandleList,
    parseLoyaltyCardPayloadList,
} from '@listam/secrets'

// SecureStore does not offer key enumeration, so a full device reset must build
// the exact key set from the fixed backend keys and the persisted loyalty-card
// manifest before AsyncStorage is cleared.
export const CORE_LOCAL_SECRET_KEYS = Object.freeze([
    ...Object.keys(HEX_SECRET_BYTES).map((name) => `${SECRET_STORE_KEY_PREFIX}${name}`),
])

export function localSecretKeys(handlesRaw: string | null, legacyCardsRaw: string | null): string[] {
    const keys = new Set<string>(CORE_LOCAL_SECRET_KEYS)

    for (const handle of parseLoyaltyCardHandleList(handlesRaw)) {
        const key = loyaltyCardPayloadStoreKey(handle.payloadRef)
        if (key) keys.add(key)
    }

    // Include any pre-migration cards as well. They may already have been copied
    // into SecureStore even if the handles write was interrupted.
    for (const card of parseLoyaltyCardPayloadList(legacyCardsRaw)) {
        const key = loyaltyCardPayloadStoreKey(loyaltyCardPayloadRef(card.id))
        if (key) keys.add(key)
    }

    return [...keys]
}

export function localDataDocumentUris(baseDirUri: string): string[] {
    if (!baseDirUri) return []
    const root = baseDirUri.endsWith('/') ? baseDirUri : `${baseDirUri}/`
    return [
        `${root}lista`,
        `${root}lista.lock`,
        ...Object.values(LEGACY_SECRET_FILES).map((filename) => `${root}${filename}`),
    ]
}

export const LOCAL_DATA_MANIFEST_KEYS = {
    loyaltyCardHandles: LOYALTY_CARD_HANDLES_KEY,
    legacyLoyaltyCards: LEGACY_LOYALTY_CARDS_KEY,
} as const

// Purchase/trial eligibility is commercial state, not user content. Keeping it
// prevents a local-data reset from starting a new trial or bypassing a deferred
// paywall. App Store entitlements themselves live outside AsyncStorage.
export const PRESERVED_LOCAL_STORAGE_KEYS = Object.freeze([
    '@lista_trial_start',
    '@lista_paywall_dismiss_count',
    '@lista_paywall_defer_until',
])

export function localStorageKeysToDelete(allKeys: readonly string[]): string[] {
    const preserved = new Set<string>(PRESERVED_LOCAL_STORAGE_KEYS)
    return allKeys.filter((key) => !preserved.has(key))
}
