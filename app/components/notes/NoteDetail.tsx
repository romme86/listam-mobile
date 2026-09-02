import React, { useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { BLOCK_TYPES, createBlock, normalizeBlocks, type TicketBlock } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import type { ListEntry } from '../_types'
import { BlockBody, BLOCK_ICON, nextBlockId } from '../board/BlockBody'
import { CloseDot } from '../CloseDot'

type Props = {
    visible: boolean
    note: ListEntry | null
    /** The name of the list the note lives in (the header's breadcrumb). */
    listName: string
    onUpdate: (patch: Record<string, unknown>) => void
    onClose: () => void
}

// The note, full screen: an editable title over the block body. The body is the
// board's BlockBody verbatim (same ten block types, same raw-text/WYSIWYG
// editors) — a note and a ticket differ in what surrounds the blocks, not in
// the blocks themselves. Insertion is the one thing that moves: the board's
// inline type menu is replaced by a bottom-sheet tray of icon tiles, because on
// a note the body is the whole screen rather than one field among many.
export function NoteDetail({ visible, note, listName, onUpdate, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [tray, setTray] = useState(false)

    if (!note) return null
    const blocks = normalizeBlocks(note.blocks as TicketBlock[] | undefined)

    const insertBlock = (type: string) => {
        setTray(false)
        onUpdate({ blocks: [...blocks, createBlock(type, nextBlockId()) as TicketBlock] })
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            {/* SafeAreaProvider INSIDE the Modal — see the note in TicketDetail:
                the root provider's insets don't reach the modal's own native
                window, so seed it with the device metrics captured at launch. */}
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={i18n.t('common.close')}>
                        <Ionicons name="chevron-back" size={26} color={t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{listName}</Text>
                    <CloseDot onPress={onClose} color={t.colors.text} accessibilityLabel={i18n.t('common.close')} />
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    {/* Uncontrolled + keyed by the note: the store echoes every
                        write back, and a controlled title would snap the caret
                        on each one. Commits on blur/return, like a list rename. */}
                    <TextInput
                        key={note.id}
                        style={styles.title}
                        defaultValue={note.text}
                        placeholder={i18n.t('mobile.notes.untitled')}
                        placeholderTextColor={t.colors.placeholder}
                        returnKeyType="done"
                        onEndEditing={(e) => {
                            const text = e.nativeEvent.text.trim()
                            if (text && text !== note.text) onUpdate({ text })
                        }}
                    />
                    <Text style={styles.meta}>
                        {blocks.length > 0
                            ? i18n.t('desktop.notes.blockCount', { count: blocks.length })
                            : i18n.t('desktop.notes.plain')}
                    </Text>

                    <BlockBody
                        blocks={note.blocks as TicketBlock[] | undefined}
                        onChange={(next) => onUpdate({ blocks: next })}
                        showAdd={false}
                    />
                </ScrollView>

                <View style={styles.bottomBar}>
                    <TouchableOpacity style={styles.insertBtn} onPress={() => setTray(true)} accessibilityRole="button">
                        <Ionicons name="add" size={18} color={t.colors.text} />
                        <Text style={styles.insertLabel}>{i18n.t('mobile.notes.insertBlock')}</Text>
                    </TouchableOpacity>
                </View>

                <Modal visible={tray} transparent animationType="slide" onRequestClose={() => setTray(false)}>
                    <View style={styles.trayOverlay}>
                        <TouchableOpacity style={styles.trayBackdrop} activeOpacity={1} onPress={() => setTray(false)} />
                        <View style={styles.tray}>
                            <View style={styles.trayHeader}>
                                <Text style={styles.trayTitle}>{i18n.t('mobile.notes.insertTitle')}</Text>
                                <CloseDot onPress={() => setTray(false)} color={t.colors.text} accessibilityLabel={i18n.t('common.close')} />
                            </View>
                            <View style={styles.trayGrid}>
                                {BLOCK_TYPES.map((spec) => (
                                    <TouchableOpacity
                                        key={spec.type}
                                        style={styles.trayTile}
                                        accessibilityRole="button"
                                        onPress={() => insertBlock(spec.type)}
                                    >
                                        <View style={styles.trayIcon}>
                                            <Ionicons name={BLOCK_ICON[spec.type] || 'ellipse-outline'} size={20} color={t.colors.text} />
                                        </View>
                                        <Text style={styles.trayLabel} numberOfLines={2}>{i18n.t(spec.labelKey as never)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
            </SafeAreaProvider>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: t.colors.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.textSecondary },
        scroll: { flex: 1 },
        content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.md },
        title: { fontSize: 26, fontWeight: '800', color: t.colors.text, paddingVertical: 0, marginTop: t.spacing.sm },
        meta: {
            fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6,
        },
        bottomBar: {
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border,
        },
        insertBtn: {
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.xs,
            backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, paddingVertical: t.spacing.md,
        },
        insertLabel: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.text },
        trayOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
        trayBackdrop: { ...StyleSheet.absoluteFillObject },
        tray: {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.xxl,
        },
        trayHeader: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xs,
        },
        trayTitle: { fontSize: t.type.title.fontSize, fontWeight: t.type.title.fontWeight, color: t.colors.text },
        trayGrid: {
            flexDirection: 'row', flexWrap: 'wrap',
            paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm,
        },
        trayTile: { width: '25%', alignItems: 'center', gap: t.spacing.xs, paddingVertical: t.spacing.md },
        trayIcon: {
            width: 44, height: 44, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center', justifyContent: 'center',
        },
        trayLabel: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textAlign: 'center' },
    })
}
