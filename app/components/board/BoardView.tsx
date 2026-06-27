import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { groupByStatus, type BoardConfig } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import type { ListEntry } from '../_types'
import { TicketCard } from './TicketCard'

type Props = {
    tickets: ListEntry[]
    config: BoardConfig
    onOpenTicket: (ticket: ListEntry) => void
}

// The board surface: a horizontal status-chip filter over a vertical list of
// ticket cards (one status at a time), per the phone design. Status names/colors
// come from the board config, so custom boards work unchanged.
export function BoardView({ tickets, config, onOpenTicket }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const columns = useMemo(() => groupByStatus(tickets, config), [tickets, config])

    const [statusId, setStatusId] = useState<string | undefined>(columns[0]?.state.id)
    // Keep the selection valid as the config/columns change; default to the first
    // column that has tickets so the board doesn't open on an empty status.
    useEffect(() => {
        const ids = columns.map((c) => c.state.id)
        if (!statusId || !ids.includes(statusId)) {
            setStatusId(columns.find((c) => c.tickets.length > 0)?.state.id ?? columns[0]?.state.id)
        }
    }, [columns, statusId])

    const selected = columns.find((c) => c.state.id === statusId) ?? columns[0]

    return (
        <View style={styles.container}>
            <View style={styles.chipBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {columns.map((col) => {
                        const active = col.state.id === selected?.state.id
                        return (
                            <TouchableOpacity
                                key={col.state.id}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setStatusId(col.state.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {col.state.name}{col.tickets.length ? ` ${col.tickets.length}` : ''}
                                </Text>
                            </TouchableOpacity>
                        )
                    })}
                </ScrollView>
            </View>

            <FlatList
                data={selected?.tickets ?? []}
                keyExtractor={(item) => item.id ?? item.itemId ?? item.text}
                renderItem={({ item }) => <TicketCard ticket={item} config={config} onPress={onOpenTicket} />}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: t.spacing.md }} />}
                ListEmptyComponent={<Text style={styles.empty}>{i18n.t('board.empty')}</Text>}
                keyboardShouldPersistTaps="handled"
            />
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: { flex: 1 },
        chipBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, gap: t.spacing.sm },
        chipRow: { gap: t.spacing.sm, paddingRight: t.spacing.sm, alignItems: 'center' },
        chip: {
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm,
        },
        chipActive: { backgroundColor: t.colors.surfaceSunken },
        chipText: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
        chipTextActive: { color: t.colors.success },
        listContent: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, paddingBottom: t.spacing.xxl },
        empty: { textAlign: 'center', color: t.colors.textTertiary, fontSize: t.type.body.fontSize, marginTop: t.spacing.xxl },
    })
}
