import React, { useMemo } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'

type JoinDialogProps = {
    visible: boolean
    // 'project' = the destructive whole-project join; 'list' = the additive
    // single-list join (RPC_JOIN_LIST). Only the copy differs.
    mode?: 'project' | 'list'
    joinKeyInput: string
    setJoinKeyInput: (text: string) => void
    onScan: () => void
    onSubmit: () => void
    onCancel: () => void
}

export function JoinDialog({
    visible,
    mode = 'project',
    joinKeyInput,
    setJoinKeyInput,
    onScan,
    onSubmit,
    onCancel,
}: JoinDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const dialogStyles = useMemo(() => makeDialogStyles(t), [t])
    const styles = useMemo(() => StyleSheet.create({
        inputWrap: { position: 'relative' },
        inputWithScan: { paddingRight: 56 },
        scanButton: {
            position: 'absolute',
            right: 6,
            top: 6,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceSunken,
        },
    }), [t])
    const title = mode === 'list' ? i18n.t('joinList.title') : i18n.t('invite.dialog.title')
    const subtitle = mode === 'list' ? i18n.t('joinList.subtitle') : i18n.t('invite.dialog.subtitle')

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={dialogStyles.overlay}>
                <View style={dialogStyles.dialog}>
                    <Text style={dialogStyles.title}>{title}</Text>
                    <Text style={dialogStyles.subtitle}>{subtitle}</Text>

                    <View style={styles.inputWrap}>
                        <TextInput
                            style={[dialogStyles.input, styles.inputWithScan]}
                            value={joinKeyInput}
                            onChangeText={setJoinKeyInput}
                            placeholder={i18n.t('invite.dialog.placeholder')}
                            placeholderTextColor={t.colors.placeholder}
                            multiline={true}
                            autoFocus={true}
                        />
                        <TouchableOpacity
                            style={styles.scanButton}
                            onPress={onScan}
                            accessibilityRole="button"
                            accessibilityLabel={i18n.t('invite.scan.button')}
                        >
                            <Ionicons name="qr-code-outline" size={23} color={t.colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={dialogStyles.buttonContainer}>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.cancelButton]}
                            onPress={onCancel}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.cancelButtonText}>{i18n.t('common.cancel')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.submitButton]}
                            onPress={onSubmit}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.submitButtonText}>{i18n.t('common.join')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
