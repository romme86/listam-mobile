import React, { useRef, useMemo } from 'react'
import {
    Animated,
    Dimensions,
    TouchableOpacity,
    PanResponder,
    View,
    Text,
    StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../../feedback'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import type { ListAlignment } from '../_types'
import type { NoteRow as NoteRowModel } from './noteRows'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.32

type NoteRowProps = {
    row: NoteRowModel
    scrollY: Animated.Value
    /** Open the note in the full-screen detail. A note has no done state, so a
     *  single tap has nothing to toggle — it always opens. */
    onOpen: (item: NoteRowModel['entry']) => void
    onDelete?: (index: number) => void
    /** Swipe-right (quick): flag this note into today's plan. */
    onFlagToday?: (index: number) => void
    /** Whether this note is already in the day plan (drives the row indicator). */
    planned?: boolean
    textScaleFactor?: number
    listAlignment?: ListAlignment
    spacing: number
    reduceMotion?: boolean
}

// One note in the index. Swipe left deletes and swipe right stars into the
// Overview exactly as on every other list; what differs is the tap (open, not
// toggle) and the two row shapes — a plain note is a title, a note that has
// grown blocks also carries an excerpt and a block count.
export function NoteRow({
    row,
    scrollY,
    onOpen,
    onDelete,
    onFlagToday,
    planned = false,
    textScaleFactor = 1,
    listAlignment = 'left',
    spacing,
    reduceMotion = false,
}: NoteRowProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const isCentered = listAlignment === 'center'
    const panX = useRef(new Animated.Value(0)).current
    const isDeleting = useRef(false)
    const passedThreshold = useRef(false)
    const { entry: item, index } = row

    React.useEffect(() => {
        panX.setValue(0)
        isDeleting.current = false
    }, [item.text, item.updatedAt, panX])

    const panResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
            Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
            Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
            isDeleting.current = false
            passedThreshold.current = false
        },
        onPanResponderMove: (_, gestureState) => {
            // Same grammar as a list row: LEFT reveals delete, RIGHT reveals the
            // "add to today" plan flag.
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

    // Rows are not all the same height here, so the focus lens interpolates
    // against the row's own running offset (buildNoteRows) instead of
    // index * height, and spans two of ITS heights either side.
    const inputRange = [row.offset - 2 * row.height, row.offset, row.offset + 2 * row.height]

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

    const isDocument = row.kind === 'document'
    // A note is filed, never finished: an archived one recedes, but it is NOT
    // struck through and carries no checkbox.
    const titleStyle = [
        isDocument ? styles.documentTitle : styles.plainTitle,
        { fontSize: (isDocument ? 17 : 20) * textScaleFactor },
        isCentered && { transformOrigin: 'center center' as const, textAlign: 'center' as const },
        item.isDone && styles.archivedText,
        { transform: [{ scale: textScale }] },
    ]

    return (
        <View style={[styles.rowWrapper, { marginBottom: spacing }]}>
            <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
                <Ionicons name="trash-outline" size={22} color={t.colors.onDanger} />
                <Text style={styles.deleteLabel}>{i18n.t('main.item.delete')}</Text>
            </Animated.View>
            {onFlagToday ? (
                <Animated.View style={[styles.flagBg, { opacity: flagOpacity }]}>
                    <Ionicons name={planned ? 'star' : 'star-outline'} size={22} color={t.colors.onAccent} />
                    <Text style={styles.flagLabel}>{planned ? i18n.t('plan.inOverview') : i18n.t('plan.addToOverview')}</Text>
                </Animated.View>
            ) : null}
            <Animated.View
                style={[
                    styles.rowContainer,
                    { transform: [{ translateX: panX }] },
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { haptics.select(); onOpen(item) }}
                    accessibilityRole="button"
                    accessibilityLabel={item.text || i18n.t('mobile.notes.untitled')}
                >
                    <Animated.View style={[styles.row, { height: row.height }, isCentered && styles.rowCentered, { opacity }]}>
                        <Animated.Text style={titleStyle} numberOfLines={1}>
                            {item.text || i18n.t('mobile.notes.untitled')}
                        </Animated.Text>
                        {isDocument ? (
                            <>
                                <Text style={[styles.excerpt, isCentered && styles.centeredText]} numberOfLines={1}>
                                    {row.excerpt}
                                </Text>
                                <Text style={[styles.meta, isCentered && styles.centeredText]} numberOfLines={1}>
                                    {i18n.t('desktop.notes.blockCount', { count: row.blockCount })}
                                </Text>
                            </>
                        ) : null}
                    </Animated.View>
                </TouchableOpacity>
            </Animated.View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        rowWrapper: {
            overflow: 'hidden',
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
        rowContainer: {
            backgroundColor: t.colors.bg,
            paddingLeft: 20,
        },
        row: {
            justifyContent: 'center',
            alignItems: 'flex-start',
            width: SCREEN_WIDTH - 40,
            backgroundColor: t.colors.bg,
            gap: 2,
        },
        rowCentered: {
            alignItems: 'center',
        },
        plainTitle: {
            fontSize: 20,
            color: t.colors.text,
            fontWeight: '600',
            transformOrigin: 'left center',
        },
        documentTitle: {
            fontSize: 17,
            color: t.colors.text,
            fontWeight: '600',
            transformOrigin: 'left center',
        },
        excerpt: {
            fontSize: 13,
            fontWeight: '400',
            color: t.colors.textTertiary,
        },
        meta: {
            fontSize: 12,
            fontWeight: '500',
            color: t.colors.textSecondary,
        },
        centeredText: {
            textAlign: 'center',
        },
        archivedText: {
            color: t.colors.textDisabled,
        },
    })
}
