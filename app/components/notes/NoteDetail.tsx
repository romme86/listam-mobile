import React, { useMemo, useRef, useState } from 'react'
import { Modal, View, Text, TextInput, ScrollView, Pressable, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { BLOCK_TYPES, createBlock, normalizeBlocks, type TicketBlock } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import type { ListEntry } from '../_types'
import { BlockBody, BLOCK_ICON, nextBlockId } from '../board/BlockBody'
import { CloseDot } from '../CloseDot'
import { createDoubleTap } from './doubleTap'

type Props = {
    visible: boolean
    note: ListEntry | null
    /** The name of the list the note lives in (the header's breadcrumb). */
    listName: string
    onUpdate: (patch: Record<string, unknown>) => void
    onClose: () => void
}

// A note reads as a document. Double-tap its empty body to write; the quiet
// header insert action keeps the other element types within reach.
export function NoteDetail({ visible, note, listName, onUpdate, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [tray, setTray] = useState(false)
    const [editBlockId, setEditBlockId] = useState<string | null>(null)
    const doubleTap = useRef(createDoubleTap()).current

    if (!note) return null
    const blocks = normalizeBlocks(note.blocks as TicketBlock[] | undefined)

    const insertBlock = (type: string) => {
        doubleTap.reset()
        setTray(false)
        const block = createBlock(type, nextBlockId()) as TicketBlock
        setEditBlockId(type === 'divider' ? null : block.id)
        onUpdate({ blocks: [...blocks, block] })
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            {/* SafeAreaProvider INSIDE the Modal — see the note in TicketDetail:
                the root provider's insets don't reach the modal's own native
                window, so seed it with the device metrics captured at launch. */}
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerAction} onPress={onClose} accessibilityRole="button" accessibilityLabel={i18n.t('common.back')}>
                        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{listName}</Text>
                    <TouchableOpacity style={styles.headerAction} onPress={() => { doubleTap.reset(); setTray(true) }} accessibilityRole="button" accessibilityLabel={i18n.t('mobile.notes.insertTitle')}>
                        <Ionicons name="add" size={22} color={t.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    automaticallyAdjustKeyboardInsets
                    onScrollBeginDrag={() => doubleTap.reset()}
                >
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
                    <BlockBody
                        blocks={note.blocks as TicketBlock[] | undefined}
                        onChange={(next) => onUpdate({ blocks: next })}
                        showAdd={false}
                        minimal
                        editBlockId={editBlockId}
                    />
                    <Pressable
                        style={styles.writingSpace}
                        accessibilityRole="button"
                        accessibilityLabel={i18n.t('mobile.notes.writeText')}
                        onAccessibilityTap={() => insertBlock('markdown')}
                        accessibilityActions={[{ name: 'activate', label: i18n.t('mobile.notes.writeText') }]}
                        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') insertBlock('markdown') }}
                        onPress={(event) => {
                            const { pageX, pageY } = event.nativeEvent
                            if (doubleTap.tap({ x: pageX, y: pageY, time: Date.now() })) insertBlock('markdown')
                        }}
                        onLongPress={() => doubleTap.reset()}
                    >
                        {blocks.length === 0 && <Text style={styles.writingHint}>{i18n.t('mobile.notes.doubleTapText')}</Text>}
                    </Pressable>
                </ScrollView>

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
        headerTitle: { flex: 1, textAlign: 'center', fontSize: t.type.label.fontSize, fontWeight: '500', color: t.colors.textSecondary },
        headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        scroll: { flex: 1 },
        content: { flexGrow: 1, paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xxl },
        title: { fontSize: 26, fontWeight: '600', color: t.colors.text, padding: 0, marginTop: t.spacing.md, marginBottom: t.spacing.xl },
        writingSpace: { flexGrow: 1, minHeight: 180, paddingTop: t.spacing.lg },
        writingHint: { fontSize: t.type.body.fontSize, color: t.colors.textTertiary },
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
            width: 44, height: 44,
            alignItems: 'center', justifyContent: 'center',
        },
        trayLabel: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textAlign: 'center' },
    })
}
