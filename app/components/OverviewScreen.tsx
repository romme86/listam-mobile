import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { reducePlan, groupPlanByDate, overduePlanRecords, toDateKey, shiftDateKey, type PlanRecord } from '@listam/domain/plan'
import { isBoardType } from '@listam/domain/board'
import { isTodoType } from '@listam/domain/identity'
import { ListSwipePager } from './ListSwipePager'
import type { ListEntry } from './_types'

type Props = {
    allItems: ListEntry[]
    listName: (listId: string, type: string) => string
    onToggleSource: (item: ListEntry) => void
    onClearPlan: (ref: string) => void
    onOpenList: (listId: string, type: string) => void
    onMovePlan: (ref: string, dateKey: string) => void
}

type ResolvedItem = { kind: 'item'; rec: PlanRecord; item: ListEntry }
type ResolvedList = { kind: 'list'; rec: PlanRecord; listId: string; listType: string; name: string; count: number }
type Resolved = ResolvedItem | ResolvedList

// The Overview: one focused day at a time. Items and whole lists captured into
// a day, joined back to their live source rows. Marking an item done / clearing
// it writes through to the source; list-cards open their list and clear from
// the plan when removed. Horizontal swipes page DAYS (not lists) — the strip
// anchors yesterday first so the "Now" pill sits second from the left.
export function OverviewScreen({ allItems, listName, onToggleSource, onClearPlan, onOpenList, onMovePlan }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [selectedDay, setSelectedDay] = useState('')
    // Which window the strip shows: 0 = the week starting yesterday, negative
    // pages into the past, positive into the future.
    const [weekOffset, setWeekOffset] = useState(0)

    const today = toDateKey(Date.now())
    const anchor = useMemo(() => shiftDateKey(today, -1 + weekOffset * 7), [today, weekOffset])
    const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDateKey(anchor, i)), [anchor])
    // Keep the selection on-screen: the picked day if visible, else today, else
    // the window's first pill.
    const selected = (selectedDay && week.includes(selectedDay))
        ? selectedDay
        : (week.includes(today) ? today : week[0])

    const reduced = useMemo(() => reducePlan(allItems), [allItems])
    const byDate = useMemo(() => groupPlanByDate(reduced), [reduced])
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
    // Derived carryover (Now only): entries parked on a past day that aren't done
    // yet, surfaced here without ever rewriting their stored day.
    const carried = selected === today
        ? overduePlanRecords(reduced, today)
            .map(resolve)
            .filter((r): r is Resolved => r !== null)
            .filter((r) => r.kind === 'list' || !r.item.isDone)
        : []

    // Swiping pages one day at a time; crossing the visible window slides the
    // strip by a week. Content swaps in place, so the pager snaps straight back.
    const commitDay = (dir: 1 | -1): boolean => {
        const nextDay = shiftDateKey(selected, dir)
        if (!week.includes(nextDay)) setWeekOffset((n) => n + dir)
        setSelectedDay(nextDay)
        return true
    }

    const dayLabel = (dk: string) =>
        dk === today ? i18n.t('plan.now') : parseKey(dk).toLocaleDateString(undefined, { weekday: 'short' })

    // Origin-day badge + a one-tap "move to now" shown on carried-over rows.
    const carryExtras = (ref: string, dk: string) => (
        <>
            <Text style={styles.carryBadge}>
                {parseKey(dk).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
            </Text>
            <TouchableOpacity hitSlop={8} onPress={() => onMovePlan(ref, today)} accessibilityLabel={i18n.t('plan.moveToNow')}>
                <Ionicons name="arrow-up-circle-outline" size={20} color={t.colors.accent} />
            </TouchableOpacity>
        </>
    )

    const renderRow = (r: Resolved, opts: { spotlight?: boolean; carried?: boolean } = {}) => {
        if (r.kind === 'list') {
            return (
                <TouchableOpacity
                    key={r.rec.ref}
                    style={[styles.row, styles.listCard, opts.spotlight && styles.spotlight, opts.carried && styles.carryRow]}
                    activeOpacity={0.7}
                    onPress={() => onOpenList(r.listId, r.listType)}
                >
                    <Ionicons name="list-outline" size={20} color={t.colors.text} />
                    <Text style={[styles.rowText, styles.listText]} numberOfLines={1}>{r.name}</Text>
                    {opts.carried ? carryExtras(r.rec.ref, r.rec.plannedFor) : null}
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
                style={[styles.row, opts.spotlight && styles.spotlight, opts.carried && styles.carryRow, item.isDone && styles.rowDone]}
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
                {opts.carried ? carryExtras(r.rec.ref, r.rec.plannedFor) : null}
                <Text style={styles.chip}>{listName(item.listId ?? '', item.listType ?? '')}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => onClearPlan(r.rec.ref)} accessibilityLabel={i18n.t('plan.remove')}>
                    <Ionicons name="close" size={18} color={t.colors.textTertiary} />
                </TouchableOpacity>
            </TouchableOpacity>
        )
    }

    return (
        <View style={styles.screen}>
            <View style={styles.titleRow}>
                <Text style={styles.title}>{i18n.t('desktop.nav.overview')}</Text>
                {selected !== today ? (
                    <TouchableOpacity
                        style={styles.nowBtn}
                        onPress={() => { setWeekOffset(0); setSelectedDay(today) }}
                        accessibilityLabel={i18n.t('plan.now')}
                    >
                        <Text style={styles.nowBtnText}>{i18n.t('plan.now')}</Text>
                    </TouchableOpacity>
                ) : null}
                <Text style={styles.dateSub}>
                    {parseKey(selected).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
            </View>

            <View style={styles.strip}>
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
            </View>

            <ListSwipePager canPage onCommit={commitDay}>
                <ScrollView style={styles.pane} contentContainerStyle={styles.content}>
                    {carried.length > 0 ? (
                        <>
                            <Text style={styles.sectionLabel}>{i18n.t('plan.carriedOver', { count: carried.length })}</Text>
                            {carried.map((r) => renderRow(r, { carried: true }))}
                        </>
                    ) : null}

                    {rows.length === 0 && carried.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>{i18n.t('plan.empty.title')}</Text>
                            <Text style={styles.emptyHint}>{i18n.t('plan.empty.hintTripleTap')}</Text>
                        </View>
                    ) : (
                        <>
                            {spotlight ? renderRow(spotlight, { spotlight: true }) : null}
                            {next.length > 0 ? (
                                <>
                                    <Text style={styles.sectionLabel}>{i18n.t('plan.nextUp')}</Text>
                                    {next.map((r) => renderRow(r))}
                                </>
                            ) : null}
                            {done.length > 0 ? (
                                <>
                                    <Text style={styles.sectionLabel}>{i18n.t('plan.done', { count: done.length })}</Text>
                                    {done.map((r) => renderRow(r))}
                                </>
                            ) : null}
                        </>
                    )}
                </ScrollView>
            </ListSwipePager>
        </View>
    )
}

