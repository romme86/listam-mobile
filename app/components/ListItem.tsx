import React, { useRef, useCallback, useMemo, useState } from 'react'
import {
    Animated,
    Dimensions,
    TouchableOpacity,
    TextInput,
    PanResponder,
    View,
    Text,
    StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../feedback'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { useCategoryDragGesture } from './CategoryDrag'
import type { ListAlignment, ListEntry } from './_types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ITEM_HEIGHT = 60
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.32

type ListItemProps = {
    item: ListEntry
    index: number
    visualIndex?: number
    scrollY: Animated.Value
    totalItemHeight: number
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    onEdit?: (index: number, text: string) => void
    /** Swipe-right (quick): flag this item into today's plan. */
    onFlagToday?: (index: number) => void
    /** Long-press: open the plan sheet (edit / plan for a day) for this item. */
    onPlanFor?: (item: ListEntry) => void
    /** Whether this item is already in the day plan (drives the row indicator). */
    planned?: boolean
    textScaleFactor?: number
    listAlignment?: ListAlignment
    spacing?: number
    /** Canonical key of the category this row currently sits in (for drag-to-move). */
    categoryKey?: string
    reduceMotion?: boolean
}

export function ListItem({
    item,
    index,
    visualIndex,
    scrollY,
    totalItemHeight,
    onToggleDone,
    onDelete,
    onEdit,
    onFlagToday,
    onPlanFor,
    planned = false,
    textScaleFactor = 1,
    listAlignment = 'left',
    spacing = SPACING,
    categoryKey = '',
    reduceMotion = false,
}: ListItemProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const isCentered = listAlignment === 'center'
    const panX = useRef(new Animated.Value(0)).current
    const isDeleting = useRef(false)
    const passedThreshold = useRef(false)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')

    // Long-press to drag this row into another category (only while categories
    // are on). `armedRef` flips true once a drag is picked up, so the tap and
    // swipe gestures below stand down.
    const { enabled: dragEnabled, armedRef, handlers: dragHandlers } =
        useCategoryDragGesture(item, categoryKey)

    React.useEffect(() => {
        panX.setValue(0)
        isDeleting.current = false
    }, [item.text, item.timeOfCompletion, panX])

    const handleSingleTap = useCallback(() => {
        // A long-press that armed a drag must not also toggle on release.
        if (armedRef.current) return
        if (!onToggleDone) return
        if (item.isDone) {
            haptics.toggleOff()
        } else {
            haptics.toggleOn()
        }
        onToggleDone(index)
    }, [onToggleDone, index, item.isDone])

    const startEdit = useCallback(() => {
        if (!onEdit) return
        haptics.select()
        setDraft(item.text)
        setEditing(true)
    }, [onEdit, item.text])

    const submitEdit = useCallback(() => {
        const value = draft.trim()
        setEditing(false)
        if (value && value !== item.text) {
            onEdit?.(index, value)
        }
    }, [draft, item.text, onEdit, index])

    const panResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
            if (armedRef.current) return false
            return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            if (armedRef.current) return false
            return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        },
        onPanResponderGrant: () => {
            isDeleting.current = false
            passedThreshold.current = false
        },
        onPanResponderMove: (_, gestureState) => {
            // Swipe LEFT reveals delete (iOS convention); swipe RIGHT reveals the
            // "add to today" plan flag (the previously-unused direction). The
            // pager only owns horizontal swipes that travel further, on the
            // background — a row swipe past 8px is captured here.
            if (isDeleting.current) return
            if (gestureState.dx < 0) {
                panX.setValue(gestureState.dx)
                const past = gestureState.dx < -SWIPE_THRESHOLD
                if (past !== passedThreshold.current) {
                    passedThreshold.current = past
                    if (past) haptics.select()
                }
            } else if (gestureState.dx > 0 && onFlagToday) {
                panX.setValue(gestureState.dx)
                const past = gestureState.dx > SWIPE_THRESHOLD
                if (past !== passedThreshold.current) {
                    passedThreshold.current = past
                    if (past) haptics.select()
                }
            }
        },
        onPanResponderRelease: (_, gestureState) => {
            if (isDeleting.current) return

            if (gestureState.dx < -SWIPE_THRESHOLD) {
                isDeleting.current = true
                haptics.delete()
                Animated.timing(panX, {
                    toValue: -SCREEN_WIDTH,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    onDelete?.(index)
                })
            } else {
                if (gestureState.dx > SWIPE_THRESHOLD && onFlagToday) {
                    haptics.toggleOn()
                    onFlagToday(index)
                }
                Animated.spring(panX, {
                    toValue: 0,
                    useNativeDriver: true,
                    friction: 8,
                    tension: 100,
                }).start()
            }
        },
        onPanResponderTerminate: () => {
            if (!isDeleting.current) {
                Animated.spring(panX, {
                    toValue: 0,
                    useNativeDriver: true,
                    friction: 8,
                    tension: 100,
                }).start()
            }
        },
    }), [panX, onDelete, onFlagToday, index])

    const scrollIndex = visualIndex ?? index
    const inputRange = [
        (scrollIndex - 2) * totalItemHeight,
        scrollIndex * totalItemHeight,
        (scrollIndex + 2) * totalItemHeight,
    ]

    const textScale = reduceMotion
        ? 1
        : scrollY.interpolate({
              inputRange,
              outputRange: [1, 1.18, 1],
              extrapolate: 'clamp',
          })

    const opacity = reduceMotion
        ? 1
        : scrollY.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: 'clamp',
          })

    const deleteOpacity = panX.interpolate({
        inputRange: [-SWIPE_THRESHOLD, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    })

    const flagOpacity = panX.interpolate({
        inputRange: [0, SWIPE_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    })

    const textStyle = [
        styles.text,
        { fontSize: 20 * textScaleFactor },
        isCentered && { transformOrigin: 'center center' as const, textAlign: 'center' as const },
        item.isDone && styles.doneText,
        { transform: [{ scale: textScale }] },
    ]

    if (editing) {
        return (
            <View style={[styles.item, isCentered && styles.itemCentered]}>
                <TextInput
                    style={[
                        styles.editInput,
                        { fontSize: 20 * textScaleFactor },
                        isCentered && styles.editInputCentered,
                    ]}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={submitEdit}
                    onBlur={submitEdit}
                    placeholder={i18n.t('main.item.editPlaceholder')}
                    placeholderTextColor={t.colors.placeholder}
                    returnKeyType="done"
                    autoFocus
                />
            </View>
        )
    }

    return (
        <View style={[styles.itemWrapper, { marginBottom: spacing }]} {...dragHandlers}>
            <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
                <Ionicons name="trash-outline" size={22} color={t.colors.onDanger} />
                <Text style={styles.deleteLabel}>{i18n.t('main.item.delete')}</Text>
            </Animated.View>
            {onFlagToday ? (
                <Animated.View style={[styles.flagBg, { opacity: flagOpacity }]}>
                    <Ionicons name={planned ? 'star' : 'star-outline'} size={22} color={t.colors.onAccent} />
                    <Text style={styles.flagLabel}>{planned ? i18n.t('plan.inPlan') : i18n.t('plan.today')}</Text>
                </Animated.View>
            ) : null}
            <Animated.View
                style={[
                    styles.itemContainer,
                    { transform: [{ translateX: panX }] },
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleSingleTap}
                    onLongPress={dragEnabled ? undefined : (onPlanFor ? () => { haptics.select(); onPlanFor(item) } : startEdit)}
                    delayLongPress={350}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.isDone }}
                    accessibilityLabel={item.text}
                    accessibilityHint={i18n.t('main.item.accessibilityHint')}
                >
                    <Animated.View style={[styles.item, isCentered && styles.itemCentered, { opacity }]}>
                        <Animated.Text style={textStyle}>
                            {item.text}
                        </Animated.Text>
                    </Animated.View>
                </TouchableOpacity>
            </Animated.View>
        </View>
    )
}

