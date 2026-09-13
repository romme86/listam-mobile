import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const compiled = compile('./useSubscription.ts')
const policy = {}, schedule = {}
new Function('exports', compile('../monetization.ts'))(policy)
new Function('exports', compile('../paywallSchedule.ts'))(schedule)
const tick = () => new Promise((resolve) => setImmediate(resolve))
const DAY = 86_400_000
const products = {
    ios: [
        { id: 'standard.yearly.nonrenewing', platform: 'ios', type: 'in-app', displayPrice: 'CHF 1.00' },
        { id: 'standard', platform: 'ios', type: 'subs', displayPrice: 'CHF 1.00' },
    ],
    android: [{
        id: 'ch.saynode.listam.yearly', platform: 'android', type: 'subs',
        subscriptionOffers: [
            { basePlanIdAndroid: 'yearly-prepaid', displayPrice: '$0.99', offerTokenAndroid: 'prepaid-token' },
            { basePlanIdAndroid: 'yearly-auto', displayPrice: '$0.99', offerTokenAndroid: 'auto-token' },
        ],
    }],
}

// Execute the real hook against native billing/storage adapters. Re-rendering
// preserves React state/refs and reruns effects only when dependencies change.
function harness(platform, options = {}) {
    let now = Date.now(), cursor = 0, hook
    const slots = [], effects = [], timers = new Set(), requests = [], finished = []
    const listeners = {}
    const storage = new Map([
        ['@lista_trial_start', String(now - (options.trialAgeDays ?? 60) * DAY)],
        ['@lista_paywall_dismiss_count', '2'],
        ['@lista_paywall_defer_until', String(now + (options.deferredDays ?? -1) * DAY)],
    ])
    const react = {
        useState(initial) {
            const index = cursor++
            if (!(index in slots)) slots[index] = initial
            return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
        },
        useRef(initial) {
            const index = cursor++
            return slots[index] ??= { current: initial }
        },
        useCallback: (fn) => fn,
        useEffect(fn, deps) {
            const index = cursor++, previous = slots[index]
            if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
            effects.push(() => {
                previous?.cleanup?.()
                slots[index] = { deps, cleanup: fn() }
            })
        },
    }
    const modules = {
        react,
        'react-native': { Platform: { OS: platform, select: (values) => values[platform] } },
        '@react-native-async-storage/async-storage': { default: {
            multiGet: async (keys) => keys.map((key) => [key, storage.get(key) ?? null]),
            setItem: async (key, value) => { storage.set(key, value) },
            multiSet: async (values) => { for (const [key, value] of values) storage.set(key, value) },
        } },
        'react-native-iap': {
            ErrorCode: { UserCancelled: 'user-cancelled' },
            initConnection: async () => { if (options.initError) throw options.initError },
            endConnection: async () => {},
            fetchProducts: async () => {
                if (options.catalogError) throw options.catalogError
                return options.products ?? products[platform]
            },
            getAvailablePurchases: async () => options.purchases ?? [],
            requestPurchase: async (request) => {
                requests.push(request)
                if (options.requestError) throw options.requestError
            },
            finishTransaction: async (transaction) => {
                if (options.finishError) throw options.finishError
                finished.push(transaction)
            },
            purchaseUpdatedListener: (fn) => { listeners.updated = fn; return { remove() {} } },
            purchaseErrorListener: (fn) => { listeners.error = fn; return { remove() {} } },
        },
        '../i18n': { useI18n: () => ({ t: (key) => key }) },
        '../logger': { appLogger: { warn() {} } },
        '../paywallSchedule': schedule,
        '../monetization': options.enabled === undefined ? policy : { PAYWALL_ENABLED: options.enabled },
    }
    const exports = {}
    new Function('require', 'exports', 'Date', 'setTimeout', 'clearTimeout', compiled)(
        (name) => {
            assert.ok(modules[name], `unexpected import: ${name}`)
            return modules[name]
        },
        exports,
        class extends Date { static now() { return now } },
        (fn) => { timers.add(fn); return fn },
        (fn) => timers.delete(fn),
    )
    const render = () => {
        cursor = 0
        hook = exports.useSubscription()
        effects.splice(0).forEach((run) => run())
        return hook
    }
    render()
    return {
        render, requests, finished, storage, listeners,
        async ready() { await tick(); return render() },
        advance(days) {
            now += days * DAY
            const pending = [...timers]
            timers.clear()
            pending.forEach((run) => run())
            return render()
        },
    }
}

