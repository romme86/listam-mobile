import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { hasValueRating, clampRate } from '@listam/domain/value'
import { useTheme, type Theme } from '../theme'
import type { ListEntry } from './_types'

// The two value-return badges (coins = value, hourglass = time delay) shown on
// any rated item — board card, board detail, todo row. Renders nothing when the
// item has no rating, so callers can drop it in unconditionally.
export function ValueBadges({ item, size = 13 }: { item: ListEntry; size?: number }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    if (!hasValueRating(item)) return null
    return (
        <View style={styles.row}>
            <View style={styles.badge}>
                <MaterialCommunityIcons name="cash-multiple" size={size} color={t.colors.success} />
                <Text style={styles.num}>{clampRate(item.valueRate)}</Text>
            </View>
            <View style={styles.badge}>
                <MaterialCommunityIcons name="timer-sand" size={size} color={t.colors.warning} />
                <Text style={styles.num}>{clampRate(item.delayRate)}</Text>
            </View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        badge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
        num: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, fontWeight: '600' },
    })
}
