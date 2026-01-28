import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
    initConnection,
    endConnection,
    fetchProducts,
    requestPurchase,
    getAvailablePurchases,
    finishTransaction,
    purchaseUpdatedListener,
    purchaseErrorListener,
    type Purchase,
    type PurchaseError,
    type ProductSubscription,
    type EventSubscription,
} from 'react-native-iap'

const TRIAL_START_KEY = '@lista_trial_start'
// const TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const TRIAL_DURATION_MS = 10 * 1000 // 30 days


// Product IDs - create these in App Store Connect / Google Play Console
const PRODUCT_IDS = Platform.select({
    ios: ['standard'],
    android: ['ch.saynode.listam.yearly'],
}) ?? []

export type SubscriptionState = {
    isLoading: boolean
    isSubscribed: boolean
    isTrialActive: boolean
    trialDaysRemaining: number
    product: ProductSubscription | null
    error: string | null
}

export function useSubscription() {
    const [state, setState] = useState<SubscriptionState>({
        isLoading: true,
        isSubscribed: false,
        isTrialActive: true,
        trialDaysRemaining: 30,
        product: null,
        error: null,
    })

    // Initialize IAP connection
    useEffect(() => {
        let purchaseUpdateSubscription: EventSubscription | null = null
        let purchaseErrorSubscription: EventSubscription | null = null

        const init = async () => {
            try {
                await initConnection()

                // Listen for purchase updates
                purchaseUpdateSubscription = purchaseUpdatedListener(
                    async (purchase: Purchase) => {
                        if (purchase.purchaseState === 'purchased') {
                            await finishTransaction({ purchase, isConsumable: false })
                            setState((prev) => ({
                                ...prev,
                                isSubscribed: true,
                                isLoading: false,
                            }))
                        }
                    }
                )

                purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
                    console.warn('Purchase error:', error)
                    setState((prev) => ({
                        ...prev,
                        error: error.message,
                        isLoading: false,
                    }))
                })

                // Check trial and subscription status
                await checkStatus()
            } catch (err) {
                console.warn('IAP init error:', err)
                // Still check trial status even if IAP fails
                await checkTrialStatus()
            }
        }

        init()

        return () => {
            purchaseUpdateSubscription?.remove()
            purchaseErrorSubscription?.remove()
            endConnection()
        }
    }, [])

    const checkTrialStatus = async () => {
        try {
            let trialStart = await AsyncStorage.getItem(TRIAL_START_KEY)

            if (!trialStart) {
                // First time user - start trial
                trialStart = Date.now().toString()
                await AsyncStorage.setItem(TRIAL_START_KEY, trialStart)
            }

            const trialStartTime = parseInt(trialStart, 10)
            const elapsed = Date.now() - trialStartTime
            const remaining = TRIAL_DURATION_MS - elapsed
            const daysRemaining = Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)))
            const isTrialActive = remaining > 0

            setState((prev) => ({
                ...prev,
                isTrialActive,
                trialDaysRemaining: daysRemaining,
                isLoading: false,
            }))

            return isTrialActive
        } catch (err) {
            console.warn('Trial check error:', err)
            setState((prev) => ({ ...prev, isLoading: false }))
            return true // Default to trial active on error
        }
    }

    const checkStatus = async () => {
        try {
            // Check for existing purchases
            const purchases = await getAvailablePurchases({})
            const hasActiveSubscription = purchases.some((purchase) =>
                PRODUCT_IDS.includes(purchase.productId)
            )

            if (hasActiveSubscription) {
                setState((prev) => ({
                    ...prev,
                    isSubscribed: true,
                    isLoading: false,
                }))
                return
            }

            // Get available subscription products
            const products = await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' })
            const product = (products?.[0] as ProductSubscription) ?? null

            setState((prev) => ({
                ...prev,
                product,
            }))

            // Check trial status
            await checkTrialStatus()
        } catch (err) {
            console.warn('Status check error:', err)
            await checkTrialStatus()
        }
    }

    const purchase = useCallback(async () => {
        if (!state.product) {
            setState((prev) => ({ ...prev, error: 'No subscription available' }))
            return
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }))

        try {
            const sku = state.product.id

            if (Platform.OS === 'ios') {
                await requestPurchase({
                    request: { apple: { sku } },
                    type: 'subs',
                })
            } else {
                // Android requires skus array and subscription offers
                const subscriptionOffers =
                    'subscriptionOffers' in state.product
                        ? state.product.subscriptionOffers?.map((offer) => ({
                              sku,
                              offerToken: offer.offerTokenAndroid ?? '',
                          }))
                        : undefined

                await requestPurchase({
                    request: {
                        google: {
                            skus: [sku],
                            subscriptionOffers,
                        },
                    },
                    type: 'subs',
                })
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Purchase failed'
            setState((prev) => ({
                ...prev,
                error: errorMessage,
                isLoading: false,
            }))
        }
    }, [state.product])

    const restore = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }))

        try {
            const purchases = await getAvailablePurchases({})
            const hasActiveSubscription = purchases.some((purchase) =>
                PRODUCT_IDS.includes(purchase.productId)
            )

            setState((prev) => ({
                ...prev,
                isSubscribed: hasActiveSubscription,
                isLoading: false,
                error: hasActiveSubscription ? null : 'No active subscription found',
            }))
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Restore failed'
            setState((prev) => ({
                ...prev,
                error: errorMessage,
                isLoading: false,
            }))
        }
    }, [])

    const shouldShowPaywall = !state.isLoading && !state.isSubscribed && !state.isTrialActive

    return {
        ...state,
        shouldShowPaywall,
        purchase,
        restore,
        refresh: checkStatus,
    }
}
