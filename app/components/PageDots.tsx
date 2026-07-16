import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, type Theme } from '../theme'

type Props = {
    // One dot per group; the group you're in expands to show its lists.
    groupCount: number
    groupIndex: number
    groupSize: number // lists in the active group
    listIndex: number // active list within the active group
    groupName: string
    overviewEnabled?: boolean
    overviewOpen?: boolean
    overviewLabel?: string
}

// A you-are-here indicator across the whole list hierarchy: a row of group dots,
// the active group expanded into its lists (with a subtle pill behind them ONLY
// when it holds more than one). Past a handful of groups/lists it collapses to a
// compact "Group · n/m" label so it never overruns the header.
export function PageDots({ groupCount, groupIndex, groupSize, listIndex, groupName, overviewEnabled = false, overviewOpen = false, overviewLabel = 'Overview' }: Props) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])

    // Collapse to a compact label before the dot row can grow wide enough to
    // overrun the header — including the dense 5-6 groups WITH a wide active pill.
    const totalGroups = groupCount + (overviewEnabled ? 1 : 0)
    if (totalGroups > 6 || groupSize > 9 || (totalGroups >= 5 && groupSize > 4)) {
        if (overviewOpen) return <Text style={styles.label} numberOfLines={1}>{overviewLabel}</Text>
        const pos = groupSize > 1 ? ` · ${listIndex + 1}/${groupSize}` : ''
        return <Text style={styles.label} numberOfLines={1}>{groupName}{pos}</Text>
    }

    return (
        <View style={styles.row}>
            {overviewEnabled ? (
                <View style={[styles.groupDot, overviewOpen && styles.groupDotActive]} />
            ) : null}
            {Array.from({ length: groupCount }).map((_, gi) => {
                if (overviewOpen || gi !== groupIndex) {
                    return <View key={gi} style={styles.groupDot} />
                }
                // The active group with a single list stays a plain (accented) dot —
                // no pill — so the background only marks a group you can swipe within.
                if (groupSize <= 1) {
                    return <View key={gi} style={[styles.groupDot, styles.groupDotActive]} />
                }
                return (
                    <View key={gi} style={styles.activeGroup}>
                        {Array.from({ length: groupSize }).map((_, li) => (
                            <View key={li} style={[styles.listDot, li === listIndex && styles.listDotActive]} />
                        ))}
                    </View>
                )
            })}
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
        groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.border },
        groupDotActive: { backgroundColor: t.colors.accent },
        activeGroup: {
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: t.colors.surfaceAlt, borderRadius: 9,
            paddingHorizontal: 7, paddingVertical: 3,
        },
        listDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: t.colors.textTertiary },
        listDotActive: { width: 14, borderRadius: 3, backgroundColor: t.colors.accent },
        label: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
    })
}