for (const platform of ['ios', 'android']) {
    const productId = platform === 'ios' ? 'standard' : 'ch.saynode.listam.yearly'

    test(`${platform}: current builds never gate expired trials or expired deferrals`, async () => {
        for (const options of [{}, { trialAgeDays: 0 }, { deferredDays: 1 }, { initError: new Error('offline') }, { catalogError: new Error('store unavailable') }]) {
            const h = harness(platform, options)
            assert.equal(h.render().shouldShowPaywall, false)
            const ready = await h.ready()
            assert.equal(ready.paywallEnabled, false)
            assert.equal(ready.shouldShowPaywall, false)
            assert.equal(ready.isSubscribed, false, 'free access must not fake store entitlements')
            assert.equal(h.advance(365).shouldShowPaywall, false)
        }
    })

    test(`${platform}: one switch restores trial eligibility and stored deferrals`, async () => {
        assert.equal((await harness(platform, { enabled: true }).ready()).shouldShowPaywall, true)
        assert.equal((await harness(platform, { enabled: true, trialAgeDays: 0 }).ready()).shouldShowPaywall, false)
        const h = harness(platform, { enabled: true, deferredDays: 1 })
        assert.equal((await h.ready()).shouldShowPaywall, false)
        assert.equal(h.advance(2).shouldShowPaywall, true)
    })

    test(`${platform}: Donate requests only the standard yearly purchase and prevents double taps`, async () => {
        const h = harness(platform)
        await h.ready()
        // A previous paywall selection must not change what Donate buys.
        h.render().selectPlan(platform === 'ios' ? 'standard.yearly.nonrenewing' : 'yearly-prepaid')
        const hook = h.render()
        await Promise.all([hook.donate(), hook.donate()])
        assert.equal(h.requests.length, 1)
        assert.deepEqual(h.requests[0], platform === 'ios'
            ? { request: { apple: { sku: 'standard' } }, type: 'subs' }
            : { request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken: 'auto-token' }] } }, type: 'subs' })
        assert.equal(h.render().shouldShowPaywall, false)
        await h.listeners.updated({ productId, purchaseState: 'purchased' })
        assert.equal(h.finished.length, 1)
        assert.equal(h.finished[0].isConsumable, false)
        assert.equal(h.render().isSubscribed, true)
        assert.equal(h.render().isLoading, false)
        assert.equal(h.render().error, null)
        await h.render().donate()
        assert.equal(h.requests.length, 1)
    })

    test(`${platform}: cancellation and store errors leave donation retryable and the app accessible`, async () => {
        const h = harness(platform)
        await h.ready()
        await h.render().donate()
        h.listeners.error({ code: 'user-cancelled', message: 'Cancelled' })
        assert.equal(h.render().isLoading, false)
        assert.equal(h.render().error, null)
        await h.render().donate()
        h.listeners.error({ code: 'network-error', message: 'Store unavailable' })
        assert.equal(h.render().error, 'Store unavailable')
        assert.equal(h.render().isLoading, false)
        assert.equal(h.render().shouldShowPaywall, false)
        await h.render().donate()
        assert.equal(h.requests.length, 3)
        assert.equal(h.render().error, null)
    })

    test(`${platform}: a rejected purchase request also releases the donation button`, async () => {
        for (const requestError of [new Error('Request failed'), Object.assign(new Error('Cancelled'), { code: 'user-cancelled' })]) {
            const h = harness(platform, { requestError })
            await h.ready()
            await h.render().donate()
            assert.equal(h.render().isLoading, false)
            assert.equal(h.render().error, requestError.code ? null : 'Request failed')
            assert.equal(h.render().shouldShowPaywall, false)
            await h.render().donate()
            assert.equal(h.requests.length, 2)
        }
    })

    test(`${platform}: missing products cannot purchase a prepaid fallback`, async () => {
        const prepaidOnly = platform === 'ios'
            ? [products.ios[0]]
            : [{ ...products.android[0], subscriptionOffers: [products.android[0].subscriptionOffers[0]] }]
        const h = harness(platform, { products: prepaidOnly })
        await h.ready()
        await h.render().donate()
        assert.equal(h.requests.length, 0)
        assert.equal(h.render().error, 'donation.unavailable')
        assert.equal(h.render().shouldShowPaywall, false)
    })

    test(`${platform}: restored supporters do not start another subscription`, async () => {
        const h = harness(platform, { purchases: [{ productId, purchaseState: 'purchased' }] })
        const hook = await h.ready()
        assert.equal(hook.isSubscribed, true)
        await hook.donate()
        assert.equal(h.requests.length, 0)
        assert.equal(h.render().shouldShowPaywall, false)
    })

    test(`${platform}: transaction acknowledgement errors stay visible without blocking app access`, async () => {
        const h = harness(platform, { finishError: new Error('Acknowledgement failed') })
        await h.ready()
        await h.render().donate()
        await h.listeners.updated({ productId, purchaseState: 'purchased' })
        assert.equal(h.render().isLoading, false)
        assert.equal(h.render().isSubscribed, false)
        assert.equal(h.render().error, 'paywall.purchaseFailed')
        assert.equal(h.render().shouldShowPaywall, false)
    })
}
