import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Linking, type TextStyle } from 'react-native'
import type { BoardConfig, BoardState } from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'

// First 1-2 alphanumerics, uppercased — the avatar fallback (mirrors desktop).
export function ticketInitials(value?: string | null): string {
    const s = String(value || '').replace(/[^a-z0-9]/gi, '')
    return (s.slice(0, 2) || '?').toUpperCase()
}

export function stateById(config: BoardConfig, id?: string): BoardState | null {
    const states = Array.isArray(config?.states) ? config.states : []
    return states.find((s) => s.id === id) || states[0] || null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatDue(dueAt?: number | null): string | null {
    if (typeof dueAt !== 'number' || !Number.isFinite(dueAt) || dueAt <= 0) return null
    const d = new Date(dueAt)
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

const PRIORITY_KEY: Record<string, string> = {
    low: 'ticket.priority.low',
    medium: 'ticket.priority.medium',
    high: 'ticket.priority.high',
    urgent: 'ticket.priority.urgent',
}

export function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
    const t = useTheme()
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: t.colors.surfaceSunken,
            alignItems: 'center', justifyContent: 'center',
        }}>
            <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: t.colors.textSecondary }}>
                {ticketInitials(name)}
            </Text>
        </View>
    )
}

// Status pill: a dot in the state's configured color + the state name.
export function StatusPill({ state }: { state: BoardState | null }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    if (!state) return null
    return (
        <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: state.color || t.colors.textTertiary }]} />
            <Text style={styles.pillText}>{state.name}</Text>
        </View>
    )
}

export function PriorityPill({ priority }: { priority?: string | null }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const i18n = useI18n()
    if (!priority || !PRIORITY_KEY[priority]) return null
    const filled = priority === 'high' || priority === 'urgent'
    const bg = priority === 'urgent' ? t.colors.danger : filled ? t.colors.primary : t.colors.surfaceAlt
    const fg = priority === 'urgent' ? t.colors.onDanger : filled ? t.colors.onPrimary : t.colors.textSecondary
    return (
        <View style={[styles.pill, { backgroundColor: bg }]}>
            <Text style={[styles.pillText, { color: fg }]}>{i18n.t(PRIORITY_KEY[priority] as never)}</Text>
        </View>
    )
}

// Timeliness badge for done tickets (on time / overtime / undertime).
export function TimelinessBadge({ timeliness, delta }: { timeliness?: string | null; delta?: number | null }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const i18n = useI18n()
    if (!timeliness) return null
    const color = timeliness === 'overtime' ? t.colors.danger
        : timeliness === 'undertime' ? t.colors.warning
            : t.colors.success
    const sign = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}%` : ''
    return (
        <View style={[styles.pill, { backgroundColor: 'transparent', paddingHorizontal: 0 }]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.pillText, { color }]}>
                {i18n.t(`ticket.timeliness.${timeliness}` as never)}{sign ? ` ${sign}` : ''}
            </Text>
        </View>
    )
}

// --- inline markdown (RN mirror of the desktop renderInlineMarkdown subset) ---

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const INLINE_RE = /(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g

type Seg = { text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string }

function parseInline(input: string): Seg[] {
    const text = typeof input === 'string' ? input : ''
    const segs: Seg[] = []
    let last = 0
    let m: RegExpExecArray | null
    INLINE_RE.lastIndex = 0
    while ((m = INLINE_RE.exec(text)) !== null) {
        if (m.index > last) segs.push({ text: text.slice(last, m.index) })
        if (m[1]) segs.push({ text: m[2], bold: true })
        else if (m[3]) segs.push({ text: m[4], italic: true })
        else if (m[5]) segs.push({ text: m[6], code: true })
        else if (m[7]) segs.push({ text: m[8], url: SAFE_LINK.test(m[9]) ? m[9] : undefined })
        last = INLINE_RE.lastIndex
    }
    if (last < text.length) segs.push({ text: text.slice(last) })
    return segs
}

export function TicketInlineMarkdown({ text, style }: { text?: string; style?: TextStyle }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const segs = useMemo(() => parseInline(text ?? ''), [text])
    return (
        <Text style={[styles.body, style]}>
            {segs.map((s, i) => {
                if (s.url) {
                    return (
                        <Text key={i} style={styles.link} onPress={() => Linking.openURL(s.url as string).catch(() => {})}>
                            {s.text}
                        </Text>
                    )
                }
                const segStyle: TextStyle = {}
                if (s.bold) segStyle.fontWeight = '700'
                if (s.italic) segStyle.fontStyle = 'italic'
                if (s.code) return <Text key={i} style={styles.code}>{s.text}</Text>
                return <Text key={i} style={segStyle}>{s.text}</Text>
            })}
        </Text>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        pill: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.spacing.md, paddingVertical: 5,
            alignSelf: 'flex-start',
        },
        dot: { width: 8, height: 8, borderRadius: 4 },
        pillText: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.text },
        body: { fontSize: t.type.body.fontSize, color: t.colors.text, lineHeight: 22 },
        link: { color: t.colors.accent, textDecorationLine: 'underline' },
        code: {
            fontFamily: 'CasinoGrotesk-Regular',
            backgroundColor: t.colors.surfaceAlt, color: t.colors.text,
        },
    })
}
