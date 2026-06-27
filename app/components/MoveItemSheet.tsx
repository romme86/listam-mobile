import React, { useMemo } from 'react'
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../feedback'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { isBoardType } from '@listam/domain/board'
import { isTodoType } from '@listam/domain/identity'
import type { GroupedLists } from '../store/registrySelectors'
import type { ListEntry } from './_types'
import { CloseDot } from './CloseDot'

// The surface a (listId, type) renders as — board ('kanban'/'board'), todo, or
// grocery. Used to exclude the source surface (built-ins share one listId, so
// listId equality alone would wrongly hide e.g. Board when moving from Groceries).
function surfaceOf(type: string): 'board' | 'todo' | 'grocery' {
    if (isBoardType(type)) return 'board'
    if (isTodoType(type)) return 'todo'
    return 'grocery'
}

function typeIcon(type: string): keyof typeof Ionicons.glyphMap {
    if (isBoardType(type)) return 'grid-outline'
    if (isTodoType(type)) return 'checkbox-outline'
    return 'cart-outline'
}

type Props = {
    visible: boolean
    item: ListEntry | null
    groups: GroupedLists
    onMove: (listId: string, type: string) => void
    onClose: () => void
}

export function MoveItemSheet({ visible, item, groups, onMove, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])

    const sourceListId = item?.listId ?? ''
    const sourceSurface = surfaceOf(item?.listType ?? '')
    const dests = useMemo(
        () =>
            groups
                .map((g) => ({
                    name: g.group.name,
                    lists: g.lists.filter((l) => !(l.id === sourceListId && surfaceOf(l.type) === sourceSurface)),
                }))
                .filter((g) => g.lists.length > 0),
        [groups, sourceListId, sourceSurface],
    )

    return (
        <Modal visible={visible && !!item} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{i18n.t('move.title')}</Text>
                        <CloseDot onPress={onClose} color={t.colors.text} accessibilityLabel={i18n.t('common.close')} />
                    </View>
                    {item ? <Text style={styles.subtitle}>{i18n.t('move.subtitle', { text: item.text })}</Text> : null}

                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                        {dests.length === 0 ? (
                            <Text style={styles.empty}>{i18n.t('move.empty')}</Text>
                        ) : (
                            dests.map((g) => (
                                <View key={g.name} style={styles.group}>
                                    <Text style={styles.groupLabel}>{g.name}</Text>
                                    {g.lists.map((l) => (
                                        <TouchableOpacity
                                            key={`${l.id}:${l.type}`}
                                            style={styles.row}
                                            accessibilityRole="button"
                                            onPress={() => { haptics.select(); onMove(l.id, l.type) }}
                                        >
                                            <View style={styles.rowIcon}>
                                                <Ionicons name={typeIcon(l.type)} size={19} color={t.colors.textSecondary} />
                                            </View>
                                            <Text style={styles.rowName} numberOfLines={1}>{l.name || l.id}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
        backdrop: { ...StyleSheet.absoluteFillObject },
        sheet: {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.xl,
            maxHeight: '80%',
        },
        header: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xs,
        },
        title: { fontSize: t.type.title.fontSize, fontWeight: t.type.title.fontWeight, color: t.colors.text },
        subtitle: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm },
        scroll: { flexShrink: 1 },
        scrollContent: { paddingBottom: t.spacing.md },
        empty: { fontSize: t.type.body.fontSize, color: t.colors.textTertiary, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.lg, textAlign: 'center' },
        group: { marginTop: t.spacing.sm },
        groupLabel: {
            fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6,
            paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs,
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, minHeight: 48 },
        rowIcon: {
            width: 36, height: 36, borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center', justifyContent: 'center',
        },
        rowName: { fontSize: t.type.body.fontSize, color: t.colors.text, flexShrink: 1 },
    })
}
