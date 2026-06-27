import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

type Props = {
    listName: string
    onOpenMenu: () => void
    /** Scan a loyalty card, or open the primary saved card if there is one. */
    onBarcode: () => void
    /** Loyalty cards are a grocery affordance — hide the barcode elsewhere. */
    showBarcode: boolean
    onOpenListSettings: () => void
}

// A borderless one-line title strip directly under the Header. Tapping the name
// opens the unified menu (the list switcher + app settings); the gear opens the
// current board/list's own settings (where the launch-default flag now lives).
export function ListContextBar({ listName, onOpenMenu, onBarcode, showBarcode, onOpenListSettings }: Props) {
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
            </TouchableOpacity>
            {showBarcode && (
                <TouchableOpacity
                    onPress={onBarcode}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t('header.section.loyaltyCards')}
                >
                    <Ionicons name="barcode-outline" size={18} color={t.colors.textTertiary} />
                </TouchableOpacity>
            )}
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
