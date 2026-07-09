import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { ticketBadges, formatDuration, deltaPercent, msToHours, type BoardConfig } from '@listam/domain/board'
import { hasValueRating } from '@listam/domain/value'
import { useTheme, type Theme } from '../../theme'
import type { ListEntry } from '../_types'
import { Avatar, PriorityPill, TimelinessBadge } from './TicketBits'
import { createCardTapCadence, TRIPLE_TAP_MS } from '../tapCadence'
import { ValueBadges } from '../ValueBadges'

type Props = {
    ticket: ListEntry
    config: BoardConfig
    onPress: (ticket: ListEntry) => void
    /**
     * Triple-tap: capture this ticket into the Overview. When wired, a single
     * tap's detail-open is deferred by the tap window so a fast triple adds to
     * the plan instead of navigating; when absent, taps open immediately.
     */
    onTripleTap?: (ticket: ListEntry) => void
}

// A board ticket as a card. Tapping opens the detail/editor — it never toggles
// "done" or deletes (that's the grocery behavior boards must NOT inherit).
export function TicketCard({ ticket, onPress, onTripleTap }: Props) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const cadence = useRef(createCardTapCadence())
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

    const handlePress = () => {
        if (!onTripleTap) {
            onPress(ticket)
            return
        }
        if (settleTimer.current) clearTimeout(settleTimer.current)
        if (cadence.current.register(Date.now()) === 'capture') {
            settleTimer.current = null
            onTripleTap(ticket)
            return
        }
        settleTimer.current = setTimeout(() => {
            settleTimer.current = null
            if (cadence.current.settle()) onPress(ticket)
        }, TRIPLE_TAP_MS)
    }
    const b = ticketBadges(ticket)
    const estLabel = b.estimatedHours ? `${b.estimatedHours}h` : null
    const delta = b.isDone && b.timeliness ? deltaPercent(msToHours(b.inProgressMs), b.estimatedHours ?? 0) : null

    let right: React.ReactNode = null
    if (b.running) {
        right = (
            <View style={styles.runRow}>
                <View style={styles.runDot} />
                <Text style={styles.runText}>
                    {formatDuration(b.inProgressMs)}{estLabel ? ` / ${estLabel}` : ''}
                </Text>
            </View>
        )
    } else if (b.isDone && b.timeliness) {
        right = <TimelinessBadge timeliness={b.timeliness} delta={delta} />
    } else if (b.priority) {
        right = <PriorityPill priority={b.priority} />
    }

    const showMeta = b.assignee || right || b.checklistTotal > 0 || hasValueRating(ticket)
    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={handlePress}
            accessibilityRole="button"
        >
            <Text style={styles.title} numberOfLines={2}>{ticket.text || ''}</Text>
            {showMeta ? (
                <View style={styles.meta}>
                    <View style={styles.metaLeft}>
                        {b.assignee ? <Avatar name={b.assignee} size={28} /> : null}
                        {b.checklistTotal > 0 ? (
                            <Text style={styles.checklist}>{b.checklistDone}/{b.checklistTotal}</Text>
                        ) : null}
                        <ValueBadges item={ticket} />
                    </View>
                    {right}
                </View>
            ) : null}
        </TouchableOpacity>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        card: {
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.lg,
            gap: t.spacing.lg,
        },
        title: { fontSize: 18, fontWeight: '700', color: t.colors.text },
        meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        metaLeft: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
        checklist: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, fontWeight: '600' },
        runRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
        runDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.success },
        runText: { fontSize: t.type.label.fontSize, color: t.colors.textSecondary, fontWeight: '600' },
    })
}
