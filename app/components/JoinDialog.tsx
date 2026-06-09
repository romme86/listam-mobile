import React, { useMemo } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'

type JoinDialogProps = {
    visible: boolean
    joinKeyInput: string
    setJoinKeyInput: (text: string) => void
    onSubmit: () => void
    onCancel: () => void
}

export function JoinDialog({
    visible,
    joinKeyInput,
    setJoinKeyInput,
    onSubmit,
    onCancel,
}: JoinDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const dialogStyles = useMemo(() => makeDialogStyles(t), [t])

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={dialogStyles.overlay}>
                <View style={dialogStyles.dialog}>
                    <Text style={dialogStyles.title}>{i18n.t('invite.dialog.title')}</Text>
                    <Text style={dialogStyles.subtitle}>{i18n.t('invite.dialog.subtitle')}</Text>

                    <TextInput
                        style={dialogStyles.input}
                        value={joinKeyInput}
                        onChangeText={setJoinKeyInput}
                        placeholder={i18n.t('invite.dialog.placeholder')}
                        placeholderTextColor={t.colors.placeholder}
                        multiline={true}
                        autoFocus={true}
                    />

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
