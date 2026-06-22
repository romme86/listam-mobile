import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedIconButton } from './AnimatedIconButton'
import { useTheme, type Theme } from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { useI18n } from '../i18n'
import type { LoyaltyCardHandle } from '../store/loyaltyCardsSlice'
import type { NetworkStatus } from '../store/syncSlice'
import { deriveConnectionStatus } from './connectionStatus'

const HEADER_ICON_SIZE = 22

type HeaderProps = {
    peerCount: number
    isWorkletReady: boolean
    networkStatus: NetworkStatus
    isJoining: boolean
    onShare: () => void
    onJoin: () => void
    onMenuToggle: () => void
    onOverview: () => void
    overviewActive: boolean
    trialDaysRemaining?: number
    loyaltyCards: LoyaltyCardHandle[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCardHandle) => void
}

export function Header(props: HeaderProps) {
    const {
        peerCount,
        isWorkletReady,
        networkStatus,
        isJoining,
        onShare,
        onJoin,
        onMenuToggle,
        onOverview,
        overviewActive,
        trialDaysRemaining,
        loyaltyCards,
        onScanCard,
        onSelectCard,
    } = props

    const t = useTheme()
    const i18n = useI18n()
    const reduceMotion = useReduceMotion()
    const styles = useMemo(() => makeStyles(t), [t])

    const peerCountLabel = peerCount > 99 ? '99+' : String(peerCount)
    const primaryLoyaltyCard = loyaltyCards[0] ?? null
    const pulse = useRef(new Animated.Value(1)).current

    const status = deriveConnectionStatus(
        { networkStatus, isWorkletReady, isJoining, peerCount },
        t,
        i18n,
    )

    useEffect(() => {
        if (status.blinking && !reduceMotion) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
                ])
            )
            loop.start()
            return () => loop.stop()
        }
        pulse.setValue(1)
    }, [status.blinking, reduceMotion, pulse])

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <View style={styles.container}>
                <View style={styles.leftSection}>
                    <AnimatedIconButton style={styles.iconButton} onPress={onMenuToggle}>
                        <Ionicons name="menu-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>
                    <Animated.View
                        style={[styles.statusDot, { backgroundColor: status.color, opacity: pulse }]}
                        importantForAccessibility="no"
                        accessibilityElementsHidden
                    />
                    <Text style={styles.statusText} numberOfLines={1}>
                        {status.label}
                    </Text>
                    {trialDaysRemaining !== undefined && trialDaysRemaining <= 7 && (
                        <Text style={styles.trialText} numberOfLines={1}>
                            {i18n.t('header.trialDaysLeft', { count: trialDaysRemaining })}
                        </Text>
                    )}
                </View>

                <View style={styles.rightSection}>
                    <AnimatedIconButton
                        style={styles.iconButton}
                        onPress={onOverview}
                        accessibilityLabel={i18n.t('desktop.nav.overview')}
                    >
                        <Ionicons
                            name={overviewActive ? 'sunny' : 'sunny-outline'}
                            size={HEADER_ICON_SIZE}
                            color={overviewActive ? t.colors.accent : t.colors.text}
                        />
                    </AnimatedIconButton>

                    <AnimatedIconButton
                        style={styles.iconButton}
                        onPress={() => (primaryLoyaltyCard ? onSelectCard(primaryLoyaltyCard) : onScanCard())}
                    >
                        <Ionicons name="card-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>

                    <View style={styles.iconWithBadge}>
                        <AnimatedIconButton style={styles.iconButton} onPress={onShare}>
                            <Ionicons name="share-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                        </AnimatedIconButton>
                        {peerCount > 0 && (
                            <View style={styles.peerBadge}>
                                <Text style={styles.peerBadgeText}>{peerCountLabel}</Text>
                            </View>
                        )}
                    </View>

                    <AnimatedIconButton style={styles.iconButton} onPress={onJoin}>
                        <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>
                </View>
            </View>
        </SafeAreaView>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        safeArea: {
            backgroundColor: t.colors.bg,
        },
        container: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: t.colors.bg,
            paddingHorizontal: t.spacing.sm,
            paddingVertical: t.spacing.sm,
            minHeight: 52,
        },
        leftSection: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            flexShrink: 1,
        },
        rightSection: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
        },
        iconButton: {
            padding: t.spacing.sm,
        },
        statusDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
        },
        statusText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            // Keep the readiness label readable; the (secondary) trial label
            // yields width first when both share the row.
            flexShrink: 0,
        },
        trialText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            flexShrink: 1,
        },
        iconWithBadge: {
            position: 'relative',
            justifyContent: 'center',
            alignItems: 'center',
        },
        peerBadge: {
            position: 'absolute',
            top: -2,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accent,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
        },
        peerBadgeText: {
            color: t.colors.onAccent,
            fontSize: 9,
            fontWeight: '700',
        },
    })
}
