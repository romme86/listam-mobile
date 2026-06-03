import React, { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedIconButton } from './AnimatedIconButton'
import { useTheme, type Theme } from '../theme'

type FabProps = {
    onPress: () => void
    bottomOffset: number
}

export function Fab({ onPress, bottomOffset }: FabProps) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])

    return (
        <AnimatedIconButton
            onPress={onPress}
            style={[styles.fab, { bottom: bottomOffset }]}
        >
            <Ionicons name="add" size={30} color={t.colors.onPrimary} />
        </AnimatedIconButton>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        fab: {
            position: 'absolute',
            right: t.spacing.lg,
            width: 56,
            height: 56,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 10,
            elevation: 6,
        },
    })
}
