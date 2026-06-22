import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

type Props = {
    listName: string
    isDefault: boolean
    onOpenMenu: () => void
    onOpenListSettings: () => void
    /** Toggle this whole list in/out of today's plan. */
    onFlagList: () => void
    /** Whether this list is currently flagged into the plan. */
    listPlanned: boolean
}

// A borderless one-line title strip directly under the Header. Tapping the name
// opens the unified menu (the list switcher + app settings); the gear opens the
// current board/list's own settings. The star is a read-only glyph; setting the
// default happens inside the menu.
export function ListContextBar({ listName, isDefault, onOpenMenu, onOpenListSettings, onFlagList, listPlanned }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    return (
        <View style={styles.bar}>
            <TouchableOpacity
                style={styles.main}
                onPress={onOpenMenu}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={i18n.t('lists.menu.title')}
            >
                <Text style={styles.name} numberOfLines={1}>{listName}</Text>
                {isDefault && <Ionicons name="star" size={14} color={t.colors.text} />}
                <Ionicons name="chevron-down" size={16} color={t.colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onFlagList}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={i18n.t('plan.flagList')}
            >
                <Ionicons
                    name={listPlanned ? 'star' : 'star-outline'}
                    size={18}
                    color={listPlanned ? t.colors.accent : t.colors.textTertiary}
                />
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onOpenListSettings}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={i18n.t('lists.menu.listSettings')}
            >
                <Ionicons name="settings-outline" size={18} color={t.colors.textTertiary} />
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
            paddingVertical: t.spacing.xs,
        },
        main: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
        },
        name: {
            flex: 1,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: t.type.bodyStrong.fontWeight,
            color: t.colors.text,
        },
    })
}
