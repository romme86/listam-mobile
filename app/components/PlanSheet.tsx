import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import type { ListEntry } from './_types'

type Props = {
    visible: boolean
    item: ListEntry | null
    planned: boolean
    /** Add to / remove from the Overview (today) — toggles on `planned`. */
    onToggleOverview: () => void
    onEdit: (text: string) => void
    /** Move this item to another list. Omitted hides the action. */
    onMove?: () => void
    onClose: () => void
}

// Bottom-sheet for the deliberate row actions: long-pressing a list row opens
// it to edit the text, add/remove the item from the Overview (the accessible,
// non-gesture capture path — no day picking on mobile), or move it elsewhere.
export function PlanSheet({ visible, item, planned, onToggleOverview, onEdit, onMove, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [draft, setDraft] = useState('')

    useEffect(() => {
        if (visible && item) setDraft(item.text)
    }, [visible, item])

    if (!item) return null

    const submitEdit = () => {
        const value = draft.trim()
        if (value && value !== item.text) onEdit(value)
        else onClose()
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.scrim} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
                    <View style={styles.handle} />
                    <Text style={styles.heading}>{i18n.t('desktop.nav.overview')}</Text>

                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={submitEdit}
                        returnKeyType="done"
                        placeholder={i18n.t('main.item.editPlaceholder')}
                        placeholderTextColor={t.colors.placeholder}
                    />

                    <TouchableOpacity style={styles.actionRow} onPress={onToggleOverview}>
                        <Ionicons
                            name={planned ? 'close-circle-outline' : 'add-circle-outline'}
                            size={18}
                            color={planned ? t.colors.danger : t.colors.text}
                        />
                        <Text style={[styles.actionText, planned && styles.actionDanger]}>
                            {i18n.t(planned ? 'plan.removeFromOverview' : 'plan.addToOverview')}
                        </Text>
                    </TouchableOpacity>

                    {onMove ? (
                        <TouchableOpacity style={styles.actionRow} onPress={onMove}>
                            <Ionicons name="swap-horizontal" size={18} color={t.colors.text} />
                            <Text style={styles.actionText}>{i18n.t('main.item.move')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </Pressable>
            </Pressable>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        scrim: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' },
        sheet: {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            padding: t.spacing.lg,
            paddingBottom: t.spacing.xxl,
            gap: t.spacing.md,
        },
        handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 99, backgroundColor: t.colors.borderStrong, marginBottom: t.spacing.xs },
        heading: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
        input: {
            fontSize: t.type.bodyLg.fontSize,
            color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
        },
        actionRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm },
        actionText: { color: t.colors.text, fontSize: t.type.body.fontSize },
        actionDanger: { color: t.colors.danger },
    })
}
