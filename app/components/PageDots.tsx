import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, type Theme } from '../theme'

// The swipe-pager position indicator: one dot per sibling list in the current
// group, the active one stretched into a pill. Collapses to "n / m" past 9 so it
// never overruns the header. Display-only.
export function PageDots({ count, index }: { count: number; index: number }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    if (count <= 1) return null
    if (count > 9) return <Text style={styles.counter}>{index + 1} / {count}</Text>
    return (
        <View style={styles.dotRow}>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.border },
        dotActive: { width: 16, borderRadius: 3, backgroundColor: t.colors.accent },
        counter: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
    })
}
