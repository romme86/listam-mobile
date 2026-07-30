import React, { useMemo } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import qrcode from 'qrcode-generator'
import Svg, { Path, Rect } from 'react-native-svg'

type InviteQrCodeProps = {
    value: string
    size?: number
    accessibilityLabel: string
    style?: StyleProp<ViewStyle>
}

const QUIET_ZONE_MODULES = 4

/**
 * Small native QR renderer. qrcode-generator builds the module matrix and
 * react-native-svg draws it, keeping invite material entirely on-device.
 */
export function InviteQrCode({
    value,
    size = 224,
    accessibilityLabel,
    style,
}: InviteQrCodeProps) {
    const { path, viewBoxSize } = useMemo(() => {
        const code = qrcode(0, 'M')
        code.addData(value, 'Byte')
        code.make()

        const moduleCount = code.getModuleCount()
        const commands: string[] = []
        for (let row = 0; row < moduleCount; row += 1) {
            for (let column = 0; column < moduleCount; column += 1) {
                if (!code.isDark(row, column)) continue
                const x = column + QUIET_ZONE_MODULES
                const y = row + QUIET_ZONE_MODULES
                commands.push(`M${x} ${y}h1v1h-1z`)
            }
        }

        return {
            path: commands.join(''),
            viewBoxSize: moduleCount + (QUIET_ZONE_MODULES * 2),
        }
    }, [value])

    return (
        <View
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={accessibilityLabel}
            style={style}
        >
            <Svg
                width={size}
                height={size}
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            >
                <Rect width={viewBoxSize} height={viewBoxSize} fill="#fff" />
                <Path d={path} fill="#000" />
            </Svg>
        </View>
    )
}
