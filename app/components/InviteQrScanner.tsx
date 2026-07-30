import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    Linking,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import type { InviteQrScope } from '@listam/protocol'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n'
import { parseScannedInviteQr } from '../invite-qr'
import { useTheme, type Theme } from '../theme'
import { CloseDot } from './CloseDot'

type InviteQrScannerProps = {
    visible: boolean
    expectedScope: InviteQrScope
    onInviteScanned: (invite: string) => void
    onClose: () => void
}

export function InviteQrScanner({
    visible,
    expectedScope,
    onInviteScanned,
    onClose,
}: InviteQrScannerProps) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])
    const [permission, requestPermission] = useCameraPermissions()
    const [errorKey, setErrorKey] = useState<
        'invite.scan.invalid' | 'invite.scan.projectMismatch' | 'invite.scan.listMismatch' | null
    >(null)
    const scanLockedRef = useRef(false)

    useEffect(() => {
        if (!visible) return
        scanLockedRef.current = false
        setErrorKey(null)
    }, [visible, expectedScope])

    const handlePermissionContinue = async () => {
        if (permission && !permission.granted && permission.canAskAgain === false) {
            await Linking.openSettings()
            return
        }
        await requestPermission()
    }

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        if (scanLockedRef.current) return
        scanLockedRef.current = true

        const result = parseScannedInviteQr(data, expectedScope)
        if (result.status === 'scope-mismatch') {
            setErrorKey(expectedScope === 'project'
                ? 'invite.scan.projectMismatch'
                : 'invite.scan.listMismatch')
            return
        }
        if (result.status === 'ok') {
            onInviteScanned(result.invite)
            return
        }

        setErrorKey('invite.scan.invalid')
    }

    const handleRescan = () => {
        setErrorKey(null)
        scanLockedRef.current = false
    }

    if (!visible) return null

    if (!permission?.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
                <View style={styles.permissionContainer}>
                    <CloseDot
                        onPress={onClose}
                        style={[styles.permissionClose, { top: insets.top + 12 }]}
                        accessibilityLabel={i18n.t('common.close')}
                    />
                    <Ionicons name="camera-outline" size={64} color={t.colors.textTertiary} />
                    <Text style={styles.permissionTitle}>{i18n.t('invite.scan.permission.title')}</Text>
                    <Text style={styles.permissionText}>{i18n.t('invite.scan.permission.message')}</Text>
                    <TouchableOpacity
                        style={styles.permissionButton}
                        onPress={handlePermissionContinue}
                        accessibilityRole="button"
                    >
                        <Text style={styles.permissionButtonText}>
                            {i18n.t(permission?.canAskAgain === false
                                ? 'invite.scan.permission.settings'
                                : 'common.continue')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        )
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanLockedRef.current ? undefined : handleBarcodeScanned}
                />

                <CloseDot
                    onPress={onClose}
                    style={[styles.closeButton, { top: insets.top + 12 }]}
                    color="#fff"
                    size={13}
                    accessibilityLabel={i18n.t('common.close')}
                />

                <View pointerEvents="none" style={styles.scanGuide}>
                    <View style={styles.scanFrame} />
                </View>

                <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
                    {errorKey ? (
                        <View style={styles.errorCard}>
                            <Text style={styles.errorText}>{i18n.t(errorKey)}</Text>
                            <TouchableOpacity
                                style={styles.rescanButton}
                                onPress={handleRescan}
                                accessibilityRole="button"
                            >
                                <Text style={styles.rescanButtonText}>{i18n.t('common.rescan')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Text style={styles.hintText}>{i18n.t('invite.scan.hint')}</Text>
                    )}
                </View>
            </View>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#000',
        },
        closeButton: {
            position: 'absolute',
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 10,
        },
        scanGuide: {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
        },
        scanFrame: {
            width: 248,
            height: 248,
            borderWidth: 2,
            borderColor: '#fff',
            borderRadius: t.radius.lg,
            backgroundColor: 'transparent',
        },
        bottomArea: {
            position: 'absolute',
            left: t.spacing.xl,
            right: t.spacing.xl,
            bottom: 0,
            alignItems: 'center',
        },
        hintText: {
            color: '#fff',
            fontSize: t.type.body.fontSize,
            textAlign: 'center',
            backgroundColor: 'rgba(0,0,0,0.65)',
            paddingHorizontal: t.spacing.xl,
            paddingVertical: t.spacing.md,
            borderRadius: t.radius.pill,
            overflow: 'hidden',
        },
        errorCard: {
            width: '100%',
            maxWidth: 400,
            alignItems: 'center',
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.md,
            padding: t.spacing.lg,
        },
        errorText: {
            color: t.colors.text,
            fontSize: t.type.body.fontSize,
            textAlign: 'center',
            marginBottom: t.spacing.md,
        },
        rescanButton: {
            alignSelf: 'stretch',
            alignItems: 'center',
            backgroundColor: t.colors.primary,
            borderRadius: t.radius.sm,
            paddingVertical: t.spacing.md,
        },
        rescanButtonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
        permissionContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: t.colors.bg,
            padding: 40,
        },
        permissionClose: {
            position: 'absolute',
            right: 20,
        },
        permissionTitle: {
            color: t.colors.text,
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            marginTop: t.spacing.lg,
            marginBottom: t.spacing.sm,
        },
        permissionText: {
            color: t.colors.textSecondary,
            fontSize: t.type.label.fontSize,
            textAlign: 'center',
            marginBottom: t.spacing.xl,
        },
        permissionButton: {
            paddingVertical: 14,
            paddingHorizontal: t.spacing.xxl,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.primary,
        },
        permissionButtonText: {
            color: t.colors.onPrimary,
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
        },
    })
}
