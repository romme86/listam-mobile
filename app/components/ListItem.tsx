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
import type { ListEntry } from './_types'

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
    textScaleFactor?: number
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
    textScaleFactor = 1,
    reduceMotion = false,
}: ListItemProps) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const panX = useRef(new Animated.Value(0)).current
    const isDeleting = useRef(false)
    const passedThreshold = useRef(false)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')

    React.useEffect(() => {
        panX.setValue(0)
        isDeleting.current = false
    }, [item.text, item.timeOfCompletion, panX])

    const handleSingleTap = useCallback(() => {
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
            return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        },
        onPanResponderGrant: () => {
            isDeleting.current = false
            passedThreshold.current = false
        },
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dx > 0 && !isDeleting.current) {
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

            if (gestureState.dx > SWIPE_THRESHOLD) {
                isDeleting.current = true
                haptics.delete()
                Animated.timing(panX, {
                    toValue: SCREEN_WIDTH,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    onDelete?.(index)
                })
            } else {
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
    }), [panX, onDelete, index])

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
        inputRange: [0, SWIPE_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    })

    const textStyle = [
        styles.text,
        { fontSize: 20 * textScaleFactor },
        item.isDone && styles.doneText,
        { transform: [{ scale: textScale }] },
    ]

    if (editing) {
        return (
            <View style={styles.item}>
                <TextInput
                    style={[styles.editInput, { fontSize: 20 * textScaleFactor }]}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={submitEdit}
                    onBlur={submitEdit}
                    placeholder="Edit item..."
                    placeholderTextColor={t.colors.placeholder}
                    returnKeyType="done"
                    autoFocus
                />
            </View>
        )
    }

    return (
        <View style={styles.itemWrapper}>
            <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
                <Ionicons name="trash-outline" size={22} color={t.colors.onDanger} />
                <Text style={styles.deleteLabel}>Delete</Text>
            </Animated.View>
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
                    onLongPress={startEdit}
                    delayLongPress={350}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.isDone }}
                    accessibilityLabel={item.text}
                    accessibilityHint="Double tap to toggle done. Long-press to edit."
                >
                    <Animated.View style={[styles.item, { opacity }]}>
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
            paddingLeft: 24,
            gap: 8,
        },
        deleteLabel: {
            color: t.colors.onDanger,
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
    })
}

export { ITEM_HEIGHT, SPACING }
