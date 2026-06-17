import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

type Props = {
    remaining: number
    doneCount: number
    onClearCompleted: () => void
    // In-group position (sibling lists), shown as dots inside the same balloon.
    positionCount?: number
    positionIndex?: number
}

// One bottom-center balloon: items-left · position dots · clear-done.
export function SummaryBar({ remaining, doneCount, onClearCompleted, positionCount = 0, positionIndex = 0 }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])

    const hasItems = (remaining + doneCount) > 0
    const showDots = positionCount > 1
    // Dots are useful even on an empty list (to show where you are among lists).
    if (!hasItems && !showDots) return null

    const label = remaining === 0
        ? i18n.t('main.summary.allDone')
        : i18n.t('main.summary.itemsLeft', { count: remaining })

    return (
        <View style={[styles.host, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
            <View style={styles.pill}>
                {hasItems && <Text style={styles.count}>{label}</Text>}

                {hasItems && showDots && <View style={styles.divider} />}
                {showDots && (
                    positionCount > 9 ? (
                        <Text style={styles.counter}>{positionIndex + 1} / {positionCount}</Text>
                    ) : (
                        <View style={styles.dotRow}>
                            {Array.from({ length: positionCount }).map((_, i) => (
                                <View key={i} style={[styles.dot, i === positionIndex && styles.dotActive]} />
                            ))}
                        </View>
                    )
                )}

                {doneCount > 0 && <View style={styles.divider} />}
                {doneCount > 0 && (
                    <TouchableOpacity
                        style={styles.clearBtn}
                        onPress={onClearCompleted}
                        accessibilityRole="button"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="checkmark-done-outline" size={16} color={t.colors.text} />
                        <Text style={styles.clearText}>{i18n.t('main.summary.clearDone')}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        host: {
            position: 'absolute',
            left: 0,
            right: 0,
            alignItems: 'center',
        },
        pill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingVertical: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surface,
            borderWidth: 1,
            borderColor: t.colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
        },
        count: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.textSecondary,
        },
        divider: {
            width: 1,
            height: 16,
            backgroundColor: t.colors.border,
        },
        dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.border },
        dotActive: { width: 16, borderRadius: 3, backgroundColor: t.colors.accent },
        counter: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.textSecondary,
        },
        clearBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        clearText: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.text,
        },
    })
}
