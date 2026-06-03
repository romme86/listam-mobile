import React, { useMemo } from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'

type Props = {
    value: string
    onChangeText: (text: string) => void
    onSubmit: () => void
    onClose: () => void
}

export function AddItemBar({ value, onChangeText, onSubmit, onClose }: Props) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])

    return (
        <View style={styles.bar}>
            <Ionicons name="add" size={22} color={t.colors.textSecondary} />
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                onSubmitEditing={onSubmit}
                blurOnSubmit={false}
                placeholder="Add item…"
                placeholderTextColor={t.colors.placeholder}
                returnKeyType="done"
                autoFocus
            />
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
                <Ionicons name="close" size={22} color={t.colors.textTertiary} />
            </TouchableOpacity>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        bar: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.border,
            backgroundColor: t.colors.bg,
        },
        input: {
            flex: 1,
            fontSize: t.type.bodyLg.fontSize,
            color: t.colors.text,
            fontWeight: '600',
            padding: 0,
        },
    })
}
