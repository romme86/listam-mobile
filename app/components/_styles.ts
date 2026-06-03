import { StyleSheet } from 'react-native'
import type { Theme } from '../theme'

export function makeDialogStyles(t: Theme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: t.colors.overlay,
            justifyContent: 'center',
            alignItems: 'center',
            padding: t.spacing.xl,
        },
        dialog: {
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.md,
            padding: t.spacing.xl,
            width: '100%',
            maxWidth: 400,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
        },
        title: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
            marginBottom: t.spacing.sm,
        },
        subtitle: {
            fontSize: t.type.label.fontSize,
            color: t.colors.textSecondary,
            marginBottom: t.spacing.lg,
        },
        input: {
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.sm,
            padding: t.spacing.md,
            fontSize: t.type.body.fontSize,
            color: t.colors.text,
            minHeight: 80,
            textAlignVertical: 'top',
            marginBottom: t.spacing.lg,
        },
        buttonContainer: {
            flexDirection: 'row',
            gap: t.spacing.md,
        },
        button: {
            flex: 1,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            borderRadius: t.radius.sm,
            alignItems: 'center',
        },
        cancelButton: {
            backgroundColor: t.colors.surfaceSunken,
        },
        submitButton: {
            backgroundColor: t.colors.primary,
        },
        cancelButtonText: {
            color: t.colors.text,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
        submitButtonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
    })
}

export function makeJoiningStyles(t: Theme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: t.colors.scrim,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 40,
        },
        content: {
            alignItems: 'center',
            maxWidth: 300,
        },
        title: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.md,
            textAlign: 'center',
        },
        subtitle: {
            fontSize: t.type.label.fontSize,
            color: t.colors.textSecondary,
            textAlign: 'center',
            marginBottom: t.spacing.xxl,
            lineHeight: 20,
        },
        p2pMessage: {
            fontSize: t.type.label.fontSize,
            color: t.colors.textTertiary,
            textAlign: 'center',
            fontStyle: 'italic',
            minHeight: 40,
        },
        cancelButton: {
            marginTop: t.spacing.xxl,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.xxl,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceSunken,
        },
        cancelButtonText: {
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
            color: t.colors.textSecondary,
        },
        phaseRow: {
            flexDirection: 'row',
            gap: t.spacing.sm,
            marginBottom: t.spacing.md,
        },
        phaseDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: t.colors.border,
        },
        phaseDotActive: {
            backgroundColor: t.colors.accent,
        },
    })
}
