import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react'
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    View,
    type GestureResponderEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../feedback'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { identityKey } from '../listProjection'
import { groupByCategory, getDisplayCategoryName } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'
import type { ListEntry } from './_types'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

/** Hold this long (finger roughly still) before an item is picked up to drag. */
const LONG_PRESS_MS = 280
/** Move more than this before pick-up and we treat the touch as a scroll/swipe. */
const MOVE_CANCEL = 12

const GHOST_WIDTH = 200
const GHOST_HEIGHT = 44

/** Sentinel drop-target key for the trash zone. */
const DELETE_KEY = '__delete__'
/** Sentinel drop-target keys for the reorder zones. */
const MOVE_TOP_KEY = '__move_top__'
const MOVE_BOTTOM_KEY = '__move_bottom__'

type DragTarget = { canonicalKey: string; label: string; icon: string }

type DragController = {
    /** Categories are on, so a long-press picks an item up to move or delete it. */
    enabled: boolean
    /** identityKey of the item currently being dragged, else null. */
    draggingId: string | null
    /** Pick up `item` (currently in `categoryKey`) at screen point (x, y). */
    begin: (item: ListEntry, categoryKey: string, x: number, y: number) => void
    /** Report the finger at screen point (x, y) during a drag. */
    move: (x: number, y: number) => void
    /** Release — drop onto the hovered category if any. */
    end: () => void
    /** Abandon the drag with no change. */
    cancel: () => void
}

const noop = () => {}
const DragContext = createContext<DragController>({
    enabled: false,
    draggingId: null,
    begin: noop,
    move: noop,
    end: noop,
    cancel: noop,
})

export function useCategoryDrag(): DragController {
    return useContext(DragContext)
}

type ProviderProps = {
    data: ListEntry[]
    enabled: boolean
    groceryLocale: Parameters<typeof getDisplayCategoryName>[1]
    onAssign: (item: ListEntry, canonicalKey: string) => void
    onDelete: (item: ListEntry) => void
    // When set, the overlay also offers "move to top / bottom" reorder targets.
    // Independent of `enabled` (categories) so a plain to-do list can reorder
    // even though it has no category targets.
    reorderEnabled?: boolean
    onReorder?: (item: ListEntry, edge: 'top' | 'bottom') => void
    children: React.ReactNode
}

