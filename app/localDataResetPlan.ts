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

// Every backend on-disk artifact is named `lista`, or `lista` + a separator.
// Matching the family rather than listing members is deliberate: the backend
// derives sibling paths from its storage root at runtime (`${storagePath}-local`
// for the personal Corestore, `${storagePath}-healed-orphans.json`, and
// `.quarantine-<stamp>` copies from storage recovery), and a fixed list silently
// falls behind the next one that is added. The separator class keeps unrelated
// app files (and anything merely starting with "lista") out of a destructive
// sweep.
export const LISTAM_DATA_ENTRY_PATTERN = /^lista($|[-.])/

// Deleted whether or not the directory listing is available, so a reset still
// clears the known roots when enumeration fails. `lista-local` belongs here
// above all: it is the Corestore holding the personal base, and while it
// survived, a reset only cleared the storage root beside it — so the backend
// rebooted straight back into the project (Autobase re-adopts the base key and
// encryption key from that store's local-core user data, keychain or not),
// re-joining every shared list from the credentials the personal base carries.
export const CORE_LOCAL_DATA_ENTRIES = Object.freeze([
    'lista',                        // storage root: shared list bases, auto-backups, outbox
    'lista-local',                  // personal base Corestore — the project database itself
    'lista.lock',                   // storage lease
    'lista-healed-orphans.json',    // orphan-heal bookkeeping, written beside the root
    ...Object.values(LEGACY_SECRET_FILES),
])

// Entry names come from a directory listing, so they are plain names — but this
// feeds a recursive delete, so reject anything that could climb out of the app
// data root rather than trusting that.
export function listamDataEntryNames(entryNames: readonly string[]): string[] {
    return entryNames.filter((name) => (
        typeof name === 'string' &&
        !name.includes('/') &&
        !name.includes('\\') &&
        LISTAM_DATA_ENTRY_PATTERN.test(name)
    ))
}

export function localDataDocumentUris(baseDirUri: string, entryNames: readonly string[] = []): string[] {
    if (!baseDirUri) return []
    const root = baseDirUri.endsWith('/') ? baseDirUri : `${baseDirUri}/`
    const names = new Set<string>(CORE_LOCAL_DATA_ENTRIES)
    for (const name of listamDataEntryNames(entryNames)) names.add(name)
    return [...names].map((name) => `${root}${name}`)
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
