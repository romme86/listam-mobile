import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { validateTicketDraft, type BoardConfig } from '@listam/domain/board'
import { VALUE_MIN, VALUE_MAX, validateValueDraft } from '@listam/domain/value'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'

export type TicketDraft = {
    description: string
    checklist: Array<{ id: string; text: string; done: boolean }>
    estimatedHours: number
    estimatedComplexity: number
    valueRate?: number
    delayRate?: number
}

type Props = {
    visible: boolean
    config: BoardConfig
    /** Seeds the description when the form opens (e.g. promoting an item into a board via a move). */
    initialDescription?: string
    /** When the destination board has the value-return property on, rating is mandatory. */
    valueReturnOn?: boolean
    onCreate: (draft: TicketDraft) => void
    onClose: () => void
}

type Task = { text: string; done: boolean }

export function CreateTicket({ visible, config, initialDescription = '', valueReturnOn = false, onCreate, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const rigorOn = !!config?.rigorOn

    const [description, setDescription] = useState('')
    const [tasks, setTasks] = useState<Task[]>([{ text: '', done: false }])
    const [hours, setHours] = useState('')
    const [complexity, setComplexity] = useState(50)
    const [valueRate, setValueRate] = useState<number | null>(null)
    const [delayRate, setDelayRate] = useState<number | null>(null)
    const [showErrors, setShowErrors] = useState(false)

    const reset = () => {
        setDescription(''); setTasks([{ text: '', done: false }]); setHours(''); setComplexity(50); setValueRate(null); setDelayRate(null); setShowErrors(false)
    }
    const close = () => { reset(); onClose() }

    // Seed the form when it opens. A normal "new ticket" opens with an empty
    // description; a promote-into-board move opens pre-filled with the item text.
    useEffect(() => {
        if (visible) {
            setDescription(initialDescription)
            setTasks([{ text: '', done: false }])
            setHours('')
            setComplexity(50)
            setValueRate(null)
            setDelayRate(null)
            setShowErrors(false)
        }
    }, [visible, initialDescription])

    const draft = (): TicketDraft => ({
        description: description.trim(),
        checklist: tasks
            .map((task, i) => ({ id: `task-${i}-${task.text.length}`, text: task.text.trim(), done: task.done }))
            .filter((task) => task.text),
        estimatedHours: Number.parseFloat(hours) || 0,
        estimatedComplexity: complexity,
        ...(valueReturnOn ? { valueRate: valueRate ?? undefined, delayRate: delayRate ?? undefined } : {}),
    })

    const missing = useMemo(() => {
        const d = draft()
        // Description is always required (it's the title); the rest only under rigor.
        const m = validateTicketDraft(d, config).missing
        if (!d.description && !m.includes('description')) m.push('description')
        if (valueReturnOn) for (const x of validateValueDraft({ valueRate, delayRate }).missing) m.push(x)
        return m
    }, [description, tasks, hours, complexity, config, valueReturnOn, valueRate, delayRate])

    const submit = () => {
        if (missing.length) { setShowErrors(true); return }
        onCreate(draft())
        reset()
    }

    const err = (field: string) => showErrors && missing.includes(field)

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close}>
            {/* SafeAreaProvider INSIDE the Modal — the root provider's insets don't
                reach the modal's own native window (top reads 0 → header under the
                notch). Seed it with initialWindowMetrics (the DEVICE window's real
                insets captured at launch) so SafeAreaView applies true top+bottom. */}
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={close} hitSlop={10}><Text style={styles.cancel}>{i18n.t('common.cancel')}</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>{i18n.t('ticket.create.title')}</Text>
                    <TouchableOpacity onPress={submit} hitSlop={10}><Text style={styles.create}>{i18n.t('ticket.create.submit')}</Text></TouchableOpacity>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    {rigorOn ? (
                        <>
                            <View style={styles.rigorBadge}>
                                <Ionicons name="shield-checkmark-outline" size={16} color={t.colors.success} />
                                <Text style={styles.rigorBadgeText}>{i18n.t('ticket.create.rigorBadge')}</Text>
                            </View>
                            <Text style={styles.rigorHint}>{i18n.t('ticket.create.rigorHint')}</Text>
                        </>
                    ) : null}

                    <Text style={styles.label}>{i18n.t('ticket.field.description')}{rigorOn ? ' *' : ''}</Text>
                    <TextInput
                        style={[styles.input, err('description') && styles.inputError]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder={i18n.t('ticket.field.descriptionPlaceholder')}
                        placeholderTextColor={t.colors.placeholder}
                    />

                    {rigorOn ? (
                        <>
                            <Text style={styles.label}>{i18n.t('ticket.field.tasks')} *</Text>
                            {tasks.map((task, i) => (
                                <View key={i} style={styles.taskRow}>
                                    <TouchableOpacity onPress={() => setTasks(tasks.map((x, j) => j === i ? { ...x, done: !x.done } : x))} hitSlop={6}>
                                        <Ionicons name={task.done ? 'checkbox' : 'square-outline'} size={22} color={task.done ? t.colors.success : t.colors.textTertiary} />
                                    </TouchableOpacity>
                                    <TextInput
                                        style={[styles.input, styles.taskInput]}
                                        value={task.text}
                                        onChangeText={(text) => setTasks(tasks.map((x, j) => j === i ? { ...x, text } : x))}
                                        placeholder={i18n.t('ticket.field.taskPlaceholder')}
                                        placeholderTextColor={t.colors.placeholder}
                                    />
                                    {tasks.length > 1 ? (
                                        <TouchableOpacity onPress={() => setTasks(tasks.filter((_, j) => j !== i))} hitSlop={6}>
                                            <Ionicons name="close" size={18} color={t.colors.textTertiary} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            {err('checklist') ? <Text style={styles.errorText}>{i18n.t('ticket.create.missing')}</Text> : null}
                            <TouchableOpacity style={styles.addTask} onPress={() => setTasks([...tasks, { text: '', done: false }])}>
                                <Ionicons name="add" size={18} color={t.colors.accent} />
                                <Text style={styles.addTaskText}>{i18n.t('ticket.field.addTask')}</Text>
                            </TouchableOpacity>

                            <Text style={styles.label}>{i18n.t('ticket.field.hours')} *</Text>
                            <TextInput
                                style={[styles.input, styles.hoursInput, err('hours') && styles.inputError]}
                                value={hours}
                                onChangeText={setHours}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor={t.colors.placeholder}
                            />

                            <Text style={styles.label}>{i18n.t('ticket.field.complexity')} *</Text>
                            <View style={styles.sliderRow}>
                                <ComplexitySlider value={complexity} onChange={setComplexity} />
                                <Text style={styles.sliderValue}>{complexity}%</Text>
                            </View>

                            <View style={styles.ownerNote}>
                                <Ionicons name="lock-closed-outline" size={16} color={t.colors.textTertiary} />
                                <Text style={styles.ownerNoteText}>{i18n.t('ticket.rigor.ownerNote')}</Text>
                            </View>
                        </>
                    ) : null}

                    {valueReturnOn ? (
                        <>
                            <Text style={styles.label}>{i18n.t('value.value')} *</Text>
                            <View style={styles.sliderRow}>
                                <Ionicons name="cash-outline" size={18} color={t.colors.success} />
                                <ComplexitySlider value={valueRate ?? VALUE_MIN} onChange={setValueRate} min={VALUE_MIN} max={VALUE_MAX} />
                                <Text style={styles.sliderValue}>{valueRate ?? '—'}</Text>
                            </View>

                            <Text style={styles.label}>{i18n.t('value.delay')} *</Text>
                            <View style={styles.sliderRow}>
                                <Ionicons name="hourglass-outline" size={18} color={t.colors.warning} />
                                <ComplexitySlider value={delayRate ?? VALUE_MIN} onChange={setDelayRate} min={VALUE_MIN} max={VALUE_MAX} />
                                <Text style={styles.sliderValue}>{delayRate ?? '—'}</Text>
                            </View>
                            {err('value') || err('delay') ? <Text style={styles.errorText}>{i18n.t('value.rate.missing')}</Text> : null}
                        </>
                    ) : null}
                </ScrollView>
            </SafeAreaView>
            </SafeAreaProvider>
        </Modal>
    )
}

// Dependency-free slider — avoids a native module + a dev-client rebuild.
// Generic over a [min,max] integer range so it serves complexity (1..100) and
// the value/delay rates (1..10).
function ComplexitySlider({ value, onChange, min = 1, max = 100 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const widthRef = useRef(0)
    const span = Math.max(1, max - min)
    const setFromX = (x: number) => {
        const w = widthRef.current
        if (w <= 0) return
        const pct = Math.max(0, Math.min(1, x / w))
        onChange(Math.max(min, Math.min(max, Math.round(min + pct * span))))
    }
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })).current
    const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width }
    const pct = (Math.max(min, Math.min(max, value)) - min) / span

    return (
        <View style={styles.sliderTrackWrap} onLayout={onLayout} {...pan.panHandlers}>
            <View style={styles.sliderTrack} />
            <View style={[styles.sliderFill, { width: `${pct * 100}%` }]} />
            <View style={[styles.sliderKnob, { left: `${pct * 100}%` }]} />
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: t.colors.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
        headerTitle: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.text },
        cancel: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary },
        create: { fontSize: t.type.body.fontSize, fontWeight: '700', color: t.colors.success },
        scroll: { flex: 1 },
        content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.sm },
        rigorBadge: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, alignSelf: 'flex-start', backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.pill, paddingHorizontal: t.spacing.md, paddingVertical: 6, marginTop: t.spacing.sm },
        rigorBadgeText: { fontSize: t.type.label.fontSize, fontWeight: '700', color: t.colors.text },
        rigorHint: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, marginBottom: t.spacing.sm },
        label: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.textSecondary, marginTop: t.spacing.md },
        input: { fontSize: t.type.body.fontSize, color: t.colors.text, backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
        inputError: { borderColor: t.colors.danger },
        errorText: { fontSize: t.type.caption.fontSize, color: t.colors.danger },
        taskRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
        taskInput: { flex: 1 },
        addTask: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, paddingVertical: t.spacing.sm, alignSelf: 'flex-start' },
        addTaskText: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.accent },
        hoursInput: { alignSelf: 'flex-start', minWidth: 120 },
        sliderRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg, marginTop: t.spacing.sm },
        sliderValue: { fontSize: t.type.title.fontSize, fontWeight: '800', color: t.colors.text, minWidth: 56, textAlign: 'right' },
        sliderTrackWrap: { flex: 1, height: 36, justifyContent: 'center' },
        sliderTrack: { height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceSunken },
        sliderFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: t.colors.success },
        sliderKnob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.success, marginLeft: -11 },
        ownerNote: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, padding: t.spacing.md, marginTop: t.spacing.lg },
        ownerNoteText: { flex: 1, fontSize: t.type.caption.fontSize, color: t.colors.textTertiary },
    })
}
