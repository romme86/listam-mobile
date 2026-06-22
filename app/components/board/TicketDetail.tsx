import React, { useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ticketBadges, formatDuration, type BoardConfig, type TicketBlock } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import type { ListEntry } from '../_types'
import { Avatar, PriorityPill, StatusPill, TicketInlineMarkdown, stateById, formatDue, ticketInitials } from './TicketBits'
import { BlockBody } from './BlockBody'
import { RichMarkdownEditor } from './RichMarkdownEditor'

type Props = {
    visible: boolean
    ticket: ListEntry | null
    config: BoardConfig
    listName: string
    onUpdate: (patch: Record<string, unknown>) => void
    onChangeStatus: (statusId: string) => void
    onRequestMove?: (ticket: ListEntry) => void
    onClose: () => void
}

const PRIORITIES = ['', 'low', 'medium', 'high', 'urgent']

export function TicketDetail({ visible, ticket, config, listName, onUpdate, onChangeStatus, onRequestMove, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [picker, setPicker] = useState<null | 'status' | 'priority'>(null)

    if (!ticket) return null
    const b = ticketBadges(ticket)
    const state = stateById(config, ticket.status)
    const due = formatDue(ticket.dueAt)
    const assignee = ticket.assignee || ticket.createdBy || null

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            {/* SafeAreaProvider INSIDE the Modal — the root provider's insets don't
                reach the modal's own native window (top reads 0 → header ends up under
                the notch). Seed it with initialWindowMetrics (the DEVICE window's real
                insets captured natively at launch, ~59 top) so SafeAreaView applies the
                true top + bottom insets immediately. */}
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={i18n.t('ticket.detail.close')}>
                        <Ionicons name="chevron-back" size={26} color={t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{listName}</Text>
                    <View style={styles.headerActions}>
                        {onRequestMove ? (
                            <TouchableOpacity onPress={() => onRequestMove(ticket)} hitSlop={10} accessibilityLabel={i18n.t('main.item.move')}>
                                <Ionicons name="swap-horizontal" size={24} color={t.colors.text} />
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={i18n.t('common.close')}>
                            <Ionicons name="close" size={26} color={t.colors.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View style={styles.pillRow}>
                        <TouchableOpacity onPress={() => setPicker('status')} accessibilityLabel={i18n.t('ticket.detail.status')}>
                            <StatusPill state={state} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setPicker('priority')} accessibilityLabel={i18n.t('ticket.detail.priority')}>
                            {ticket.priority
                                ? <PriorityPill priority={ticket.priority} />
                                : <View style={styles.addPriority}><Text style={styles.addPriorityText}>{i18n.t('ticket.detail.priority')}</Text></View>}
                        </TouchableOpacity>
                    </View>

                    <InlineEditable
                        value={ticket.text || ''}
                        placeholder={i18n.t('ticket.detail.titlePlaceholder')}
                        textStyle={styles.title}
                        onCommit={(text) => onUpdate({ text })}
                    />

                    <View style={styles.subline}>
                        <Avatar name={assignee} size={26} />
                        <Text style={styles.sublineText}>
                            {assignee ? ticketInitials(assignee) : i18n.t('ticket.detail.none')}
                            {due ? ` · ${i18n.t('ticket.detail.due')} ${due}` : ''}
                        </Text>
                    </View>

                    <View style={styles.stats}>
                        <StatRow label={i18n.t('ticket.detail.estimate')} value={b.estimatedHours ? `${b.estimatedHours}h` : i18n.t('ticket.detail.none')} />
                        <View style={styles.statDivider} />
                        <StatRow label={i18n.t('ticket.detail.complexity')} value={typeof ticket.estimatedComplexity === 'number' ? `${ticket.estimatedComplexity}%` : i18n.t('ticket.detail.none')} />
                        <View style={styles.statDivider} />
                        <StatRow label={i18n.t('ticket.detail.timeSpent')} value={formatDuration(b.inProgressMs)} />
                    </View>

                    <Text style={styles.sectionLabel}>{i18n.t('ticket.detail.overview')}</Text>
                    <InlineEditable
                        value={ticket.description || ''}
                        placeholder={i18n.t('ticket.detail.descriptionPlaceholder')}
                        textStyle={styles.overview}
                        markdown
                        multiline
                        onCommit={(description) => onUpdate({ description })}
                    />

                    <Text style={styles.sectionLabel}>{i18n.t('ticket.detail.body')}</Text>
                    <BlockBody
                        blocks={ticket.blocks as TicketBlock[] | undefined}
                        onChange={(blocks) => onUpdate({ blocks })}
                    />
                </ScrollView>

                <View style={styles.bottomBar}>
                    <TouchableOpacity style={styles.bottomStatus} onPress={() => setPicker('status')} accessibilityRole="button">
                        <View style={[styles.dot, { backgroundColor: state?.color || t.colors.textTertiary }]} />
                        <Text style={styles.bottomStatusText}>{state?.name}</Text>
                        <Ionicons name="chevron-up" size={16} color={t.colors.textTertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.advanceBtn}
                        onPress={() => {
                            const states = config.states || []
                            const idx = states.findIndex((s) => s.id === ticket.status)
                            const next = states[(idx + 1) % Math.max(1, states.length)]
                            if (next) onChangeStatus(next.id)
                        }}
                        accessibilityLabel={i18n.t('ticket.detail.status')}
                    >
                        <Ionicons name="arrow-forward" size={20} color={t.colors.onAccent} />
                    </TouchableOpacity>
                </View>

                {picker ? (
                    <TouchableOpacity style={styles.pickerScrim} activeOpacity={1} onPress={() => setPicker(null)}>
                        <View style={styles.pickerSheet}>
                            {picker === 'status'
                                ? (config.states || []).map((s) => (
                                    <TouchableOpacity key={s.id} style={styles.pickerRow} onPress={() => { onChangeStatus(s.id); setPicker(null) }}>
                                        <View style={[styles.dot, { backgroundColor: s.color || t.colors.textTertiary }]} />
                                        <Text style={styles.pickerLabel}>{s.name}</Text>
                                        {s.id === ticket.status ? <Ionicons name="checkmark" size={18} color={t.colors.accent} /> : null}
                                    </TouchableOpacity>
                                ))
                                : PRIORITIES.map((p) => (
                                    <TouchableOpacity key={p || 'none'} style={styles.pickerRow} onPress={() => { onUpdate({ priority: p || undefined }); setPicker(null) }}>
                                        <Text style={styles.pickerLabel}>{p ? i18n.t(`ticket.priority.${p}` as never) : i18n.t('ticket.priority.none')}</Text>
                                        {(ticket.priority || '') === p ? <Ionicons name="checkmark" size={18} color={t.colors.accent} /> : null}
                                    </TouchableOpacity>
                                ))}
                        </View>
                    </TouchableOpacity>
                ) : null}
            </SafeAreaView>
            </SafeAreaProvider>
        </Modal>
    )
}

function StatRow({ label, value }: { label: string; value: string }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    return (
        <View style={styles.statRow}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    )
}

function InlineEditable({ value, placeholder, textStyle, markdown, multiline, onCommit }: {
    value: string
    placeholder: string
    textStyle: object
    markdown?: boolean
    multiline?: boolean
    onCommit: (v: string) => void
}) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    if (editing) {
        // Markdown fields edit as live WYSIWYG (TipTap-in-webview): the user sees
        // only compiled markdown, never the raw syntax, while the stored value
        // stays markdown via the shared markdown<->HTML bridge. The editor
        // commits itself on unmount, so Save just leaves edit mode.
        if (markdown) {
            return (
                <View>
                    <RichMarkdownEditor
                        initialMarkdown={value}
                        mode="inline"
                        minHeight={96}
                        onCommit={(md) => { if (md !== value) onCommit(md) }}
                    />
                    <TouchableOpacity style={styles.richDone} accessibilityRole="button" onPress={() => setEditing(false)}>
                        <Ionicons name="checkmark" size={16} color={t.colors.accent} />
                        <Text style={styles.richDoneText}>{i18n.t('common.save')}</Text>
                    </TouchableOpacity>
                </View>
            )
        }
        return (
            <TextInput
                style={[textStyle, styles.editing]}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                multiline={multiline}
                placeholder={placeholder}
                placeholderTextColor={t.colors.placeholder}
                onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft) }}
            />
        )
    }
    return (
        <TouchableOpacity activeOpacity={0.6} onPress={() => { setDraft(value); setEditing(true) }}>
            {value
                ? (markdown ? <TicketInlineMarkdown text={value} style={textStyle} /> : <Text style={textStyle}>{value}</Text>)
                : <Text style={[textStyle, { color: t.colors.placeholder }]}>{placeholder}</Text>}
        </TouchableOpacity>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: t.colors.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
        headerActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.textSecondary },
        scroll: { flex: 1 },
        content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.lg },
        pillRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.sm },
        addPriority: { borderRadius: t.radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, paddingHorizontal: t.spacing.md, paddingVertical: 5 },
        addPriorityText: { fontSize: t.type.label.fontSize, color: t.colors.textTertiary, fontWeight: '600' },
        title: { fontSize: 26, fontWeight: '800', color: t.colors.text },
        editing: { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.sm, paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.sm },
        richDone: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.xs,
            paddingVertical: t.spacing.sm, marginTop: t.spacing.xs, borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceAlt,
        },
        richDoneText: { fontSize: t.type.label.fontSize, fontWeight: '700', color: t.colors.accent },
        subline: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
        sublineText: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary },
        stats: { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.lg, paddingHorizontal: t.spacing.lg },
        statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: t.spacing.md },
        statDivider: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
        statLabel: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary },
        statValue: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.text },
        sectionLabel: { fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
        overview: { fontSize: t.type.body.fontSize, color: t.colors.text, lineHeight: 22 },
        bottomBar: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
        bottomStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md },
        bottomStatusText: { flex: 1, fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.text },
        dot: { width: 9, height: 9, borderRadius: 5 },
        advanceBtn: { width: 48, height: 48, borderRadius: t.radius.md, backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' },
        pickerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' },
        pickerSheet: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.xl, borderTopRightRadius: t.radius.xl, paddingVertical: t.spacing.sm },
        pickerRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.xl, paddingVertical: t.spacing.lg },
        pickerLabel: { flex: 1, fontSize: t.type.body.fontSize, color: t.colors.text },
    })
}
