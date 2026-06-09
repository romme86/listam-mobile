import React, { useMemo } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import type { SubscriptionState } from '../hooks/useSubscription'

type PaywallProps = {
    state: SubscriptionState
    onPurchase: () => void
    onRestore: () => void
}

export function Paywall({ state, onPurchase, onRestore }: PaywallProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])

    const price = Platform.select({
        ios: 'CHF 1.00',
        android: '$0.99',
    }) ?? '$0.99'

    const openPrivacyPolicy = () => Linking.openURL('https://saynode.ch/privacy')
    const openTerms = () => Linking.openURL('https://saynode.ch/terms')

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <View style={styles.heartCircle}>
                        <Ionicons name="heart" size={32} color={t.colors.accent} />
                    </View>
                    <Text style={styles.title}>{i18n.t('paywall.title')}</Text>
                    <Text style={styles.subtitle}>
                        {i18n.t('paywall.subtitle')}
                    </Text>
                </View>

                <View style={styles.priceContainer}>
                    <Text style={styles.price}>{price}</Text>
                    <Text style={styles.period}>{i18n.t('paywall.period')}</Text>
                </View>

                <View style={styles.features}>
                    <FeatureRow text={i18n.t('paywall.feature.unlimitedLists')} styles={styles} accent={t.colors.accent} />
                    <FeatureRow text={i18n.t('paywall.feature.p2pSync')} styles={styles} accent={t.colors.accent} />
                    <FeatureRow text={i18n.t('paywall.feature.noAds')} styles={styles} accent={t.colors.accent} />
                    <FeatureRow text={i18n.t('paywall.feature.supportIndie')} styles={styles} accent={t.colors.accent} />
                </View>

                {state.error && <Text style={styles.error}>{state.error}</Text>}

                <View style={styles.buttons}>
                    <TouchableOpacity
                        style={styles.subscribeButton}
                        onPress={onPurchase}
                        disabled={state.isLoading}
                        accessibilityRole="button"
                    >
                        {state.isLoading ? (
                            <ActivityIndicator color={t.colors.onPrimary} />
                        ) : (
                            <Text style={styles.subscribeButtonText}>{i18n.t('paywall.subscribe', { price })}</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={onRestore}
                        disabled={state.isLoading}
                        accessibilityRole="button"
                    >
                        <Text style={styles.restoreButtonText}>{i18n.t('paywall.restore')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        {i18n.t('paywall.footer', {
                            store: Platform.OS === 'ios'
                                ? i18n.t('paywall.platform.ios')
                                : i18n.t('paywall.platform.android'),
                        })}
                    </Text>
                    <View style={styles.links}>
                        <TouchableOpacity onPress={openPrivacyPolicy}>
                            <Text style={styles.link}>{i18n.t('paywall.privacy')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.linkSeparator}>|</Text>
                        <TouchableOpacity onPress={openTerms}>
                            <Text style={styles.link}>{i18n.t('paywall.terms')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    )
}

function FeatureRow({ text, styles, accent }: { text: string; styles: ReturnType<typeof makeStyles>; accent: string }) {
    return (
        <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color={accent} style={{ marginRight: 12 }} />
            <Text style={styles.featureText}>{text}</Text>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: t.colors.bg,
        },
        content: {
            flex: 1,
            padding: t.spacing.xl,
            justifyContent: 'space-between',
        },
        header: {
            alignItems: 'center',
            marginTop: t.spacing.xl,
        },
        heartCircle: {
            width: 72,
            height: 72,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: t.spacing.lg,
        },
        title: {
            fontSize: t.type.display.fontSize,
            fontWeight: '700',
            color: t.colors.text,
            marginBottom: t.spacing.md,
            textAlign: 'center',
        },
        subtitle: {
            fontSize: t.type.body.fontSize,
            color: t.colors.textSecondary,
            textAlign: 'center',
            lineHeight: 24,
            paddingHorizontal: t.spacing.xl,
        },
        priceContainer: {
            alignItems: 'center',
            marginVertical: t.spacing.xl,
        },
        price: {
            fontSize: 48,
            fontWeight: '700',
            color: t.colors.text,
        },
        period: {
            fontSize: t.type.bodyLg.fontSize,
            color: t.colors.textSecondary,
            marginTop: t.spacing.xs,
        },
        features: {
            marginVertical: t.spacing.xl,
        },
        featureRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: t.spacing.sm,
            paddingHorizontal: t.spacing.xl,
        },
        featureText: {
            fontSize: t.type.body.fontSize,
            color: t.colors.text,
        },
        error: {
            color: t.colors.danger,
            textAlign: 'center',
            marginBottom: t.spacing.lg,
            fontSize: t.type.label.fontSize,
        },
        buttons: {
            marginTop: 'auto',
            gap: t.spacing.md,
        },
        subscribeButton: {
            backgroundColor: t.colors.primary,
            paddingVertical: t.spacing.lg,
            borderRadius: t.radius.md,
            alignItems: 'center',
        },
        subscribeButtonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyLg.fontSize,
            fontWeight: '600',
        },
        restoreButton: {
            paddingVertical: t.spacing.md,
            alignItems: 'center',
        },
        restoreButtonText: {
            color: t.colors.textSecondary,
            fontSize: t.type.body.fontSize,
        },
        footer: {
            marginTop: t.spacing.xl,
            alignItems: 'center',
        },
        footerText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            textAlign: 'center',
            lineHeight: 18,
            marginBottom: t.spacing.sm,
        },
        links: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        link: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textSecondary,
            textDecorationLine: 'underline',
        },
        linkSeparator: {
            marginHorizontal: t.spacing.sm,
            color: t.colors.textTertiary,
        },
    })
}
