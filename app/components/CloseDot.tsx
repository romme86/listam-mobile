import React from 'react'
import { TouchableOpacity, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../theme'

type Props = {
    onPress: () => void
    color?: string
    size?: number
    style?: StyleProp<ViewStyle>
    accessibilityLabel?: string
}

// The minimal "close" affordance: a small filled dot in place of an X. Shared by
// every sheet/modal so the dismiss control stays lean and consistent everywhere.
export function CloseDot({ onPress, color, size = 11, style, accessibilityLabel }: Props) {
    const t = useTheme()
    return (
        <TouchableOpacity
            onPress={onPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[styles.hit, style]}
        >
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? t.colors.textTertiary }} />
        </TouchableOpacity>
    )
}

// An intrinsic ~44px tappable area so the dot meets platform minimums without
// every caller remembering a wrapper. A caller's `style` is layered last, so an
// explicit sized container (e.g. the 44x44 loyalty close discs) still wins.
const styles = StyleSheet.create({
    hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
