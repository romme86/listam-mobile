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
}

export function SummaryBar({ remaining, doneCount, onClearCompleted }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])

    const label = remaining === 0
        ? i18n.t('main.summary.allDone')
        : i18n.t('main.summary.itemsLeft', { count: remaining })

    return (
        <View style={[styles.pill, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
            <Text style={styles.count}>{label}</Text>
            {doneCount > 0 && (
                <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.clearBtn}
                        onPress={onClearCompleted}
                        accessibilityRole="button"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="checkmark-done-outline" size={16} color={t.colors.accent} />
                        <Text style={styles.clearText}>{i18n.t('main.summary.clearDone')}</Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        pill: {
            position: 'absolute',
            left: t.spacing.lg,
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
        clearBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        clearText: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.accent,
        },
    })
}
