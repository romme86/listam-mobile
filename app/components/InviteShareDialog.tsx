import React, { useMemo } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { createInviteQrPayload, type InviteQrScope } from '@listam/protocol'
import { useI18n } from '../i18n'
import { useTheme, type Theme } from '../theme'
import { InviteQrCode } from './InviteQrCode'

type InviteShareDialogProps = {
    visible: boolean
    scope: InviteQrScope
    invite: string
    onShare: () => void
    onClose: () => void
}

export function InviteShareDialog({
    visible,
    scope,
    invite,
    onShare,
    onClose,
}: InviteShareDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const payload = useMemo(
        () => (invite ? createInviteQrPayload(invite, scope) : ''),
        [invite, scope],
    )
    const title = scope === 'project'
        ? i18n.t('share.project.dialogTitle')
        : i18n.t('shareList.title')
    const message = scope === 'project'
        ? i18n.t('share.project.dialogMessage')
        : i18n.t('share.list.hint')

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <Text style={styles.title}>{title}</Text>
                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.subtitle}>{message}</Text>

                        {payload ? (
                            <InviteQrCode
                                value={payload}
                                size={224}
                                accessibilityLabel={i18n.t('invite.qr.accessibility', {
                                    scope: scope === 'project'
                                        ? i18n.t('invite.qr.scope.project')
                                        : i18n.t('invite.qr.scope.list'),
                                })}
                                style={styles.qrCode}
                            />
                        ) : null}

                        <Text style={styles.scanHint}>{i18n.t('invite.qr.scanHint')}</Text>
                        <Text style={styles.codeLabel}>{i18n.t('invite.qr.codeLabel')}</Text>
                        <Text style={styles.inviteCode} selectable={true}>{invite}</Text>
                    </ScrollView>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.closeButton]}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={styles.closeButtonText}>{i18n.t('common.close')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.shareButton]}
                            onPress={onShare}
                            accessibilityRole="button"
                        >
                            <Text style={styles.shareButtonText}>{i18n.t('invite.qr.share')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: t.colors.overlay,
            justifyContent: 'center',
            alignItems: 'center',
            padding: t.spacing.xl,
        },
        dialog: {
            width: '100%',
            maxWidth: 420,
            maxHeight: '94%',
            alignItems: 'stretch',
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.md,
            padding: t.spacing.xl,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
        },
        title: {
            color: t.colors.text,
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            marginBottom: t.spacing.sm,
        },
        scroll: {
            minHeight: 0,
            flexShrink: 1,
            marginBottom: t.spacing.lg,
        },
        scrollContent: {
            alignItems: 'stretch',
        },
        subtitle: {
            color: t.colors.textSecondary,
            fontSize: t.type.label.fontSize,
            lineHeight: 19,
            marginBottom: t.spacing.lg,
        },
        qrCode: {
            alignSelf: 'center',
            overflow: 'hidden',
            borderRadius: t.radius.sm,
        },
        scanHint: {
            color: t.colors.textSecondary,
            fontSize: t.type.caption.fontSize,
            textAlign: 'center',
            marginTop: t.spacing.md,
            marginBottom: t.spacing.lg,
        },
        codeLabel: {
            color: t.colors.textTertiary,
            fontSize: t.type.caption.fontSize,
            fontWeight: t.type.caption.fontWeight,
            marginBottom: t.spacing.xs,
        },
        inviteCode: {
            color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.sm,
            padding: t.spacing.md,
            fontSize: t.type.caption.fontSize,
            lineHeight: 17,
            marginBottom: t.spacing.lg,
        },
        buttonContainer: {
            flexDirection: 'row',
            gap: t.spacing.md,
        },
        button: {
            flex: 1,
            alignItems: 'center',
            borderRadius: t.radius.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
        },
        closeButton: {
            backgroundColor: t.colors.surfaceSunken,
        },
        closeButtonText: {
            color: t.colors.text,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
        shareButton: {
            backgroundColor: t.colors.primary,
        },
        shareButtonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
    })
}
