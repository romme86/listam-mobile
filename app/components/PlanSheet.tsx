import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { toDateKey, shiftDateKey } from '@listam/domain/plan'
import type { ListEntry } from './_types'

type Props = {
    visible: boolean
    item: ListEntry | null
    planned: boolean
    onPickDay: (dateKey: string) => void
    onClear: () => void
    onEdit: (text: string) => void
    onClose: () => void
}

// Bottom-sheet for the deliberate flag path: long-pressing a list row opens it
// to edit the row text or plan it for a specific day (Today + the next six),
// mirroring the desktop day-picker popover.
export function PlanSheet({ visible, item, planned, onPickDay, onClear, onEdit, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [draft, setDraft] = useState('')

    useEffect(() => {
        if (visible && item) setDraft(item.text)
    }, [visible, item])

    if (!item) return null

    const today = toDateKey(Date.now())
    const week = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, i))
    const dayLabel = (dk: string) =>
        dk === today ? i18n.t('plan.today')
            : dk === week[1] ? i18n.t('plan.tomorrow')
                : parseKey(dk).toLocaleDateString(undefined, { weekday: 'short' })

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
                    <Text style={styles.heading}>{i18n.t('plan.planFor')}</Text>

                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={submitEdit}
                        returnKeyType="done"
                        placeholder={i18n.t('main.item.editPlaceholder')}
                        placeholderTextColor={t.colors.placeholder}
                    />

                    <View style={styles.grid}>
                        {week.map((dk) => (
                            <TouchableOpacity key={dk} style={styles.dayCell} onPress={() => onPickDay(dk)}>
                                <Text style={styles.dayDow}>{dayLabel(dk)}</Text>
                                <Text style={styles.dayNum}>{String(parseKey(dk).getDate())}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {planned ? (
                        <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
                            <Ionicons name="close-circle-outline" size={18} color={t.colors.danger} />
                            <Text style={styles.clearText}>{i18n.t('plan.clearFromPlan')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </Pressable>
            </Pressable>
        </Modal>
    )
}

function parseKey(key: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date()
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
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
        dayCell: {
            width: '22%',
            flexGrow: 1,
            alignItems: 'center',
            paddingVertical: t.spacing.md,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.md,
        },
        dayDow: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textTransform: 'uppercase' },
        dayNum: { fontSize: t.type.title.fontSize, fontWeight: '600', color: t.colors.text, marginTop: 2 },
        clearBtn: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm },
        clearText: { color: t.colors.danger, fontSize: t.type.body.fontSize },
    })
}
