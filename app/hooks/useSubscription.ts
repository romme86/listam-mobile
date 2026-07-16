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
    type ProductOrSubscription,
    type EventSubscription,
} from 'react-native-iap'
import { useI18n } from '../i18n'
import { appLogger } from '../logger'

const TRIAL_START_KEY = '@lista_trial_start'
const TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days


// Store catalog expected by the paywall:
// - App Store Connect: `standard` is auto-renewing and
//   `standard.yearly.nonrenewing` is a non-renewing subscription.
// - Play Console: the existing subscription has `yearly-auto` (auto-renewing)
//   and `yearly-prepaid` (prepaid) base plans.
const IOS_RECURRING_ID = 'standard'
const IOS_PREPAID_ID = 'standard.yearly.nonrenewing'
const ANDROID_PRODUCT_ID = 'ch.saynode.listam.yearly'
const ANDROID_PREPAID_BASE_PLAN_ID = 'yearly-prepaid'

const PRODUCT_IDS = Platform.select({
    ios: [IOS_RECURRING_ID, IOS_PREPAID_ID],
    android: ['ch.saynode.listam.yearly'],
}) ?? []

export type PaymentPlan = {
    id: string
    productId: string
    kind: 'recurring' | 'prepaid'
    displayPrice: string
    productType: 'in-app' | 'subs'
    offerToken?: string
}

export type SubscriptionState = {
    isLoading: boolean
    isSubscribed: boolean
    isTrialActive: boolean
    trialDaysRemaining: number
    plans: PaymentPlan[]
    selectedPlanId: string | null
    error: string | null
    isPaywallDismissed: boolean
}

function plansFromProducts(products: ProductOrSubscription[]): PaymentPlan[] {
    if (Platform.OS === 'ios') {
        return products
            .filter((product) => PRODUCT_IDS.includes(product.id))
            .map((product) => ({
                id: product.id,
                productId: product.id,
                kind: product.id === IOS_PREPAID_ID ? 'prepaid' as const : 'recurring' as const,
                displayPrice: product.displayPrice,
                productType: product.type,
            }))
            .sort((a) => a.kind === 'recurring' ? -1 : 1)
    }

    const product = products.find((item) => item.id === ANDROID_PRODUCT_ID && item.type === 'subs')
    if (!product || product.type !== 'subs' || product.platform !== 'android') return []
    return product.subscriptionOffers.map((offer) => {
        const basePlanId = offer.basePlanIdAndroid ?? offer.id
        const tags = offer.offerTagsAndroid ?? []
        const prepaid = basePlanId === ANDROID_PREPAID_BASE_PLAN_ID || tags.includes('prepaid')
        return {
            id: basePlanId,
            productId: product.id,
            kind: prepaid ? 'prepaid' as const : 'recurring' as const,
            displayPrice: offer.displayPrice,
            productType: 'subs' as const,
            offerToken: offer.offerTokenAndroid ?? undefined,
        }
    }).sort((a) => a.kind === 'recurring' ? -1 : 1)
}

function hasActiveEntitlement(purchases: Purchase[]) {
    const now = Date.now()
    return purchases.some((purchase) => {
        if (!PRODUCT_IDS.includes(purchase.productId) || purchase.purchaseState !== 'purchased') return false
        if ('isSuspendedAndroid' in purchase && purchase.isSuspendedAndroid) return false
        if ('expirationDateIOS' in purchase && purchase.expirationDateIOS && purchase.expirationDateIOS <= now) return false
        return true
    })
}

export function useSubscription() {
    const i18n = useI18n()
    const [state, setState] = useState<SubscriptionState>({
        isLoading: true,
        isSubscribed: false,
        isTrialActive: true,
        trialDaysRemaining: 30,
        plans: [],
        selectedPlanId: null,
        error: null,
        isPaywallDismissed: false,
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
                    appLogger.warn('Purchase error', error)
                    setState((prev) => ({
                        ...prev,
                        error: error.message,
                        isLoading: false,
                    }))
                })

                // Check trial and subscription status
                await checkStatus()
            } catch (err) {
                appLogger.warn('IAP init error', err)
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
            appLogger.warn('Trial check error', err)
            setState((prev) => ({ ...prev, isLoading: false }))
            return true // Default to trial active on error
        }
    }

    const checkStatus = async () => {
        try {
            // Check for existing purchases
            const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })
            const hasActiveSubscription = hasActiveEntitlement(purchases)

            if (hasActiveSubscription) {
                setState((prev) => ({
                    ...prev,
                    isSubscribed: true,
                    isLoading: false,
                }))
                return
            }

            // `all` is required because Apple's non-renewing subscription is an
            // IAP product while the recurring option is a subscription product.
            const products = await fetchProducts({ skus: PRODUCT_IDS, type: 'all' })
            const plans = plansFromProducts((products ?? []) as ProductOrSubscription[])

            setState((prev) => ({
                ...prev,
                plans,
                selectedPlanId: prev.selectedPlanId && plans.some((plan) => plan.id === prev.selectedPlanId)
                    ? prev.selectedPlanId
                    : plans[0]?.id ?? null,
            }))

            // Check trial status
            await checkTrialStatus()
        } catch (err) {
            appLogger.warn('Status check error', err)
            await checkTrialStatus()
        }
    }

    const purchase = useCallback(async (planId?: string) => {
        const plan = state.plans.find((candidate) => candidate.id === (planId ?? state.selectedPlanId))
        if (!plan) {
            setState((prev) => ({ ...prev, error: i18n.t('paywall.noSubscriptionAvailable') }))
            return
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }))

        try {
            const sku = plan.productId

            if (Platform.OS === 'ios') {
                await requestPurchase({
                    request: { apple: { sku } },
                    type: plan.productType,
                })
            } else {
                await requestPurchase({
                    request: {
                        google: {
                            skus: [sku],
                            subscriptionOffers: plan.offerToken ? [{ sku, offerToken: plan.offerToken }] : undefined,
                        },
                    },
                    type: 'subs',
                })
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : i18n.t('paywall.purchaseFailed')
            setState((prev) => ({
                ...prev,
                error: errorMessage,
                isLoading: false,
            }))
        }
    }, [i18n, state.plans, state.selectedPlanId])

    const restore = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }))

        try {
            const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })
            const hasActiveSubscription = hasActiveEntitlement(purchases)

            setState((prev) => ({
                ...prev,
                isSubscribed: hasActiveSubscription,
                isLoading: false,
                error: hasActiveSubscription ? null : i18n.t('paywall.noActiveSubscription'),
            }))
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : i18n.t('paywall.restoreFailed')
            setState((prev) => ({
                ...prev,
                error: errorMessage,
                isLoading: false,
            }))
        }
    }, [i18n])

    const selectPlan = useCallback((planId: string) => {
        setState((prev) => ({ ...prev, selectedPlanId: planId, error: null }))
    }, [])

    const dismissPaywall = useCallback(() => {
        setState((prev) => ({ ...prev, isPaywallDismissed: true, error: null }))
    }, [])

    const shouldShowPaywall = !state.isLoading && !state.isSubscribed && !state.isTrialActive && !state.isPaywallDismissed

    return {
        ...state,
        shouldShowPaywall,
        purchase,
        selectPlan,
        dismissPaywall,
        restore,
        refresh: checkStatus,
    }
}
