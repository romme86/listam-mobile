import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'

type SnackbarType = 'info' | 'success' | 'error'
type SnackbarContextValue = { show: (message: string, type?: SnackbarType) => void }

const SnackbarContext = createContext<SnackbarContextValue>({ show: () => {} })

export function useSnackbar() {
    return useContext(SnackbarContext)
}

const ICONS: Record<SnackbarType, keyof typeof Ionicons.glyphMap> = {
    info: 'information-circle',
    success: 'checkmark-circle',
    error: 'alert-circle',
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
    const t = useTheme()
    const insets = useSafeAreaInsets()
    const reduceMotion = useReduceMotion()
    const styles = useMemo(() => makeStyles(t), [t])

    const [message, setMessage] = useState<string | null>(null)
    const [variant, setVariant] = useState<SnackbarType>('info')
    const opacity = useRef(new Animated.Value(0)).current
    const translateY = useRef(new Animated.Value(16)).current
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const hide = useCallback(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: reduceMotion ? 0 : t.motion.duration.fast,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 16,
                duration: reduceMotion ? 0 : t.motion.duration.fast,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (finished) setMessage(null)
        })
    }, [opacity, translateY, reduceMotion, t.motion.duration.fast])

    const show = useCallback(
        (msg: string, type: SnackbarType = 'info') => {
            setMessage(msg)
            setVariant(type)
            opacity.setValue(reduceMotion ? 1 : 0)
            translateY.setValue(reduceMotion ? 0 : 16)
            if (!reduceMotion) {
                Animated.parallel([
                    Animated.timing(opacity, {
                        toValue: 1,
                        duration: t.motion.duration.base,
                        useNativeDriver: true,
                    }),
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 9,
                        tension: 80,
                    }),
                ]).start()
            }
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(hide, 2800)
        },
        [opacity, translateY, reduceMotion, hide, t.motion.duration.base]
    )

    const value = useMemo(() => ({ show }), [show])

    const accent =
        variant === 'error' ? t.colors.danger : variant === 'success' ? t.colors.accent : t.colors.textSecondary

    return (
        <SnackbarContext.Provider value={value}>
            {children}
            {message !== null && (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.wrap,
                        { bottom: insets.bottom + 24, opacity, transform: [{ translateY }] },
                    ]}
                >
                    <View style={styles.card} accessibilityLiveRegion="polite">
                        <Ionicons name={ICONS[variant]} size={18} color={accent} />
                        <Text style={styles.text}>{message}</Text>
                    </View>
                </Animated.View>
            )}
        </SnackbarContext.Provider>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        wrap: {
            position: 'absolute',
            left: t.spacing.lg,
            right: t.spacing.lg,
            alignItems: 'center',
        },
        card: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            maxWidth: 480,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            borderRadius: t.radius.md,
            backgroundColor: t.dark ? t.colors.surfaceAlt : '#2a2a2c',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 6,
        },
        text: {
            flexShrink: 1,
            color: '#ffffff',
            fontSize: t.type.body.fontSize,
            fontWeight: '500',
        },
    })
}