const SPACING = 16

function makeStyles(t: Theme) {
    return StyleSheet.create({
        itemWrapper: {
            overflow: 'hidden',
            marginBottom: SPACING,
            justifyContent: 'center',
        },
        deleteBg: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: t.colors.danger,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 24,
            gap: 8,
        },
        deleteLabel: {
            color: t.colors.onDanger,
            fontSize: t.type.label.fontSize,
            fontWeight: '700',
        },
        flagBg: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 24,
            gap: 8,
        },
        flagLabel: {
            color: t.colors.onAccent,
            fontSize: t.type.label.fontSize,
            fontWeight: '700',
        },
        itemContainer: {
            backgroundColor: t.colors.bg,
            paddingLeft: 20,
        },
        item: {
            height: ITEM_HEIGHT,
            justifyContent: 'center',
            alignItems: 'flex-start',
            width: SCREEN_WIDTH - 40,
            backgroundColor: t.colors.bg,
        },
        itemCentered: {
            alignItems: 'center',
        },
        text: {
            fontSize: 20,
            color: t.colors.text,
            fontWeight: '600',
            transformOrigin: 'left center',
        },
        doneText: {
            color: t.colors.textDisabled,
            textDecorationLine: 'line-through',
        },
        editInput: {
            fontSize: 20,
            color: t.colors.text,
            fontWeight: '600',
            width: '100%',
            paddingLeft: 20,
            paddingVertical: 0,
        },
        editInputCentered: {
            textAlign: 'center',
            paddingLeft: 0,
        },
    })
}

export { ITEM_HEIGHT, SPACING }
