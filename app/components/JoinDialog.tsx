import React, { useMemo } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'

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
                    <Text style={dialogStyles.title}>Join with Invite Code</Text>
                    <Text style={dialogStyles.subtitle}>Paste the invite code below</Text>

                    <TextInput
                        style={dialogStyles.input}
                        value={joinKeyInput}
                        onChangeText={setJoinKeyInput}
                        placeholder="Enter invite code..."
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
                            <Text style={dialogStyles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.submitButton]}
                            onPress={onSubmit}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.submitButtonText}>Join</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
