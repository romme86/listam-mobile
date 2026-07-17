import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'

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
// the active group expanded into its lists. The whole indicator sits inside a
// permanent pill (surfaceAlt fill + border, chevron trailing) so it reads as
// tappable even when idle. Past a handful of groups/lists it collapses to a
// compact "Group · n/m" label — inside the same pill — so it never overruns
// the header.
export function PageDots({ groupCount, groupIndex, groupSize, listIndex, groupName, overviewEnabled = false, overviewOpen = false, overviewLabel = 'Overview' }: Props) {
    const t = useTheme()
    const reduceMotion = useReduceMotion()
    const styles = useMemo(() => makeStyles(t), [t])

    // Collapse to a compact label before the dot row can grow wide enough to
    // overrun the header — including the dense 5-6 groups WITH a wide active run.
    const totalGroups = groupCount + (overviewEnabled ? 1 : 0)
    const collapsed = totalGroups > 6 || groupSize > 9 || (totalGroups >= 5 && groupSize > 4)

    let content: React.ReactNode
    if (collapsed) {
        const pos = groupSize > 1 ? ` · ${listIndex + 1}/${groupSize}` : ''
        const text = overviewOpen ? overviewLabel : `${groupName}${pos}`
        content = <Text style={styles.label} numberOfLines={1}>{text}</Text>
    } else {
        content = (
            <View style={styles.row}>
                {overviewEnabled ? (
                    <View style={[styles.groupDot, overviewOpen && styles.groupDotActive]} />
                ) : null}
                {Array.from({ length: groupCount }).map((_, gi) => {
                    if (overviewOpen || gi !== groupIndex) {
                        return <View key={gi} style={styles.groupDot} />
                    }
                    // The active group with a single list stays a plain (accented) dot —
                    // list dots only appear for a group you can swipe within.
                    if (groupSize <= 1) {
                        return <View key={gi} style={[styles.groupDot, styles.groupDotActive]} />
                    }
                    return (
                        <View key={gi} style={styles.activeGroup}>
                            {Array.from({ length: groupSize }).map((_, li) => (
                                <ListDot key={li} active={li === listIndex} t={t} styles={styles} reduceMotion={reduceMotion} />
                            ))}
                        </View>
                    )
                })}
            </View>
        )
    }

    return (
        <View style={styles.pill}>
            {content}
            <Ionicons name="chevron-down" size={12} color={t.colors.textTertiary} />
        </View>
    )
}

// One list dot inside the active group. The active one stretches into the 14px
// accent bar; swiping within a group animates the bar shrinking on the list you
// left while it grows on the one you landed on. Freshly mounted dots (a group
// switch) start at their final state — no entrance flash.
function ListDot({ active, t, styles, reduceMotion }: {
    active: boolean
    t: Theme
    styles: ReturnType<typeof makeStyles>
    reduceMotion: boolean
}) {
    const anim = useRef(new Animated.Value(active ? 1 : 0)).current
    useEffect(() => {
        const toValue = active ? 1 : 0
        if (reduceMotion) {
            anim.setValue(toValue)
            return
        }
        const animation = Animated.timing(anim, {
            toValue,
            duration: t.motion.duration.base,
            easing: t.motion.easing,
            useNativeDriver: false, // animates width + color
        })
        animation.start()
        return () => animation.stop()
    }, [active, anim, reduceMotion, t])

    return (
        <Animated.View
            style={[styles.listDot, {
                width: anim.interpolate({ inputRange: [0, 1], outputRange: [5, 14] }),
                backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [t.colors.textTertiary, t.colors.accent] }),
            }]}
        />
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        // The permanent button chrome around the indicator, chevron trailing.
        pill: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: t.colors.surfaceAlt,
            borderWidth: 1, borderColor: t.colors.borderStrong,
            borderRadius: t.radius.pill,
            paddingVertical: 6, paddingLeft: 10, paddingRight: 8,
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
        groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.border },
        groupDotActive: { backgroundColor: t.colors.accent },
        // Chrome-less: the outer pill carries the background now.
        activeGroup: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
        listDot: { height: 5, borderRadius: 3 },
        label: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
    })
}
