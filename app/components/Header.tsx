import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedIconButton } from './AnimatedIconButton'
import { useTheme, type Theme } from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { useI18n } from '../i18n'
import type { NetworkStatus } from '../store/syncSlice'
import { deriveConnectionStatus } from './connectionStatus'

const HEADER_ICON_SIZE = 22

type HeaderProps = {
    peerCount: number
    isWorkletReady: boolean
    networkStatus: NetworkStatus
    isJoining: boolean
    onMenuToggle: () => void
    onOverview: () => void
    overviewActive: boolean
    // The day-plan Overview is an opt-in organization capability (gated on
    // boardEnabled). The sun button is only rendered once it's been activated.
    showOverview: boolean
    trialDaysRemaining?: number
}

export function Header(props: HeaderProps) {
    const {
        peerCount,
        isWorkletReady,
        networkStatus,
        isJoining,
        onMenuToggle,
        onOverview,
        overviewActive,
        showOverview,
        trialDaysRemaining,
    } = props

    const t = useTheme()
    const i18n = useI18n()
    const reduceMotion = useReduceMotion()
    const styles = useMemo(() => makeStyles(t), [t])

    const peerCountLabel = peerCount > 99 ? '99+' : String(peerCount)
    const pulse = useRef(new Animated.Value(1)).current

    const status = deriveConnectionStatus(
        { networkStatus, isWorkletReady, isJoining, peerCount },
        t,
        i18n,
    )

    // The descriptive label is transient: it flashes whenever the connection
    // status changes, then fades out — leaving the colored dot and the connection
    // count, which stay permanent. Clamp to 10 chars so it can never overlap the
    // right-hand header icons.
    const shortLabel = status.label.length > 10 ? `${status.label.slice(0, 9)}…` : status.label
    const [labelVisible, setLabelVisible] = useState(true)
    const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        setLabelVisible(true)
        if (labelTimer.current) clearTimeout(labelTimer.current)
        labelTimer.current = setTimeout(() => setLabelVisible(false), 4000)
        return () => { if (labelTimer.current) clearTimeout(labelTimer.current) }
    }, [status.label])

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
                    {peerCount > 0 && (
                        <Text style={styles.connCount} numberOfLines={1}>{peerCountLabel}</Text>
                    )}
                    {labelVisible && (
                        <Text style={styles.statusText} numberOfLines={1}>
                            {shortLabel}
                        </Text>
                    )}
                    {trialDaysRemaining !== undefined && trialDaysRemaining <= 7 && (
                        <Text style={styles.trialText} numberOfLines={1}>
                            {i18n.t('header.trialDaysLeft', { count: trialDaysRemaining })}
                        </Text>
                    )}
                </View>

                <View style={styles.rightSection}>
                    {showOverview && (
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
                    )}
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
        // The permanent connection count shown right after the dot.
        connCount: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '700',
            color: t.colors.text,
            flexShrink: 0,
        },
        trialText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            flexShrink: 1,
        },
    })
}
