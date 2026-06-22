import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { reducePlan, groupPlanByDate, toDateKey, shiftDateKey, type PlanRecord } from '@listam/domain/plan'
import { isBoardType } from '@listam/domain/board'
import { isTodoType } from '@listam/domain/identity'
import type { ListEntry } from './_types'

type Props = {
    allItems: ListEntry[]
    listName: (listId: string, type: string) => string
    onToggleSource: (item: ListEntry) => void
    onClearPlan: (ref: string) => void
    onOpenList: (listId: string, type: string) => void
}

type ResolvedItem = { kind: 'item'; rec: PlanRecord; item: ListEntry }
type ResolvedList = { kind: 'list'; rec: PlanRecord; listId: string; listType: string; name: string; count: number }
type Resolved = ResolvedItem | ResolvedList

// The read-only day plan: items and whole lists flagged into a day, joined back
// to their live source rows. Marking an item done / clearing it writes through to
// the source; list-cards open their list and clear from the plan when removed.
export function OverviewScreen({ allItems, listName, onToggleSource, onClearPlan, onOpenList }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [selectedDay, setSelectedDay] = useState('')

    const today = toDateKey(Date.now())
    const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDateKey(today, i)), [today])
    const selected = (selectedDay && week.includes(selectedDay)) ? selectedDay : today

    const byDate = useMemo(() => groupPlanByDate(reducePlan(allItems)), [allItems])
    const byKey = useMemo(() => {
        const m = new Map<string, ListEntry>()
        for (const it of allItems) m.set(`${it.listId}::${it.id}`, it)
        return m
    }, [allItems])

    const matchesType = (itemType: string | undefined, refType: string) => {
        if (isBoardType(refType)) return isBoardType(itemType)
        if (isTodoType(refType)) return isTodoType(itemType)
        return !isBoardType(itemType) && !isTodoType(itemType)
    }

    const resolve = (rec: PlanRecord): Resolved | null => {
        if (rec.kind === 'list') {
            const count = allItems.filter(
                (it) => it.listId === rec.refListId && matchesType(it.listType, rec.refType) && !it.isDone,
            ).length
            return { kind: 'list', rec, listId: rec.refListId, listType: rec.refType, name: listName(rec.refListId, rec.refType), count }
        }
        const item = byKey.get(`${rec.refListId}::${rec.refItemId}`)
        if (!item) return null
        return { kind: 'item', rec, item }
    }
    const resolveDay = (dk: string): Resolved[] =>
        (byDate.get(dk) || []).map(resolve).filter((r): r is Resolved => r !== null)

    const rows = resolveDay(selected)
    const pending = rows.filter((r) => r.kind === 'list' || !r.item.isDone)
    const done = rows.filter((r): r is ResolvedItem => r.kind === 'item' && r.item.isDone)
    const spotlight = pending[0]
    const next = pending.slice(1)

    const dayLabel = (dk: string) =>
        dk === today ? i18n.t('plan.today')
            : dk === week[1] ? i18n.t('plan.tomorrow')
                : parseKey(dk).toLocaleDateString(undefined, { weekday: 'short' })

    const renderRow = (r: Resolved, opts: { spotlight?: boolean } = {}) => {
        if (r.kind === 'list') {
            return (
                <TouchableOpacity
                    key={r.rec.ref}
                    style={[styles.row, styles.listCard, opts.spotlight && styles.spotlight]}
                    activeOpacity={0.7}
                    onPress={() => onOpenList(r.listId, r.listType)}
                >
                    <Ionicons name="list-outline" size={20} color={t.colors.text} />
                    <Text style={[styles.rowText, styles.listText]} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.chip}>{i18n.t('plan.listItems', { count: r.count })}</Text>
                    <TouchableOpacity hitSlop={8} onPress={() => onClearPlan(r.rec.ref)} accessibilityLabel={i18n.t('plan.clearFromPlan')}>
                        <Ionicons name="close" size={18} color={t.colors.textTertiary} />
                    </TouchableOpacity>
                </TouchableOpacity>
            )
        }
        const item = r.item
        return (
            <TouchableOpacity
                key={r.rec.ref}
                style={[styles.row, opts.spotlight && styles.spotlight, item.isDone && styles.rowDone]}
                activeOpacity={0.7}
                onPress={() => onToggleSource(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.isDone }}
            >
                <Ionicons
                    name={item.isDone ? 'checkbox' : 'square-outline'}
                    size={opts.spotlight ? 26 : 22}
                    color={item.isDone ? t.colors.textTertiary : t.colors.text}
                />
                <Text style={[styles.rowText, opts.spotlight && styles.spotlightText, item.isDone && styles.doneText]} numberOfLines={2}>
                    {item.text}
                </Text>
                <Text style={styles.chip}>{listName(item.listId ?? '', item.listType ?? '')}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => onClearPlan(r.rec.ref)} accessibilityLabel={i18n.t('plan.remove')}>
                    <Ionicons name="close" size={18} color={t.colors.textTertiary} />
                </TouchableOpacity>
            </TouchableOpacity>
        )
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>
                {parseKey(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
                {week.map((dk) => {
                    const count = resolveDay(dk).length
                    const isSel = dk === selected
                    return (
                        <TouchableOpacity key={dk} style={[styles.pill, isSel && styles.pillSelected]} onPress={() => setSelectedDay(dk)}>
                            <Text style={[styles.pillDow, isSel && styles.pillSelectedText]}>{dayLabel(dk)}</Text>
                            <Text style={[styles.pillDay, isSel && styles.pillSelectedText]}>{String(parseKey(dk).getDate())}</Text>
                            <Text style={[styles.pillCount, isSel && styles.pillSelectedText]}>{count > 0 ? String(count) : '·'}</Text>
                        </TouchableOpacity>
                    )
                })}
            </ScrollView>

            {rows.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{i18n.t('plan.empty.title')}</Text>
                    <Text style={styles.emptyHint}>{i18n.t('plan.empty.hint')}</Text>
                </View>
            ) : (
                <>
                    {spotlight ? (
                        <>
                            <Text style={styles.sectionLabel}>{i18n.t('plan.now')}</Text>
                            {renderRow(spotlight, { spotlight: true })}
                        </>
                    ) : null}
                    {next.length > 0 ? (
                        <>
                            <Text style={styles.sectionLabel}>{i18n.t('plan.nextUp')}</Text>
                            {next.map((r) => renderRow(r))}
                        </>
                    ) : null}
                    {done.length > 0 ? (
                        <>
                            <Text style={styles.sectionLabel}>{i18n.t('plan.doneToday', { count: done.length })}</Text>
                            {done.map((r) => renderRow(r))}
                        </>
                    ) : null}
                </>
            )}
        </ScrollView>
    )
}

