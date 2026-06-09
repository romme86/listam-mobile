import React, { useMemo, useState } from 'react'
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'

export type LoyaltyCard = {
    id: string
    name: string
    data: string
    type: string
}

type LoyaltyCardScannerProps = {
    visible: boolean
    onClose: () => void
    onCardScanned: (card: LoyaltyCard) => void
}

export function LoyaltyCardScanner({ visible, onClose, onCardScanned }: LoyaltyCardScannerProps) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])
    const [permission, requestPermission] = useCameraPermissions()
    const [scannedData, setScannedData] = useState<{ data: string; type: string } | null>(null)
    const [storeName, setStoreName] = useState('')

    const handlePermissionContinue = async () => {
        if (permission && !permission.granted && permission.canAskAgain === false) {
            await Linking.openSettings()
            return
        }
        await requestPermission()
    }

    const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
        if (scannedData) return
        setScannedData({ data, type })
    }

    const handleSave = () => {
        if (!scannedData || !storeName.trim()) return
        onCardScanned({
            id: Date.now().toString(),
            name: storeName.trim(),
            data: scannedData.data,
            type: scannedData.type,
        })
        resetAndClose()
    }

    const resetAndClose = () => {
        setScannedData(null)
        setStoreName('')
        onClose()
    }

    if (!visible) return null

    if (!permission?.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={handlePermissionContinue}>
                <View style={styles.permissionContainer}>
                    <Ionicons name="camera-outline" size={64} color={t.colors.textTertiary} />
                    <Text style={styles.permissionTitle}>{i18n.t('loyalty.scanner.permission.title')}</Text>
                    <Text style={styles.permissionText}>
                        {i18n.t('loyalty.scanner.permission.message')}
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={handlePermissionContinue} accessibilityRole="button">
                        <Text style={styles.permissionButtonText}>{i18n.t('common.continue')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        )
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
            <View style={styles.container}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{
                        barcodeTypes: [
                            'qr',
                            'ean13',
                            'ean8',
                            'upc_a',
                            'upc_e',
                            'code128',
                            'code39',
                            'code93',
                            'codabar',
                            'itf14',
                            'pdf417',
                            'aztec',
                            'datamatrix',
                        ],
                    }}
                    onBarcodeScanned={scannedData ? undefined : handleBarcodeScanned}
                />

                <TouchableOpacity
                    style={[styles.closeButton, { top: insets.top + 12 }]}
                    onPress={resetAndClose}
                    accessibilityRole="button"
                >
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>

                {!scannedData && (
                    <View style={styles.hintContainer}>
                        <Text style={styles.hintText}>{i18n.t('loyalty.scanner.hint')}</Text>
                    </View>
                )}

                {scannedData && (
                    <KeyboardAvoidingView
                        style={styles.nameOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={styles.nameCard}>
                            <Text style={styles.nameTitle}>{i18n.t('loyalty.scanner.scanned.title')}</Text>
                            <Text style={styles.nameSubtitle}>{i18n.t('loyalty.scanner.scanned.subtitle')}</Text>
                            <TextInput
                                style={styles.nameInput}
                                placeholder={i18n.t('loyalty.scanner.namePlaceholder')}
                                placeholderTextColor={t.colors.placeholder}
                                value={storeName}
                                onChangeText={setStoreName}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={handleSave}
                            />
                            <View style={styles.nameButtons}>
                                <TouchableOpacity
                                    style={styles.nameCancel}
                                    onPress={() => setScannedData(null)}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.nameCancelText}>{i18n.t('common.rescan')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.nameSave, !storeName.trim() && { opacity: 0.4 }]}
                                    onPress={handleSave}
                                    disabled={!storeName.trim()}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.nameSaveText}>{i18n.t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}
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
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
        },
        hintContainer: {
            position: 'absolute',
            bottom: 120,
            left: 0,
            right: 0,
            alignItems: 'center',
        },
        hintText: {
            color: '#fff',
            fontSize: 16,
            backgroundColor: 'rgba(0,0,0,0.5)',
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            overflow: 'hidden',
        },
        nameOverlay: {
            ...StyleSheet.absoluteFillObject,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.6)',
        },
        nameCard: {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            padding: t.spacing.xl,
            paddingBottom: 40,
        },
        nameTitle: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
            marginBottom: t.spacing.xs,
        },
        nameSubtitle: {
            fontSize: t.type.label.fontSize,
            color: t.colors.textSecondary,
            marginBottom: t.spacing.lg,
        },
        nameInput: {
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.sm,
            padding: 14,
            fontSize: t.type.body.fontSize,
            color: t.colors.text,
            marginBottom: t.spacing.lg,
        },
        nameButtons: {
            flexDirection: 'row',
            gap: t.spacing.md,
        },
        nameCancel: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceSunken,
            alignItems: 'center',
        },
        nameCancelText: {
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
            color: t.colors.text,
        },
        nameSave: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.primary,
            alignItems: 'center',
        },
        nameSaveText: {
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
            color: t.colors.onPrimary,
        },
        permissionContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: t.colors.bg,
            padding: 40,
        },
        permissionTitle: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
            marginTop: t.spacing.lg,
            marginBottom: t.spacing.sm,
        },
        permissionText: {
            fontSize: t.type.label.fontSize,
            color: t.colors.textSecondary,
            textAlign: 'center',
            marginBottom: t.spacing.xl,
        },
        permissionButton: {
            paddingVertical: 14,
            paddingHorizontal: t.spacing.xxl,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.primary,
            marginBottom: t.spacing.md,
        },
        permissionButtonText: {
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: '600',
            color: t.colors.onPrimary,
        },
    })
}
