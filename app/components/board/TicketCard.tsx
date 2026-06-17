import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { ticketBadges, formatDuration, deltaPercent, msToHours, type BoardConfig } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import type { ListEntry } from '../_types'
import { Avatar, PriorityPill, TimelinessBadge } from './TicketBits'

type Props = {
    ticket: ListEntry
    config: BoardConfig
    onPress: (ticket: ListEntry) => void
}

// A board ticket as a card. Tapping opens the detail/editor — it never toggles
// "done" or deletes (that's the grocery behavior boards must NOT inherit).
export function TicketCard({ ticket, onPress }: Props) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
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

    const showMeta = b.assignee || right
    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => onPress(ticket)}
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
