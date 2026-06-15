import React, { useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

type HintProps = { icon: keyof typeof Ionicons.glyphMap; text: string }

function Hint({ icon, text }: HintProps) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    return (
        <View style={styles.hintRow}>
            <Ionicons name={icon} size={16} color={t.colors.textTertiary} />
            <Text style={styles.hintText}>{text}</Text>
        </View>
    )
}

export function EmptyState({ onRequestAdd }: { onRequestAdd?: () => void }) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])

    return (
        <View style={styles.container}>
            <View style={styles.iconCircle}>
                <Ionicons name="basket-outline" size={44} color={t.colors.textTertiary} />
            </View>
            <Text style={styles.title}>{i18n.t('main.empty.title')}</Text>
            <Text style={styles.subtitle}>{i18n.t('main.empty.subtitle')}</Text>

            {onRequestAdd && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={onRequestAdd}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Ionicons name="add" size={20} color={t.colors.onPrimary} />
                    <Text style={styles.buttonText}>{i18n.t('main.empty.addItem')}</Text>
                </TouchableOpacity>
            )}

            <View style={styles.hints}>
                <Hint icon="add-circle-outline" text={i18n.t('main.empty.hintAdd')} />
                <Hint icon="hand-left-outline" text={i18n.t('main.empty.hintToggle')} />
                <Hint icon="create-outline" text={i18n.t('main.empty.hintEdit')} />
                <Hint icon="arrow-forward-outline" text={i18n.t('main.empty.hintDelete')} />
            </View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: t.spacing.xl,
            paddingBottom: 80,
        },
        iconCircle: {
            width: 96,
            height: 96,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: t.spacing.lg,
        },
        title: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
            marginBottom: t.spacing.xs,
        },
        subtitle: {
            fontSize: t.type.body.fontSize,
            color: t.colors.textSecondary,
            textAlign: 'center',
            marginBottom: t.spacing.xl,
        },
        button: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            backgroundColor: t.colors.primary,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.xl,
            borderRadius: t.radius.pill,
            marginBottom: t.spacing.xxl,
        },
        buttonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: t.type.bodyStrong.fontWeight,
        },
        hints: {
            gap: t.spacing.sm,
            alignItems: 'flex-start',
        },
        hintRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
        },
        hintText: {
            fontSize: t.type.body.fontSize,
            color: t.colors.textTertiary,
        },
    })
}
