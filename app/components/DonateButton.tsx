import React, { useMemo } from 'react'
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useI18n } from '../i18n'
import { useTheme, type Theme } from '../theme'
import type { PaymentPlan, SubscriptionState } from '../hooks/useSubscription'

type Props = {
    state: Pick<SubscriptionState, 'isLoading' | 'isSubscribed' | 'error'>
    plan?: PaymentPlan
    onDonate: () => void
}

export function DonateButton({ state, plan, onDonate }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null

    const disabled = state.isLoading || state.isSubscribed
    const hint = state.isSubscribed
        ? i18n.t('donation.thanks')
        : plan
            ? i18n.t('donation.yearly', { price: plan.displayPrice })
            : i18n.t('donation.support')

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.button}
                onPress={onDonate}
                disabled={disabled}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={i18n.t('donation.button')}
                accessibilityHint={hint}
                accessibilityState={{ disabled, busy: state.isLoading }}
            >
                <Ionicons name="heart-outline" size={20} color={t.colors.text} />
                <View style={styles.copy}>
                    <Text style={styles.label}>{i18n.t('donation.button')}</Text>
                    <Text style={styles.hint}>{hint}</Text>
                </View>
                {state.isLoading
                    ? <ActivityIndicator size="small" color={t.colors.textSecondary} />
                    : <Ionicons name={state.isSubscribed ? 'checkmark' : 'chevron-forward'} size={18} color={t.colors.textTertiary} />}
            </TouchableOpacity>
            {state.error ? <Text style={styles.error} accessibilityRole="alert">{state.error}</Text> : null}
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: { marginTop: t.spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
        button: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 56, paddingVertical: t.spacing.md },
        copy: { flex: 1, gap: t.spacing.xs },
        label: { ...t.type.bodyStrong, color: t.colors.text },
        hint: { ...t.type.caption, color: t.colors.textSecondary },
        error: { ...t.type.caption, color: t.colors.danger, paddingBottom: t.spacing.sm },
    })
}
