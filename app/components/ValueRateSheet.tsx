import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { VALUE_MIN, VALUE_MAX, validateValueDraft } from '@listam/domain/value'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

type Props = {
    visible: boolean
    /** Item text shown as context for an add; omitted for an edit. */
    text?: string
    initialValue?: number | null
    initialDelay?: number | null
    confirmLabel?: string
    onConfirm: (valueRate: number, delayRate: number) => void
    onClose: () => void
}

// Mandatory value + delay rating (1-10 each). Used to gate a to-do add on a
// value-return surface and to edit an existing item's rates.
export function ValueRateSheet({ visible, text, initialValue = null, initialDelay = null, confirmLabel, onConfirm, onClose }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [value, setValue] = useState<number | null>(initialValue)
    const [delay, setDelay] = useState<number | null>(initialDelay)
    const [showErrors, setShowErrors] = useState(false)

    useEffect(() => {
        if (visible) { setValue(initialValue); setDelay(initialDelay); setShowErrors(false) }
    }, [visible, initialValue, initialDelay])

    const missing = validateValueDraft({ valueRate: value, delayRate: delay }).missing
    const submit = () => {
        if (missing.length) { setShowErrors(true); return }
        onConfirm(value as number, delay as number)
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity style={styles.sheet} activeOpacity={1}>
                    <Text style={styles.title}>{i18n.t('value.addRate')}</Text>
                    {text ? <Text style={styles.subtitle} numberOfLines={2}>{text}</Text> : null}

                    <Text style={styles.label}>{i18n.t('value.value')} *</Text>
                    <View style={styles.row}>
                        <MaterialCommunityIcons name="cash-multiple" size={18} color={t.colors.success} />
                        <RateSlider value={value ?? VALUE_MIN} onChange={setValue} />
                        <Text style={styles.num}>{value ?? '—'}</Text>
                    </View>

                    <Text style={styles.label}>{i18n.t('value.delay')} *</Text>
                    <View style={styles.row}>
                        <MaterialCommunityIcons name="timer-sand" size={18} color={t.colors.warning} />
                        <RateSlider value={delay ?? VALUE_MIN} onChange={setDelay} />
                        <Text style={styles.num}>{delay ?? '—'}</Text>
                    </View>

                    {showErrors && missing.length ? <Text style={styles.error}>{i18n.t('value.rate.missing')}</Text> : null}

                    <View style={styles.actions}>
                        <TouchableOpacity onPress={onClose} hitSlop={8}><Text style={styles.cancel}>{i18n.t('common.cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity onPress={submit} hitSlop={8}><Text style={styles.confirm}>{confirmLabel ?? i18n.t('value.add')}</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    )
}

// Dependency-free 1..10 slider (same approach as CreateTicket's ComplexitySlider).
function RateSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const widthRef = useRef(0)
    const span = VALUE_MAX - VALUE_MIN
    const setFromX = (x: number) => {
        const w = widthRef.current
        if (w <= 0) return
        const pct = Math.max(0, Math.min(1, x / w))
        onChange(Math.max(VALUE_MIN, Math.min(VALUE_MAX, Math.round(VALUE_MIN + pct * span))))
    }
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })).current
    const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width }
    const pct = (Math.max(VALUE_MIN, Math.min(VALUE_MAX, value)) - VALUE_MIN) / span
    return (
        <View style={styles.trackWrap} onLayout={onLayout} {...pan.panHandlers}>
            <View style={styles.track} />
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            <View style={[styles.knob, { left: `${pct * 100}%` }]} />
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: t.spacing.lg },
        sheet: { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, padding: t.spacing.lg, gap: t.spacing.sm },
        title: { fontSize: t.type.title.fontSize, fontWeight: '800', color: t.colors.text },
        subtitle: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary, marginBottom: t.spacing.sm },
        label: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '700', color: t.colors.textSecondary, marginTop: t.spacing.sm },
        row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
        num: { fontSize: t.type.title.fontSize, fontWeight: '800', color: t.colors.text, minWidth: 36, textAlign: 'right' },
        error: { fontSize: t.type.caption.fontSize, color: t.colors.danger, marginTop: t.spacing.xs },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.xl, marginTop: t.spacing.lg },
        cancel: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary },
        confirm: { fontSize: t.type.body.fontSize, fontWeight: '800', color: t.colors.success },
        trackWrap: { flex: 1, height: 36, justifyContent: 'center' },
        track: { height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceSunken },
        fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: t.colors.success },
        knob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.success, marginLeft: -11 },
    })
}
