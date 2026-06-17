import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme, type Theme } from '../theme'
import type { ThemeChoice } from '../store/preferencesSlice'
import type { ItemIconVariant } from './itemIconMap'
import type { ListAlignment, ListSpacing, SizeOption } from './_types'

export const SIZE_OPTIONS: SizeOption[] = ['small', 'medium', 'normal', 'large']
export const ITEM_ICON_VARIANT_OPTIONS: ItemIconVariant[] = ['illustrated', 'minimal']
export const LIST_ALIGNMENT_OPTIONS: ListAlignment[] = ['left', 'center']
export const LIST_SPACING_OPTIONS: ListSpacing[] = ['compact', 'cozy', 'normal', 'relaxed']

export function sizeLabelKey(size: SizeOption) {
    switch (size) {
        case 'small':
            return 'header.size.small'
        case 'medium':
            return 'header.size.medium'
        case 'large':
            return 'header.size.large'
        default:
            return 'header.size.normal'
    }
}

export function themeLabelKey(choice: ThemeChoice) {
    switch (choice) {
        case 'light':
            return 'header.appearance.light'
        case 'dark':
            return 'header.appearance.dark'
        default:
            return 'header.appearance.system'
    }
}

export function alignLabelKey(alignment: ListAlignment) {
    return alignment === 'center' ? 'header.align.center' : 'header.align.left'
}

export function spacingLabelKey(spacing: ListSpacing) {
    switch (spacing) {
        case 'compact':
            return 'header.spacing.compact'
        case 'cozy':
            return 'header.spacing.cozy'
        case 'relaxed':
            return 'header.spacing.relaxed'
        default:
            return 'header.spacing.normal'
    }
}

// A titled row of mutually-exclusive options. Self-contained (own theme/styles)
// so both the header (legacy) and the unified menu sheet can use it.
export function SegmentedSetting<T extends string>({
    title,
    options,
    value,
    onChange,
    labelFor,
}: {
    title?: string
    options: readonly T[]
    value: T
    onChange: (value: T) => void
    labelFor: (option: T) => string
}) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    return (
        <View style={styles.settingGroup}>
            {title ? <Text style={styles.settingTitle}>{title}</Text> : null}
            <View style={styles.optionRow}>
                {options.map((option) => {
                    const active = value === option
                    return (
                        <TouchableOpacity
                            key={option}
                            style={[styles.optionButton, active && styles.optionButtonActive]}
                            onPress={() => onChange(option)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                        >
                            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                                {labelFor(option)}
                            </Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        settingGroup: {
            paddingVertical: t.spacing.sm,
        },
        settingTitle: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.text,
            marginBottom: t.spacing.sm,
        },
        optionRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: t.spacing.sm,
        },
        optionButton: {
            // flexBasis must be non-zero: `flex: 1` (flexBasis 0%) inside a
            // `flexWrap` row makes Yoga mis-measure the wrapped container's
            // height, so extra rows overflow onto the next setting. A real
            // basis lets lines break (max 3 per row) and measure correctly;
            // flexGrow still fills full rows edge-to-edge.
            flexGrow: 1,
            flexBasis: '30%',
            minWidth: 68,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderColor: t.colors.border,
            paddingVertical: t.spacing.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.colors.surface,
        },
        optionButtonActive: {
            backgroundColor: t.colors.primary,
            borderColor: t.colors.primary,
        },
        optionLabel: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '600',
            color: t.colors.text,
        },
        optionLabelActive: {
            color: t.colors.onPrimary,
        },
    })
}
