import React, { useRef } from 'react'
import { TouchableOpacity, Animated } from 'react-native'
import { useReduceMotion } from '../hooks/useReduceMotion'

type AnimatedIconButtonProps = {
    onPress: () => void
    children: React.ReactNode
    style?: any
    accessibilityLabel?: string
    hitSlop?: number
}

export function AnimatedIconButton({
    onPress,
    children,
    style,
    accessibilityLabel,
    hitSlop = 10,
}: AnimatedIconButtonProps) {
    const scaleAnim = useRef(new Animated.Value(1)).current
    const reduceMotion = useReduceMotion()

    const handlePressIn = () => {
        if (reduceMotion) return
        Animated.spring(scaleAnim, {
            toValue: 0.85,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
        }).start()
    }

    const handlePressOut = () => {
        if (reduceMotion) return
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 10,
        }).start()
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
            style={style}
            hitSlop={{ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                {children}
            </Animated.View>
        </TouchableOpacity>
    )
}