function parseKey(key: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date()
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: t.colors.bg },
        content: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.sm },
        title: { fontSize: t.type.title.fontSize, fontWeight: '600', color: t.colors.text },
        strip: { marginVertical: t.spacing.sm },
        stripContent: { gap: t.spacing.sm, paddingRight: t.spacing.lg },
        pill: {
            alignItems: 'center',
            paddingVertical: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surfaceAlt,
            minWidth: 52,
        },
        pillSelected: { backgroundColor: t.colors.primary },
        pillSelectedText: { color: t.colors.onPrimary },
        pillDow: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textTransform: 'uppercase' },
        pillDay: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.text, marginTop: 2 },
        pillCount: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, marginTop: 2 },
        sectionLabel: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginTop: t.spacing.md,
            marginBottom: t.spacing.xs,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.md,
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.md,
        },
        rowDone: { backgroundColor: t.colors.surfaceAlt },
        spotlight: { borderLeftWidth: 3, borderLeftColor: t.colors.accent, paddingVertical: t.spacing.lg },
        listCard: { backgroundColor: t.colors.surfaceAlt },
        rowText: { flex: 1, fontSize: t.type.body.fontSize, color: t.colors.text },
        spotlightText: { fontSize: t.type.bodyLg.fontSize, fontWeight: '600' },
        listText: { fontWeight: '600' },
        doneText: { color: t.colors.textDisabled, textDecorationLine: 'line-through' },
        chip: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textSecondary,
            backgroundColor: t.colors.surfaceSunken,
            paddingHorizontal: t.spacing.sm,
            paddingVertical: 2,
            borderRadius: t.radius.pill,
            overflow: 'hidden',
        },
        empty: { paddingVertical: t.spacing.xxl, alignItems: 'center', gap: t.spacing.sm },
        emptyTitle: { fontSize: t.type.bodyLg.fontSize, color: t.colors.text },
        emptyHint: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary, textAlign: 'center' },
    })
}