export function CategoryDragProvider({
    data,
    enabled,
    groceryLocale,
    onAssign,
    onDelete,
    reorderEnabled = false,
    onReorder,
    children,
}: ProviderProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])

    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [dragText, setDragText] = useState('')
    const [hoveredKey, setHoveredKey] = useState<string | null>(null)

    const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
    const payloadRef = useRef<ListEntry | null>(null)
    const originKeyRef = useRef<string | null>(null)
    const hoveredRef = useRef<string | null>(null)
    // Measured screen rects of each drop target, keyed by canonical category.
    const rectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map())
    const rowRefs = useRef<Map<string, View>>(new Map())

    const targets = useMemo<DragTarget[]>(() => {
        if (!enabled || data.length === 0) return []
        return groupByCategory(data, groceryLocale).map((section) => ({
            canonicalKey: section.canonicalKey,
            label: section.category,
            icon: CATEGORY_ICONS[section.canonicalKey] || 'basket-outline',
        }))
    }, [data, enabled, groceryLocale])
    const targetsRef = useRef(targets)
    targetsRef.current = targets

    const measureRow = useCallback((key: string) => {
        const node = rowRefs.current.get(key)
        if (!node) return
        node.measureInWindow((x, y, w, h) => {
            rectsRef.current.set(key, { x, y, w, h })
        })
    }, [])

    const hitTest = useCallback((x: number, y: number): string | null => {
        for (const [key, r] of rectsRef.current) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return key
        }
        return null
    }, [])

    const begin = useCallback((item: ListEntry, categoryKey: string, x: number, y: number) => {
        payloadRef.current = item
        originKeyRef.current = categoryKey
        hoveredRef.current = null
        rectsRef.current.clear()
        ghostPos.setValue({ x, y })
        setDragText(item.text)
        setHoveredKey(null)
        setDraggingId(identityKey(item))
    }, [ghostPos])

    const move = useCallback((x: number, y: number) => {
        if (!payloadRef.current) return
        ghostPos.setValue({ x, y })
        const hit = hitTest(x, y)
        if (hit !== hoveredRef.current) {
            hoveredRef.current = hit
            setHoveredKey(hit)
            if (hit && hit !== originKeyRef.current) haptics.select()
        }
    }, [ghostPos, hitTest])

    const finish = useCallback((commit: boolean) => {
        const item = payloadRef.current
        const hovered = hoveredRef.current
        const origin = originKeyRef.current
        payloadRef.current = null
        hoveredRef.current = null
        originKeyRef.current = null
        setDraggingId(null)
        setHoveredKey(null)
        setDragText('')
        if (!commit || !item || !hovered) return
        if (hovered === DELETE_KEY) {
            onDelete(item)
        } else if (hovered === MOVE_TOP_KEY) {
            onReorder?.(item, 'top')
        } else if (hovered === MOVE_BOTTOM_KEY) {
            onReorder?.(item, 'bottom')
        } else if (hovered !== origin) {
            onAssign(item, hovered)
        }
    }, [onAssign, onDelete, onReorder])

    const end = useCallback(() => finish(true), [finish])
    const cancel = useCallback(() => finish(false), [finish])

    const reorderAvailable = reorderEnabled && Boolean(onReorder) && data.length > 1
    const controller = useMemo<DragController>(() => ({
        // A long-press is useful as soon as there is something to do: move
        // between categories / delete (when categories are on) or reorder (needs
        // 2+ items). The trash zone is always present while the overlay is up.
        enabled: (enabled && data.length > 0) || reorderAvailable,
        draggingId,
        begin,
        move,
        end,
        cancel,
    }), [enabled, reorderAvailable, data.length, draggingId, begin, move, end, cancel])

    const dragging = draggingId !== null

    return (
        <DragContext.Provider value={controller}>
            {children}
            {dragging && (
                <View style={styles.overlay} pointerEvents="none">
                    <View style={styles.backdrop} />
                    <Text style={styles.title}>{i18n.t('main.drag.title')}</Text>
                    <View style={styles.targets}>
                        {reorderAvailable && [
                            { key: MOVE_TOP_KEY, label: i18n.t('main.drag.toTop'), icon: 'arrow-up' },
                            { key: MOVE_BOTTOM_KEY, label: i18n.t('main.drag.toBottom'), icon: 'arrow-down' },
                        ].map((tgt) => {
                            const isHovered = tgt.key === hoveredKey
                            return (
                                <View
                                    key={tgt.key}
                                    ref={(node) => {
                                        if (node) rowRefs.current.set(tgt.key, node)
                                        else rowRefs.current.delete(tgt.key)
                                    }}
                                    onLayout={() => measureRow(tgt.key)}
                                    style={[styles.target, styles.reorderTarget, isHovered && styles.targetHovered]}
                                >
                                    <Ionicons
                                        name={tgt.icon as any}
                                        size={18}
                                        color={isHovered ? t.colors.onAccent : t.colors.textSecondary}
                                    />
                                    <Text
                                        style={[styles.targetLabel, isHovered && styles.targetLabelHovered]}
                                        numberOfLines={1}
                                    >
                                        {tgt.label}
                                    </Text>
                                </View>
                            )
                        })}
                        {targets.map((target) => {
                            const isOrigin = target.canonicalKey === originKeyRef.current
                            const isHovered = target.canonicalKey === hoveredKey && !isOrigin
                            return (
                                <View
                                    key={target.canonicalKey}
                                    ref={(node) => {
                                        if (node) rowRefs.current.set(target.canonicalKey, node)
                                        else rowRefs.current.delete(target.canonicalKey)
                                    }}
                                    onLayout={() => measureRow(target.canonicalKey)}
                                    style={[
                                        styles.target,
                                        isOrigin && styles.targetOrigin,
                                        isHovered && styles.targetHovered,
                                    ]}
                                >
                                    <Ionicons
                                        name={target.icon as any}
                                        size={18}
                                        color={isHovered ? t.colors.onAccent : t.colors.textSecondary}
                                    />
                                    <Text
                                        style={[styles.targetLabel, isHovered && styles.targetLabelHovered]}
                                        numberOfLines={1}
                                    >
                                        {target.label}
                                    </Text>
                                </View>
                            )
                        })}
                    </View>
                    <View
                        ref={(node) => {
                            if (node) rowRefs.current.set(DELETE_KEY, node)
                            else rowRefs.current.delete(DELETE_KEY)
                        }}
                        onLayout={() => measureRow(DELETE_KEY)}
                        style={[
                            styles.deleteZone,
                            hoveredKey === DELETE_KEY && styles.deleteZoneHovered,
                        ]}
                    >
                        <Ionicons name="trash-outline" size={20} color={t.colors.onDanger} />
                        <Text style={styles.deleteLabel} numberOfLines={1}>
                            {i18n.t('main.item.delete')}
                        </Text>
                    </View>
                    <Animated.View
                        style={[
                            styles.ghost,
                            {
                                transform: [
                                    { translateX: Animated.subtract(ghostPos.x, GHOST_WIDTH / 2) },
                                    { translateY: Animated.subtract(ghostPos.y, GHOST_HEIGHT + 16) },
                                ],
                            },
                        ]}
                    >
                        <Text style={styles.ghostText} numberOfLines={1}>{dragText}</Text>
                    </Animated.View>
                </View>
            )}
        </DragContext.Provider>
    )
}

