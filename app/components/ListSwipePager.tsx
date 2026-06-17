import React, { useMemo, useRef } from 'react'
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ACTIVATE = 24            // horizontal travel before the pager claims (> item swipe's 8)
const COMMIT = SCREEN_WIDTH * 0.25

type Props = {
    children: React.ReactNode
    // dir: +1 swipe-left (next), -1 swipe-right (prev). Returns true if a move happened.
    onCommit: (dir: 1 | -1, jumpGroup: boolean) => boolean
    canPage: boolean
    reduceMotion?: boolean
}

// Wraps the current list view and turns a clearly-horizontal swipe into a
// next/previous-list move. Capture-phase + axis lock so vertical scrolling and
// the (left) row-delete swipe are never stolen; content is swapped via the
// store, so on commit we just snap translateX back to 0 with the new list in place.
export function ListSwipePager({ children, onCommit, canPage, reduceMotion = false }: Props) {
    const translateX = useRef(new Animated.Value(0)).current

    const springBack = () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }).start()
    }

    const responder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_evt, g) => {
            if (!canPage) return false
            return Math.abs(g.dx) > ACTIVATE && Math.abs(g.dx) > Math.abs(g.dy) * 2
        },
        onPanResponderMove: (_evt, g) => {
            translateX.setValue(g.dx)
        },
        onPanResponderRelease: (_evt, g) => {
            const past = Math.abs(g.dx) > COMMIT || Math.abs(g.vx) > 0.4
            if (!past) { springBack(); return }
            const dir: 1 | -1 = g.dx < 0 ? 1 : -1
            const moved = onCommit(dir, false)
            if (moved) {
                // Content already swapped by the store; reset instantly under the new list.
                translateX.setValue(0)
            } else {
                springBack()
            }
        },
        onPanResponderTerminate: () => springBack(),
    }), [canPage, onCommit, reduceMotion, translateX])

    return (
        <Animated.View style={[styles.fill, { transform: [{ translateX }] }]} {...responder.panHandlers}>
            <View style={styles.fill}>{children}</View>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
})
