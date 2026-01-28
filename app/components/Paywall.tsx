import React from 'react'
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Platform,
    Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { SubscriptionState } from '../hooks/useSubscription'

type PaywallProps = {
    state: SubscriptionState
    onPurchase: () => void
    onRestore: () => void
}

export function Paywall({ state, onPurchase, onRestore }: PaywallProps) {
    const price = Platform.select({
        ios: 'CHF 1.00',
        android: '$0.99',
    }) ?? '$0.99'

    const openPrivacyPolicy = () => {
        Linking.openURL('https://saynode.ch/privacy')
    }

    const openTerms = () => {
        Linking.openURL('https://saynode.ch/terms')
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.emoji}>{"<3"}</Text>
                    <Text style={styles.title}>Your trial has ended</Text>
                    <Text style={styles.subtitle}>
                        Thanks for trying Lista! Subscribe to continue using the app and support
                        development.
                    </Text>
                </View>

                <View style={styles.priceContainer}>
                    <Text style={styles.price}>{price}</Text>
                    <Text style={styles.period}>per year</Text>
                </View>

                <View style={styles.features}>
                    <FeatureRow text="Unlimited lists" />
                    <FeatureRow text="P2P sync across devices" />
                    <FeatureRow text="No ads, no tracking" />
                    <FeatureRow text="Support indie development" />
                </View>

                {state.error && <Text style={styles.error}>{state.error}</Text>}

                <View style={styles.buttons}>
                    <TouchableOpacity
                        style={styles.subscribeButton}
                        onPress={onPurchase}
                        disabled={state.isLoading}
                    >
                        {state.isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.subscribeButtonText}>
                                Subscribe for {price}/year
                            </Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={onRestore}
                        disabled={state.isLoading}
                    >
                        <Text style={styles.restoreButtonText}>Restore Purchase</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Subscription automatically renews yearly. Cancel anytime in{' '}
                        {Platform.OS === 'ios' ? 'Settings' : 'Play Store'}.
                    </Text>
                    <View style={styles.links}>
                        <TouchableOpacity onPress={openPrivacyPolicy}>
                            <Text style={styles.link}>Privacy Policy</Text>
                        </TouchableOpacity>
                        <Text style={styles.linkSeparator}>|</Text>
                        <TouchableOpacity onPress={openTerms}>
                            <Text style={styles.link}>Terms of Service</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    )
}

function FeatureRow({ text }: { text: string }) {
    return (
        <View style={styles.featureRow}>
            <Text style={styles.checkmark}>+</Text>
            <Text style={styles.featureText}>{text}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    content: {
        flex: 1,
        padding: 24,
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        marginTop: 20,
    },
    emoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#333',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 20,
    },
    priceContainer: {
        alignItems: 'center',
        marginVertical: 24,
    },
    price: {
        fontSize: 48,
        fontWeight: '700',
        color: '#333',
    },
    period: {
        fontSize: 18,
        color: '#666',
        marginTop: 4,
    },
    features: {
        marginVertical: 24,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 8,
        paddingHorizontal: 20,
    },
    checkmark: {
        fontSize: 18,
        color: '#34c759',
        marginRight: 12,
        fontWeight: '600',
    },
    featureText: {
        fontSize: 16,
        color: '#333',
    },
    error: {
        color: '#ff3b30',
        textAlign: 'center',
        marginBottom: 16,
        fontSize: 14,
    },
    buttons: {
        marginTop: 'auto',
        gap: 12,
    },
    subscribeButton: {
        backgroundColor: '#333',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    subscribeButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    restoreButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    restoreButtonText: {
        color: '#666',
        fontSize: 16,
    },
    footer: {
        marginTop: 24,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#999',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 8,
    },
    links: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    link: {
        fontSize: 12,
        color: '#666',
        textDecorationLine: 'underline',
    },
    linkSeparator: {
        marginHorizontal: 8,
        color: '#999',
    },
})