type GestureHook = {
    enabled: boolean
    armedRef: React.MutableRefObject<boolean>
    handlers: {
        onTouchStart?: (e: GestureResponderEvent) => void
        onTouchMove?: (e: GestureResponderEvent) => void
        onTouchEnd?: (e: GestureResponderEvent) => void
        onTouchCancel?: (e: GestureResponderEvent) => void
    }
}

/**
 * Long-press-to-drag for a single list/grid item. When categories are on, a
 * hold picks the item up; subsequent movement drives the drop-target overlay
 * via the shared {@link DragController}. Returns raw touch handlers to spread on
 * the item's outermost view plus `armedRef`, which the caller uses to suppress
 * the normal tap/swipe once a drag is in progress.
 */
export function useCategoryDragGesture(item: ListEntry, categoryKey: string): GestureHook {
    const drag = useCategoryDrag()
    const enabled = drag.enabled

    const armedRef = useRef(false)
    const startRef = useRef({ x: 0, y: 0 })
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const onTouchStart = useCallback((e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent
        startRef.current = { x: pageX, y: pageY }
        armedRef.current = false
        clearTimer()
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            armedRef.current = true
            haptics.select()
            drag.begin(item, categoryKey, startRef.current.x, startRef.current.y)
        }, LONG_PRESS_MS)
    }, [clearTimer, drag, item, categoryKey])

    const onTouchMove = useCallback((e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent
        if (armedRef.current) {
            drag.move(pageX, pageY)
            return
        }
        const dx = Math.abs(pageX - startRef.current.x)
        const dy = Math.abs(pageY - startRef.current.y)
        if (dx > MOVE_CANCEL || dy > MOVE_CANCEL) {
            // The finger is scrolling or swiping — don't arm a drag.
            clearTimer()
        }
    }, [clearTimer, drag])

    const onTouchEnd = useCallback(() => {
        clearTimer()
        if (armedRef.current) {
            drag.end()
            // Keep `armed` true through this release frame so the item's onPress
            // (which can fire after onTouchEnd) still suppresses the toggle, then
            // reset on the next tick.
            setTimeout(() => { armedRef.current = false }, 0)
        }
    }, [clearTimer, drag])

    const onTouchCancel = useCallback(() => {
        clearTimer()
        if (armedRef.current) {
            drag.cancel()
            setTimeout(() => { armedRef.current = false }, 0)
        }
    }, [clearTimer, drag])

    return {
        enabled,
        armedRef,
        handlers: enabled
            ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }
            : {},
    }
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        overlay: {
            ...StyleSheet.absoluteFillObject,
            zIndex: 1000,
            alignItems: 'center',
            justifyContent: 'center',
        },
        backdrop: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: t.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
        },
        title: {
            position: 'absolute',
            top: SCREEN_HEIGHT * 0.12,
            fontSize: t.type.label.fontSize,
            fontWeight: '700',
            letterSpacing: 0.5,
            color: '#FFFFFF',
            textTransform: 'uppercase',
        },
        targets: {
            maxHeight: SCREEN_HEIGHT * 0.6,
            paddingHorizontal: 24,
            gap: 8,
            alignItems: 'stretch',
        },
        target: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minWidth: 220,
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: t.radius.lg,
            backgroundColor: t.colors.surface,
            borderWidth: 2,
            borderColor: t.colors.border,
        },
        reorderTarget: {
            borderStyle: 'dashed',
        },
        targetOrigin: {
            opacity: 0.45,
        },
        targetHovered: {
            backgroundColor: t.colors.accent,
            borderColor: t.colors.accent,
            transform: [{ scale: 1.04 }],
        },
        targetLabel: {
            fontSize: t.type.body.fontSize,
            fontWeight: '600',
            color: t.colors.text,
            flexShrink: 1,
        },
        targetLabelHovered: {
            color: t.colors.onAccent,
        },
        deleteZone: {
            position: 'absolute',
            bottom: SCREEN_HEIGHT * 0.1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            minWidth: 220,
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderRadius: t.radius.lg,
            backgroundColor: t.colors.danger,
            borderWidth: 2,
            borderColor: t.colors.danger,
            opacity: 0.9,
        },
        deleteZoneHovered: {
            opacity: 1,
            transform: [{ scale: 1.06 }],
        },
        deleteLabel: {
            fontSize: t.type.body.fontSize,
            fontWeight: '700',
            color: t.colors.onDanger,
        },
        ghost: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: GHOST_WIDTH,
            height: GHOST_HEIGHT,
            borderRadius: GHOST_HEIGHT / 2,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
        },
        ghostText: {
            color: t.colors.onAccent,
            fontSize: t.type.body.fontSize,
            fontWeight: '700',
        },
    })
}