function parseKey(key: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date()
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: t.colors.bg },
        titleRow: {
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.md,
        },
        title: { fontSize: t.type.title.fontSize, fontWeight: '600', color: t.colors.text, flex: 1 },
        dateSub: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary },
        nowBtn: {
            paddingVertical: t.spacing.xs,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surfaceAlt,
        },
        nowBtnText: { fontSize: t.type.caption.fontSize, fontWeight: '600', color: t.colors.text },
        strip: {
            flexDirection: 'row',
            gap: t.spacing.xs + 2,
            paddingHorizontal: t.spacing.lg,
            marginVertical: t.spacing.sm,
        },
        pill: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: t.spacing.sm,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surfaceAlt,
        },
        pillSelected: { backgroundColor: t.colors.primary },
        pillSelectedText: { color: t.colors.onPrimary },
        pillDow: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textTransform: 'uppercase' },
        pillDay: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.text, marginTop: 2 },
        pillCount: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary, marginTop: 2 },
        pane: { flex: 1 },
        content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.sm },
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
        spotlight: { borderLeftWidth: 3, borderLeftColor: t.colors.accent, paddingVertical: t.spacing.lg, marginTop: t.spacing.sm },
        carryRow: { borderLeftWidth: 2, borderLeftColor: t.colors.accent },
        carryBadge: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textSecondary,
            backgroundColor: t.colors.surfaceSunken,
            paddingHorizontal: t.spacing.sm,
            paddingVertical: 2,
            borderRadius: t.radius.pill,
            overflow: 'hidden',
        },
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
